"use strict";

const crypto = require("node:crypto");

const DEFAULT_THRESHOLD_MS = 500;
const DEFAULT_MAX_FINGERPRINTS = 500;
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const MAX_THRESHOLD_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OPERATION_LENGTH = 120;
const SAFE_ERROR_CODES = new Set([
  "P1001",
  "P1008",
  "P1017",
  "P2024",
  "P2028",
  "P2034",
]);

function envEnabled(env = process.env) {
  return [
    env.CRM_PRISMA_QUERY_OBSERVABILITY,
    env.CRM_DATABASE_QUERY_OBSERVABILITY,
  ].some((value) => String(value || "").trim().toLowerCase() === "true");
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeOperation(value, fallback = "unknown") {
  const normalized = String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, MAX_OPERATION_LENGTH);
  return normalized || fallback;
}

function classifyPrismaError(error) {
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  if (SAFE_ERROR_CODES.has(code)) return code;
  const text = `${error?.name || ""} ${error?.message || ""}`.toUpperCase();
  for (const candidate of SAFE_ERROR_CODES) {
    if (text.includes(candidate)) return candidate;
  }
  if (text.includes("TIMEOUT") || text.includes("TIMED OUT")) return "TIMEOUT";
  return null;
}

function normalizeQueryForFingerprint(query) {
  return String(query || "")
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function fingerprintQuery(query, target) {
  const normalized = `${safeOperation(target, "prisma")}\0${normalizeQueryForFingerprint(query)}`;
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
}

function createPrismaQueryObservability(options = {}) {
  const env = options.env || process.env;
  const enabled = options.enabled === undefined ? envEnabled(env) : options.enabled === true;
  const thresholdMs = boundedInteger(
    env.CRM_PRISMA_SLOW_QUERY_MS,
    DEFAULT_THRESHOLD_MS,
    1,
    MAX_THRESHOLD_MS,
  );
  const maxFingerprints = boundedInteger(
    env.CRM_PRISMA_QUERY_METRICS_MAX,
    DEFAULT_MAX_FINGERPRINTS,
    10,
    5000,
  );
  const ttlMs = boundedInteger(
    env.CRM_PRISMA_QUERY_METRICS_TTL_MS,
    DEFAULT_TTL_MS,
    1000,
    MAX_TTL_MS,
  );
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const logger = options.logger || console;
  const metrics = new Map();

  function prune(at = now()) {
    for (const [key, metric] of metrics) {
      if (at - metric.lastSeenAt > ttlMs) metrics.delete(key);
    }
    while (metrics.size > maxFingerprints) {
      const oldest = [...metrics.entries()].sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)[0];
      if (!oldest) break;
      metrics.delete(oldest[0]);
    }
  }

  function recordQuery(event = {}) {
    if (!enabled) return null;
    const durationMs = boundedInteger(event.duration, 0, 0, MAX_THRESHOLD_MS * 100);
    const target = safeOperation(event.target, "prisma");
    const fingerprint = fingerprintQuery(event.query, target);
    const at = now();
    const current = metrics.get(fingerprint) || {
      fingerprint,
      target,
      count: 0,
      slowCount: 0,
      totalMs: 0,
      maxMs: 0,
      lastSeenAt: at,
    };
    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    current.lastSeenAt = at;
    if (durationMs >= thresholdMs) {
      current.slowCount += 1;
      safeLog("warn", {
        event: "prisma_slow_query",
        durationMs,
        thresholdMs,
        target,
        fingerprint,
      });
    }
    metrics.set(fingerprint, current);
    prune(at);
    return current;
  }

  function recordError(event = {}) {
    if (!enabled) return null;
    const code = classifyPrismaError(event.error || event);
    if (!code) return null;
    const at = now();
    safeLog("warn", {
      event: "prisma_database_error",
      code,
      target: safeOperation(event.target, "prisma"),
      durationMs: boundedInteger(event.duration, 0, 0, MAX_THRESHOLD_MS * 100),
    });
    return { code, at };
  }

  function safeLog(level, payload) {
    const method = typeof logger[level] === "function" ? logger[level] : logger.info;
    if (typeof method !== "function") return;
    try {
      method.call(logger, JSON.stringify(payload));
    } catch {
      // Observability must never break a request or worker cycle.
    }
  }

  async function observe(operation, fn, meta = {}) {
    if (typeof fn !== "function") throw new TypeError("observe exige uma funcao.");
    if (!enabled) return fn();
    const started = now();
    try {
      const result = await fn();
      recordQuery({
        duration: Math.max(0, now() - started),
        query: `operation:${safeOperation(operation)}`,
        target: meta.target || operation,
      });
      return result;
    } catch (error) {
      const duration = Math.max(0, now() - started);
      recordQuery({
        duration,
        query: `operation:${safeOperation(operation)}`,
        target: meta.target || operation,
      });
      recordError({ error, duration, target: meta.target || operation });
      throw error;
    }
  }

  function snapshot() {
    prune();
    return {
      enabled,
      thresholdMs,
      ttlMs,
      fingerprints: [...metrics.values()]
        .map((metric) => ({
          fingerprint: metric.fingerprint,
          target: metric.target,
          count: metric.count,
          slowCount: metric.slowCount,
          totalMs: metric.totalMs,
          maxMs: metric.maxMs,
          averageMs: metric.count ? Number((metric.totalMs / metric.count).toFixed(2)) : 0,
        }))
        .sort((left, right) => right.totalMs - left.totalMs)
        .slice(0, maxFingerprints),
    };
  }

  return {
    enabled,
    thresholdMs,
    ttlMs,
    observe,
    onError: recordError,
    onQuery: recordQuery,
    reset: () => metrics.clear(),
    snapshot,
  };
}

function attachPrismaQueryObservability(prisma, options = {}) {
  const observability = createPrismaQueryObservability(options);
  if (!prisma || typeof prisma.$on !== "function") return observability;
  if (observability.enabled) {
    prisma.$on("query", (event) => observability.onQuery(event));
    prisma.$on("error", (event) => observability.onError(event));
  }
  try {
    Object.defineProperty(prisma, "__crmQueryObservability", {
      configurable: true,
      enumerable: false,
      value: observability,
    });
  } catch {
    // A Prisma proxy may reject extension properties; listeners still work.
  }
  return observability;
}

module.exports = {
  attachPrismaQueryObservability,
  classifyPrismaError,
  createPrismaQueryObservability,
  envEnabled,
  fingerprintQuery,
};
