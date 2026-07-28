const LOG_SERVICE = "automation-worker";
const MAX_ERROR_MESSAGE_LENGTH = 240;

const NUMERIC_FIELDS = new Set([
  "tenantId",
  "ruleId",
  "jobId",
  "executionId",
  "eventId",
  "attempt",
  "maxAttempts",
  "durationMs",
  "pollIntervalMs",
  "batchSize",
  "leaseMs",
  "executionTimeoutMs",
]);

const IDENTIFIER_FIELDS = new Set([
  "workerInstanceId",
  "actionType",
  "triggerType",
  "status",
  "errorCode",
  "errorName",
  "provider",
]);

const DATE_FIELDS = new Set(["retryAt", "leaseUntil"]);

function createAutomationWorkerLogger({
  logger = console,
  workerInstanceId,
  provider = "unknown",
  clock = () => new Date(),
} = {}) {
  const baseFields = { workerInstanceId, provider };

  function write(method, event, fields = {}) {
    const output = typeof logger?.[method] === "function"
      ? logger[method]
      : typeof logger?.log === "function" ? logger.log : null;
    if (!output) return false;
    const entry = {
      event: safeIdentifier(event, "worker_event", 80),
      timestamp: safeTimestamp(clock()),
      service: LOG_SERVICE,
      ...sanitizeLogFields({ ...baseFields, ...fields }),
    };
    try {
      output.call(logger, JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  }

  const api = {
    info(event, fields) {
      return write("log", event, fields);
    },
    error(event, error, fields) {
      return write("error", event, { ...fields, ...sanitizeError(error) });
    },
    event(event, fields, error) {
      return error ? api.error(event, error, fields) : api.info(event, fields);
    },
  };
  return api;
}

function sanitizeLogFields(fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (NUMERIC_FIELDS.has(key)) {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) safe[key] = number;
      continue;
    }
    if (IDENTIFIER_FIELDS.has(key)) {
      safe[key] = safeIdentifier(value, "unknown", key === "workerInstanceId" ? 120 : 80);
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      const timestamp = safeTimestamp(value);
      if (timestamp) safe[key] = timestamp;
      continue;
    }
    if (key === "errorMessage") safe.errorMessage = sanitizeErrorMessage(value);
  }
  return safe;
}

function sanitizeError(error) {
  return {
    errorCode: safeIdentifier(error?.codigo || error?.code || "AUTOMATION_WORKER_ERROR", "AUTOMATION_WORKER_ERROR", 80),
    errorName: safeIdentifier(error?.name || "Error", "Error", 80),
    errorMessage: sanitizeErrorMessage(error?.message || "Automation worker error."),
  };
}

function sanitizeErrorMessage(value, maxLength = MAX_ERROR_MESSAGE_LENGTH) {
  let text = String(value || "Automation worker error.").replace(/[\r\n\t]+/g, " ");
  const replacements = [
    [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?|file):(?:\/\/)?[^\s"'<>]+/gi, "[REDACTED_URL]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]"],
    [/\b(cookie|set-cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
    [/\b(password|senha|secret|token|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]"],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
    [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_DOCUMENT]"],
    [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[REDACTED_DOCUMENT]"],
    [/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]"],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  const sanitized = text.replace(/\s+/g, " ").trim();
  return (sanitized || "Automation worker error.").slice(0, maxLength);
}

function safeIdentifier(value, fallback, maxLength) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_.:-]/g, "_");
  return (normalized || fallback).slice(0, maxLength);
}

function safeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

module.exports = {
  LOG_SERVICE,
  MAX_ERROR_MESSAGE_LENGTH,
  createAutomationWorkerLogger,
  sanitizeError,
  sanitizeErrorMessage,
  sanitizeLogFields,
};
