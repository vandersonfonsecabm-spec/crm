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
  const targets = [
    ["rows", "linhaImportacaoEstoque", { retentionUntil: { lt: cutoff } }],
    ["imports", "importacaoEstoque", { retentionUntil: { lt: cutoff }, status: { in: ["APPLIED", "PARTIAL", "CANCELLED", "EXPIRED", "FAILED"] } }],
    ["observations", "observacaoEstoque", { retentionUntil: { lt: cutoff } }],
    ["quality", "problemaQualidadeEstoque", { retentionUntil: { lt: cutoff }, estado: { in: ["RESOLVED", "QUARANTINED"] } }],
    ["outbox", "eventoOutboxEstoque", { retentionUntil: { lt: cutoff }, status: { in: ["PROCESSED", "QUARANTINED"] } }],
    ["runs", "execucaoSincronizacaoEstoque", { retentionUntil: { lt: cutoff }, estado: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "QUARANTINED", "SUPERSEDED"] } }],
  ];
  const purge = async (tx) => {
    const counts = {};
    for (const [key, model, condition] of targets) {
      const delegate = tx[model];
      if (!delegate || typeof delegate.findMany !== "function" || typeof delegate.deleteMany !== "function") continue;
      let deleted = 0;
      for (;;) {
        const rows = await delegate.findMany({ where: { empresaId, ...condition }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
        if (!rows.length) break;
        const result = await delegate.deleteMany({ where: { empresaId, id: { in: rows.map((row) => row.id) } } });
        deleted += Number(result?.count || 0);
        if (rows.length < 100 || result?.count === 0) break;
      }
      counts[key] = deleted;
    }
    return counts;
  };
  const counts = prisma.$transaction ? await prisma.$transaction(purge) : await purge(prisma);
  const deleted = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  logger.info?.("stock_retention_completed", { empresaId, cutoff: cutoff.toISOString(), counts, deleted });
  return { enabled: true, dryRun: false, counts, deleted };
}

module.exports = { retentionConfig, runStockRetention };
