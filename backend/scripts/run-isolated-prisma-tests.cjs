const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(backendDir, "..");
const officialDb = path.join(backendDir, "prisma", "dev.db");
const resumeDir = path.join(os.tmpdir(), "crm-release-g2a-resume");
const protectedDir = path.join(resumeDir, "protected");
const testsRoot = path.join(os.tmpdir(), "crm-prisma-tests");
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const runDir = path.join(testsRoot, runId);
const sandboxPrisma = path.join(runDir, "prisma");
const testDb = path.join(sandboxPrisma, "test.db");
const activeBackup = path.join(protectedDir, "dev-original-active.db");
const command = process.argv.slice(2);
const expectedHash = "cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a";
const expectedSize = 532480;
let baseline;
let sentinelActive = false;
let completed = false;

main().catch((error) => {
  process.exitCode = 1;
  console.error(`[isolated-prisma] ${error.stack || error.message}`);
}).finally(async () => {
  try { await restoreOfficialDatabase(); } catch (error) {
    process.exitCode = 1;
    console.error(`[isolated-prisma] RESTAURACAO FALHOU: ${error.stack || error.message}`);
  }
  if (completed && process.exitCode !== 1) console.log(`[isolated-prisma] OK ${runId}`);
  else console.error(`[isolated-prisma] evidencias preservadas em ${runDir}`);
});

process.once("SIGINT", () => { process.exitCode = 130; restoreOfficialDatabase().finally(() => process.exit()); });
process.once("SIGTERM", () => { process.exitCode = 143; restoreOfficialDatabase().finally(() => process.exit()); });

async function main() {
  if (command.length === 0) throw new Error("Informe o comando de teste a executar.");
  fs.mkdirSync(protectedDir, { recursive: true });
  fs.mkdirSync(sandboxPrisma, { recursive: true });
  baseline = fingerprint(officialDb);
  assertHistoricalBaseline(baseline);

  const backup1 = path.join(protectedDir, `dev-${runId}-1.db`);
  const backup2 = path.join(protectedDir, `dev-${runId}-2.db`);
  verifiedCopy(officialDb, backup1, baseline);
  verifiedCopy(officialDb, backup2, baseline);

  const sourceSchema = path.join(backendDir, "prisma", "schema.prisma");
  const sourceMigrations = path.join(backendDir, "prisma", "migrations");
  const sandboxSchema = path.join(sandboxPrisma, "schema.prisma");
  fs.cpSync(sourceMigrations, path.join(sandboxPrisma, "migrations"), { recursive: true });
  const originalSchema = fs.readFileSync(sourceSchema, "utf8");
  const sandboxSchemaText = originalSchema.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = "file:.\/test.db"');
  if (sandboxSchemaText === originalSchema) throw new Error("Datasource DATABASE_URL nao encontrada no schema.");
  if (sandboxSchemaText.replace('url      = "file:./test.db"', 'url      = env("DATABASE_URL")') !== originalSchema) {
    throw new Error("Sandbox alteraria mais do que a URL do datasource.");
  }
  fs.writeFileSync(sandboxSchema, sandboxSchemaText);
  fs.writeFileSync(testDb, "");
  assertTreeEqual(sourceMigrations, path.join(sandboxPrisma, "migrations"));
  const migrationCount = fs.readdirSync(sourceMigrations, { withFileTypes: true }).filter((item) => item.isDirectory()).length;
  if (migrationCount !== 16) throw new Error(`Esperadas 16 migrations no worktree; encontradas ${migrationCount}.`);

  fs.renameSync(officialDb, activeBackup);
  fs.mkdirSync(officialDb);
  sentinelActive = true;

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl(testDb),
    CRM_TEST_DATABASE_URL: databaseUrl(testDb),
    CRM_PRISMA_TEST_RUN_DIR: runDir,
    CRM_TEST_BASE_DATABASE_PATH: testDb,
    CRM_TEST_SOURCE_DATABASE_PATH: activeBackup,
    CRM_PRISMA_SENTINEL_ACTIVE: "true",
    CRM_OFFICIAL_DATABASE_PATH: officialDb,
  };
  const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");
  run(process.execPath, [prismaCli, "validate", "--schema", sandboxSchema], runDir, env);
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", sandboxSchema], runDir, env);
  run(process.execPath, [prismaCli, "migrate", "status", "--schema", sandboxSchema], runDir, env);
  await assertDatabase(testDb, migrationCount);
  run(command[0], command.slice(1), repoDir, env);
  completed = true;
}

function run(executable, args, cwd, env) {
  const result = spawnSync(executable, args, { cwd, env, stdio: "inherit", windowsHide: true });
  assertSentinel();
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando falhou (${result.status}): ${executable} ${args.join(" ")}`);
}

async function assertDatabase(databasePath, expectedMigrations) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  try {
    const quick = await prisma.$queryRawUnsafe("PRAGMA quick_check");
    const foreignKeys = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
    const migrations = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const required = ["Negocio", "EmpresaFuncionalidade", "Lead", "Cliente"];
    const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table'");
    if (quick[0]?.quick_check !== "ok" || foreignKeys.length !== 0) throw new Error("Banco temporario falhou na integridade.");
    if (Number(migrations[0]?.total) !== expectedMigrations) throw new Error("Quantidade incorreta de migrations no banco temporario.");
    for (const name of required) if (!tables.some((table) => table.name === name)) throw new Error(`Tabela ausente: ${name}`);
  } finally { await prisma.$disconnect(); }
}

async function restoreOfficialDatabase() {
  if (!sentinelActive) return;
  assertSentinel();
  fs.rmdirSync(officialDb);
  fs.renameSync(activeBackup, officialDb);
  sentinelActive = false;
  const restored = fingerprint(officialDb);
  if (!baseline || restored.size !== baseline.size || restored.hash !== baseline.hash) throw new Error("dev.db restaurado nao corresponde ao baseline.");
}

function assertSentinel() {
  if (!sentinelActive) return;
  if (!fs.statSync(officialDb).isDirectory() || fs.readdirSync(officialDb).length !== 0) throw new Error("Sentinela dev.db foi alterada.");
  if (fingerprint(activeBackup).hash !== baseline.hash) throw new Error("Copia ativa protegida foi alterada.");
}

function assertHistoricalBaseline(value) {
  if (value.size !== expectedSize || value.hash !== expectedHash) throw new Error(`dev.db fora do baseline historico: ${JSON.stringify(value)}`);
}

function fingerprint(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, hash: crypto.createHash("sha256").update(data).digest("hex") };
}

function verifiedCopy(source, target, expected) {
  if (fs.existsSync(target)) throw new Error(`Backup protegido ja existe: ${target}`);
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  const actual = fingerprint(target);
  if (actual.size !== expected.size || actual.hash !== expected.hash) throw new Error(`Copia protegida invalida: ${target}`);
}

function assertTreeEqual(source, copy) {
  const sourceFiles = treeManifest(source);
  const copiedFiles = treeManifest(copy);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(copiedFiles)) throw new Error("Migrations do sandbox divergem do worktree.");
}

function treeManifest(root) {
  const result = [];
  walk(root, "", result);
  return result;
  function walk(directory, relative, output) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRelative = path.join(relative, item.name);
      const child = path.join(directory, item.name);
      if (item.isDirectory()) walk(child, childRelative, output);
      else output.push([childRelative.replace(/\\/g, "/"), fingerprint(child).hash]);
    }
  }
}

function databaseUrl(file) { return `file:${path.resolve(file).replace(/\\/g, "/")}`; }
