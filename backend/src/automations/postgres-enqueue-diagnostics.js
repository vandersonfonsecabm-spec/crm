const crypto = require("node:crypto");

const OPERATIONS = new Set([
  "INSERT_AUTOMATION_EXECUTION",
  "INSERT_AUTOMATION_JOB",
]);
const ACTION_TYPES = new Set([
  "ASSIGN_OWNER",
  "ASSIGN_ROUND_ROBIN",
  "CREATE_FOLLOW_UP",
  "CREATE_INTERNAL_EVENT",
  "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
]);
const ENTITY_TYPES = new Set(["LEAD", "NEGOCIO"]);
const POSTGRES_MESSAGE_CATEGORIES = [
  [/invalid input value for enum/i, "invalid input value for enum"],
  [/(?:relation|table).+does not exist/i, "relation does not exist"],
  [/column.+does not exist/i, "column does not exist"],
  [/duplicate key/i, "duplicate key"],
  [/null value.+not-null constraint/i, "null value violates not-null constraint"],
  [/operator does not exist/i, "operator does not exist"],
  [/current transaction is aborted/i, "current transaction is aborted"],
  [/violates foreign key constraint/i, "foreign key constraint violation"],
  [/violates check constraint/i, "check constraint violation"],
];

async function withPostgresEnqueueDiagnostics({ operation, context, logger = console }, callback) {
  try {
    return await callback();
  } catch (error) {
    logPostgresEnqueueError({ operation, context, error, logger });
    throw error;
  }
}

function logPostgresEnqueueError({ operation, context = {}, error, logger = console }) {
  const output = typeof logger?.error === "function" ? logger.error : null;
  if (!output) return false;
  try {
    output.call(logger, JSON.stringify(createPostgresEnqueueDiagnostic({ operation, context, error })));
    return true;
  } catch {
    return false;
  }
}

function createPostgresEnqueueDiagnostic({ operation, context = {}, error }) {
  const meta = safeObject(error?.meta);
  const databaseError = safeObject(meta?.database_error);
  const cause = safeObject(error?.cause);
  const messageSource = firstString(
    meta?.message,
    typeof meta?.database_error === "string" ? meta.database_error : undefined,
    databaseError?.message,
    cause?.message,
  );
  const diagnostic = {
    operation: OPERATIONS.has(operation) ? operation : "UNKNOWN_POSTGRES_ENQUEUE_OPERATION",
  };

  assignIfPresent(diagnostic, "prismaCode", safePrismaCode(error?.code));
  assignIfPresent(
    diagnostic,
    "postgresCode",
    safeSqlState(firstString(meta?.code, meta?.sqlstate, databaseError?.code, databaseError?.sqlstate, cause?.code)),
  );
  assignIfPresent(diagnostic, "postgresMessage", safePostgresMessage(messageSource));
  assignIfPresent(
    diagnostic,
    "constraint",
    safeConstraint(firstString(meta?.constraint, databaseError?.constraint, cause?.constraint, constraintFromMessage(messageSource))),
  );
  assignIfPresent(diagnostic, "actionType", safeKnownIdentifier(context.actionType, ACTION_TYPES));
  assignIfPresent(diagnostic, "entityType", safeKnownIdentifier(context.entityType, ENTITY_TYPES));
  assignIfPresent(diagnostic, "tenantRef", stableReference("tenant", context.tenantId));
  assignIfPresent(diagnostic, "occurrenceRef", stableReference("occurrence", context.occurrenceKey));
  assignIfPresent(diagnostic, "actionRef", stableReference("action", context.actionKey));
  return diagnostic;
}

function safePostgresMessage(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  for (const [pattern, category] of POSTGRES_MESSAGE_CATEGORIES) {
    if (pattern.test(value)) return category;
  }
  return "database operation failed";
}

function safePrismaCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^P\d{4}$/.test(normalized) ? normalized : undefined;
}

function safeSqlState(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[0-9A-Z]{5}$/.test(normalized) ? normalized : undefined;
}

function safeConstraint(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,119}$/.test(normalized) ? normalized : undefined;
}

function constraintFromMessage(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\bconstraint\s+["']([A-Za-z_][A-Za-z0-9_.-]{0,119})["']/i);
  return match?.[1];
}

function safeKnownIdentifier(value, allowed) {
  const normalized = String(value || "").trim().toUpperCase();
  return allowed.has(normalized) ? normalized : undefined;
}

function stableReference(prefix, value) {
  if (value === undefined || value === null || String(value).length === 0) return undefined;
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function assignIfPresent(target, key, value) {
  if (value !== undefined) target[key] = value;
}

module.exports = {
  createPostgresEnqueueDiagnostic,
  logPostgresEnqueueError,
  withPostgresEnqueueDiagnostics,
};
