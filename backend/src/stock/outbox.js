"use strict";

const { buildStockEvent, validateStockEvent, ACTIVE_EVENT_TYPES } = require("./events");
const { StockError } = require("./errors");

async function appendStockOutbox({ tx, event, retentionUntil }) {
  if (!tx?.eventoOutboxEstoque) return null;
  validateStockEvent(event, { activeOnly: true });
  const data = {
    empresaId: event.empresaId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    materialVersion: event.materialVersion,
    payloadStructuredJson: JSON.stringify(event),
    status: "PENDING",
    attempts: 0,
    availableAt: new Date(),
    correlationId: event.correlationId,
    retentionUntil: retentionUntil instanceof Date ? retentionUntil : new Date(retentionUntil || Date.now() + 90 * 86400000),
  };
  try {
    return await tx.eventoOutboxEstoque.create({ data });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await tx.eventoOutboxEstoque.findFirst({ where: {
      empresaId: data.empresaId,
      eventType: data.eventType,
      aggregateType: data.aggregateType,
      aggregateId: data.aggregateId,
      materialVersion: data.materialVersion,
    } });
    if (!existing) throw error;
    try {
      const previous = JSON.parse(existing.payloadStructuredJson || "{}");
      if (previous.payloadHash && previous.payloadHash !== event.payloadHash) throw new StockError("STOCK_CONFLICT", "Replay com payload divergente.");
    } catch (parseError) {
      if (parseError instanceof StockError) throw parseError;
      throw new StockError("STOCK_CONFLICT", "Replay de outbox inconsistente.");
    }
    return existing;
  }
}

async function claimStockOutbox({ prisma, empresaId, owner, limit = 20, leaseMs = 30000, now = new Date() }) {
  if (!Number.isSafeInteger(Number(empresaId)) || Number(empresaId) <= 0) throw new StockError("STOCK_TENANT_CONTEXT_INVALID", "Tenant do outbox invalido.", undefined, 401);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const boundedOwner = String(owner || "stock-worker").slice(0, 128);
  const leaseUntil = new Date(now.getTime() + Math.max(5000, Math.min(10 * 60 * 1000, Number(leaseMs) || 30000)));
  const rows = await prisma.eventoOutboxEstoque.findMany({
    where: {
      empresaId: Number(empresaId),
      status: { in: ["PENDING", "PROCESSING"] },
      availableAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: [{ empresaId: "asc" }, { availableAt: "asc" }, { id: "asc" }],
    take: safeLimit * 4,
  });
  const claimed = [];
  for (const row of rows) {
    if (claimed.length >= safeLimit) break;
    const result = await prisma.eventoOutboxEstoque.updateMany({
      where: { id: row.id, empresaId: Number(empresaId), status: { in: ["PENDING", "PROCESSING"] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      data: { status: "PROCESSING", leaseOwner: boundedOwner, leaseExpiresAt: leaseUntil, attempts: { increment: 1 } },
    });
    if (result.count === 1) {
      claimed.push({ ...row, status: "PROCESSING", leaseOwner: boundedOwner, leaseExpiresAt: leaseUntil });
    }
  }
  return claimed;
}

async function processStockOutboxBatch({ prisma, empresaId, owner, limit = 20, leaseMs = 30000, now = new Date(), logger = console, h8ProjectionEnabled = false, consumer = null }) {
  if (!h8ProjectionEnabled) return { claimed: 0, processed: 0, quarantined: 0, disabled: true };
  if (typeof consumer !== "function") throw new StockError("STOCK_UNAVAILABLE", "Consumer de outbox nao esta ativo.", undefined, 503);
  const effectiveOwner = String(owner || "stock-worker").slice(0, 128);
  const claimed = await claimStockOutbox({ prisma, empresaId, owner: effectiveOwner, limit, leaseMs, now });
  let processed = 0;
  let quarantined = 0;
  for (const row of claimed) {
    try {
      const event = JSON.parse(row.payloadStructuredJson || "{}");
      validateStockEvent(event, { activeOnly: true });
      if (!ACTIVE_EVENT_TYPES.includes(event.eventType)) throw new StockError("STOCK_SCHEMA_UNSUPPORTED", "Evento reservado.");
      await consumer(event, row);
      const marked = await prisma.eventoOutboxEstoque.updateMany({
        where: { id: row.id, empresaId: Number(empresaId), status: "PROCESSING", leaseOwner: effectiveOwner },
        data: { status: "PROCESSED", processedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      });
      if (marked.count !== 1) throw new StockError("STOCK_CONFLICT", "Lease do outbox expirada antes do commit.");
      processed += 1;
    } catch (error) {
      logger.warn?.("stock_outbox_quarantined", { code: error?.code || "STOCK_EVENT_INVALID", outboxId: row.id });
      const quarantinedRow = await prisma.eventoOutboxEstoque.updateMany({
        where: { id: row.id, empresaId: Number(empresaId), status: "PROCESSING", leaseOwner: effectiveOwner },
        data: { status: "QUARANTINED", leaseOwner: null, leaseExpiresAt: null },
      });
      if (quarantinedRow.count === 1) quarantined += 1;
    }
  }
  return { claimed: claimed.length, processed, quarantined };
}

module.exports = { appendStockOutbox, claimStockOutbox, processStockOutboxBatch };
