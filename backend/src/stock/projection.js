"use strict";

const { upsertStockProjection, parseTenantAllowlist } = require("../notifications/service");
const { parseBoolean, stockFlags, stockEnabledForTenant } = require("./flags");
const { sanitizeStructured } = require("./contracts");

function projectionTarget(evaluation) {
  if (evaluation.loteEstoqueId) return { type: "ESTOQUE_LOTE", id: evaluation.loteEstoqueId, subId: evaluation.localEstoqueId };
  if (evaluation.produtoEstoqueId) return { type: "ESTOQUE_PRODUTO", id: evaluation.produtoEstoqueId };
  if (evaluation.sourceConnectionId) return { type: "ESTOQUE_FONTE", id: evaluation.sourceConnectionId };
  return null;
}

function h8TenantEnabled(empresaId, env) {
  if (!parseBoolean(env.H8_NOTIFICATIONS_ENABLED)) return false;
  const ids = parseTenantAllowlist(env.H8_NOTIFICATION_TENANT_ALLOWLIST);
  return ids.includes(Number(empresaId));
}

async function projectStockEvaluation({ prisma, evaluation, recipients = [], env = process.env, now = new Date() } = {}) {
  const tenantId = Number(evaluation?.empresaId);
  const flags = stockFlags(env);
  if (!stockEnabledForTenant(tenantId, env) || !flags.ruleEngineEnabled || !flags.h8ProjectionEnabled || !h8TenantEnabled(tenantId, env)) return { created: 0, updated: 0, disabled: true };
  const target = projectionTarget(evaluation);
  if (!target) return { created: 0, updated: 0, disabled: false, rejected: "STOCK_TARGET_INVALID" };
  const title = evaluation.ruleType === "STOCK_LOT_EXPIRED" ? "Lote de estoque vencido" : evaluation.ruleType === "STOCK_LOT_EXPIRING" ? "Lote de estoque próximo do vencimento" : evaluation.ruleType === "STOCK_DATA_STALE" ? "Dados de estoque desatualizados" : "Sincronização de estoque falhou";
  const summary = evaluation.noMatchReason || (evaluation.match ? "Alerta de estoque requer atenção operacional." : "Estado de estoque normalizado.");
  const snapshot = sanitizeStructured({
    ruleType: evaluation.ruleType,
    priority: evaluation.priority,
    freshness: evaluation.freshnessObserved,
    confidence: evaluation.confidence,
    expiryDate: evaluation.expiryDate,
    expiryPrecision: evaluation.expiryPrecision,
    quantityRelevant: evaluation.quantityRelevant,
    materialVersion: evaluation.materialVersion,
    sourceObservedAt: evaluation.sourceObservedAt,
    destination: evaluation.destination,
  });
  let result = { created: 0, updated: 0, reopened: 0 };
  for (const recipientId of [...new Set(recipients.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100)) {
    const next = await upsertStockProjection({
      prisma,
      empresaId: tenantId,
      destinatarioId: recipientId,
      ruleType: evaluation.ruleType,
      priority: evaluation.priority || "ATENCAO",
      occurrenceKey: evaluation.occurrenceKey,
      title,
      summary,
      targetType: target.type,
      targetId: target.id,
      targetSubId: target.subId,
      snapshot,
      materialVersion: evaluation.materialVersion,
      sourceObservedAt: evaluation.sourceObservedAt,
      resolutionState: evaluation.match ? "OPEN" : "RESOLVED",
      occurredAt: now,
    });
    result = { created: result.created + next.created, updated: result.updated + next.updated, reopened: result.reopened + next.reopened };
  }
  return result;
}

module.exports = { projectStockEvaluation, projectionTarget };
