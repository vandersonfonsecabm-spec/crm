const LOG_SERVICE = "automation-worker";
const MAX_ERROR_MESSAGE_LENGTH = 240;
const DEFAULT_ERROR_MESSAGE = "Automation worker operation failed.";
const UNKNOWN_ERROR_CODE = "UNKNOWN_ERROR";
const UNKNOWN_ERROR_NAME = "Error";
const UNKNOWN_ERROR_CLASS = "UNEXPECTED";
const UNKNOWN_FAILURE_REASON = "UNKNOWN_ERROR";
const SAFE_ERROR_MESSAGES = new Map([
  ["ACTION_CONFIG_MISSING", "Automation action configuration is missing."],
  ["ACTION_NOT_SUPPORTED", "Automation action is not supported."],
  ["ACTION_TIMEOUT", "Automation action timed out."],
  ["AUTOMATION_CLIENT_NOT_FOUND", "Automation client was not found."],
  ["FEATURE_DISABLED", "Automation feature is disabled."],
  ["NO_ELIGIBLE_USER", "Automation action has no eligible user."],
  ["ROUND_ROBIN_STATE_CONFLICT", "Round-robin state changed concurrently."],
  ["RULE_DISABLED", "Automation rule is disabled."],
  ["WORKER_CYCLE_TIMEOUT", "Worker cycle exceeded its deadline."],
  ["WORKER_SHUTDOWN_TIMEOUT", "Worker shutdown exceeded its deadline."],
]);
const SAFE_ERROR_CODES = new Set([
  "ACTION_CONFIG_MISSING",
  "ACTION_FAILED",
  "ACTION_NOT_SUPPORTED",
  "ACTION_TIMEOUT",
  "AUTOMATION_AUTHOR_UNAVAILABLE",
  "AUTOMATION_CLIENT_NOT_FOUND",
  "AUTOMATION_FORBIDDEN",
  "AUTOMATION_WORKER_ERROR",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "FEATURE_DISABLED",
  "JOB_RETRY_UNAVAILABLE",
  "NO_ELIGIBLE_USER",
  "NOT_FOUND",
  "PILOT_EVENT_DUPLICATE",
  "ROUND_ROBIN_STATE_CONFLICT",
  "RULE_DISABLED",
  "USER_NOT_FOUND",
  "VALIDATION_ERROR",
  "WORKER_CYCLE_TIMEOUT",
  "WORKER_SHUTDOWN_TIMEOUT",
]);
const DOMAIN_ERROR_CODES = new Set([
  "ACTION_CONFIG_MISSING",
  "ACTION_NOT_SUPPORTED",
  "ACTION_TIMEOUT",
  "AUTOMATION_AUTHOR_UNAVAILABLE",
  "AUTOMATION_CLIENT_NOT_FOUND",
  "AUTOMATION_FORBIDDEN",
  "FEATURE_DISABLED",
  "JOB_RETRY_UNAVAILABLE",
  "NO_ELIGIBLE_USER",
  "NOT_FOUND",
  "PILOT_EVENT_DUPLICATE",
  "ROUND_ROBIN_STATE_CONFLICT",
  "RULE_DISABLED",
  "USER_NOT_FOUND",
  "VALIDATION_ERROR",
  "WORKER_CYCLE_TIMEOUT",
  "WORKER_SHUTDOWN_TIMEOUT",
]);
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientRustPanicError",
  "PrismaClientUnknownRequestError",
  "PrismaClientValidationError",
]);
const SAFE_ERROR_CLASSES = new Set(["DOMAIN", "PRISMA", "TIMEOUT", "UNEXPECTED"]);
const SAFE_FAILURE_REASONS = new Set(["ATTEMPTS_EXHAUSTED", "PERMANENT_ERROR", "RETRYABLE_ERROR"]);
const SAFE_EVENTS = new Set([
  "action_failed",
  "action_started",
  "action_succeeded",
  "execution_started",
  "job_attempt_failed",
  "job_attempts_exhausted",
  "job_claimed",
  "job_failed",
  "job_lease_recovered",
  "job_permanent_failure",
  "job_retry_scheduled",
  "job_succeeded",
  "worker_disabled",
  "worker_failed",
  "worker_unhealthy",
  "worker_poll_error",
  "worker_started",
  "worker_stopped",
  "worker_stopping",
]);
const SAFE_ACTION_TYPES = new Set([
  "ASSIGN_OWNER",
  "ASSIGN_ROUND_ROBIN",
  "CREATE_FOLLOW_UP",
  "CREATE_INTERNAL_EVENT",
  "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
]);
const SAFE_TRIGGER_TYPES = new Set(["DEAL_STALLED", "LEAD_CREATED", "LEAD_WITHOUT_FOLLOW_UP"]);
const SAFE_STATUSES = new Set([
  "CANCELADO",
  "CONCLUIDO",
  "FAILED",
  "FALHA_DEFINITIVA",
  "FALHOU",
  "PENDENTE",
  "PROCESSANDO",
  "SUCCEEDED",
]);
const SAFE_LIFECYCLE_STATUSES = new Set(["disabled", "started", "stopped", "stopping"]);
const SAFE_PROVIDERS = new Set(["postgresql", "sqlite", "unknown"]);
const SAFE_SUBSYSTEMS = new Set(["automation", "automation_temporal", "automation_jobs", "notifications", "stock_core", "meta_inbound", "security_email_delivery", "worker_cycle", "worker_shutdown"]);
const UNTERMINATED_SENSITIVE_ERROR_VALUE = /\b(password|senha|secret|token|api[_-]?key)\s*[:=]\s*(?:"(?:\\.|[^"\\])*|'(?:\\.|[^'\\])*)$/gi;

