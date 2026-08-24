"use strict";

const STOCK_FLAG_NAMES = Object.freeze([
  "STOCK_DOMAIN_ENABLED",
  "STOCK_SYNC_WORKER_ENABLED",
  "STOCK_SOURCE_ENABLED",
  "STOCK_TENANT_ALLOWLIST",
  "STOCK_RULE_ENGINE_ENABLED",
  "STOCK_H8_PROJECTION_ENABLED",
]);

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function positiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseAllowlist(value) {
  if (Array.isArray(value)) {
    const ids = value.map(positiveId);
    return ids.every(Boolean) ? new Set(ids) : new Set();
  }
  const raw = String(value || "").trim();
  if (!raw) return new Set();
  const tokens = raw.split(",").map((item) => item.trim());
  if (tokens.some((item) => !item || !positiveId(item))) return new Set();
  return new Set(tokens.map(positiveId));
}

function stockFlags(env = process.env) {
  const allowlist = parseAllowlist(env.STOCK_TENANT_ALLOWLIST);
  return Object.freeze({
    domainEnabled: parseBoolean(env.STOCK_DOMAIN_ENABLED),
    syncWorkerEnabled: parseBoolean(env.STOCK_SYNC_WORKER_ENABLED),
    sourceEnabled: parseBoolean(env.STOCK_SOURCE_ENABLED),
    ruleEngineEnabled: parseBoolean(env.STOCK_RULE_ENGINE_ENABLED),
    h8ProjectionEnabled: parseBoolean(env.STOCK_H8_PROJECTION_ENABLED),
    tenantAllowlist: allowlist,
  });
}

function stockEnabledForTenant(empresaId, env = process.env, options = {}) {
  const id = positiveId(empresaId);
  if (!id) return false;
  const flags = stockFlags(env);
  if (!flags.domainEnabled) return false;
  if (options.worker && !flags.syncWorkerEnabled) return false;
  if (options.source && !flags.sourceEnabled) return false;
  if (flags.tenantAllowlist.size === 0 || !flags.tenantAllowlist.has(id)) return false;
  return true;
}

function assertStockFlagsOffForProduction(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() !== "production") return;
  const flags = stockFlags(env);
  const canaryApproved = parseBoolean(env.STOCK_RUNTIME_CANARY_APPROVED);
  if ((flags.ruleEngineEnabled || flags.h8ProjectionEnabled) && (!canaryApproved || flags.tenantAllowlist.size !== 1)) {
    throw new Error("STOCK_RULE_OR_H8_RUNTIME_MUST_REMAIN_OFF_IN_E2");
  }
}

module.exports = {
  STOCK_FLAG_NAMES,
  parseBoolean,
  parseAllowlist,
  positiveId,
  stockFlags,
  stockEnabledForTenant,
  assertStockFlagsOffForProduction,
};
