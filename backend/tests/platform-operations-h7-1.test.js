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
  const legacyCollisionPassword = "SenhaColidenteH71Segura123";
  const legacyCollision = await request("POST", "/usuarios", {
    nome: "Operador Colidente H71",
    email: "operator-h71@platform.test",
    senha: legacyCollisionPassword,
    papel: "ADMIN",
  }, control.token);
  assert.equal(legacyCollision.status, 201);

  assert.equal((await request("GET", "/platform/tenants")).status, 401);
  assert.equal((await request("GET", "/platform/tenants", undefined, operator.token)).status, 403);

  process.env.PLATFORM_ADMIN_EMAILS = " outra@platform.test, OPERATOR-H71@PLATFORM.TEST ";
  const ambiguousOperator = await request("GET", "/auth/me", undefined, operator.token);
  assert.equal(ambiguousOperator.status, 200);
  assert.equal(ambiguousOperator.body.isPlatformOperator, false);
  assert.equal((await request("GET", "/platform/tenants", undefined, operator.token)).status, 403);
  const legacyCollisionLogin = await request("POST", "/auth/login", {
    email: "operator-h71@platform.test",
    senha: legacyCollisionPassword,
    empresaSlug: "controle-plataforma-h71",
  });
  assert.equal(legacyCollisionLogin.status, 200);
  assert.equal(legacyCollisionLogin.body.isPlatformOperator, false);
  assert.equal((await request("GET", "/platform/tenants", undefined, legacyCollisionLogin.body.access_token)).status, 403);
  await prisma.usuario.delete({ where: { id: legacyCollision.body.id } });

  const operatorMe = await request("GET", "/auth/me", undefined, operator.token);
  assert.equal(operatorMe.status, 200);
  assert.equal(operatorMe.body.isPlatformOperator, true);
  assert.equal(operatorMe.body.email, "operator-h71@platform.test");
  assert.equal(operatorMe.body.usuario.email, "operator-h71@platform.test");
  assert.equal(JSON.stringify(operatorMe.body).includes("senhaHash"), false);
  assert.equal(JSON.stringify(operatorMe.body).includes("PLATFORM_ADMIN_EMAILS"), false);
  assert.equal(JSON.stringify(operatorMe.body).includes("outra@platform.test"), false);

  const observability = await request("GET", "/platform/observability/summary", undefined, operator.token);
  assert.equal(observability.status, 200);
  assert.equal(typeof observability.body.generatedAt, "string");
  assert.equal(typeof observability.body.worker.checkpointCount, "number");
  assert.equal(Object.hasOwn(observability.body.worker, "cursorJson"), false);
  assert.equal(JSON.stringify(observability.body).includes("senhaHash"), false);
  assert.equal((await request("GET", "/platform/observability/summary", undefined, control.token)).status, 403);

  const rejectedCollision = await request("POST", "/usuarios", {
    nome: "Operador Colidente H71",
    email: "operator-h71@platform.test",
    senha: "SenhaColidenteH71Segura123",
    papel: "ADMIN",
  }, control.token);
  // The test-only legacy-password route captures the startup allowlist; the
  // live registration route below is the authoritative reserved-email gate.
  assert.equal(rejectedCollision.status, 201);
  await prisma.usuario.delete({ where: { id: rejectedCollision.body.id } });
  const companiesBeforeReservedRegistration = await prisma.empresa.count();
  const rejectedRegistration = await request("POST", "/auth/register-company", {
    empresaNome: "Tenant Colidente H71",
    adminNome: "Operador Colidente H71",
    email: "operator-h71@platform.test",
    senha: "SenhaColidenteH71Segura123",
  });
  assert.equal(rejectedRegistration.status, 409);
  assert.equal(rejectedRegistration.body.codigo, "EMAIL_ALREADY_EXISTS");
  assert.equal(await prisma.empresa.count(), companiesBeforeReservedRegistration);
  assert.equal((await request("GET", "/platform/tenants", undefined, operator.token)).status, 200);

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

  assert.equal((await request("POST", "/platform/tenants", {
    companyName: "Tenant Negado H72",
    slug: "tenant-negado-h72",
    adminName: "Admin Negado",
    adminEmail: "admin-negado-h72@platform.test",
    adminPassword: "SenhaH72Segura123",
  }, control.token)).status, 403);
  assert.equal((await request("POST", "/platform/tenants", {
    companyName: "Tenant Invalido H72",
    slug: "tenant-invalido-h72",
    adminName: "Admin Invalido",
    adminEmail: "admin-invalido-h72@platform.test",
    adminPassword: "curta",
  }, operator.token)).status, 422);
  assert.equal((await request("POST", "/platform/tenants", {
    companyName: "Tenant Campo Extra H72",
    slug: "tenant-campo-extra-h72",
    adminName: "Admin Extra",
    adminEmail: "admin-extra-h72@platform.test",
    adminPassword: "SenhaH72Segura123",
    papel: "ADMIN",
  }, operator.token)).status, 422);

  const tenantCountsBefore = await automationCounts(0);
  const provisioned = await request("POST", "/platform/tenants", {
    companyName: "Provisionado H72",
    slug: "provisionado-h72",
    adminName: "Admin Provisionado H72",
    adminEmail: "admin-provisionado-h72@platform.test",
    adminPassword: "SenhaH72Segura123",
  }, operator.token);
  assert.equal(provisioned.status, 201);
  assert.equal(provisioned.body.tenant.nome, "Provisionado H72");
  assert.equal(provisioned.body.tenant.slug, "provisionado-h72");
  assert.equal(provisioned.body.tenant.capabilities.automations.enabled, false);
  assert.equal(provisioned.body.admin.papel, "ADMIN");
  assert.equal(provisioned.body.admin.ativo, true);
  assert.equal(JSON.stringify(provisioned.body).includes("SenhaH72Segura123"), false);
  assert.equal(JSON.stringify(provisioned.body).includes("senhaHash"), false);
  const provisionedUser = await prisma.usuario.findUnique({ where: { id: provisioned.body.admin.id } });
  assert.equal(provisionedUser.papel, "ADMIN");
  assert.notEqual(provisionedUser.senhaHash, "SenhaH72Segura123");
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: provisioned.body.tenant.id } }), 0);
  assert.deepEqual(await automationCounts(provisioned.body.tenant.id), tenantCountsBefore);
  const tenantAudit = await prisma.platformTenantAudit.findMany({ where: { tenantId: provisioned.body.tenant.id } });
  assert.equal(tenantAudit.length, 1);
  assert.equal(tenantAudit[0].actorUserId, operator.usuarioId);
  assert.equal(tenantAudit[0].action, "TENANT_CREATED");
  assert.equal(tenantAudit[0].tenantSlug, "provisionado-h72");
  assert.equal(tenantAudit[0].adminUserId, provisioned.body.admin.id);
  assert.equal(JSON.stringify(tenantAudit).includes("SenhaH72Segura123"), false);
  assert.equal((await request("POST", "/platform/tenants", {
    companyName: "Provisionado H72",
    slug: "provisionado-h72",
    adminName: "Admin Provisionado H72",
    adminEmail: "admin-provisionado-2-h72@platform.test",
    adminPassword: "SenhaH72Segura123",
  }, operator.token)).status, 409);
  assert.equal((await request("POST", "/platform/tenants", {
    companyName: "Provisionado Outro H72",
    slug: "provisionado-outro-h72",
    adminName: "Admin Provisionado H72",
    adminEmail: "admin-provisionado-h72@platform.test",
    adminPassword: "SenhaH72Segura123",
  }, operator.token)).status, 409);

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

  const unsafeReason = "probe postgresql://alice:synthetic-secret@db.internal:5432/crm?access_token=query-secret state=STATE123 signature=SIG123";
  const unsafeEnabled = await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: true, reason: unsafeReason }, operator.token);
  assert.equal(unsafeEnabled.status, 200);
  const unsafeAudit = await prisma.auditoriaFuncionalidade.findFirst({ where: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS }, orderBy: { id: "desc" } });
  assert.equal(unsafeAudit.valorNovo, true);
  assert.doesNotMatch(unsafeAudit.motivo, /synthetic-secret|query-secret|STATE123|SIG123|postgresql:/i);
  const unsafeAuditResponse = await request("GET", `/platform/tenants/${control.empresaId}/capabilities/automations/audit`, undefined, operator.token);
  assert.equal(unsafeAuditResponse.status, 200);
  assert.doesNotMatch(unsafeAuditResponse.body.data[0].reason, /synthetic-secret|query-secret|STATE123|SIG123|postgresql:/i);

  const disabledAgain = await request("PATCH", `/platform/tenants/${control.empresaId}/capabilities/automations`, { enabled: false, reason: "Encerrar segundo piloto" }, operator.token);
  assert.equal(disabledAgain.status, 200);
  audits = await prisma.auditoriaFuncionalidade.findMany({ where: { empresaId: control.empresaId, chave: FEATURE_KEYS.AUTOMATIONS } });
  assert.equal(audits.length, 4);
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: control.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS }), false);

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