const NUMERIC_FIELDS = new Set([
  "tenantId",
  "ruleId",
  "jobId",
  "executionId",
  "eventId",
  "attempt",
  "maxAttempts",
  "durationMs",
  "consecutiveFailures",
  "failedTenantCount",
  "pollIntervalMs",
  "cycleTimeoutMs",
  "shutdownTimeoutMs",
  "syncRunId",
  "sourceConnectionId",
  "materialVersion",
]);
const OPAQUE_FIELDS = new Set(["aggregateId", "correlationId"]);

const DATE_FIELDS = new Set(["retryAt", "leaseUntil"]);
const BOOLEAN_FIELDS = new Set(["final", "permanent", "retryable", "willRetry"]);

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
      event: normalizeEvent(event),
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
    event(envelope) {
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || envelope instanceof Error) return false;
      const method = envelope.errorCode ? "error" : "log";
      return write(method, envelope.event, envelope);
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
    if (OPAQUE_FIELDS.has(key)) {
      const text = String(value).trim();
      if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(text)) safe[key] = text;
      continue;
    }
    if (key === "workerInstanceId") {
      safe.workerInstanceId = normalizeWorkerInstanceId(value);
      continue;
    }
    if (key === "actionType") {
      safe.actionType = normalizeKnownIdentifier(value, SAFE_ACTION_TYPES, "UNKNOWN_ACTION");
      continue;
    }
    if (key === "triggerType") {
      safe.triggerType = normalizeKnownIdentifier(value, SAFE_TRIGGER_TYPES, "UNKNOWN_TRIGGER");
      continue;
    }
    if (key === "status") {
      safe.status = normalizeStatus(value);
      continue;
    }
    if (key === "provider") {
      const provider = String(value || "").trim().toLowerCase();
      safe.provider = SAFE_PROVIDERS.has(provider) ? provider : "unknown";
      continue;
    }
    if (key === "subsystem") {
      safe.subsystem = SAFE_SUBSYSTEMS.has(String(value || "").trim()) ? String(value).trim() : "unknown";
      continue;
    }
    if (key === "errorCode") {
      safe.errorCode = normalizeErrorCode(value);
      continue;
    }
    if (key === "errorName") {
      safe.errorName = normalizeErrorName(value);
      continue;
    }
    if (key === "errorClass") {
      safe.errorClass = normalizeErrorClass(value);
      continue;
    }
    if (key === "failureReason") {
      safe.failureReason = normalizeFailureReason(value);
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      const timestamp = safeTimestamp(value);
      if (timestamp) safe[key] = timestamp;
      continue;
    }
    if (BOOLEAN_FIELDS.has(key) && typeof value === "boolean") {
      safe[key] = value;
      continue;
    }
  }
  if (
    Object.hasOwn(fields, "errorMessage")
    || Object.hasOwn(safe, "errorCode")
    || Object.hasOwn(safe, "errorName")
    || Object.hasOwn(safe, "errorClass")
  ) {
    safe.errorMessage = safeErrorMessage(
      safe.errorCode || UNKNOWN_ERROR_CODE,
      safe.errorClass || UNKNOWN_ERROR_CLASS,
    );
  }
  return safe;
}

