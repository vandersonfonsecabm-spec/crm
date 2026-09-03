const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  preparePostgresWorkspace,
  resolvePrismaCli,
} = require("./postgres-prisma.cjs");
const {
  createPrismaFailure,
  sanitizeFailure: sanitizeVerifierFailure,
} = require("./tenant-isolation-log-utils.cjs");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const SQLITE_FALLBACK_URL = "file:./prisma/dev.db";
const POSTGRES_PLACEHOLDER_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
const OFFICIAL_DATABASE_SERVICE_ID = "e9d8a6b8-507b-45fb-92a8-3ab016f865a2";
// These options identify the effective PostgreSQL namespace or connection
// contract without carrying credentials.  Keep this allowlist intentionally
// small: unknown query parameters must not silently become part of a target
// attestation, and password-like parameters are never fingerprinted.
const SAFE_POSTGRES_TARGET_QUERY_KEYS = new Set([
  "application_name",
  "connect_timeout",
  "connection_limit",
  "pgbouncer",
  "pool_timeout",
  "schema",
  "sslaccept",
  "sslcert",
  "sslidentity",
  "sslmode",
  "sslrootcert",
  "statement_cache_size",
]);
const SENSITIVE_POSTGRES_TARGET_QUERY_KEY = /(?:pass(?:word)?|secret|token|credential|authorization|cookie|api[_-]?key|private[_-]?key)/i;

function targetError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function databaseProviderFromEnv(env = process.env) {
  const value = String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  if (!value) return "sqlite";
  if (value === "sqlite" || value === "postgresql") return value;
  throw new Error("CRM_DATABASE_PROVIDER deve ser sqlite ou postgresql.");
}

function databaseEngineFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (value.startsWith("file:")) return "sqlite";
  if (/^postgres(ql)?:\/\//i.test(value)) return "postgresql";
  return null;
}

function assertProviderMatchesDatabaseUrl(provider, databaseUrl) {
  const engine = databaseEngineFromUrl(databaseUrl);
  if (!engine) throw new Error("DATABASE_URL deve usar file: ou postgresql://.");
  if (engine !== provider) throw new Error("CRM_DATABASE_PROVIDER inconsistente com DATABASE_URL.");
  return engine;
}

function databaseUrlForProvider(env = process.env, provider = databaseProviderFromEnv(env)) {
  if (provider === "postgresql") {
    return String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  }
  return String(env.DATABASE_URL || "").trim();
}

function databaseTargetFingerprint(rawUrl) {
  const canonical = canonicalPostgresTarget(rawUrl);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalPostgresTarget(rawUrl) {
  if (databaseEngineFromUrl(rawUrl) !== "postgresql") throw targetError("DATABASE_URL_INVALID");
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    throw targetError("DATABASE_URL_INVALID");
  }
  const host = String(parsed.hostname || "").trim().toLowerCase();
  const database = decodeURIComponent(String(parsed.pathname || "").replace(/^\/+/, "")).trim();
  if (!host || !database) throw targetError("DATABASE_URL_INVALID");
  return {
    database,
    host,
    parameters: canonicalPostgresTargetParameters(parsed),
    port: String(parsed.port || "5432"),
    protocol: "postgresql",
  };
}

