const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  preparePostgresWorkspace,
  resolvePrismaCli,
  sanitize,
} = require("./postgres-prisma.cjs");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const SQLITE_FALLBACK_URL = "file:./prisma/dev.db";
const POSTGRES_PLACEHOLDER_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

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

function runtimePrismaConfig(options = {}) {
  const env = options.env || process.env;
  const provider = options.provider || databaseProviderFromEnv(env);
  const backendDirectory = options.backendDirectory || backendDir;
  const sqliteSchema = options.sqliteSchemaPath || path.join(backendDirectory, "prisma", "schema.prisma");
  const command = options.command || "generate";
  const rawDatabaseUrl = String(env.DATABASE_URL || "").trim();

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
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status}.`);
}

if (require.main === module) {
  const command = process.argv[2] || "generate";
  try {
    runPrismaForProvider(command);
  } catch (error) {
    console.error(`[prisma-runtime] ${sanitize(error.stack || error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  POSTGRES_PLACEHOLDER_URL,
  SQLITE_FALLBACK_URL,
  assertProviderMatchesDatabaseUrl,
  databaseEngineFromUrl,
  databaseProviderFromEnv,
  runPrismaForProvider,
  runtimePrismaConfig,
};
