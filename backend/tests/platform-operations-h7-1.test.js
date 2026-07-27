const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "platform-operations-h7-1");
const databasePath = path.join(auditDir, `platform-operations-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "platform-operations-h7-1-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  AUTOMATIONS_ENABLED: "true",
});
delete process.env.PLATFORM_ADMIN_EMAILS;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("H7.1 protege operacoes de plataforma por allowlist backend e sem acesso tenant-scoped", async () => {
  const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../src/tenant-features/service");
  const operator = await register("Operadora Plataforma H71", "Operadora H71", "operator-h71@platform.test");
  const control = await register("Controle Plataforma H71", "Admin Controle", "admin-control-h71@platform.test");
  const manager = await createUser(control, "Gerente Controle", "manager-control-h71@platform.test", "GERENTE");

  assert.equal((await request("GET", "/platform/tenants")).status, 401);
  assert.equal((await request("GET", "/platform/tenants", undefined, operator.token)).status, 403);

  process.env.PLATFORM_ADMIN_EMAILS = " outra@platform.test, OPERATOR-H71@PLATFORM.TEST ";
  const operatorMe = await request("GET", "/auth/me", undefined, operator.token);
  assert.equal(operatorMe.status, 200);
  assert.equal(operatorMe.body.isPlatformOperator, true);
  assert.equal(JSON.stringify(operatorMe.body).includes("PLATFORM_ADMIN_EMAILS"), false);
  assert.equal(JSON.stringify(operatorMe.body).includes("outra@platform.test"), false);

  assert.equal((await request("GET", "/platform/tenants", undefined, control.token)).status, 403);
  assert.equal((await request("GET", "/platform/tenants", undefined, manager.token)).status, 403);

  await prisma.usuario.update({ where: { id: operator.usuarioId }, data: { ativo: false } });
  assert.equal((await request("GET", "/platform/tenants", undefined, operator.token)).status, 403);
  await prisma.usuario.update({ where: { id: operator.usuarioId }, data: { ativo: true } });

  const listed = await request("GET", "/platform/tenants?busca=controle&limit=1", undefined, operator.token);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].slug, "controle-plataforma-h71");
  assert.equal(listed.body.data[0].capabilities.automations.enabled, false);
  assert.equal(listed.body.data[0].usuarios, undefined);
  assert.equal(listed.body.data[0].leads, undefined);

  const detail = await request("GET", `/platform/tenants/${control.empresaId}`, undefined, operator.token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, control.empresaId);
  assert.equal(detail.body.capabilities.automations.enabled, false);

  assert.equal((await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: "true" }, operator.token)).status, 422);
  assert.equal((await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: true, outra: true }, operator.token)).status, 422);
  assert.equal((await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: true, reason: "x".repeat(501) }, operator.token)).status, 422);
  assert.equal((await request("PATCH", "/platform/tenants/999999/capabilities/automations", { enabled: true }, operator.token)).status, 404);

  const countsBefore = await automationCounts(control.empresaId);
  const enabled = await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: true, reason: "Piloto controlado H7.1" }, operator.token);
  assert.equal(enabled.status, 200);
  assert.deepEqual(enabled.body, {
    changed: true,
    capability: FEATURE_KEYS.AUTOMATIONS,
    previousEnabled: false,
    newEnabled: true,
  });

  const feature = await prisma.empresaFuncionalidade.findUnique({
    where: { empresaId_chave: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS } },
  });
  assert.equal(feature.habilitada, true);
  assert.equal(feature.habilitadoPorUsuarioId, null);
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: control.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS }), true);
  assert.deepEqual(await automationCounts(control.empresaId), countsBefore);

  let audits = await prisma.auditoriaFuncionalidade.findMany({ where: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].usuarioId, operator.usuarioId);
  assert.equal(audits[0].valorNovo, true);
  assert.equal(audits[0].motivo, "Piloto controlado H7.1");

  const idempotent = await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: true }, operator.token);
  assert.equal(idempotent.status, 200);
  assert.equal(idempotent.body.changed, false);
  assert.equal(await prisma.auditoriaFuncionalidade.count({ where: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS } }), 1);

  const auditResponse = await request("GET", `/platform/tenants/${control.empresaId}/capabilities/automations/audit`, undefined, operator.token);
  assert.equal(auditResponse.status, 200);
  assert.equal(auditResponse.body.data[0].actor.nome, "Operadora H71");
  assert.equal(auditResponse.body.data[0].actor.email, undefined);

  const disabled = await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: false, reason: "Encerrar piloto" }, operator.token);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.changed, true);
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: control.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS }), false);
  audits = await prisma.auditoriaFuncionalidade.findMany({ where: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS } });
  assert.equal(audits.length, 2);
  assert.deepEqual(await automationCounts(control.empresaId), countsBefore);

  const otherCapabilities = await prisma.empresaFuncionalidade.count({
    where: { empresaId: control.empresaId, chave: { not: FEATURE_KEYS.AUTOMATIONS } },
  });
  assert.equal(otherCapabilities, 0);
});

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaH71Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return {
    token: login.body.access_token,
    empresaId: registration.body.empresa.id,
    usuarioId: registration.body.usuario.id,
  };
}

async function createUser(admin, nome, email, papel) {
  const senha = "SenhaH71Usuario123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id, empresaId: admin.empresaId };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return { status: response.status, body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null };
}

async function automationCounts(empresaId) {
  const [rules, executions, jobs, events, followUps] = await Promise.all([
    prisma.automacaoRegra.count({ where: { empresaId } }),
    prisma.automacaoExecucao.count({ where: { empresaId } }),
    prisma.automacaoAcaoJob.count({ where: { empresaId } }),
    prisma.automacaoEventoInterno.count({ where: { empresaId } }),
    prisma.acompanhamento.count({ where: { empresaId } }),
  ]);
  return { rules, executions, jobs, events, followUps };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}
