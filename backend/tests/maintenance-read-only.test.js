const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const jwt = require("jsonwebtoken");
const { Prisma, PrismaClient } = require("@prisma/client");
const { createAutomationService } = require("../src/automations/service");
const { startAutomationWorker } = require("../src/automations/worker");
const { createPrismaClient } = require("../src/database/prisma-client");
const {
  applyMaintenanceReadOnlyGuard,
  maintenanceReadOnlyEnabled,
  markMaintenanceReadOnlyQuery,
} = require("../src/database/maintenance-read-only");

const savedEnvironment = {};
const managedEnvironmentKeys = [
  "ALLOW_COMPANY_REGISTRATION",
  "AUTOMATIONS_ENABLED",
  "AUTOMATION_PILOT_TRIGGER_ENABLED",
  "AUTOMATION_WORKER_ENABLED",
  "CRM_MAINTENANCE_READ_ONLY",
  "JWT_SECRET",
];
const jwtSecret = "maintenance-read-only-test-secret";
let api;
let baseUrl;
let databasePath;
let externalCalls = 0;
let initialDatabaseHash;
let initialSnapshot;
let nativeFetch;
let server;
let tenantA;
let tenantB;
let token;

before(async () => {
  for (const key of managedEnvironmentKeys) savedEnvironment[key] = process.env[key];
  process.env.ALLOW_COMPANY_REGISTRATION = "false";
  process.env.AUTOMATIONS_ENABLED = "true";
  process.env.AUTOMATION_PILOT_TRIGGER_ENABLED = "true";
  process.env.AUTOMATION_WORKER_ENABLED = "true";
  process.env.CRM_MAINTENANCE_READ_ONLY = "true";
  process.env.JWT_SECRET = jwtSecret;

  databasePath = sqlitePath(process.env.CRM_TEST_DATABASE_URL);
  const setup = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  tenantA = await seedTenant(setup, "maintenance-a", true);
  tenantB = await seedTenant(setup, "maintenance-b", false);
  const clientA = await setup.cliente.create({
    data: {
      empresaId: tenantA.empresa.id,
      nome: "Cliente freeze A",
      telefone: "",
      email: "",
      empresa: "Freeze",
      interesse: "Teste",
      origem: "Teste",
    },
  });
  const clientB = await setup.cliente.create({
    data: {
      empresaId: tenantB.empresa.id,
      nome: "Cliente freeze B",
      telefone: "",
      email: "",
      empresa: "Freeze",
      interesse: "Controle",
      origem: "Teste",
    },
  });
  tenantA.clienteId = clientA.id;
  tenantB.clienteId = clientB.id;
  await setup.$disconnect();

  initialDatabaseHash = fileHash(databasePath);
  initialSnapshot = databaseSnapshot(databasePath);

  api = require("../src/server");
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign(
    { empresaId: tenantA.empresa.id, papel: "ADMIN" },
    jwtSecret,
    {
      audience: "crm-agro-saas",
      expiresIn: "5m",
      issuer: "crm-agro-saas-api",
      subject: String(tenantA.admin.id),
    },
  );

  nativeFetch = globalThis.fetch;
  globalThis.fetch = async function guardedFetch(url, options) {
    const target = new URL(String(url));
    if (target.origin !== new URL(baseUrl).origin) externalCalls += 1;
    return nativeFetch(url, options);
  };
});

