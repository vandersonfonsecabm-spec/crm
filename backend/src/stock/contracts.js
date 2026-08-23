"use strict";

const crypto = require("node:crypto");
const { StockError } = require("./errors");

const ADAPTER_SCHEMA_VERSION = "stock-adapter.v1";
const NORMALIZED_SCHEMA_VERSION = "stock-normalized.v1";
const CAPABILITY_MANIFEST_VERSION = "stock-capabilities.v1";
const RULE_CONTRACT_VERSION = "stock-rule-evaluation.v1";
const CAPABILITIES = Object.freeze([
  "FULL_SNAPSHOT", "IMPORT_BATCH", "INCREMENTAL_CURSOR", "WEBHOOK_EVENTS", "PRODUCT_IDENTITY", "SKU", "BARCODE",
  "LOT_IDENTIFIER", "EXPIRATION_DATE", "LOCATION", "ON_HAND_QUANTITY", "RESERVED_QUANTITY",
  "AVAILABLE_QUANTITY", "QUARANTINED_QUANTITY", "UNIT_OF_MEASURE", "SOURCE_UPDATED_AT", "MOVEMENTS",
  "TOMBSTONES_DELETIONS", "READ_ONLY_ACCESS", "PAGINATION", "RATE_LIMIT_METADATA",
]);
const RESERVED_RULE_EVENTS = Object.freeze(["StockRuleMatched.v1", "StockRuleResolved.v1", "StockProjectionRequested.v1"]);

function checksum(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function assertKnownVersion(version, expected, code = "STOCK_SCHEMA_UNSUPPORTED") {
  if (version !== expected) throw new StockError(code, "Versao de contrato nao suportada.", { expected, received: version });
}

function capabilityManifest(capabilities = {}, semantics = {}) {
  assertKnownVersion(capabilities.version || CAPABILITY_MANIFEST_VERSION, CAPABILITY_MANIFEST_VERSION);
  const values = {};
  for (const name of CAPABILITIES) values[name] = Boolean(capabilities[name]);
  return Object.freeze({ version: CAPABILITY_MANIFEST_VERSION, capabilities: values, semantics: sanitizeStructured(semantics) });
}

function sanitizeStructured(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "string" || typeof value === "boolean") return typeof value === "string" ? value.slice(0, 2000) : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeStructured(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).slice(0, 100).map((key) => [String(key).slice(0, 120), /(?:password|token|secret|authorization|cookie|privatekey|credential|database|dsn|url)/i.test(key) ? "[redacted]" : sanitizeStructured(value[key], depth + 1)]));
  }
  return undefined;
}

function buildNormalizedEnvelope(context, record) {
  const tenantId = Number(context?.tenantId ?? context?.empresaId);
  const sourceConnectionId = Number(context?.sourceConnectionId ?? context?.fonteId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || !Number.isSafeInteger(sourceConnectionId) || sourceConnectionId <= 0) {
    throw new StockError("STOCK_TENANT_CONTEXT_INVALID", "Contexto de normalizacao invalido.", undefined, 401);
  }
  const sourceRecordId = String(record?.sourceRecordId || "").trim();
  if (!sourceRecordId || sourceRecordId.length > 256) throw new StockError("STOCK_INVALID", "Identidade externa obrigatoria.");
  const payload = sanitizeStructured(record.payload || {});
  const version = String(record.sourceRecordVersion || record.sourceVersion || checksum(payload));
  return Object.freeze({
    schemaVersion: NORMALIZED_SCHEMA_VERSION,
    tenantId,
    sourceConnectionId,
    sourceEntityType: String(record.sourceEntityType || "STOCK_RECORD").slice(0, 120),
    sourceRecordId,
    sourceRecordVersion: version.slice(0, 256),
    sourceUpdatedAt: record.sourceUpdatedAt instanceof Date ? record.sourceUpdatedAt.toISOString() : (record.sourceUpdatedAt || null),
    observedAt: record.observedAt instanceof Date ? record.observedAt.toISOString() : new Date().toISOString(),
    payload,
    warnings: Array.isArray(record.warnings) ? record.warnings.slice(0, 50).map((item) => String(item).slice(0, 240)) : [],
    dataQuality: String(record.dataQuality || "UNKNOWN"),
    provenance: sanitizeStructured(record.provenance || { sourceConnectionId }),
    checksum: checksum({ sourceRecordId, version, payload }),
  });
}

function ruleEvaluationContract(input = {}) {
  assertKnownVersion(input.schemaVersion || RULE_CONTRACT_VERSION, RULE_CONTRACT_VERSION);
  const decision = ["MATCH", "NO_MATCH", "BLOCKED_CAPABILITY", "BLOCKED_FRESHNESS", "INVALID_STATE"].includes(input.decision)
    ? input.decision : "INVALID_STATE";
  return Object.freeze({
    schemaVersion: RULE_CONTRACT_VERSION,
    decision,
    ruleType: String(input.ruleType || "").slice(0, 120),
    requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities.map(String).slice(0, 50) : [],
    reason: String(input.reason || "").slice(0, 500),
    materialVersion: Number.isSafeInteger(input.materialVersion) ? input.materialVersion : null,
    confidence: String(input.confidence || "UNKNOWN"),
    candidateResolution: sanitizeStructured(input.candidateResolution || null),
  });
}

module.exports = {
  ADAPTER_SCHEMA_VERSION,
  NORMALIZED_SCHEMA_VERSION,
  CAPABILITY_MANIFEST_VERSION,
  RULE_CONTRACT_VERSION,
  CAPABILITIES,
  RESERVED_RULE_EVENTS,
  checksum,
  stableJson,
  sanitizeStructured,
  assertKnownVersion,
  capabilityManifest,
  buildNormalizedEnvelope,
  ruleEvaluationContract,
};
