"use strict";

const { stockFlags, stockEnabledForTenant } = require("./flags");
const { buildStockEvent } = require("./events");
const { appendStockOutbox } = require("./outbox");
const { evaluateStockState, RULE_TYPES, RULE_SCHEMA_VERSION } = require("./rules");
const { sanitizeStructured } = require("./contracts");
const { StockError } = require("./errors");

const DEFAULT_RETENTION_DAYS = 90;

function asDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function evaluationData(evaluation, retentionUntil) {
  return {
    empresaId: evaluation.empresaId,
    schemaVersion: evaluation.schemaVersion || RULE_SCHEMA_VERSION,
    ruleType: evaluation.ruleType,
    sourceConnectionId: evaluation.sourceConnectionId,
    scopeJson: JSON.stringify(sanitizeStructured(evaluation.scope || {})),
    produtoEstoqueId: evaluation.produtoEstoqueId,
    loteEstoqueId: evaluation.loteEstoqueId,
    localEstoqueId: evaluation.localEstoqueId,
    requiredCapabilitiesJson: JSON.stringify(sanitizeStructured(evaluation.requiredCapabilities || [])),
    capabilitiesObservedJson: JSON.stringify(sanitizeStructured(evaluation.capabilitiesObserved || {})),
    enabledEffective: evaluation.enabledEffective === true,
    thresholdJson: JSON.stringify(sanitizeStructured(evaluation.threshold || {})),
    evaluationTime: asDate(evaluation.evaluationTime),
    tenantTimezone: evaluation.tenantTimezone,
    freshnessRequirement: evaluation.freshnessRequirement,
    freshnessObserved: evaluation.freshnessObserved,
    quantitySemantic: evaluation.quantitySemantic,
    quantityRelevant: evaluation.quantityRelevant,
    expiryDate: evaluation.expiryDate,
    expiryPrecision: evaluation.expiryPrecision,
    matched: evaluation.match === true,
    noMatchReason: evaluation.noMatchReason,
    priority: evaluation.priority,
    occurrenceKey: evaluation.occurrenceKey,
    materialVersion: evaluation.materialVersion,
    materialChange: evaluation.materialChange === true,
    destinationJson: JSON.stringify(sanitizeStructured(evaluation.destination || null)),
    resolutionCandidate: evaluation.resolutionCandidate,
    suppressionPolicyJson: JSON.stringify(sanitizeStructured(evaluation.suppressionPolicy || null)),
    confidence: evaluation.confidence,
    correlationId: evaluation.correlationId,
    evaluatedAt: asDate(evaluation.evaluatedAt),
    retentionUntil,
  };
}

function eventForEvaluation(evaluation, eventType, now) {
  const aggregateType = evaluation.loteEstoqueId ? "LoteEstoque" : evaluation.produtoEstoqueId ? "ProdutoEstoque" : "FonteEstoque";
  const aggregateId = String(evaluation.loteEstoqueId || evaluation.produtoEstoqueId || evaluation.sourceConnectionId);
  return buildStockEvent({
    type: eventType,
    empresaId: evaluation.empresaId,
    aggregateType,
    aggregateId,
    materialVersion: evaluation.materialVersion,
    correlationId: evaluation.correlationId,
    occurredAt: now,
    payload: {
      ruleType: evaluation.ruleType,
      occurrenceKey: evaluation.occurrenceKey,
      priority: evaluation.priority,
      match: evaluation.match,
      materialChange: evaluation.materialChange,
      targetType: aggregateType === "LoteEstoque" ? "ESTOQUE_LOTE" : aggregateType === "ProdutoEstoque" ? "ESTOQUE_PRODUTO" : "ESTOQUE_FONTE",
      targetId: aggregateId,
      evaluation: { freshness: evaluation.freshnessObserved, confidence: evaluation.confidence, expiryDate: evaluation.expiryDate },
    },
  });
}

