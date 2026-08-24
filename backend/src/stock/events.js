"use strict";

const { checksum, sanitizeStructured, assertKnownVersion, RESERVED_RULE_EVENTS } = require("./contracts");
const { StockError } = require("./errors");

const ACTIVE_EVENT_TYPES = Object.freeze([
  "StockSyncStarted.v1",
  "StockSyncCompleted.v1",
  "StockSyncFailed.v1",
  "StockRecordObserved.v1",
  "StockCanonicalStateChanged.v1",
]);

const ALL_EVENT_TYPES = Object.freeze([...ACTIVE_EVENT_TYPES, ...RESERVED_RULE_EVENTS]);

function buildStockEvent({ type, empresaId, syncRunId = null, aggregateType, aggregateId, materialVersion, correlationId, payload = {}, occurredAt = new Date() }) {
  if (!ALL_EVENT_TYPES.includes(type)) throw new StockError("STOCK_INVALID", "Tipo de evento de estoque desconhecido.");
  if (!Number.isSafeInteger(Number(empresaId)) || Number(empresaId) <= 0) throw new StockError("STOCK_TENANT_CONTEXT_INVALID", "Tenant de evento invalido.", undefined, 401);
  if (!aggregateType || !aggregateId || !Number.isSafeInteger(Number(materialVersion)) || Number(materialVersion) < 1) {
    throw new StockError("STOCK_INVALID", "Agregado ou versao material invalida.");
  }
  const event = {
    schemaVersion: "stock-event.v1",
    eventType: type,
    empresaId: Number(empresaId),
    correlationId: String(correlationId || "").slice(0, 128) || null,
    syncRunId: syncRunId === null ? null : Number(syncRunId),
    aggregateType: String(aggregateType).slice(0, 120),
    aggregateId: String(aggregateId).slice(0, 256),
    materialVersion: Number(materialVersion),
    occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : new Date(occurredAt).toISOString(),
    payload: sanitizeStructured(payload),
  };
  return Object.freeze({ ...event, payloadHash: checksum(event.payload) });
}

function validateStockEvent(event, options = {}) {
  if (!event || typeof event !== "object") throw new StockError("STOCK_INVALID", "Envelope de evento ausente.");
  assertKnownVersion(event.schemaVersion, "stock-event.v1");
  if (!ALL_EVENT_TYPES.includes(event.eventType)) throw new StockError("STOCK_SCHEMA_UNSUPPORTED", "Tipo de evento nao suportado.");
  if (options.activeOnly && !ACTIVE_EVENT_TYPES.includes(event.eventType)) throw new StockError("STOCK_SCHEMA_UNSUPPORTED", "Evento reservado para E3.");
  if (!Number.isSafeInteger(Number(event.empresaId)) || Number(event.empresaId) <= 0 || !event.aggregateType || !event.aggregateId || !Number.isSafeInteger(Number(event.materialVersion)) || Number(event.materialVersion) < 1) throw new StockError("STOCK_INVALID", "Envelope de evento invalido.");
  if (event.payloadHash && event.payloadHash !== checksum(event.payload)) throw new StockError("STOCK_INVALID", "Hash de payload invalido.");
  return true;
}

module.exports = { ACTIVE_EVENT_TYPES, ALL_EVENT_TYPES, buildStockEvent, validateStockEvent };
