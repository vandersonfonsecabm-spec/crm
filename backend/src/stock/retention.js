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
    const protectedVersions = new Map();
    const protect = (occurrenceKey, materialVersion = null) => {
      if (!occurrenceKey) return;
      const versions = protectedVersions.get(occurrenceKey) || new Set();
      versions.add(Number.isSafeInteger(Number(materialVersion)) && Number(materialVersion) > 0 ? Number(materialVersion) : null);
      protectedVersions.set(occurrenceKey, versions);
    };
    if (typeof tx.notificacao?.findMany === "function") {
      let cursor = null;
      for (;;) {
        const open = await tx.notificacao.findMany({ where: { empresaId, resolvidaEm: null, stockTargetType: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, occurrenceKey: true, stockMaterialVersion: true }, orderBy: { id: "asc" }, take: 500 });
        for (const row of open) protect(row.occurrenceKey, row.stockMaterialVersion);
        if (open.length < 500) break;
        cursor = open.at(-1)?.id;
        if (!cursor) break;
      }
    }
    if (typeof tx.eventoOutboxEstoque?.findMany === "function") {
      let cursor = null;
      for (;;) {
        const pending = await tx.eventoOutboxEstoque.findMany({ where: { empresaId, status: { in: ["PENDING", "PROCESSING"] }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, payloadStructuredJson: true }, orderBy: { id: "asc" }, take: 500 });
        for (const row of pending) { try { const event = JSON.parse(row.payloadStructuredJson || "{}"); protect(event.payload?.occurrenceKey, event.materialVersion); } catch {} }
        if (pending.length < 500) break;
        cursor = pending.at(-1)?.id;
        if (!cursor) break;
      }
    }
    for (const [key, model, condition] of targets) {
      const delegate = tx[model];
      if (!delegate || typeof delegate.findMany !== "function" || typeof delegate.deleteMany !== "function") continue;
      const protectedPairs = key === "evaluations" ? [...protectedVersions].flatMap(([occurrenceKey, versions]) => [...versions].filter((version) => version !== null).map((materialVersion) => ({ occurrenceKey, materialVersion }))) : [];
      const protectedWholeOccurrences = key === "evaluations" ? [...protectedVersions].filter(([, versions]) => versions.has(null)).map(([occurrenceKey]) => ({ occurrenceKey })) : [];
      const effectiveCondition = key === "evaluations" && (protectedPairs.length || protectedWholeOccurrences.length)
        ? { ...condition, NOT: { OR: [...protectedPairs, ...protectedWholeOccurrences] } }
        : condition;
      let deleted = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_MODEL; batch += 1) {
        const rows = await delegate.findMany({ where: { empresaId, ...effectiveCondition }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
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
