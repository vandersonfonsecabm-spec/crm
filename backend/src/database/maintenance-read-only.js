const MUTATING_MODEL_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

const RAW_WRITE_OPERATIONS = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
  "$runCommandRaw",
]);

const READ_ONLY_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MARKED_READ_ONLY_SQL = new Set();
const SQL_WRITE_TOKENS = new Set([
  "ALTER",
  "ANALYZE",
  "ATTACH",
  "CALL",
  "COPY",
  "CREATE",
  "DELETE",
  "DETACH",
  "DO",
  "DROP",
  "GRANT",
  "INSERT",
  "LOCK",
  "MERGE",
  "NEXTVAL",
  "PRAGMA",
  "REINDEX",
  "REPLACE",
  "RESET",
  "REVOKE",
  "SET",
  "SETVAL",
  "TRUNCATE",
  "UNLOCK",
  "UPDATE",
  "UPSERT",
  "VACUUM",
]);

function maintenanceReadOnlyEnabled(env = process.env) {
  const raw = String(env.CRM_MAINTENANCE_READ_ONLY || "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  throw maintenanceConfigurationError();
}

function applyMaintenanceReadOnlyGuard(prisma, options = {}) {
  const env = options.env || process.env;
  if (!maintenanceReadOnlyEnabled(env)) return prisma;
  if (!prisma || typeof prisma.$extends !== "function") {
    throw maintenanceConfigurationError("PRISMA_EXTENSION_UNAVAILABLE");
  }

  return prisma.$extends({
    name: "crm-maintenance-read-only",
    query: {
      $allOperations({ model, operation, args, query }) {
        assertMaintenanceOperationAllowed({ model, operation, args });
        return query(args);
      },
    },
  });
}

function assertMaintenanceOperationAllowed({ model, operation, args }) {
  if (model && MUTATING_MODEL_OPERATIONS.has(operation)) {
    throw maintenanceReadOnlyError();
  }
  if (RAW_WRITE_OPERATIONS.has(operation)) {
    throw maintenanceReadOnlyError();
  }
  if (operation === "$queryRawUnsafe") {
    throw maintenanceReadOnlyError();
  }
  if (operation === "$queryRaw") {
    const sql = extractStaticSql(args);
    if (!isStrictReadOnlySelect(sql) || !MARKED_READ_ONLY_SQL.has(sql)) {
      throw maintenanceReadOnlyError();
    }
  }
}

function markMaintenanceReadOnlyQuery(statement) {
  if (!statement || typeof statement !== "object") {
    throw maintenanceConfigurationError("READ_ONLY_SQL_OBJECT_REQUIRED");
  }
  const sql = extractStaticSql(statement);
  if (!isStrictReadOnlySelect(sql)) {
    throw maintenanceConfigurationError("READ_ONLY_SQL_INVALID");
  }
  MARKED_READ_ONLY_SQL.add(sql);
  return statement;
}

function createMaintenanceReadOnlyMiddleware(options = {}) {
  const env = options.env || process.env;
  const enabled = maintenanceReadOnlyEnabled(env);
  const mutatingGetPaths = new Set(options.mutatingGetPaths || []);

  return function maintenanceReadOnlyMiddleware(req, res, next) {
    if (!enabled) return next();
    if (READ_ONLY_HTTP_METHODS.has(req.method) && !mutatingGetPaths.has(req.path)) {
      return next();
    }
    res.set("Retry-After", "60");
    return res.status(503).json({
      erro: "Sistema temporariamente em manutencao somente leitura.",
      codigo: "MAINTENANCE_READ_ONLY",
    });
  };
}

function maintenanceReadOnlyError() {
  const error = new Error("Operacao bloqueada durante manutencao somente leitura.");
  error.code = "MAINTENANCE_READ_ONLY";
  error.status = 503;
  return error;
}

function isMaintenanceReadOnlyError(error) {
  return error?.code === "MAINTENANCE_READ_ONLY";
}

function maintenanceConfigurationError(code = "MAINTENANCE_READ_ONLY_INVALID") {
  const error = new Error(code);
  error.code = code;
  return error;
}

function extractStaticSql(statement) {
  if (Array.isArray(statement.strings)) return statement.strings.join("?");
  if (typeof statement.sql === "string") return statement.sql;
  return "";
}

function isStrictReadOnlySelect(sql) {
  const normalized = stripSqlLiteralsAndComments(sql);
  if (!normalized || normalized.includes(";") || normalized.includes("$")) return false;
  const tokens = normalized.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) || [];
  if (tokens[0] !== "SELECT") return false;
  return tokens.every((token) => !SQL_WRITE_TOKENS.has(token));
}

function stripSqlLiteralsAndComments(sql) {
  const source = String(sql || "");
  let output = "";
  let state = "normal";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
        output += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "normal";
        index += 1;
        output += " ";
      }
      continue;
    }
    if (state === "single-quote") {
      if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        state = "normal";
      }
      output += " ";
      continue;
    }
    if (state === "double-quote") {
      if (char === "\"" && next === "\"") {
        index += 1;
      } else if (char === "\"") {
        state = "normal";
      }
      output += " ";
      continue;
    }
    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 1;
      output += " ";
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      output += " ";
      continue;
    }
    if (char === "'") {
      state = "single-quote";
      output += " ";
      continue;
    }
    if (char === "\"") {
      state = "double-quote";
      output += " ";
      continue;
    }
    output += char;
  }

  return state === "normal" || state === "line-comment" ? output.trim() : "";
}

module.exports = {
  MUTATING_MODEL_OPERATIONS,
  applyMaintenanceReadOnlyGuard,
  assertMaintenanceOperationAllowed,
  createMaintenanceReadOnlyMiddleware,
  isMaintenanceReadOnlyError,
  maintenanceReadOnlyEnabled,
  markMaintenanceReadOnlyQuery,
};
