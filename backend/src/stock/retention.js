"use strict";

function retentionConfig(env = process.env) {
  const enabled = String(env.STOCK_RETENTION_ENABLED || "").trim().toLowerCase() === "true";
  const days = Number(env.STOCK_RETENTION_DAYS);
  return Object.freeze({ enabled, days: Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null });
}

const MAX_BATCHES_PER_MODEL = 5;

async function runStockRetention({ prisma, empresaId, now = new Date(), dryRun = true, env = process.env, logger = console } = {}) {
  const config = retentionConfig(env);
  if (!config.enabled || !config.days || dryRun) return { enabled: config.enabled, dryRun: true, deleted: 0 };
  const cutoff = new Date(now.getTime() - config.days * 86400000);
  const expired = { lt: now };
  const targets = [
    ["rows", "linhaImportacaoEstoque", { retentionUntil: expired }],
    ["imports", "importacaoEstoque", { retentionUntil: expired, status: { in: ["APPLIED", "PARTIAL", "CANCELLED", "EXPIRED", "FAILED"] } }],
    ["observations", "observacaoEstoque", { retentionUntil: expired }],
    ["quality", "problemaQualidadeEstoque", { retentionUntil: expired, estado: { in: ["RESOLVED", "QUARANTINED"] } }],
    ["evaluations", "avaliacaoRegraEstoque", { retentionUntil: expired }],
    ["outbox", "eventoOutboxEstoque", { retentionUntil: expired, status: { in: ["PROCESSED", "QUARANTINED"] } }],
    ["runs", "execucaoSincronizacaoEstoque", { retentionUntil: expired, estado: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "QUARANTINED", "SUPERSEDED"] } }],
  ];
  const purge = async (tx) => {
    const counts = {};
    for (const [key, model, condition] of targets) {
      if (key === "evaluations" && typeof tx.eventoOutboxEstoque?.count === "function") {
        const pending = await tx.eventoOutboxEstoque.count({ where: { empresaId, status: { in: ["PENDING", "PROCESSING"] } } });
        if (pending > 0) continue;
      }
      const delegate = tx[model];
      if (!delegate || typeof delegate.findMany !== "function" || typeof delegate.deleteMany !== "function") continue;
      let deleted = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_MODEL; batch += 1) {
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