function sanitizeError(error) {
  const errorCode = normalizeErrorCode(error?.codigo || error?.code || "AUTOMATION_WORKER_ERROR");
  const errorName = normalizeErrorName(error?.name);
  const errorClass = classifyError(error, errorCode, errorName);
  return {
    errorCode,
    errorClass,
    errorName,
    errorMessage: safeErrorMessage(errorCode, errorClass),
  };
}

function createWorkerEventEnvelope(event, fields = {}, error) {
  return {
    event: normalizeEvent(event),
    ...sanitizeLogFields({
      ...fields,
      ...(error ? sanitizeError(error) : {}),
    }),
  };
}

function sanitizeErrorMessage(value, maxLength = MAX_ERROR_MESSAGE_LENGTH) {
  const escapedDoubleQuote = "\uE000";
  const escapedSingleQuote = "\uE001";
  let text = String(value || DEFAULT_ERROR_MESSAGE)
    .replace(/\\"/g, escapedDoubleQuote)
    .replace(/\\'/g, escapedSingleQuote);
  if (looksLikePrismaPayload(text)) return "Database operation failed.";
  text = text.replace(UNTERMINATED_SENSITIVE_ERROR_VALUE, "$1=[REDACTED]");
  const replacements = [
    [/\b(cookie|set-cookie|authorization)\s*[:=][^\r\n]*/gi, "$1=[REDACTED]"],
    [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?|file):(?:\/\/)?[^\s"'<>]+/gi, "[REDACTED_URL]"],
    [/\bBasic\s+[A-Za-z0-9+/=._~-]+/gi, "Basic [REDACTED]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]"],
    [/\b(password|senha|secret|token|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]"],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
    [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_DOCUMENT]"],
    [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[REDACTED_DOCUMENT]"],
    [/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]"],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  const sanitized = text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\uE000/g, '\\"')
    .replace(/\uE001/g, "\\'")
    .trim();
  return (sanitized || DEFAULT_ERROR_MESSAGE).slice(0, maxLength);
}

function classifyError(error, errorCode, errorName) {
  if (/^P\d{4}$/i.test(errorCode) || /^Prisma/i.test(errorName)) return "PRISMA";
  if (["ACTION_TIMEOUT", "WORKER_CYCLE_TIMEOUT", "WORKER_SHUTDOWN_TIMEOUT"].includes(errorCode) || /timeout/i.test(errorName)) return "TIMEOUT";
  if (DOMAIN_ERROR_CODES.has(errorCode)) return "DOMAIN";
  return "UNEXPECTED";
}

function safeErrorMessage(errorCode, errorClass) {
  if (errorClass === "PRISMA") return "Database operation failed.";
  return SAFE_ERROR_MESSAGES.get(errorCode) || DEFAULT_ERROR_MESSAGE;
}

function normalizeErrorCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (/^P\d{4}$/.test(normalized)) return normalized;
  return SAFE_ERROR_CODES.has(normalized) ? normalized : UNKNOWN_ERROR_CODE;
}

function normalizeErrorName(value) {
  const normalized = String(value || "").trim();
  return SAFE_ERROR_NAMES.has(normalized) ? normalized : UNKNOWN_ERROR_NAME;
}

function normalizeErrorClass(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return SAFE_ERROR_CLASSES.has(normalized) ? normalized : UNKNOWN_ERROR_CLASS;
}

function normalizeFailureReason(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return SAFE_FAILURE_REASONS.has(normalized) ? normalized : UNKNOWN_FAILURE_REASON;
}

function normalizeEvent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SAFE_EVENTS.has(normalized) ? normalized : "worker_event";
}

function normalizeWorkerInstanceId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9-]{1,120}$/.test(normalized) ? normalized : "worker-unknown";
}

function normalizeKnownIdentifier(value, allowed, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim();
  if (SAFE_LIFECYCLE_STATUSES.has(normalized)) return normalized;
  return normalizeKnownIdentifier(normalized, SAFE_STATUSES, "UNKNOWN_STATUS");
}

function looksLikePrismaPayload(text) {
  return /\bPrismaClient(?:KnownRequest|UnknownRequest|Validation|Initialization|RustPanic)?Error\b/i.test(text)
    || /\b(?:meta|target|data|args|input)\s*[:=]\s*[\[{]/i.test(text);
}

function safeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

module.exports = {
  LOG_SERVICE,
  MAX_ERROR_MESSAGE_LENGTH,
  createWorkerEventEnvelope,
  createAutomationWorkerLogger,
  normalizeErrorClass,
  normalizeErrorCode,
  normalizeErrorName,
  normalizeFailureReason,
  sanitizeError,
  sanitizeErrorMessage,
  sanitizeLogFields,
};
