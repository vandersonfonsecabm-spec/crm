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
    port: String(parsed.port || "5432"),
    protocol: "postgresql",
  };
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

  const expectedFingerprint = String(env.CRM_DATABASE_TARGET_FINGERPRINT || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
    throw targetError("RAILWAY_DATABASE_TARGET_FINGERPRINT_MISSING");
  }
  const actualFingerprint = databaseTargetFingerprint(databaseUrl);
  if (!crypto.timingSafeEqual(Buffer.from(expectedFingerprint, "hex"), Buffer.from(actualFingerprint, "hex"))) {
    throw targetError("RAILWAY_DATABASE_TARGET_MISMATCH");
  }

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
  assertProviderMatchesDatabaseUrl,
  canonicalPostgresTarget,
  databaseTargetFingerprint,
  databaseUrlForProvider,
  databaseEngineFromUrl,
  databaseProviderFromEnv,
  runPrismaForProvider,
  runtimePrismaConfig,
};
