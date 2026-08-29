const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
let PrismaClient;
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
const prismaDatasourceShim = path.join(runDir, "prisma-datasource-shim.cjs");
const command = process.argv.slice(2);
const metaSandboxOnly = command[0] === "meta-suite";
const expectedHash = "6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533";
const expectedSize = 1282048;
const expectedMigrationCount = 42;
const historicalMigrationCount = 9;
const prismaCli = resolvePrismaCli();
const prismaConfigModule = require.resolve("prisma/config", { paths: [backendDir] });
let completed = false;
let interrupted = false;
let officialBaseline;
let historicalBaseline;

main().catch((error) => {
  if (!interrupted) process.exitCode = 1;
  console.error(JSON.stringify({ event: "isolated_prisma", safe: false, error: sanitizeFailure(error, "isolated-prisma") }));
}).finally(async () => {
  let guardFailure = null;
  try {
  assertProtectedDatabases();
  } catch (error) {
    process.exitCode = 1;
    guardFailure = error;
    console.error(JSON.stringify({ event: "isolated_prisma", safe: false, error: sanitizeFailure(error, "isolated-prisma") }));
  }
  try {
    await removeRunDirectory(runDir);
    console.log(`[isolated-prisma] ${completed && !guardFailure ? "OK" : "STOP"} ${runId} (cleanup concluido)`);
  } catch (error) {
    process.exitCode = 1;
    console.error(JSON.stringify({ event: "isolated_prisma", safe: false, cleanup: "failed", error: sanitizeFailure(error, "isolated-prisma") }));
  }
});

process.once("SIGINT", () => { interrupted = true; process.exitCode = 130; });
process.once("SIGTERM", () => { interrupted = true; process.exitCode = 143; });

async function main() {
  if (command.length === 0) throw new Error("Informe o comando de teste a executar.");
  assertSafeTempPath(runDir, "CRM_PRISMA_TEST_RUN_DIR");
  officialBaseline = fingerprintProtected(officialDb);
  historicalBaseline = fingerprintProtected(historicalDb);
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
  writePrismaDatasourceShim();
  if (metaSandboxOnly) {
    const env = sandboxEnv(testDb);
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

  const env = sandboxEnv(testDb, { CRM_TEST_SOURCE_DATABASE_PATH: historicalTestDb });
  runPrisma(["validate", "--schema", sandboxA.schema, "--config", sandboxA.config], runDir, env);
  runPrisma(["generate", "--schema", sandboxA.schema], backendDir, env);
  PrismaClient = require("@prisma/client").PrismaClient;
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

  runRequestedCommand(command, env);
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
  const generatedClient = path.join(backendDir, "node_modules", ".prisma", "client").replace(/\\/g, "/");
  const schemaWithOutput = originalSchema.replace(/generator client \{\s*provider\s*=\s*"prisma-client-js"\s*\}/, `generator client {\n  provider = "prisma-client-js"\n  output   = "${generatedClient}"\n}`);
  const datasourceMatches = schemaWithOutput.match(/url\s*=\s*env\("DATABASE_URL"\)/g) || [];
  if (datasourceMatches.length !== 1) throw new Error("Sandbox exige exatamente um datasource DATABASE_URL.");
  const sandboxSchemaText = schemaWithOutput.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = "file:.\\/test.db"');
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
    runNode(["--test", testFile], backendDir, runtimeTestEnv(env), "Teste Node");
    return;
  }
  if (mode === "node-suite") {
    if (modeArgs.length !== 0) throw new Error("node-suite nao aceita argumentos adicionais.");
    const testsDir = path.join(backendDir, "tests");
    const suiteDir = path.join(runDir, "test-databases");
    fs.mkdirSync(suiteDir, { recursive: true });
    let testFiles = fs.readdirSync(testsDir)
      .filter((name) => name.endsWith(".test.js"))
      // The canonical runner is SQLite-only. PostgreSQL relations run only in
      // the separately isolated disposable-Postgres gate; never coerce that
      // test into the SQLite sandbox or consume an ambient URL implicitly.
      .filter((name) => !name.endsWith("-postgres.test.js"))
      .sort();
    const startAt = String(process.env.CRM_TEST_START_AT || "").trim();
    if (startAt) {
      if (!/^[A-Za-z0-9._-]+\.test\.js$/.test(startAt) || !testFiles.includes(startAt)) {
        throw new Error("CRM_TEST_START_AT deve nomear um teste canonico existente.");
      }
      testFiles = testFiles.slice(testFiles.indexOf(startAt));
    }
    for (const name of testFiles) {
      const isolatedDb = path.join(suiteDir, `${name}.db`);
      fs.copyFileSync(testDb, isolatedDb, fs.constants.COPYFILE_EXCL);
      const isolatedEnv = runtimeTestEnv(sandboxEnv(isolatedDb, {
        CRM_TEST_SOURCE_DATABASE_PATH: env.CRM_TEST_SOURCE_DATABASE_PATH || "",
      }));
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
      const isolatedEnv = runtimeTestEnv(sandboxEnv(isolatedDb, { CRM_TEST_BASE_DATABASE_PATH: testDb }));
      runNode(["--test", path.join(backendDir, "tests", name)], backendDir, isolatedEnv, `Teste Meta ${name}`);
    }
    return;
  }
  throw new Error("Comando logico permitido: prisma, node-test ou node-suite.");
}

