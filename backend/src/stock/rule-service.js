"use strict";

const { stockFlags, stockEnabledForTenant } = require("./flags");
const { buildStockEvent } = require("./events");
const { appendStockOutbox } = require("./outbox");
const { evaluateStockState, RULE_TYPES, RULE_SCHEMA_VERSION } = require("./rules");
const { classifyFreshness } = require("./freshness");
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

  async function evaluateTenant(empresaId, { limit = 100, cursor = null, now = clock() } = {}) {
    const tenantId = Number(empresaId);
    const flags = stockFlags(env);
    if (!stockEnabledForTenant(tenantId, env) || !flags.ruleEngineEnabled) return { disabled: true, evaluated: 0, matched: 0, resolved: 0 };
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const [balances, configs, overrides] = await Promise.all([
      prisma.saldoEstoque.findMany({
        where: { empresaId: tenantId, ...(cursor ? { id: { gt: Number(cursor) } } : {}), fonteAutoritativa: { statusCiclo: "ACTIVE" } },
        orderBy: { id: "asc" },
        take: safeLimit + 1,
        include: {
          produtoEstoque: { select: { id: true, nomeExibicao: true } },
          lote: { select: { id: true, validadeEm: true, precisaoValidade: true, revision: true } },
          local: { select: { id: true, nome: true } },
          fonteAutoritativa: { select: { id: true, nome: true, statusCiclo: true } },
        },
      }),
      prisma.configuracaoRegraEstoque.findMany({ where: { empresaId: tenantId, scopeType: "TENANT", scopeKey: "TENANT" } }),
      typeof prisma.overrideEstoque?.findMany === "function" ? prisma.overrideEstoque.findMany({ where: { empresaId: tenantId } }) : [],
    ]);
    const sourceRows = typeof prisma.fonteEstoque?.findMany === "function"
      ? await prisma.fonteEstoque.findMany({ where: { empresaId: tenantId, statusCiclo: "ACTIVE" }, select: { id: true, statusCiclo: true } })
      : [];
    const sourceIds = [...new Set([
      ...balances.map((balance) => Number(balance.fonteAutoritativaId)),
      ...sourceRows.map((source) => Number(source.id)),
    ].filter((id) => Number.isSafeInteger(id) && id > 0))];
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
    const overrideByKey = new Map(overrides.map((override) => [`${override.ruleType}:${override.targetType}:${override.targetId}`, override]));
    const sourceScopeIds = [...new Set(sourceRows.map((row) => Number(row.id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const [checkpointRows, recentRuns] = await Promise.all([
      sourceScopeIds.length && typeof prisma.checkpointSincronizacaoEstoque?.findMany === "function" ? prisma.checkpointSincronizacaoEstoque.findMany({ where: { empresaId: tenantId, fonteId: { in: sourceScopeIds } } }) : [],
      sourceScopeIds.length && typeof prisma.execucaoSincronizacaoEstoque?.findMany === "function" ? prisma.execucaoSincronizacaoEstoque.findMany({ where: { empresaId: tenantId, fonteId: { in: sourceScopeIds } }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] }) : [],
    ]);
    const checkpointBySource = new Map(checkpointRows.map((row) => [row.fonteId, row]));
    const latestRunBySource = new Map();
    for (const run of recentRuns) if (!latestRunBySource.has(run.fonteId)) latestRunBySource.set(run.fonteId, run);
    const pageBalances = balances.slice(0, safeLimit);
    const stateItems = pageBalances.map((balance) => ({ balance, state: {
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
      } }));
    for (const source of sourceRows) {
      const checkpoint = checkpointBySource.get(source.id);
      const latestRun = latestRunBySource.get(source.id);
      const failedRun = latestRun && ["FAILED", "RETRY_WAIT"].includes(latestRun.estado) ? latestRun : null;
      const previousFailure = typeof prisma.avaliacaoRegraEstoque?.findFirst === "function"
        ? await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, sourceConnectionId: source.id, ruleType: "STOCK_SYNC_FAILED", matched: true }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] })
        : null;
      const previousErrorFamily = previousFailure?.occurrenceKey ? String(previousFailure.occurrenceKey).split(":").at(-1) : null;
      const staleBaseConfig = configByType.get("STOCK_DATA_STALE") || {};
      const staleOverride = overrideByKey.get(`STOCK_DATA_STALE:ESTOQUE_FONTE:${source.id}`);
      let staleConfig = staleBaseConfig;
      if (staleOverride) staleConfig = { ...staleBaseConfig, freshnessSlaMinutes: staleOverride.freshnessSlaMinutes ?? staleBaseConfig.freshnessSlaMinutes };
      const freshness = classifyFreshness({ lastSuccessfulSyncAt: checkpoint?.lastSuccessfulSyncAt, slaMs: Number(staleConfig.freshnessSlaMinutes || 0) * 60000, now });
      stateItems.push({ balance: null, state: { empresaId: tenantId, sourceConnectionId: source.id, freshnessEstado: freshness, sourceFreshnessEvidence: Boolean(checkpoint?.lastSuccessfulSyncAt), latestRunHealthy: latestRun?.estado === "SUCCEEDED", syncFailed: failedRun?.estado === "FAILED", retriesExhausted: failedRun?.estado === "FAILED" && Number(failedRun.retryCount || 0) >= 3, errorFamily: latestRun?.errorClass || previousErrorFamily || "UNKNOWN", revision: Number(latestRun?.revision || checkpoint?.revision || 1), correlationId: latestRun?.correlationId || previousFailure?.correlationId || `stock-rule:${tenantId}:source:${source.id}` } });
    }
    let evaluated = 0; let matched = 0; let resolved = 0;
    for (const { balance, state } of stateItems) {
      const lifecycleOccurrenceKey = balance ? `${tenantId}:logicalExpiryLifecycle:${state.loteEstoqueId}:${state.localEstoqueId || "scope"}` : null;
      const previousLifecycleState = lifecycleOccurrenceKey && typeof prisma.avaliacaoRegraEstoque?.findFirst === "function"
        ? await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, occurrenceKey: lifecycleOccurrenceKey }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] })
        : null;
      const previousLifecycleMatched = lifecycleOccurrenceKey && typeof prisma.avaliacaoRegraEstoque?.findFirst === "function"
        ? await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, occurrenceKey: lifecycleOccurrenceKey, matched: true }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] })
        : null;
      const ruleTypes = balance ? ["STOCK_LOT_EXPIRED", "STOCK_LOT_EXPIRING"] : ["STOCK_DATA_STALE", "STOCK_SYNC_FAILED"];
      for (const ruleType of ruleTypes) {
        const baseConfig = configByType.get(ruleType) || { ruleType, enabled: false };
        const targetType = state.loteEstoqueId ? "ESTOQUE_LOTE" : state.produtoEstoqueId ? "ESTOQUE_PRODUTO" : "ESTOQUE_FONTE";
        const targetId = state.loteEstoqueId || state.produtoEstoqueId || state.sourceConnectionId;
        const override = overrideByKey.get(`${ruleType}:${targetType}:${targetId}`);
        let config = baseConfig;
        if (override) {
          let threshold = {};
          try { threshold = override.thresholdJson ? JSON.parse(override.thresholdJson) : {}; } catch { threshold = {}; }
          config = { ...baseConfig, enabled: override.enabled === null || override.enabled === undefined ? baseConfig.enabled : override.enabled, expiryWindowDays: Number.isInteger(threshold.expiryWindowDays) ? threshold.expiryWindowDays : baseConfig.expiryWindowDays, freshnessSlaMinutes: override.freshnessSlaMinutes ?? baseConfig.freshnessSlaMinutes, priority: override.priority || baseConfig.priority, recipientPolicy: override.recipientPolicyJson ? (() => { try { return JSON.parse(override.recipientPolicyJson); } catch { return null; } })() : baseConfig.recipientPolicy };
        }
        const observedCapabilities = { ...(capabilityBySource.get(state.sourceConnectionId) || {}) };
        if (!balance && state.sourceFreshnessEvidence) observedCapabilities.SOURCE_UPDATED_AT = true;
        const effectiveCapabilities = { capabilities: observedCapabilities };
        const evaluation = evaluateStockState({ ruleType, state, config, capabilities: effectiveCapabilities, now });
        if (config.priority) evaluation.priority = config.priority;
        evaluated += 1;
        if (evaluation.match) matched += 1;
        const retentionUntil = new Date(now.getTime() + DEFAULT_RETENTION_DAYS * 86400000);
        const previous = await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, occurrenceKey: evaluation.occurrenceKey, ruleType }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] });
        const previousMatched = previous?.matched ? previous : (typeof prisma.avaliacaoRegraEstoque?.findFirst === "function" ? await prisma.avaliacaoRegraEstoque.findFirst({ where: { empresaId: tenantId, occurrenceKey: evaluation.occurrenceKey, ruleType, matched: true }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] }) : null);
        let effectiveEvaluation = evaluation;
        const lifecycleResolution = balance && ruleType === "STOCK_LOT_EXPIRING" && !evaluation.match && evaluation.noMatchReason !== "ALREADY_EXPIRED" && !previous?.matched && previousLifecycleMatched?.matched;
        const resolutionCandidate = !evaluation.match && previousMatched?.matched && (ruleType !== "STOCK_SYNC_FAILED" || state.latestRunHealthy === true);
        const previousState = balance ? previousLifecycleState : previous;
        const stableSameMatch = Boolean(evaluation.match && previousState?.matched && previousState.ruleType === ruleType && Number(previousState.materialVersion || 0) === Number(evaluation.materialVersion || 0));
        const shouldAdvanceMaterial = (lifecycleResolution || resolutionCandidate || (evaluation.match && previousState && !stableSameMatch)) && previousState;
        if (shouldAdvanceMaterial && Number(previousState.materialVersion || 0) >= Number(evaluation.materialVersion || 0)) {
          effectiveEvaluation = { ...evaluation, materialVersion: Number(previousState.materialVersion) + 1 };
        }
        const materialChange = Boolean(previous && previous.materialVersion !== effectiveEvaluation.materialVersion);
        const evaluationWithChange = { ...effectiveEvaluation, materialChange };
        const data = evaluationData(evaluationWithChange, retentionUntil);
        let eventType = effectiveEvaluation.match ? "StockRuleMatched.v1" : (previousMatched?.matched ? "StockRuleResolved.v1" : null);
        if (balance && ruleType === "STOCK_LOT_EXPIRED" && !effectiveEvaluation.match && effectiveEvaluation.noMatchReason === "NOT_EXPIRED") eventType = null;
        if (balance && ruleType === "STOCK_LOT_EXPIRING" && !effectiveEvaluation.match && effectiveEvaluation.noMatchReason === "ALREADY_EXPIRED") eventType = null;
        if (lifecycleResolution) eventType = "StockRuleResolved.v1";
        if (eventType === "StockRuleResolved.v1" && !["QUANTITY_NOT_POSITIVE", "OUTSIDE_WINDOW", "FRESHNESS_WITHIN_SLA", "RETRIES_NOT_EXHAUSTED"].includes(effectiveEvaluation.noMatchReason)) eventType = null;
        if (eventType === "StockRuleResolved.v1" && ruleType === "STOCK_SYNC_FAILED" && state.latestRunHealthy !== true) eventType = null;
        if (stableSameMatch) eventType = null;
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
    return { disabled: false, evaluated, matched, resolved, nextCursor: balances.length > safeLimit ? pageBalances.at(-1)?.id || null : null };
  }

  return { evaluateTenant };
}

module.exports = { createStockRuleService, evaluationData, eventForEvaluation };