function canonicalPostgresTargetParameters(parsed) {
  const parameters = new Map();
  for (const [rawKey, rawValue] of parsed.searchParams.entries()) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key || SENSITIVE_POSTGRES_TARGET_QUERY_KEY.test(key) || !SAFE_POSTGRES_TARGET_QUERY_KEYS.has(key)) continue;

    const value = normalizePostgresTargetParameter(key, rawValue);
    if (parameters.has(key) && parameters.get(key) !== value) {
      throw targetError("DATABASE_URL_QUERY_PARAMETER_AMBIGUOUS");
    }
    parameters.set(key, value);
  }

  // Prisma defaults to the public schema when no schema query parameter is
  // supplied.  Treating the omission as public makes semantically equivalent
  // URLs match while ensuring a different schema cannot share a fingerprint.
  if (!parameters.has("schema")) parameters.set("schema", "public");
  return Object.fromEntries([...parameters.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizePostgresTargetParameter(key, rawValue) {
  const value = String(rawValue ?? "").trim().normalize("NFC");
  if (!value || value.includes("\u0000")) throw targetError("DATABASE_URL_QUERY_PARAMETER_INVALID");
  if (key === "schema") return value;
  if (["pgbouncer", "sslaccept", "sslmode"].includes(key)) return value.toLowerCase();
  return value;
}

function assertPostgresTargetFingerprint({
  env = process.env,
  databaseUrl,
  fingerprintKey = "CRM_DATABASE_TARGET_FINGERPRINT",
  missingCode = "POSTGRES_TARGET_FINGERPRINT_REQUIRED",
  mismatchCode = "POSTGRES_TARGET_MISMATCH",
} = {}) {
  const expectedFingerprint = String(env[fingerprintKey] || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw targetError(missingCode);

  const actualFingerprint = databaseTargetFingerprint(databaseUrl);
  if (!crypto.timingSafeEqual(Buffer.from(expectedFingerprint, "hex"), Buffer.from(actualFingerprint, "hex"))) {
    throw targetError(mismatchCode);
  }
  return actualFingerprint;
}

function assertPinnedPostgresTarget({
  env = process.env,
  expectedDatabaseServiceId = OFFICIAL_DATABASE_SERVICE_ID,
  provider = databaseProviderFromEnv(env),
} = {}) {
  if (provider !== "postgresql") throw targetError("RAILWAY_PRODUCTION_POSTGRES_REQUIRED");

  const expectedServiceId = String(expectedDatabaseServiceId || "").trim();
  const actualServiceId = String(env.CRM_DATABASE_SERVICE_ID || "").trim();
  if (!expectedServiceId || !/^[A-Za-z0-9_-]+$/.test(expectedServiceId)) {
    throw targetError("RAILWAY_DATABASE_SERVICE_EXPECTATION_INVALID");
  }
  if (actualServiceId !== expectedServiceId) throw targetError("RAILWAY_DATABASE_SERVICE_MISMATCH");

  const databaseUrl = databaseUrlForProvider(env, provider);
  assertProviderMatchesDatabaseUrl(provider, databaseUrl);
  assertPostgresAliasTargetConsistency(env, databaseUrl);

  const actualFingerprint = assertPostgresTargetFingerprint({
    env,
    databaseUrl,
    missingCode: "RAILWAY_DATABASE_TARGET_FINGERPRINT_MISSING",
    mismatchCode: "RAILWAY_DATABASE_TARGET_MISMATCH",
  });

  return {
    databaseServiceId: actualServiceId,
    targetFingerprint: actualFingerprint,
  };
}

function assertPostgresAliasTargetConsistency(env, primaryUrl) {
  const legacyUrl = String(env.DATABASE_URL || "").trim();
  if (!legacyUrl || databaseEngineFromUrl(legacyUrl) !== "postgresql") return;
  if (databaseTargetFingerprint(legacyUrl) !== databaseTargetFingerprint(primaryUrl)) {
    throw targetError("RAILWAY_DATABASE_URL_TARGET_MISMATCH");
  }
}

function runtimePrismaConfig(options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || databaseProviderFromEnv(env);
  const backendDirectory = options.backendDirectory || backendDir;
  const sqliteSchema = options.sqliteSchemaPath || path.join(backendDirectory, "prisma", "schema.prisma");
  const command = options.command || "generate";
  const rawDatabaseUrl = databaseUrlForProvider(env, provider);

  if (provider === "sqlite") {
    const databaseUrl = rawDatabaseUrl || SQLITE_FALLBACK_URL;
    if (rawDatabaseUrl) assertProviderMatchesDatabaseUrl(provider, rawDatabaseUrl);
    return {
      env: { ...env, DATABASE_URL: databaseUrl },
      provider,
      schemaPath: sqliteSchema,
    };
  }

  if (provider !== "postgresql") {
    throw new Error("Provider Prisma invalido.");
  }

  if (command === "migrate-deploy") {
    assertProviderMatchesDatabaseUrl(provider, rawDatabaseUrl);
  } else if (rawDatabaseUrl) {
    assertProviderMatchesDatabaseUrl(provider, rawDatabaseUrl);
  }

  const workspace = preparePostgresWorkspace(options.postgresWorkspaceOptions);
  return {
    env: { ...env, DATABASE_URL: rawDatabaseUrl || POSTGRES_PLACEHOLDER_URL },
    provider,
    schemaPath: workspace.schemaPath,
    workspace,
  };
}

function runPrismaForProvider(command, options = {}) {
  if (!["generate", "validate", "migrate-deploy"].includes(command)) {
    throw new Error("Comando Prisma esperado: generate, validate ou migrate-deploy.");
  }
  const runCommand = options.runCommand || run;
  const config = runtimePrismaConfig({ ...options, command });
  const prismaCommand = command === "migrate-deploy" ? ["migrate", "deploy"] : [command];
  runCommand(process.execPath, [resolvePrismaCli(), ...prismaCommand, "--schema", config.schemaPath], config.env);
  return config;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw createPrismaFailure(`runtime-${args[0] || "command"}`, result.error.message);
  if (result.status !== 0) throw createPrismaFailure(`runtime-${args[0] || "command"}`, `${result.stderr || ""}\n${result.stdout || ""}`);
}

if (require.main === module) {
  const command = process.argv[2] || "generate";
  try {
    runPrismaForProvider(command);
  } catch (error) {
    console.error(JSON.stringify({ event: "prisma_runtime", safe: false, error: sanitizeVerifierFailure(error, "prisma-runtime") }));
    process.exitCode = 1;
  }
}

module.exports = {
  OFFICIAL_DATABASE_SERVICE_ID,
  POSTGRES_PLACEHOLDER_URL,
  SQLITE_FALLBACK_URL,
  assertPinnedPostgresTarget,
  assertPostgresAliasTargetConsistency,
  assertPostgresTargetFingerprint,
  assertProviderMatchesDatabaseUrl,
  canonicalPostgresTarget,
  databaseTargetFingerprint,
  databaseUrlForProvider,
  databaseEngineFromUrl,
  databaseProviderFromEnv,
  runPrismaForProvider,
  runtimePrismaConfig,
};
