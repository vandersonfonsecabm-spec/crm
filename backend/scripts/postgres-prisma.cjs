const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const workspaceRoot = path.join(
  backendDir,
  "node_modules",
  ".cache",
  "crm-postgres-prisma",
);
const migrationName = "20260728090000_postgres_baseline";

function preparePostgresWorkspace(options = {}) {
  const root = options.root || path.join(workspaceRoot, stableWorkspaceId());
  const prismaDir = path.join(root, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const migrationDir = path.join(migrationsDir, migrationName);
  const schemaPath = path.join(prismaDir, "schema.prisma");
  fs.mkdirSync(migrationDir, { recursive: true });
  const clientOutput = path.join(backendDir, "node_modules", ".prisma", "client").replace(/\\/g, "/");
  fs.writeFileSync(schemaPath, postgresSchemaWithClientOutput(postgresSchemaText(fs.readFileSync(sqliteSchemaPath, "utf8")), clientOutput));
  fs.writeFileSync(path.join(migrationsDir, "migration_lock.toml"), 'provider = "postgresql"\n');
  const sql = options.migrationSql || generatePostgresMigrationSql(schemaPath);
  fs.writeFileSync(path.join(migrationDir, "migration.sql"), sql);
  return { root, prismaDir, migrationsDir, migrationDir, schemaPath, migrationName };
}

function postgresSchemaText(sqliteSchema) {
  const replaced = sqliteSchema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  if (replaced === sqliteSchema) throw new Error("Provider SQLite nao encontrado no schema Prisma canonico.");
  return replaced;
}

function postgresSchemaWithClientOutput(schema, outputPath) {
  return schema.replace(/generator\s+client\s*{([\s\S]*?)}/, (block, body) => {
    if (/^\s*output\s*=/m.test(body)) return block;
    return `generator client {${body}  output   = "${outputPath}"\n}`;
  });
}

function generatePostgresMigrationSql(schemaPath) {
  const prismaCli = resolvePrismaCli();
  const result = spawnSync(process.execPath, [
    prismaCli,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    schemaPath,
    "--script",
  ], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Falha ao gerar migration PostgreSQL (${result.status}): ${sanitize(result.stderr || result.stdout)}`);
  }
  return result.stdout;
}

function runPrisma(args, env = process.env) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...args], {
    cwd: backendDir,
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma falhou com codigo ${result.status}.`);
}

function postgresUrlFromEnv(env = process.env) {
  const value = String(env.POSTGRES_TEST_DATABASE_URL || env.POSTGRES_TARGET_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error("Informe POSTGRES_TEST_DATABASE_URL ou POSTGRES_TARGET_URL com postgresql://.");
  }
  return value;
}

function assertWriteConfirmation(env = process.env) {
  if (env.CRM_POSTGRES_MIGRATE_CONFIRM !== "apply-empty-postgres") {
    throw new Error("CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres e obrigatorio para aplicar migration PostgreSQL.");
  }
}

function stableWorkspaceId() {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(sqliteSchemaPath))
    .digest("hex")
    .slice(0, 16);
}

function resolvePrismaCli() {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  if (!relativeBin) throw new Error("Prisma local nao declara binario.");
  return path.resolve(path.dirname(packageJsonPath), relativeBin);
}

function sanitize(text) {
  return String(text || "")
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")
    .slice(0, 2000);
}

async function main() {
  const command = process.argv[2];
  if (!command || !["schema", "migration-sql", "validate", "generate", "migrate-empty"].includes(command)) {
    throw new Error("Comando esperado: schema, migration-sql, validate, generate ou migrate-empty.");
  }
  const workspace = preparePostgresWorkspace();
  if (command === "schema") {
    console.log(workspace.schemaPath);
    return;
  }
  if (command === "migration-sql") {
    const output = process.argv[3];
    const sqlPath = path.join(workspace.migrationDir, "migration.sql");
    if (output) {
      const target = path.resolve(output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(sqlPath, target);
      console.log(target);
    } else {
      console.log(sqlPath);
    }
    return;
  }
  if (command === "validate") {
    runPrisma(["validate", "--schema", workspace.schemaPath], { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
    return;
  }
  if (command === "generate") {
    runPrisma(["generate", "--schema", workspace.schemaPath], { ...process.env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" });
    return;
  }
  assertWriteConfirmation(process.env);
  const databaseUrl = postgresUrlFromEnv(process.env);
  runPrisma(["migrate", "deploy", "--schema", workspace.schemaPath], { ...process.env, DATABASE_URL: databaseUrl });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[postgres-prisma] ${sanitize(error.stack || error.message)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  generatePostgresMigrationSql,
  postgresSchemaWithClientOutput,
  postgresSchemaText,
  preparePostgresWorkspace,
  resolvePrismaCli,
  sanitize,
};
