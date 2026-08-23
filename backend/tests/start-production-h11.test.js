const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  resolvePrismaCli,
  resolveExpectedServiceId,
  runPrismaMigration,
  runStartup,
} = require("../scripts/start-production.cjs");

const backendDirectory = path.resolve(__dirname, "..");
const sourcePrismaDirectory = path.join(backendDirectory, "prisma");
const pendingMigrationName = "20260823180000_add_stock_core_e2";
const currentMigrationCount = fs.readdirSync(path.join(sourcePrismaDirectory, "migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).length;
const testServiceId = "railway-service-test";

test("validate-runtime falha fechado quando Railway nao declara production", () => {
  const result = spawnSync(process.execPath, [path.join(backendDirectory, "scripts", "validate-runtime.js")], {
    cwd: backendDirectory,
    env: { ...process.env, NODE_ENV: "test", RAILWAY_SERVICE_ID: testServiceId },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /NODE_ENV=production/);
});

test("startup Railway recusa NODE_ENV invalido antes de migration", async () => {
  let migrationCalls = 0;
  await assert.rejects(
    runStartup({
      env: { NODE_ENV: "development", RAILWAY_SERVICE_ID: testServiceId, RAILWAY_DEPLOYMENT_ID: "deployment-invalid-env" },
      runMigration: async () => { migrationCalls += 1; },
      startServer: async () => closingChild(0),
      logger: quietLogger(),
    }),
    { code: "NODE_ENV_PRODUCTION_REQUIRED" },
  );
  assert.equal(migrationCalls, 0);
});

test("API oficial Railway recusa SQLite antes de migration", async () => {
  let migrationCalls = 0;
  await assert.rejects(
    runStartup({
      env: {
        NODE_ENV: "production",
        RAILWAY_SERVICE_ID: "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92",
        RAILWAY_DEPLOYMENT_ID: "deployment-official-sqlite",
        RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
        RAILWAY_ENVIRONMENT_ID: "e18f76b1-e38f-468e-91fe-1eff6db9a5f8",
        RAILWAY_VOLUME_MOUNT_PATH: "/app/data",
        DATABASE_URL: "file:/app/data/crm.db",
      },
      runMigration: async () => { migrationCalls += 1; },
      startServer: async () => closingChild(0),
      logger: quietLogger(),
    }),
    { code: "RAILWAY_PRODUCTION_POSTGRES_REQUIRED" },
  );
  assert.equal(migrationCalls, 0);
});

test("API oficial Railway recusa projeto ou ambiente divergente antes de Prisma", async () => {
  const baseEnv = {
    NODE_ENV: "production",
    RAILWAY_SERVICE_ID: "16de1b91-7dcb-46f4-9231-1c3e2c3e5a92",
    RAILWAY_DEPLOYMENT_ID: "deployment-target-mismatch",
    RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
    RAILWAY_ENVIRONMENT_ID: "e18f76b1-e38f-468e-91fe-1eff6db9a5f8",
    POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm",
    CRM_DATABASE_PROVIDER: "postgresql",
  };
  const { assertRailwayTargetIdentity } = require("../scripts/start-production.cjs");
  assert.throws(() => assertRailwayTargetIdentity({ env: { ...baseEnv, RAILWAY_PROJECT_ID: "wrong-project" }, expectedServiceId: baseEnv.RAILWAY_SERVICE_ID }), { code: "RAILWAY_PROJECT_MISMATCH" });
});

test("contrato de servico: producao aceita somente o ID oficial e homolog exige ID explicito", () => {
  assert.equal(resolveExpectedServiceId({}), "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92");
  assert.equal(resolveExpectedServiceId({ CRM_RAILWAY_ENVIRONMENT: "homolog", CRM_RAILWAY_HOMOLOG_SERVICE_ID: testServiceId }), testServiceId);
  assert.throws(
    () => resolveExpectedServiceId({ CRM_RAILWAY_ENVIRONMENT: "homolog" }),
    { code: "RAILWAY_HOMOLOG_SERVICE_ID_MISSING" },
  );
});

test("cenario 1: fora do Railway inicia servidor sem executar migration", async () => {
  let migrationCalls = 0;
  const spawnCalls = [];

  const code = await runStartup({
    env: { NODE_ENV: "production" },
    logger: quietLogger(),
    runMigration: async () => { migrationCalls += 1; },
    spawnImpl: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      return closingChild(0);
    },
  });

  assert.equal(code, 0);
  assert.equal(migrationCalls, 0);
  assert.equal(spawnCalls.length, 2);
  assert.equal(spawnCalls[0].command, process.execPath);
  assert.equal(path.basename(spawnCalls[0].args[0]), "validate-runtime.js");
  assert.equal(spawnCalls[1].command, process.execPath);
  assert.equal(path.basename(spawnCalls[1].args[0]), "server.js");
  assert.equal(spawnCalls.every((call) => call.options.shell === false), true);
});

test("cenario 2: Railway aplica migration pendente antes do servidor", async () => {
  const fixture = createPrismaFixture("pending", { pendingTarget: true, legacyHistory: true });
  const order = [];

  const code = await runStartup({
    ...fixture.startupOptions,
    logger: quietLogger(),
    runMigration: async (runtime) => {
      order.push("migration:start");
      await runPrismaMigration(runtime);
      order.push("migration:end");
    },
    startServer: async () => {
      order.push("server");
      return closingChild(0);
    },
  });

  assert.equal(code, 0);
  assert.deepEqual(order, ["migration:start", "migration:end", "server"]);
  assertDatabase(fixture.databasePath, { migrations: currentMigrationCount, history: 1 });
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const history = database.prepare('SELECT "motivo", "acaoAtendimento", "estadoAnterior", "estadoNovo" FROM "HistoricoAtribuicao"').get();
  database.close();
  assert.deepEqual({ ...history }, {
    motivo: "Registro legado preservado",
    acaoAtendimento: null,
    estadoAnterior: null,
    estadoNovo: null,
  });
});

test("cenario 3: Railway atualizado executa no-op e inicia servidor", async () => {
  const fixture = createPrismaFixture("up-to-date");
  const before = migrationRows(fixture.databasePath);
  let serverCalls = 0;

  const code = await runStartup({
    ...fixture.startupOptions,
    logger: quietLogger(),
    startServer: async () => {
      serverCalls += 1;
      return closingChild(0);
    },
  });

  assert.equal(code, 0);
  assert.equal(serverCalls, 1);
  assert.equal(migrationRows(fixture.databasePath), before);
  assertDatabase(fixture.databasePath, { migrations: currentMigrationCount, history: 0 });
});

test("cenario 3b: maintenance read-only pula migration e inicia API", async () => {
  const fixture = createPrismaFixture("maintenance-read-only");
  const logs = capturedLogger();
  const before = migrationRows(fixture.databasePath);
  let migrationCalls = 0;
  let serverCalls = 0;

  const code = await runStartup({
    ...fixture.startupOptions,
    env: {
      ...fixture.startupOptions.env,
      CRM_MAINTENANCE_READ_ONLY: "true",
    },
    logger: logs.logger,
    runMigration: async () => {
      migrationCalls += 1;
    },
    startServer: async () => {
      serverCalls += 1;
      return closingChild(0);
    },
  });

  assert.equal(code, 0);
  assert.equal(migrationCalls, 0);
  assert.equal(serverCalls, 1);
  assert.equal(migrationRows(fixture.databasePath), before);
  assert.equal(logs.entries.includes("Maintenance read-only ativo; migrations nao executadas."), true);
});

test("cenario 4: falha de migration impede servidor e nao vaza segredo", async () => {
  const fixture = createPrismaFixture("migration-failure");
  const logs = capturedLogger();
  let serverCalls = 0;

  await assert.rejects(
    runStartup({
      ...fixture.startupOptions,
      logger: logs.logger,
      runMigration: async () => {
        throw new Error(fixture.startupOptions.env.DATABASE_URL);
      },
      startServer: async () => {
        serverCalls += 1;
        return closingChild(0);
      },
    }),
  );

  assert.equal(serverCalls, 0);
  assert.equal(logs.entries.some((entry) => entry.includes(fixture.databasePath)), false);
  assert.equal(logs.entries.includes("Migration falhou; API nao iniciada."), true);
});

test("cenario 5: volume invalido falha antes de migration e servidor", async () => {
  const fixture = createPrismaFixture("invalid-volume");
  let migrationCalls = 0;
  let serverCalls = 0;

  await assert.rejects(runStartup({
    ...fixture.startupOptions,
    env: {
      ...fixture.startupOptions.env,
      RAILWAY_VOLUME_MOUNT_PATH: path.join(fixture.mountPath, "outro"),
    },
    logger: quietLogger(),
    runMigration: async () => { migrationCalls += 1; },
    startServer: async () => {
      serverCalls += 1;
      return closingChild(0);
    },
  }), { code: "RAILWAY_VOLUME_INVALID" });

  assert.equal(migrationCalls, 0);
  assert.equal(serverCalls, 0);
});

test("cenario 6: DATABASE_URL fora do volume falha fechada", async () => {
  const fixture = createPrismaFixture("database-outside-volume");
  const outsideDatabase = path.join(path.dirname(fixture.mountPath), "outside.db");
  fs.writeFileSync(outsideDatabase, "");
  let migrationCalls = 0;
  let serverCalls = 0;

  await assert.rejects(runStartup({
    ...fixture.startupOptions,
    env: {
      ...fixture.startupOptions.env,
      DATABASE_URL: databaseUrl(outsideDatabase),
    },
    logger: quietLogger(),
    runMigration: async () => { migrationCalls += 1; },
    startServer: async () => {
      serverCalls += 1;
      return closingChild(0);
    },
  }), { code: "DATABASE_PATH_INVALID" });

  assert.equal(migrationCalls, 0);
  assert.equal(serverCalls, 0);
});

test("cenario 6b: provider PostgreSQL usa schema PostgreSQL e nao exige volume SQLite", async () => {
  const supervisorRunDirectory = process.env.CRM_PRISMA_TEST_RUN_DIR;
  const schemaPath = path.join(supervisorRunDirectory, "postgres-runtime", "schema.prisma");
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, "generator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url = env(\"DATABASE_URL\")\n}\n");
  let runtimeSeen = null;

  const code = await runStartup({
    backendDirectory,
    env: {
      ...process.env,
      CRM_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:/app/data/dev.db",
      NODE_ENV: "test",
      POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
      RAILWAY_DEPLOYMENT_ID: "deployment-postgres",
      RAILWAY_SERVICE_ID: testServiceId,
      RAILWAY_VOLUME_MOUNT_PATH: "/app/data",
    },
    allowNonProductionRailway: true,
    expectedServiceId: testServiceId,
    runRuntimeGate: async () => ({ safe: true }),
    logger: quietLogger(),
    preparePrismaRuntime: ({ env, provider }) => ({
      env,
      provider,
      schemaPath,
    }),
    prismaCliPath: resolvePrismaCli(backendDirectory),
    runMigration: async (runtime) => {
      runtimeSeen = runtime;
    },
    startServer: async () => closingChild(0),
  });

  assert.equal(code, 0);
  assert.equal(runtimeSeen.provider, "postgresql");
  assert.equal(runtimeSeen.engine, "postgresql");
  assert.equal(runtimeSeen.mountPath, null);
  assert.equal(runtimeSeen.schemaPath, schemaPath);
});

test("cenario 6c: provider divergente falha antes de migration e servidor", async () => {
  let migrationCalls = 0;
  let serverCalls = 0;

  await assert.rejects(runStartup({
    backendDirectory,
    env: {
      ...process.env,
      CRM_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:/app/data/dev.db",
      NODE_ENV: "test",
      RAILWAY_DEPLOYMENT_ID: "deployment-provider-mismatch",
      RAILWAY_SERVICE_ID: testServiceId,
      RAILWAY_VOLUME_MOUNT_PATH: "/app/data",
    },
    allowNonProductionRailway: true,
    expectedMountPath: "/app/data",
    expectedServiceId: testServiceId,
    logger: quietLogger(),
    runMigration: async () => { migrationCalls += 1; },
    startServer: async () => {
      serverCalls += 1;
      return closingChild(0);
    },
  }), { code: "DATABASE_PROVIDER_MISMATCH" });

  assert.equal(migrationCalls, 0);
  assert.equal(serverCalls, 0);
});

test("cenario 7: SIGTERM e encaminhado uma vez e exit code e preservado", async () => {
  const signalSource = new EventEmitter();
  const child = new EventEmitter();
  const forwarded = [];
  child.kill = (signal) => {
    forwarded.push(signal);
    queueMicrotask(() => child.emit("close", 143, null));
    return true;
  };

  const startup = runStartup({
    env: {},
    logger: quietLogger(),
    signalSource,
    startServer: async () => child,
  });
  await new Promise((resolve) => setImmediate(resolve));
  signalSource.emit("SIGTERM");
  signalSource.emit("SIGTERM");

  assert.equal(await startup, 143);
  assert.deepEqual(forwarded, ["SIGTERM"]);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
});

function createPrismaFixture(name, { pendingTarget = false, legacyHistory = false } = {}) {
  const supervisorRunDirectory = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!supervisorRunDirectory || !path.isAbsolute(supervisorRunDirectory)) {
    throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  }

  const mountPath = path.join(supervisorRunDirectory, `h11-${name}`);
  const prismaDirectory = path.join(mountPath, "prisma");
  const migrationsDirectory = path.join(prismaDirectory, "migrations");
  const schemaPath = path.join(prismaDirectory, "schema.prisma");
  const databasePath = path.join(mountPath, "startup.db");
  fs.mkdirSync(prismaDirectory, { recursive: true });
  fs.copyFileSync(path.join(sourcePrismaDirectory, "schema.prisma"), schemaPath);
  fs.cpSync(path.join(sourcePrismaDirectory, "migrations"), migrationsDirectory, { recursive: true });

  if (pendingTarget) {
    fs.rmSync(path.join(migrationsDirectory, pendingMigrationName), { recursive: true, force: true });
  }

  fs.writeFileSync(databasePath, "");
  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);

  if (legacyHistory) {
    const database = new DatabaseSync(databasePath);
    database.prepare('INSERT INTO "Empresa" ("nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)')
      .run("Empresa H1.1", `empresa-h11-${name}`, "2026-07-21T20:00:00.000Z", "2026-07-21T20:00:00.000Z");
    database.prepare('INSERT INTO "HistoricoAtribuicao" ("empresaId", "tipo", "origem", "motivo", "createdAt") VALUES (1, ?, ?, ?, ?)')
      .run("ATRIBUIR", "MANUAL", "Registro legado preservado", "2026-07-21T20:01:00.000Z");
    database.close();
  }

  if (pendingTarget) {
    fs.cpSync(
      path.join(sourcePrismaDirectory, "migrations", pendingMigrationName),
      path.join(migrationsDirectory, pendingMigrationName),
      { recursive: true },
    );
  }

  return {
    databasePath,
    mountPath,
    startupOptions: {
      backendDirectory,
      allowNonProductionRailway: true,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl(databasePath),
        NODE_ENV: "test",
        RAILWAY_DEPLOYMENT_ID: `deployment-${name}`,
        RAILWAY_SERVICE_ID: testServiceId,
        RAILWAY_VOLUME_MOUNT_PATH: mountPath,
      },
      expectedMountPath: mountPath,
      expectedServiceId: testServiceId,
      prismaCliPath: resolvePrismaCli(backendDirectory),
      schemaPath,
    },
  };
}

function runPrisma(schemaPath, databasePath, args) {
  const result = spawnSync(
    process.execPath,
    [resolvePrismaCli(backendDirectory), ...args, "--schema", schemaPath],
    {
      cwd: backendDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl(databasePath) },
      shell: false,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status ?? "SPAWN"}.`);
  }
}

function assertDatabase(databasePath, { migrations, history }) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), migrations);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "HistoricoAtribuicao"').get().total), history);
  database.close();
}

function migrationRows(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const total = Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations"').get().total);
  database.close();
  return total;
}

function closingChild(code) {
  const child = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => child.emit("close", code, null));
  return child;
}

function capturedLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      error: (message) => entries.push(String(message)),
      log: (message) => entries.push(String(message)),
    },
  };
}

function quietLogger() {
  return { error() {}, log() {} };
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}
