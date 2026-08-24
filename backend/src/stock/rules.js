"use strict";

const { ruleEvaluationContract, RULE_CONTRACT_VERSION } = require("./contracts");

const RULE_TYPES = Object.freeze(["STOCK_LOT_EXPIRING", "STOCK_LOT_EXPIRED", "STOCK_DATA_STALE", "STOCK_SYNC_FAILED"]);
const RULE_SCHEMA_VERSION = "stock-rule-evaluation.v1";
const DEFAULT_EXPIRY_WINDOW_DAYS = 7;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const REQUIRED_CAPABILITIES = Object.freeze({
  STOCK_LOT_EXPIRING: ["LOT_IDENTIFIER", "EXPIRATION_DATE", "ON_HAND_QUANTITY", "UNIT_OF_MEASURE"],
  STOCK_LOT_EXPIRED: ["LOT_IDENTIFIER", "EXPIRATION_DATE", "ON_HAND_QUANTITY", "UNIT_OF_MEASURE"],
  STOCK_DATA_STALE: ["SOURCE_UPDATED_AT"],
  STOCK_SYNC_FAILED: [],
});

const PRIORITY = Object.freeze({ STOCK_LOT_EXPIRING: "ATENCAO", STOCK_LOT_EXPIRED: "CRITICA", STOCK_DATA_STALE: "ATENCAO", STOCK_SYNC_FAILED: "CRITICA" });

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function tenantDateParts(now, timeZone = DEFAULT_TIMEZONE) {
  const date = safeDate(now) || new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function isoDateForExpiry(value, precision) {
  const raw = String(value || "").trim();
  if (precision === "DAY" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (precision === "MONTH" && /^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-").map(Number);
    if (month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  }
  if (precision === "YEAR" && /^\d{4}$/.test(raw)) return `${raw}-12-31`;
  return null;
}

function dayNumber(iso) {
  const date = safeDate(`${iso}T00:00:00Z`);
  return date ? Math.floor(date.getTime() / 86400000) : null;
}

function capabilityValues(capabilities = {}) {
  return capabilities?.capabilities || capabilities || {};
}

function hasRequiredCapabilities(ruleType, capabilities) {
  const values = capabilityValues(capabilities);
  return REQUIRED_CAPABILITIES[ruleType].filter((name) => values[name] !== true);
}

function quantityState(balance) {
  if (balance?.quantityRelevantForExpiry !== true) return { relevant: false, positive: false, reason: "QUANTITY_SEMANTICS_UNDECLARED" };
  if (balance?.onHand === null || balance?.onHand === undefined || balance?.onHand === "") return { relevant: true, positive: false, reason: "QUANTITY_UNKNOWN" };
  const value = Number(balance?.onHand);
  if (!Number.isFinite(value)) return { relevant: true, positive: false, reason: "QUANTITY_UNKNOWN" };
  return { relevant: true, positive: value > 0, reason: value > 0 ? null : "QUANTITY_NOT_POSITIVE" };
}

function occurrenceKey(ruleType, state) {
  const empresaId = Number(state.empresaId);
  const sourceId = Number(state.sourceConnectionId || state.fonteId || 0);
  const lotId = Number(state.loteEstoqueId || state.lot?.id || 0);
  const localId = Number(state.localEstoqueId || state.location?.id || 0);
  if (ruleType === "STOCK_LOT_EXPIRING" || ruleType === "STOCK_LOT_EXPIRED") return `${empresaId}:logicalExpiryLifecycle:${lotId}:${localId || "scope"}`;
  if (ruleType === "STOCK_DATA_STALE") return `${empresaId}:STOCK_DATA_STALE:${sourceId}:${state.scopeKey || "TENANT"}`;
  return `${empresaId}:STOCK_SYNC_FAILED:${sourceId}:${state.errorFamily || "UNKNOWN"}`;
}

function evaluateStockState({ ruleType, state = {}, config = {}, capabilities = {}, now = new Date() } = {}) {
  const type = String(ruleType || "");
  const evaluationTime = safeDate(now) || new Date();
  const tenantTimezone = String(config.timezone || state.tenantTimezone || DEFAULT_TIMEZONE);
  const requiredCapabilities = REQUIRED_CAPABILITIES[type] || [];
  const observed = capabilityValues(capabilities);
  const missing = hasRequiredCapabilities(type, capabilities);
  const canonicalRevision = Number(state.revision || state.balance?.revision || state.lot?.revision) || 1;
  const lifecycleMaterialOffset = type === "STOCK_LOT_EXPIRING" || type === "STOCK_DATA_STALE" ? 1 : type === "STOCK_LOT_EXPIRED" || type === "STOCK_SYNC_FAILED" ? 2 : 0;
  const base = {
    schemaVersion: RULE_SCHEMA_VERSION,
    ruleType: type,
    empresaId: Number(state.empresaId) || null,
    sourceConnectionId: Number(state.sourceConnectionId || state.fonteId) || null,
    scope: { scopeType: String(config.scopeType || "TENANT"), scopeKey: String(config.scopeKey || state.scopeKey || "TENANT") },
    produtoEstoqueId: Number(state.produtoEstoqueId || state.product?.id) || null,
    loteEstoqueId: Number(state.loteEstoqueId || state.lot?.id) || null,
    localEstoqueId: Number(state.localEstoqueId || state.location?.id) || null,
    requiredCapabilities,
    capabilitiesObserved: Object.fromEntries(requiredCapabilities.map((name) => [name, observed[name] === true])),
    enabledEffective: config.enabled === true,
    threshold: { expiryWindowDays: Number.isInteger(config.expiryWindowDays) ? config.expiryWindowDays : DEFAULT_EXPIRY_WINDOW_DAYS, freshnessSlaMinutes: config.freshnessSlaMinutes ?? null },
    evaluationTime: evaluationTime.toISOString(),
    tenantTimezone,
    freshnessRequirement: String(config.freshnessRequirement || "FRESH"),
    freshnessObserved: String(state.freshnessEstado || state.freshness || "UNKNOWN"),
    quantitySemantic: String(state.semanticaDisponivel || state.quantitySemantic || "UNKNOWN"),
    quantityRelevant: state.quantityRelevantForExpiry === true,
    expiryDate: state.lot?.validadeEm || state.expiryDate || null,
    expiryPrecision: String(state.lot?.precisaoValidade || state.expiryPrecision || "UNKNOWN"),
    match: false,
    noMatchReason: null,
    priority: PRIORITY[type] || null,
    occurrenceKey: occurrenceKey(type, state),
    materialVersion: Number.isSafeInteger(state.materialVersion) ? state.materialVersion : (canonicalRevision * 10 + lifecycleMaterialOffset),
    materialChange: state.materialChange === true,
    destination: state.destination || null,
    resolutionCandidate: null,
    suppressionPolicy: config.suppressionPolicy || "RESPECT_SNOOZE_UNTIL_MATERIAL_CHANGE",
    confidence: String(state.dataConfidence || state.confidence || "UNKNOWN"),
    correlationId: state.correlationId || null,
    evaluatedAt: evaluationTime.toISOString(),
  };
  if (!RULE_TYPES.includes(type)) return { ...base, noMatchReason: "RULE_NOT_ACTIVE" };
  if (config.enabled !== true) return { ...base, noMatchReason: "RULE_DISABLED" };
  if (missing.length) return { ...base, noMatchReason: "CAPABILITY_MISSING", capabilitiesMissing: missing };
  if (type === "STOCK_SYNC_FAILED") {
    const matched = state.syncFailed === true && state.retriesExhausted === true;
    return { ...base, match: matched, noMatchReason: matched ? null : "RETRIES_NOT_EXHAUSTED", confidence: matched ? "HIGH" : "UNKNOWN" };
  }
  if (type === "STOCK_DATA_STALE") {
    const freshness = base.freshnessObserved;
    const matched = freshness === "STALE" || freshness === "SYNC_FAILED";
    return { ...base, match: matched, noMatchReason: matched ? null : "FRESHNESS_WITHIN_SLA", resolutionCandidate: matched ? null : "FRESHNESS_HEALTHY" };
  }
  const quantity = quantityState(state.balance || state);
  if (!quantity.relevant) return { ...base, noMatchReason: quantity.reason };
  const expiryIso = isoDateForExpiry(base.expiryDate, base.expiryPrecision);
  if (!expiryIso) return { ...base, noMatchReason: "EXPIRY_UNKNOWN_OR_INVALID" };
  const today = tenantDateParts(evaluationTime, tenantTimezone);
  const todayNumber = dayNumber(`${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`);
  const expiryNumber = dayNumber(expiryIso);
  if (expiryNumber === null || todayNumber === null) return { ...base, noMatchReason: "EXPIRY_INVALID" };
  const delta = expiryNumber - todayNumber;
  if (type === "STOCK_LOT_EXPIRED") {
    const matched = delta < 0 && quantity.positive;
    return { ...base, match: matched, noMatchReason: matched ? null : (delta >= 0 ? "NOT_EXPIRED" : quantity.reason), resolutionCandidate: !matched && delta < 0 ? "QUANTITY_ZERO_OR_UNKNOWN" : null, expiryDate: expiryIso };
  }
  const windowDays = Number.isInteger(config.expiryWindowDays) && config.expiryWindowDays >= 0 ? config.expiryWindowDays : DEFAULT_EXPIRY_WINDOW_DAYS;
  const matched = delta >= 0 && delta <= windowDays && quantity.positive;
  return { ...base, match: matched, noMatchReason: matched ? null : (delta < 0 ? "ALREADY_EXPIRED" : delta > windowDays ? "OUTSIDE_WINDOW" : quantity.reason), resolutionCandidate: !matched && quantity.positive === false ? "QUANTITY_ZERO_OR_UNKNOWN" : null, expiryDate: expiryIso };
}

function evaluateStockRuleContract(input = {}) {
  const required = Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [];
  const provided = input.capabilities?.capabilities || input.capabilities || {};
  const missing = required.filter((name) => !provided[name]);
  if (missing.length) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "BLOCKED_CAPABILITY", ruleType: input.ruleType, requiredCapabilities: required, reason: "CAPABILITY_MISSING", candidateResolution: { missing } });
  const freshness = String(input.freshness || input.state?.freshnessEstado || "UNKNOWN");
  if (input.freshnessRequirement === "FRESH" && !["FRESH", "AGING"].includes(freshness)) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "BLOCKED_FRESHNESS", ruleType: input.ruleType, requiredCapabilities: required, reason: "FRESHNESS_UNAVAILABLE", candidateResolution: { freshness } });
  if (!RULE_TYPES.includes(String(input.ruleType || ""))) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "INVALID_STATE", reason: "RULE_NOT_ACTIVE_IN_E2" });
  return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "NO_MATCH", ruleType: input.ruleType, requiredCapabilities: required, reason: "RULE_ENGINE_RUNTIME_INACTIVE", materialVersion: input.materialVersion, confidence: input.confidence });
}

module.exports = {
  RULE_TYPES,
  RULE_SCHEMA_VERSION,
  REQUIRED_CAPABILITIES,
  evaluateStockRuleContract,
  evaluateStockState,
  RULE_CONTRACT_VERSION,
};
