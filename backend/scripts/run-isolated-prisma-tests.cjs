const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { createPrismaFailure, sanitizeFailure } = require("./tenant-isolation-log-utils.cjs");

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
const metaSandboxOnly = command[0] === "meta-suite";
const expectedHash = "6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533";
const expectedSize = 1282048;
const expectedMigrationCount = 32;
const historicalMigrationCount = 9;
const prismaCli = resolvePrismaCli();
const prismaConfigModule = require.resolve("prisma/config", { paths: [backendDir] });
let officialBaseline;
let historicalBaseline;
let completed = false;

main().catch((error) => {
  process.exitCode = 1;
  console.error(JSON.stringify({ event: "isolated_prisma", safe: false, error: sanitizeFailure(error, "isolated-prisma") }));
}).finally(async () => {
  try { if (!metaSandboxOnly) assertProtectedDatabases(); } catch (error) {
    process.exitCode = 1;
    console.error(JSON.stringify({ event: "isolated_prisma", safe: false, error: sanitizeFailure(error, "isolated-prisma") }));
  }
  if (completed && process.exitCode !== 1) {
    await removeRunDirectory(runDir);
    console.log(`[isolated-prisma] OK ${runId} (cleanup concluido)`);
  } else console.error(JSON.stringify({ event: "isolated_prisma", safe: false, cleanup: "preservado" }));
});

process.once("SIGINT", () => { process.exitCode = 130; if (!metaSandboxOnly) assertProtectedDatabases(); process.exit(); });
process.once("SIGTERM", () => { process.exitCode = 143; if (!metaSandboxOnly) assertProtectedDatabases(); process.exit(); });

async function main() {
  if (command.length === 0) throw new Error("Informe o comando de teste a executar.");
  if (!metaSandboxOnly) {
    officialBaseline = fingerprint(officialDb);
    historicalBaseline = fingerprint(historicalDb);
    assertHistoricalBaseline(officialBaseline);
    assertNoSidecars(officialDb);
    assertNoSidecars(historicalDb);
  }

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
  if (metaSandboxOnly) {
    const env = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl(testDb),
      CRM_TEST_DATABASE_URL: databaseUrl(testDb),
      CRM_PRISMA_TEST_RUN_DIR: runDir,
      CRM_TEST_BASE_DATABASE_PATH: testDb,
      CRM_PRISMA_SENTINEL_ACTIVE: "false",
    };
    runPrisma(["validate", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
    await runTenantGate("pre-migration", env, sourceSchema, sourceMigrations, migrationNames.at(-1));
    runPrisma(["migrate", "deploy", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
    await runTenantGate("post-migration", env, sourceSchema, sourceMigrations, migrationNames.at(-1));
    runRequestedCommand(command, env);
    completed = true;
    return;
  }

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
  await runTenantGate("architecture", env, sourceSchema, sourceMigrations, migrationNames.at(-1));

  await runTenantGate("pre-migration", env, sourceSchema, sourceMigrations, migrationNames.at(-1));
  runPrisma(["migrate", "deploy", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  runPrisma(["migrate", "status", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  await assertDatabase(testDb, migrationCount);
  await runTenantGate("post-migration", env, sourceSchema, sourceMigrations, migrationNames.at(-1));

  runPrisma(["migrate", "deploy", "--schema", historical.schema, "--config", historical.config], runDir, env);
  await assertDatabase(historicalTestDb, historicalMigrationCount, ["Cliente"]);

  runPrisma(["migrate", "deploy", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  await assertDatabase(upgradeDb, historicalMigrationCount, ["Cliente"]);
  copyMigrationDirectories(sourceMigrations, path.join(sandboxBPrisma, "migrations"), migrationNames.slice(historicalMigrationCount));
  assertTreeEqual(sourceMigrations, path.join(sandboxBPrisma, "migrations"));
  runPrisma(["migrate", "deploy", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  runPrisma(["migrate", "status", "--schema", sandboxB.schema, "--config", sandboxB.config], runDir, env);
  await assertDatabase(upgradeDb, migrationCount);
  await runTenantGate("post-migration", { ...env, DATABASE_URL: databaseUrl(upgradeDb), CRM_TEST_DATABASE_URL: databaseUrl(upgradeDb) }, sourceSchema, sourceMigrations, migrationNames.at(-1));

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
  if (mode === "meta-suite") {
    if (modeArgs.length !== 0) throw new Error("meta-suite nao aceita argumentos adicionais.");
    const tests = ["meta-oauth-local-wiring.test.js", "meta-credential-store.test.js", "meta-oauth-state.test.js"];
    for (const name of tests) {
      const isolatedDb = path.join(runDir, "meta-suite", `${name}.db`);
      fs.mkdirSync(path.dirname(isolatedDb), { recursive: true });
      fs.copyFileSync(testDb, isolatedDb, fs.constants.COPYFILE_EXCL);
      const isolatedEnv = {
        ...env,
        DATABASE_URL: databaseUrl(isolatedDb),
        CRM_TEST_DATABASE_URL: databaseUrl(isolatedDb),
        CRM_TEST_BASE_DATABASE_PATH: testDb,
      };
      runNode(["--test", path.join(backendDir, "tests", name)], backendDir, isolatedEnv, `Teste Meta ${name}`);
    }
    return;
  }
  throw new Error("Comando logico permitido: prisma, node-test ou node-suite.");
}

function runPrisma(args, cwd, env) {
  runNode([prismaCli, ...args], cwd, env, `Prisma ${args[0] || "CLI"}`);
}

async function runTenantGate(mode, env, schemaPath, migrationsDir, migrationName) {
  const gateScript = path.join(backendDir, "scripts", "tenant-isolation-gate.cjs");
  const args = [gateScript, mode, "--schema", schemaPath, "--migration-dir", migrationsDir, "--migration-name", migrationName];
  runNode(args, backendDir, env, `Tenant isolation gate ${mode}`);
}

function runNode(args, cwd, env, logicalCommand) {
  const capturePrisma = logicalCommand.startsWith("Prisma");
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: capturePrisma ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: capturePrisma ? "utf8" : undefined,
    windowsHide: true,
    shell: false,
  });
  assertProtectedDatabases();
  if (result.error) {
    if (capturePrisma) throw createPrismaFailure(logicalCommand, result.error.message);
    throw new Error(`${logicalCommand} nao iniciou.`);
  }
  if (!Number.isInteger(result.status)) {
    throw new Error(`${logicalCommand} terminou sem codigo de saida.`);
  }
  if (result.status !== 0) {
    if (capturePrisma) throw createPrismaFailure(logicalCommand, `${result.stderr || ""}\n${result.stdout || ""}`);
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

async function removeRunDirectory(directory) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw lastError;
}
