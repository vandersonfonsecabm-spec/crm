"use strict";

const { stockEnabledForTenant, stockFlags, parseBoolean, assertStockFlagsOffForProduction } = require("./flags");
const { processStockOutboxBatch } = require("./outbox");
const { runStockRetention } = require("./retention");
const { projectStockEvaluation } = require("./projection");
const { SYSTEM_ACTOR_EMAIL } = require("../system-actor");
const ruleCursors = new Map();

async function runStockWorkerCycle({ prisma, rules = null, env = process.env, owner = null, leaseOwner = null, leaseMs = 30000, logger = console, now = new Date(), limit = 20 } = {}) {
  const flags = stockFlags(env);
  assertStockFlagsOffForProduction(env);
  if (!flags.domainEnabled || !flags.syncWorkerEnabled || flags.tenantAllowlist.size === 0) return { enabled: false, claimed: 0, processed: 0, quarantined: 0, evaluated: 0, tenants: 0 };
  const results = { enabled: true, claimed: 0, processed: 0, quarantined: 0, evaluated: 0, matched: 0, resolved: 0, tenants: 0 };
  let cycleError = null;
  for (const empresaId of flags.tenantAllowlist) {
    if (!stockEnabledForTenant(empresaId, env, { worker: true })) continue;
    results.tenants += 1;
    try {
      if (flags.ruleEngineEnabled && typeof rules?.evaluateTenant === "function") {
        const evaluation = await rules.evaluateTenant(empresaId, { now, limit, cursor: ruleCursors.get(empresaId) || null });
        if (evaluation.nextCursor) ruleCursors.set(empresaId, evaluation.nextCursor);
        else ruleCursors.delete(empresaId);
        results.evaluated += Number(evaluation.evaluated || 0);
        results.matched += Number(evaluation.matched || 0);
        results.resolved += Number(evaluation.resolved || 0);
      }
      const effectiveOwner = String(owner || leaseOwner || `stock-worker-${process.pid}`);
      const result = await processStockOutboxBatch({
        prisma,
        empresaId,
        owner: `${effectiveOwner}-${empresaId}`,
        limit,
        leaseMs,
        now,
        logger,
        h8ProjectionEnabled: flags.h8ProjectionEnabled && flags.ruleEngineEnabled,
        allowReserved: flags.h8ProjectionEnabled && flags.ruleEngineEnabled,
        eventTypes: flags.h8ProjectionEnabled && flags.ruleEngineEnabled ? ["StockProjectionRequested.v1", "StockRuleMatched.v1", "StockRuleResolved.v1"] : null,
        consumer: flags.h8ProjectionEnabled && flags.ruleEngineEnabled ? createProjectionConsumer({ prisma, empresaId, env, now }) : null,
      });
      results.claimed += result.claimed; results.processed += result.processed; results.quarantined += result.quarantined;
      if (parseBoolean(env.STOCK_RETENTION_ENABLED) && parseBoolean(env.STOCK_RETENTION_WORKER_ENABLED)) await runStockRetention({ prisma, empresaId, now, dryRun: false, env, logger });
    } catch (error) {
      logger.error?.("stock_tenant_cycle_failed", { empresaId, code: error?.code || "STOCK_CYCLE_FAILED" });
      cycleError ||= error;
    }
  }
  if (cycleError) throw cycleError;
  return results;
}

function createProjectionConsumer({ prisma, empresaId, env, now }) {
  return async (event) => {
    if (event.eventType !== "StockProjectionRequested.v1" && event.eventType !== "StockRuleMatched.v1" && event.eventType !== "StockRuleResolved.v1") return { handled: false };
    const occurrenceKey = event.payload?.occurrenceKey;
    if (!occurrenceKey || typeof prisma.avaliacaoRegraEstoque?.findFirst !== "function") return { handled: false };
    const row = await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId, occurrenceKey, materialVersion: event.materialVersion }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] });
    if (!row) return { handled: false };
    let recipientPolicy = {};
    if (typeof prisma.configuracaoRegraEstoque?.findFirst === "function") {
      const config = await prisma.configuracaoRegraEstoque.findFirst({ where: { empresaId, ruleType: row.ruleType, scopeType: "TENANT", scopeKey: "TENANT" }, select: { recipientPolicyJson: true } });
      try { recipientPolicy = config?.recipientPolicyJson ? JSON.parse(config.recipientPolicyJson) : {}; } catch { recipientPolicy = {}; }
    }
    const configuredIds = Array.isArray(recipientPolicy.usuarioIds || recipientPolicy.userIds)
      ? [...new Set((recipientPolicy.usuarioIds || recipientPolicy.userIds).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
      : [];
    const recipientWhere = { empresaId, ativo: true, email: { not: SYSTEM_ACTOR_EMAIL }, papel: { in: ["ADMIN", "GERENTE"] }, ...(configuredIds.length ? { id: { in: configuredIds } } : {}) };
    const recipients = await prisma.usuario.findMany({ where: recipientWhere, select: { id: true } });
    if (!recipients.length) {
      const fonteId = Number(row.sourceConnectionId || event.payload?.sourceConnectionId || 0);
      if (fonteId > 0 && typeof prisma.problemaQualidadeEstoque?.create === "function") {
        const existingQuality = typeof prisma.problemaQualidadeEstoque.findFirst === "function"
          ? await prisma.problemaQualidadeEstoque.findFirst({ where: { empresaId, fonteId, tipo: "STOCK_RECIPIENT_MISSING", targetRef: row.occurrenceKey, estado: "OPEN" } })
          : null;
        if (!existingQuality) await prisma.problemaQualidadeEstoque.create({ data: { empresaId, fonteId, tipo: "STOCK_RECIPIENT_MISSING", severidade: "HIGH", targetRef: row.occurrenceKey, estado: "OPEN", detailsSanitizedJson: JSON.stringify({ ruleType: row.ruleType, occurrenceKey: row.occurrenceKey }), retentionUntil: new Date(now.getTime() + 90 * 86400000) } });
      }
      return { handled: false, waitingForRecipient: true, recipients: 0 };
    }
    await projectStockEvaluation({
      prisma,
      env,
      now,
      recipients: recipients.map((recipient) => recipient.id),
      evaluation: {
        empresaId,
        ruleType: row.ruleType,
        match: row.matched,
        priority: row.priority,
        occurrenceKey: row.occurrenceKey,
        produtoEstoqueId: row.produtoEstoqueId,
        loteEstoqueId: row.loteEstoqueId,
        localEstoqueId: row.localEstoqueId,
        sourceConnectionId: row.sourceConnectionId,
        materialVersion: row.materialVersion,
        confidence: row.confidence,
        freshnessObserved: row.freshnessObserved,
        expiryDate: row.expiryDate,
        expiryPrecision: row.expiryPrecision,
      },
    });
    return { handled: true, recipients: recipients.length };
  };
}

module.exports = { runStockWorkerCycle, createProjectionConsumer };
