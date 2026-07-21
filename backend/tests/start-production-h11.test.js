const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  resolvePrismaCli,
  runPrismaMigration,
  runStartup,
} = require("../scripts/start-production.cjs");

const backendDirectory = path.resolve(__dirname, "..");
const sourcePrismaDirectory = path.join(backendDirectory, "prisma");
const migrationName = "20260721123000_add_inbox_operational_history";
const testServiceId = "railway-service-test";

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

test("cenario 2: Railway com 17 migrations aplica a 18 antes do servidor", async () => {
  const fixture = createPrismaFixture("seventeen", { migrations: 17, legacyHistory: true });
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
  assertDatabase(fixture.databasePath, { migrations: 18, history: 1 });
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

test("cenario 3: Railway com 18 migrations executa no-op e inicia servidor", async () => {
  const fixture = createPrismaFixture("eighteen", { migrations: 18 });
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
  assertDatabase(fixture.databasePath, { migrations: 18, history: 0 });
});

test("cenario 4: falha de migration impede servidor e nao vaza segredo", async () => {
  const fixture = createPrismaFixture("migration-failure", { migrations: 18 });
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
  const fixture = createPrismaFixture("invalid-volume", { migrations: 18 });
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
  const fixture = createPrismaFixture("database-outside-volume", { migrations: 18 });
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

function createPrismaFixture(name, { migrations, legacyHistory = false }) {
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

  if (migrations === 17) {
    fs.rmSync(path.join(migrationsDirectory, migrationName), { recursive: true, force: true });
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

  if (migrations === 17) {
    fs.cpSync(
      path.join(sourcePrismaDirectory, "migrations", migrationName),
      path.join(migrationsDirectory, migrationName),
      { recursive: true },
    );
  }

  return {
    databasePath,
    mountPath,
    startupOptions: {
      backendDirectory,
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
