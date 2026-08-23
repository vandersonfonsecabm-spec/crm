"use strict";

function retentionConfig(env = process.env) {
  const enabled = String(env.STOCK_RETENTION_ENABLED || "").trim().toLowerCase() === "true";
  const days = Number(env.STOCK_RETENTION_DAYS);
  return Object.freeze({ enabled, days: Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null });
}

async function runStockRetention({ prisma, empresaId, now = new Date(), dryRun = true, env = process.env, logger = console } = {}) {
  const config = retentionConfig(env);
  if (!config.enabled || !config.days || dryRun) return { enabled: config.enabled, dryRun: true, deleted: 0 };
  const cutoff = new Date(now.getTime() - config.days * 86400000);
  const result = {};
  for (const [key, model] of [["imports", "importacaoEstoque"], ["rows", "linhaImportacaoEstoque"], ["observations", "observacaoEstoque"], ["runs", "execucaoSincronizacaoEstoque"], ["outbox", "eventoOutboxEstoque"], ["quality", "problemaQualidadeEstoque"]]) {
    if (!prisma[model]) continue;
    const count = await prisma[model].count({ where: { empresaId, retentionUntil: { lt: cutoff }, ...(model === "eventoOutboxEstoque" ? { status: { in: ["PROCESSED", "QUARANTINED"] } } : {}) } });
    result[key] = count;
  }
  logger.info?.("stock_retention_dry_run", { empresaId, cutoff: cutoff.toISOString(), result });
  return { enabled: true, dryRun: false, counts: result };
}

module.exports = { retentionConfig, runStockRetention };
