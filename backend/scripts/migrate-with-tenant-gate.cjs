const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  preparePostgresWorkspace,
  resolvePrismaCli,
  latestMigrationName,
} = require("./postgres-prisma.cjs");
const { runGate, sanitizeFailure } = require("./tenant-isolation-gate.cjs");
const { createPrismaFailure } = require("./tenant-isolation-log-utils.cjs");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const sqliteMigrationDir = path.join(backendDir, "prisma", "migrations");

function providerFromEnv(env) {
  const explicit = String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "sqlite" || explicit === "postgresql") return explicit;
  if (/^postgres(ql)?:\/\//i.test(String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || ""))) return "postgresql";
  return "sqlite";
}

function databaseUrlForProvider(env, provider) {
  const value = provider === "postgresql" ? env.POSTGRES_DATABASE_URL || env.DATABASE_URL : env.DATABASE_URL;
  if (!value) throw new Error("TENANT_MIGRATION_DATABASE_URL_MISSING");
  return String(value).trim();
}

function runPrisma(args, env) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...args], {
    cwd: backendDir,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw createPrismaFailure(`tenant-migration-${args[0] || "command"}`, result.error.message);
  if (result.status !== 0) throw createPrismaFailure(`tenant-migration-${args[0] || "command"}`, `${result.stderr || ""}\n${result.stdout || ""}`);
}

async function main() {
  const env = { ...process.env };
  const provider = providerFromEnv(env);
  let schemaPath = sqliteSchemaPath;
  let migrationDir = sqliteMigrationDir;
  let migrationName = latestMigrationName(migrationDir);
  let gateOptions = { env, schemaPath, migrationDir, migrationName };

  if (provider === "postgresql") {
    const workspace = preparePostgresWorkspace();
    schemaPath = workspace.schemaPath;
    migrationDir = workspace.migrationsDir;
    migrationName = latestMigrationName(migrationDir);
    const databaseUrl = databaseUrlForProvider(env, provider);
    const prismaEnv = { ...env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" };
    runPrisma(["validate", "--schema", schemaPath], prismaEnv);
    runPrisma(["generate", "--schema", schemaPath], prismaEnv);
    gateOptions = { env: { ...env, DATABASE_URL: databaseUrl }, schemaPath, postgresMigrationDir: migrationDir, migrationName };
  } else {
    const databaseUrl = databaseUrlForProvider(env, provider);
    const sqliteEnv = { ...env, DATABASE_URL: databaseUrl };
    runPrisma(["validate", "--schema", schemaPath], sqliteEnv);
    runPrisma(["generate", "--schema", schemaPath], sqliteEnv);
    gateOptions = { env: sqliteEnv, schemaPath, migrationDir, migrationName };
  }

  await runGate({ mode: "architecture", ...gateOptions });
  await runGate({ mode: "pre-migration", ...gateOptions });
  runPrisma(["migrate", "deploy", "--schema", schemaPath], gateOptions.env);
  await runGate({ mode: "post-migration", ...gateOptions });
  console.log(JSON.stringify({ event: "tenant_migration", safe: true, provider, migrationName }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "tenant_migration", safe: false, error: sanitizeFailure(error) }));
    process.exitCode = 1;
  });
}

module.exports = { main, providerFromEnv };