function writePrismaDatasourceShim() {
  fs.writeFileSync(prismaDatasourceShim, [
    "const Module = require('node:module');",
    "const originalLoad = Module._load;",
    "Module._load = function(request, parent, isMain) {",
    "  const loaded = originalLoad.call(this, request, parent, isMain);",
    "  if (request !== '@prisma/client' || !loaded || typeof loaded.PrismaClient !== 'function') return loaded;",
    "  class TestDatasourcePrismaClient extends loaded.PrismaClient {",
    "    constructor(options = {}) { super(options.datasourceUrl || options.datasources ? options : { ...options, datasourceUrl: process.env.DATABASE_URL }); }",
    "  }",
    "  return { ...loaded, PrismaClient: TestDatasourcePrismaClient };",
    "};",
    "",
  ].join("\n"));
}

function runtimeTestEnv(env) {
  const option = `--require=${prismaDatasourceShim}`;
  return {
    ...env,
    NODE_OPTIONS: [env.NODE_OPTIONS, option].filter(Boolean).join(" "),
  };
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
  const captureTest = logicalCommand.startsWith("Teste Node");
  if (captureTest) console.error(`[isolated-prisma] START ${logicalCommand}`);
  let result;
  try {
    result = spawnSync(process.execPath, args, {
      cwd,
      env,
      stdio: capturePrisma ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: capturePrisma ? "utf8" : undefined,
      windowsHide: true,
      shell: false,
      timeout: captureTest ? 60000 : undefined,
    });
  } finally {
    assertProtectedDatabases();
  }
  if (result.error) {
    if (capturePrisma) throw createPrismaFailure(logicalCommand, result.error.message);
    if (result.error.code === "ETIMEDOUT") throw new Error(`${logicalCommand} excedeu o limite de 60000ms.`);
    throw new Error(`${logicalCommand} nao iniciou.`);
  }
  if (!Number.isInteger(result.status)) {
    throw new Error(`${logicalCommand} terminou sem codigo de saida.`);
  }
  if (result.status !== 0) {
    if (capturePrisma) throw createPrismaFailure(logicalCommand, `${result.stderr || ""}\n${result.stdout || ""}`);
    throw new Error(`${logicalCommand} falhou com codigo ${result.status}.`);
  }
  if (interrupted) throw new Error("Execucao interrompida antes da conclusao segura.");
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

function assertSafeTempPath(candidate, label) {
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  if (!isPathInside(resolved, tempRoot)) throw new Error(`${label} deve permanecer na sandbox TEMP.`);
  let current = resolved;
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(current)).toLowerCase() !== current.toLowerCase()) {
        throw new Error(`${label} nao pode resolver por symlink/junction.`);
      }
    }
    current = path.dirname(current);
  }
}