function createStockRuleService({ prisma, env = process.env, clock = () => new Date(), logger = console } = {}) {
  if (!prisma) throw new StockError("STOCK_UNAVAILABLE", "Prisma de estoque ausente.", undefined, 503);

  async function evaluateTenant(empresaId, { limit = 100, now = clock(), capabilities = {} } = {}) {
    const tenantId = Number(empresaId);
    const flags = stockFlags(env);
    if (!stockEnabledForTenant(tenantId, env) || !flags.ruleEngineEnabled) return { disabled: true, evaluated: 0, matched: 0, resolved: 0 };
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const [balances, configs] = await Promise.all([
      prisma.saldoEstoque.findMany({
        where: { empresaId: tenantId },
        orderBy: { id: "asc" },
        take: safeLimit,
        include: {
          produtoEstoque: { select: { id: true, nomeExibicao: true } },
          lote: { select: { id: true, validadeEm: true, precisaoValidade: true, revision: true } },
          local: { select: { id: true, nome: true } },
          fonteAutoritativa: { select: { id: true, nome: true, statusCiclo: true } },
        },
      }),
      prisma.configuracaoRegraEstoque.findMany({ where: { empresaId: tenantId, scopeType: "TENANT", scopeKey: "TENANT" } }),
    ]);
    const sourceIds = [...new Set(balances.map((balance) => Number(balance.fonteAutoritativaId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const capabilityRows = sourceIds.length && typeof prisma.capacidadeFonteEstoque?.findMany === "function"
      ? await prisma.capacidadeFonteEstoque.findMany({ where: { empresaId: tenantId, fonteId: { in: sourceIds }, suportada: true }, select: { fonteId: true, codigo: true } })
      : [];
    const capabilityBySource = new Map();
    for (const row of capabilityRows) {
      const current = capabilityBySource.get(row.fonteId) || {};
      current[row.codigo] = true;
      capabilityBySource.set(row.fonteId, current);
    }
    const configByType = new Map(configs.map((config) => [config.ruleType, config]));
    let evaluated = 0; let matched = 0; let resolved = 0;
    for (const balance of balances) {
      const state = {
        empresaId: tenantId,
        sourceConnectionId: balance.fonteAutoritativaId,
        produtoEstoqueId: balance.produtoEstoqueId,
        loteEstoqueId: balance.loteId,
        localEstoqueId: balance.localId,
        balance,
        lot: balance.lote,
        location: balance.local,
        freshnessEstado: balance.freshnessEstado,
        dataConfidence: balance.dataConfidence,
        semanticaDisponivel: balance.semanticaDisponivel,
        revision: balance.revision,
        correlationId: `stock-rule:${tenantId}:${balance.id}:${balance.revision}`,
      };
      for (const ruleType of RULE_TYPES) {
        const config = configByType.get(ruleType) || { ruleType, enabled: false };
        const effectiveCapabilities = Object.keys(capabilities || {}).length ? capabilities : { capabilities: capabilityBySource.get(balance.fonteAutoritativaId) || {} };
        const evaluation = evaluateStockState({ ruleType, state, config, capabilities: effectiveCapabilities, now });
        evaluated += 1;
        if (evaluation.match) matched += 1;
        const retentionUntil = new Date(now.getTime() + DEFAULT_RETENTION_DAYS * 86400000);
        const previous = await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, occurrenceKey: evaluation.occurrenceKey }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] });
        const materialChange = Boolean(previous && previous.materialVersion !== evaluation.materialVersion);
        const evaluationWithChange = { ...evaluation, materialChange };
        const data = evaluationData(evaluationWithChange, retentionUntil);
        const eventType = evaluation.match ? "StockRuleMatched.v1" : (previous?.matched ? "StockRuleResolved.v1" : null);
        const event = eventType ? eventForEvaluation(evaluationWithChange, eventType, now) : null;
        const projectionEvent = eventType ? eventForEvaluation(evaluationWithChange, "StockProjectionRequested.v1", now) : null;
        const apply = async (tx) => {
          await tx.avaliacaoRegraEstoque.create({ data });
          if (event) await appendStockOutbox({ tx, event, allowReserved: true, retentionUntil });
          if (projectionEvent) await appendStockOutbox({ tx, event: projectionEvent, allowReserved: true, retentionUntil });
        };
        if (typeof prisma.$transaction === "function") await prisma.$transaction(apply);
        else await apply(prisma);
        if (eventType === "StockRuleResolved.v1") resolved += 1;
      }
    }
    logger.info?.("stock_rule_evaluation_cycle", { empresaId: tenantId, evaluated, matched, resolved });
    return { disabled: false, evaluated, matched, resolved };
  }

  return { evaluateTenant };
}

module.exports = { createStockRuleService, evaluationData, eventForEvaluation };