after(async () => {
  globalThis.fetch = nativeFetch;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  if (api?.prisma) await api.prisma.$disconnect();
  for (const key of managedEnvironmentKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
});

test("maintenance read-only congela HTTP, Prisma, transacoes e automacoes sem mutar SQLite", async () => {
  assert.equal(maintenanceReadOnlyEnabled(process.env), true);
  assert.equal(maintenanceReadOnlyEnabled({}), false);
  assert.equal(maintenanceReadOnlyEnabled({ CRM_MAINTENANCE_READ_ONLY: "false" }), false);
  assert.throws(
    () => maintenanceReadOnlyEnabled({ CRM_MAINTENANCE_READ_ONLY: "talvez" }),
    { code: "MAINTENANCE_READ_ONLY_INVALID" },
  );

  assert.equal((await request("GET", "/health", { authenticated: false })).status, 200);
  assert.equal((await request("GET", "/clientes?page=1&limit=10")).status, 200);
  assert.equal((await request("GET", "/dashboard")).status, 200);

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await request(method, "/clientes", {
      body: { nome: "Bloqueado" },
      authenticated: false,
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.codigo, "MAINTENANCE_READ_ONLY");
  }
  assert.equal((await request("POST", "/auth/login", { body: {}, authenticated: false })).status, 503);
  assert.equal((
    await request("GET", "/integracoes/bling/callback?code=blocked&state=blocked", { authenticated: false })
  ).status, 503);

  await assert.rejects(
    api.prisma.cliente.create({
      data: {
        empresaId: tenantA.empresa.id,
        nome: "Interno bloqueado",
        telefone: "",
        email: "",
        empresa: "",
        interesse: "",
        origem: "Teste",
      },
    }),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  await assert.rejects(
    api.prisma.$executeRawUnsafe('UPDATE "Cliente" SET "nome" = "nome"'),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  await assert.rejects(
    api.prisma.$queryRawUnsafe('SELECT 1'),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  await assert.rejects(
    api.prisma.$queryRaw(Prisma.sql`SELECT 1`),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  await assert.rejects(
    api.prisma.$transaction(async (tx) => tx.cliente.update({
      where: { id: tenantA.clienteId },
      data: { nome: "Transacao bloqueada" },
    })),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  await assert.rejects(
    api.prisma.$transaction([
      api.prisma.cliente.delete({ where: { id: tenantA.clienteId } }),
    ]),
    { code: "MAINTENANCE_READ_ONLY" },
  );

  const readRows = await api.prisma.$queryRaw(markMaintenanceReadOnlyQuery(
    Prisma.sql`SELECT COUNT(*) AS total FROM "Cliente"`,
  ));
  assert.equal(Number(readRows[0].total), 2);
  assert.throws(
    () => markMaintenanceReadOnlyQuery(Prisma.sql`SELECT setval('unsafe', 1)`),
    { code: "READ_ONLY_SQL_INVALID" },
  );

  const automation = createAutomationService({ prisma: api.prisma, env: process.env });
  await assert.rejects(
    automation.produceAutomationEvent({
      tenantId: tenantA.empresa.id,
      eventType: "LEAD_CREATED",
      sourceType: "PILOT_SYNTHETIC",
      sourceId: "maintenance-freeze",
      idempotencyKey: "maintenance-freeze",
      occurredAt: new Date(),
      payload: { name: "Lead sintetico maintenance", origin: "PILOT" },
    }),
    { code: "MAINTENANCE_READ_ONLY" },
  );
  assert.equal(await api.prisma.automacaoExecucao.count(), 0);
  assert.equal(await api.prisma.automacaoAcaoJob.count(), 0);
  assert.equal(await api.prisma.automacaoEventoInterno.count(), 0);

  let processedJobs = 0;
  let scheduledPolls = 0;
  const worker = startAutomationWorker({
    env: {
      AUTOMATION_WORKER_ENABLED: "true",
      CRM_MAINTENANCE_READ_ONLY: "true",
      NODE_ENV: "production",
    },
    logger: { error() {}, log() {} },
    service: {
      async processDueJobs() {
        processedJobs += 1;
      },
    },
    setTimeoutImpl() {
      scheduledPolls += 1;
    },
  });
  assert.equal(worker.started, false);
  assert.equal(processedJobs, 0);
  assert.equal(scheduledPolls, 0);
  assert.equal(externalCalls, 0);

  await closeApi();
  assert.deepEqual(databaseSnapshot(databasePath), initialSnapshot);
  assert.equal(fileHash(databasePath), initialDatabaseHash);

  const writable = createPrismaClient({
    env: {
      ...process.env,
      CRM_MAINTENANCE_READ_ONLY: "false",
      CRM_TEST_DATABASE_URL: process.env.CRM_TEST_DATABASE_URL,
      NODE_ENV: "test",
    },
  });
  const restored = await writable.cliente.create({
    data: {
      empresaId: tenantA.empresa.id,
      nome: "Escrita restaurada",
      telefone: "",
      email: "",
      empresa: "",
      interesse: "",
      origem: "Teste",
    },
  });
  assert.ok(restored.id > 0);
  await writable.$disconnect();
});

test("guard usa a mesma semantica antes de acessar SQLite ou PostgreSQL", async () => {
  for (const provider of ["sqlite", "postgresql"]) {
    let extension;
    const fakePrisma = {
      $extends(value) {
        extension = value;
        return { provider };
      },
    };
    const guarded = applyMaintenanceReadOnlyGuard(fakePrisma, {
      env: { CRM_MAINTENANCE_READ_ONLY: "true" },
    });
    assert.equal(guarded.provider, provider);
    assert.throws(
      () => extension.query.$allOperations({
        args: { data: {} },
        model: "Cliente",
        operation: "create",
        query() {
          throw new Error("query nao deveria executar");
        },
      }),
      { code: "MAINTENANCE_READ_ONLY" },
    );
  }
});

async function closeApi() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  if (api?.prisma) {
    await api.prisma.$disconnect();
    api.prisma = null;
  }
}

async function request(method, route, options = {}) {
  const response = await globalThis.fetch(`${baseUrl}${route}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.authenticated === false ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
  });
  const text = await response.text();
  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
}

async function seedTenant(prisma, label, automationsEnabled) {
  const empresa = await prisma.empresa.create({
    data: { nome: `Empresa ${label}`, slug: `${label}-${process.pid}` },
  });
  const admin = await prisma.usuario.create({
    data: {
      ativo: true,
      email: `${label}-${process.pid}@maintenance.test`,
      empresaId: empresa.id,
      nome: `Admin ${label}`,
      papel: "ADMIN",
      senhaHash: "hash-test",
    },
  });
  if (automationsEnabled) {
    await prisma.empresaFuncionalidade.create({
      data: {
        chave: "AUTOMATIONS",
        empresaId: empresa.id,
        habilitada: true,
        habilitadoEm: new Date(),
        habilitadoPorUsuarioId: admin.id,
      },
    });
    await prisma.automacaoRegra.create({
      data: {
        acoesJson: JSON.stringify([{
          eventoTipo: "MAINTENANCE_TEST",
          resumo: "Evento tecnico de teste.",
          tipo: "CREATE_INTERNAL_EVENT",
        }]),
        activatedAt: new Date(Date.now() - 1000),
        ativa: true,
        condicoesJson: "[]",
        createdById: admin.id,
        empresaId: empresa.id,
        gatilho: "LEAD_CREATED",
        nome: "Regra maintenance",
        prioridade: 10,
        timezone: "America/Sao_Paulo",
        updatedById: admin.id,
      },
    });
  }
  return { admin, clienteId: null, empresa };
}

function databaseSnapshot(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  const counts = {};
  for (const row of tables) {
    const table = String(row.name).replace(/"/g, "\"\"");
    counts[row.name] = Number(database.prepare(`SELECT COUNT(*) AS total FROM "${table}"`).get().total);
  }
  const clients = database.prepare(
    'SELECT "id", "empresaId", "nome", "revisao", "createdAt" FROM "Cliente" ORDER BY "id"',
  ).all();
  const users = database.prepare(
    'SELECT "id", "empresaId", "ultimoLoginEm", "updatedAt" FROM "Usuario" ORDER BY "id"',
  ).all();
  database.close();
  return JSON.parse(JSON.stringify({ clients, counts, users }));
}

function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sqlitePath(databaseUrl) {
  const value = String(databaseUrl || "");
  assert.equal(value.startsWith("file:"), true);
  let file = decodeURIComponent(value.slice(5));
  if (file.startsWith("/") && /^[A-Za-z]:/.test(file.slice(1))) file = file.slice(1);
  return path.resolve(file);
}
