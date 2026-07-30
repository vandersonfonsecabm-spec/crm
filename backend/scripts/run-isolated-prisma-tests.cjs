const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const officialDb = path.join(backendDir, "prisma", "dev.db");
const historicalDb = path.join(backendDir, "dev.db");
const testsRoot = path.join(os.tmpdir(), "crm-prisma-tests");
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const runDir = path.join(testsRoot, runId);
const sandboxAPrisma = path.join(runDir, "sandbox-a", "prisma");
const sandboxBPrisma = path.join(runDir, "sandbox-b", "prisma");
const historicalPrisma = path.join(runDir, "historical-9", "prisma");
const testDb = path.join(sandboxAPrisma, "test.db");
const upgradeDb = path.join(sandboxBPrisma, "test.db");
const historicalTestDb = path.join(historicalPrisma, "test.db");
const command = process.argv.slice(2);
const expectedHash = "cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a";
const expectedSize = 532480;
const expectedMigrationCount = 26;
const historicalMigrationCount = 9;
const prismaCli = resolvePrismaCli();
const prismaConfigModule = require.resolve("prisma/config", { paths: [backendDir] });
let officialBaseline;
let historicalBaseline;
let completed = false;

main().catch((error) => {
  process.exitCode = 1;
  console.error(`[isolated-prisma] ${error.stack || error.message}`);
}).finally(async () => {
  try { assertProtectedDatabases(); } catch (error) {
    process.exitCode = 1;
    console.error(`[isolated-prisma] BANCO PROTEGIDO ALTERADO: ${error.stack || error.message}`);
  }
  if (completed && process.exitCode !== 1) console.log(`[isolated-prisma] OK ${runId}`);
  else console.error(`[isolated-prisma] evidencias preservadas em ${runDir}`);
});

process.once("SIGINT", () => { process.exitCode = 130; assertProtectedDatabases(); process.exit(); });
process.once("SIGTERM", () => { process.exitCode = 143; assertProtectedDatabases(); process.exit(); });