function sandboxEnv(databasePath, extra = {}) {
  const blocked = new Set([
    "DATABASE_URL",
    "CRM_TEST_DATABASE_URL",
    "CRM_TEST_BASE_DATABASE_PATH",
    "CRM_TEST_SOURCE_DATABASE_PATH",
    "CRM_OFFICIAL_DATABASE_PATH",
    "POSTGRES_DATABASE_URL",
    "POSTGRES_TEST_DATABASE_URL",
    "POSTGRES_TARGET_URL",
    "POSTGRES_URL",
    "POSTGRES_MIGRATION_DATABASE_URL",
    "CRM_TEST_DATABASE_PROVIDER",
    "CRM_TEST_POSTGRES_ALLOW",
    "CRM_POSTGRES_MIGRATE_CONFIRM",
    "CRM_POSTGRES_IMPORT_CONFIRM",
    "POSTGRES_IMPORT_MODE",
    "CRM_DATABASE_PROVIDER",
  ]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.has(key)));
  return {
    ...env,
    NODE_ENV: "test",
    CRM_DATABASE_PROVIDER: "sqlite",
    CRM_TEST_DATABASE_PROVIDER: "",
    CRM_TEST_POSTGRES_ALLOW: "",
    POSTGRES_TARGET_URL: "",
    DATABASE_URL: databaseUrl(databasePath),
    CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
    CRM_PRISMA_TEST_RUN_DIR: runDir,
    CRM_TEST_BASE_DATABASE_PATH: databasePath,
    CRM_PRISMA_SENTINEL_ACTIVE: "false",
    ...extra,
  };
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
  } catch (error) {
    throw error;
  } finally { await prisma.$disconnect(); }
}

function assertProtectedDatabases() {
  if (!officialBaseline || !historicalBaseline) return;
  const officialCurrent = fingerprintProtected(officialDb);
  const historicalCurrent = fingerprintProtected(historicalDb);
  if (officialCurrent.size !== officialBaseline.size || officialCurrent.hash !== officialBaseline.hash) {
    throw new Error("backend/prisma/dev.db foi alterado.");
  }
  if (historicalCurrent.size !== historicalBaseline.size || historicalCurrent.hash !== historicalBaseline.hash) {
    throw new Error("backend/dev.db foi alterado.");
  }
  assertNoSidecars(officialDb);
  assertNoSidecars(historicalDb);
}

function fingerprintProtected(file) {
  assertRegularCanonicalFile(file, "Banco protegido");
  return fingerprint(file);
}

function assertRegularCanonicalFile(file, label) {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} deve ser arquivo regular.`);
  const real = path.resolve(fs.realpathSync.native(resolved));
  if (real.toLowerCase() !== resolved.toLowerCase()) throw new Error(`${label} nao pode resolver por alias.`);
}

function assertNoSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (fs.existsSync(`${databasePath}${suffix}`)) throw new Error(`Sidecar inesperado: ${databasePath}${suffix}`);
  }
}

function assertHistoricalBaseline(value) {
  if (value.size !== expectedSize || value.hash !== expectedHash) {
    throw new Error(`dev.db fora do baseline historico: ${JSON.stringify(value)}`);
  }
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

function fingerprint(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, hash: crypto.createHash("sha256").update(data).digest("hex") };
}

function databaseUrl(file) { return `file:${path.resolve(file).replace(/\\/g, "/")}`; }

async function removeRunDirectory(directory) {
  assertSafeTempPath(directory, "CRM_PRISMA_TEST_RUN_DIR");
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
