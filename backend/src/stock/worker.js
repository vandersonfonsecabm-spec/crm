"use strict";

const { stockEnabledForTenant, stockFlags, parseBoolean, assertStockFlagsOffForProduction } = require("./flags");
const { processStockOutboxBatch } = require("./outbox");
const { runStockRetention } = require("./retention");
const { projectStockEvaluation } = require("./projection");

async function runStockWorkerCycle({ prisma, rules = null, env = process.env, owner = null, leaseOwner = null, leaseMs = 30000, logger = console, now = new Date(), limit = 20 } = {}) {
  const flags = stockFlags(env);
  assertStockFlagsOffForProduction(env);
  if (!flags.domainEnabled || !flags.syncWorkerEnabled || flags.tenantAllowlist.size === 0) return { enabled: false, claimed: 0, processed: 0, quarantined: 0, evaluated: 0, tenants: 0 };
  const results = { enabled: true, claimed: 0, processed: 0, quarantined: 0, evaluated: 0, matched: 0, resolved: 0, tenants: 0 };
  for (const empresaId of flags.tenantAllowlist) {
    if (!stockEnabledForTenant(empresaId, env, { worker: true })) continue;
    results.tenants += 1;
    if (flags.ruleEngineEnabled && typeof rules?.evaluateTenant === "function") {
      const evaluation = await rules.evaluateTenant(empresaId, { now, limit });
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
      consumer: flags.h8ProjectionEnabled && flags.ruleEngineEnabled ? createProjectionConsumer({ prisma, empresaId, env, now }) : null,
    });
    results.claimed += result.claimed; results.processed += result.processed; results.quarantined += result.quarantined;
    if (parseBoolean(env.STOCK_RETENTION_ENABLED) && parseBoolean(env.STOCK_RETENTION_WORKER_ENABLED)) await runStockRetention({ prisma, empresaId, now, dryRun: false, env, logger });
  }
  return results;
}

function createProjectionConsumer({ prisma, empresaId, env, now }) {
  return async (event) => {
    if (event.eventType !== "StockProjectionRequested.v1" && event.eventType !== "StockRuleResolved.v1") return;
    const occurrenceKey = event.payload?.occurrenceKey;
    if (!occurrenceKey || typeof prisma.avaliacaoRegraEstoque?.findFirst !== "function") return;
    const row = await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId, occurrenceKey, materialVersion: event.materialVersion }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] });
    if (!row) return;
    const recipients = await prisma.usuario.findMany({ where: { empresaId, ativo: true, papel: { in: ["ADMIN", "GERENTE"] } }, select: { id: true } });
    if (!recipients.length) {
      const fonteId = Number(row.sourceConnectionId || event.payload?.sourceConnectionId || 0);
      if (fonteId > 0 && typeof prisma.problemaQualidadeEstoque?.create === "function") {
        await prisma.problemaQualidadeEstoque.create({ data: { empresaId, fonteId, tipo: "STOCK_RECIPIENT_MISSING", severidade: "HIGH", targetRef: row.occurrenceKey, estado: "OPEN", detailsSanitizedJson: JSON.stringify({ ruleType: row.ruleType, occurrenceKey: row.occurrenceKey }), retentionUntil: new Date(now.getTime() + 90 * 86400000) } });
      }
      return;
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
  };
}

module.exports = { runStockWorkerCycle, createProjectionConsumer };