async function main() {
  if (command.length === 0) throw new Error("Informe o comando de teste a executar.");
  officialBaseline = fingerprint(officialDb);
  historicalBaseline = fingerprint(historicalDb);
  assertHistoricalBaseline(officialBaseline);
  assertNoSidecars(officialDb);
  assertNoSidecars(historicalDb);

  const sourceSchema = path.join(backendDir, "prisma", "schema.prisma");
  const sourceMigrations = path.join(backendDir, "prisma", "migrations");
  const migrationNames = migrationDirectories(sourceMigrations);
  const migrationCount = migrationNames.length;
  if (migrationCount !== expectedMigrationCount) throw new Error(`Esperadas ${expectedMigrationCount} migrations no worktree; encontradas ${migrationCount}.`);

  const sandboxA = prepareSandbox({
    targetPrisma: sandboxAPrisma,
    sourceSchema,
    sourceMigrations,
    migrationNames,
  });
  const historical = prepareSandbox({
    targetPrisma: historicalPrisma,
    sourceSchema,
    sourceMigrations,
    migrationNames: migrationNames.slice(0, historicalMigrationCount),
  });
  const sandboxB = prepareSandbox({
    targetPrisma: sandboxBPrisma,
    sourceSchema,
    sourceMigrations,
    migrationNames: migrationNames.slice(0, historicalMigrationCount),
  });

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl(testDb),
    CRM_TEST_DATABASE_URL: databaseUrl(testDb),
    CRM_PRISMA_TEST_RUN_DIR: runDir,
    CRM_TEST_BASE_DATABASE_PATH: testDb,
    CRM_TEST_SOURCE_DATABASE_PATH: historicalTestDb,
    CRM_PRISMA_SENTINEL_ACTIVE: "false",
    CRM_OFFICIAL_DATABASE_PATH: officialDb,
  };
  runPrisma(["validate", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  runPrisma(["generate", "--schema", sourceSchema], backendDir, env);

  runPrisma(["migrate", "deploy", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  runPrisma(["migrate", "status", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  await assertDatabase(testDb, migrationCount);

  runPrisma(["migrate", "deploy", "--schema", historical.schema, "--config", historical.config], runDir, env);
  await assertDatabase(historicalTestDb, historicalMigrationCount, ["Cliente"]);

  runPrisma(["migrate", "deploy", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  await assertDatabase(upgradeDb, historicalMigrationCount, ["Cliente"]);
  copyMigrationDirectories(sourceMigrations, path.join(sandboxBPrisma, "migrations"), migrationNames.slice(historicalMigrationCount));
  assertTreeEqual(sourceMigrations, path.join(sandboxBPrisma, "migrations"));
  runPrisma(["migrate", "deploy", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  runPrisma(["migrate", "status", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  await assertDatabase(upgradeDb, migrationCount);

  assertProtectedDatabases();
  runRequestedCommand(command, env);
  assertProtectedDatabases();
  completed = true;
}

function prepareSandbox({ targetPrisma, sourceSchema, sourceMigrations, migrationNames }) {
  fs.mkdirSync(targetPrisma, { recursive: true });
  const targetSchema = path.join(targetPrisma, "schema.prisma");
  const targetConfig = path.join(targetPrisma, "prisma.config.cjs");
  const targetDatabase = path.join(targetPrisma, "test.db");
  const targetMigrations = path.join(targetPrisma, "migrations");
  fs.mkdirSync(targetMigrations, { recursive: true });
  const originalSchema = fs.readFileSync(sourceSchema, "utf8");
  const sandboxSchemaText = originalSchema.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = "file:.\/test.db"');
  if (sandboxSchemaText === originalSchema) throw new Error("Datasource DATABASE_URL nao encontrada no schema.");
  if (sandboxSchemaText.replace('url      = "file:./test.db"', 'url      = env("DATABASE_URL")') !== originalSchema) {
    throw new Error("Sandbox alteraria mais do que a URL do datasource.");
  }
  fs.writeFileSync(targetSchema, sandboxSchemaText);
  fs.writeFileSync(targetDatabase, "");
  fs.writeFileSync(targetConfig, [
    `const { defineConfig } = require(${JSON.stringify(prismaConfigModule)});`,
    "",
    "module.exports = defineConfig({",
    '  schema: "./schema.prisma",',
    "  datasource: {",
    '    url: "file:./test.db",',
    "  },",
    "});",
    "",
  ].join("\n"));
  const lockFile = path.join(sourceMigrations, "migration_lock.toml");
  if (fs.existsSync(lockFile)) fs.copyFileSync(lockFile, path.join(targetMigrations, "migration_lock.toml"));
  copyMigrationDirectories(sourceMigrations, targetMigrations, migrationNames);
  return { schema: targetSchema, config: targetConfig };
}

function copyMigrationDirectories(sourceMigrations, targetMigrations, migrationNames) {
  for (const name of migrationNames) {
    const source = path.join(sourceMigrations, name);
    const target = path.join(targetMigrations, name);
    if (fs.existsSync(target)) throw new Error(`Migration duplicada no sandbox: ${name}`);
    fs.cpSync(source, target, { recursive: true });
  }
}

function migrationDirectories(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
}

function runRequestedCommand(args, env) {
  const [mode, ...modeArgs] = args;
  if (mode === "prisma") {
    if (modeArgs.length === 0) throw new Error("Informe o comando logico do Prisma.");
    runPrisma(modeArgs, backendDir, env);
    return;
  }
  if (mode === "node-test") {
    if (modeArgs.length !== 1) throw new Error("Informe exatamente um arquivo para o test runner do Node.");
    const testFile = path.resolve(backendDir, modeArgs[0]);
    const testsDir = path.join(backendDir, "tests");
    if (!isPathInside(testFile, testsDir) || !fs.existsSync(testFile) || !fs.statSync(testFile).isFile()) {
      throw new Error("Arquivo de teste deve existir dentro de backend/tests.");
    }
    runNode(["--test", testFile], backendDir, env, "Teste Node");
    return;
  }
  if (mode === "node-suite") {
    if (modeArgs.length !== 0) throw new Error("node-suite nao aceita argumentos adicionais.");
    const testsDir = path.join(backendDir, "tests");
    const suiteDir = path.join(runDir, "test-databases");
    fs.mkdirSync(suiteDir, { recursive: true });
    const testFiles = fs.readdirSync(testsDir)
      .filter((name) => name.endsWith(".test.js"))
      .sort();
    for (const name of testFiles) {
      const isolatedDb = path.join(suiteDir, `${name}.db`);
      fs.copyFileSync(testDb, isolatedDb, fs.constants.COPYFILE_EXCL);
      const isolatedEnv = {
        ...env,
        DATABASE_URL: databaseUrl(isolatedDb),
        CRM_TEST_DATABASE_URL: databaseUrl(isolatedDb),
        CRM_TEST_BASE_DATABASE_PATH: isolatedDb,
      };
      runNode(["--test", path.join(testsDir, name)], backendDir, isolatedEnv, `Teste Node ${name}`);
    }
    return;
  }
  throw new Error("Comando logico permitido: prisma, node-test ou node-suite.");
}

function runPrisma(args, cwd, env) {
  runNode([prismaCli, ...args], cwd, env, `Prisma ${args[0] || "CLI"}`);
}

function runNode(args, cwd, env, logicalCommand) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  assertProtectedDatabases();
  if (result.error) {
    throw new Error(`${logicalCommand} nao iniciou (${result.error.code || "SPAWN_ERROR"}).`);
  }
  if (!Number.isInteger(result.status)) {
    throw new Error(`${logicalCommand} terminou sem codigo de saida.`);
  }
  if (result.status !== 0) {
    throw new Error(`${logicalCommand} falhou com codigo ${result.status}.`);
  }
}

function resolvePrismaCli() {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string"
    ? prismaPackage.bin
    : prismaPackage.bin?.prisma;
  if (!relativeBin) throw new Error("Prisma local nao declara o binario prisma.");
  const cliPath = path.resolve(path.dirname(packageJsonPath), relativeBin);
  if (!fs.existsSync(cliPath) || !fs.statSync(cliPath).isFile()) {
    throw new Error("Binario local do Prisma nao foi encontrado.");
  }
  return cliPath;
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function assertDatabase(databasePath, expectedMigrations, required = ["Negocio", "EmpresaFuncionalidade", "Lead", "Cliente"]) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  try {
    const quick = await prisma.$queryRawUnsafe("PRAGMA quick_check");
    const foreignKeys = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
    const migrations = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table'");
    if (quick[0]?.quick_check !== "ok" || foreignKeys.length !== 0) throw new Error("Banco temporario falhou na integridade.");
    if (Number(migrations[0]?.total) !== expectedMigrations) throw new Error("Quantidade incorreta de migrations no banco temporario.");
    for (const name of required) if (!tables.some((table) => table.name === name)) throw new Error(`Tabela ausente: ${name}`);
  } finally { await prisma.$disconnect(); }
}

function assertProtectedDatabases() {
  if (!officialBaseline || !historicalBaseline) return;
  const officialCurrent = fingerprint(officialDb);
  const historicalCurrent = fingerprint(historicalDb);
  if (officialCurrent.size !== officialBaseline.size || officialCurrent.hash !== officialBaseline.hash) {
    throw new Error("backend/prisma/dev.db foi alterado.");
  }
  if (historicalCurrent.size !== historicalBaseline.size || historicalCurrent.hash !== historicalBaseline.hash) {
    throw new Error("backend/dev.db foi alterado.");
  }
  assertNoSidecars(officialDb);
  assertNoSidecars(historicalDb);
}

function assertNoSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(`${databasePath}${suffix}`)) throw new Error(`Sidecar inesperado: ${databasePath}${suffix}`);
  }
}

function assertHistoricalBaseline(value) {
  if (value.size !== expectedSize || value.hash !== expectedHash) throw new Error(`dev.db fora do baseline historico: ${JSON.stringify(value)}`);
}

function fingerprint(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, hash: crypto.createHash("sha256").update(data).digest("hex") };
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
