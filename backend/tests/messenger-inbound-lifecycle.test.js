const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
const createdTenantIds = [];
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "messenger-inbound-lifecycle", `lifecycle-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "messenger-inbound-lifecycle-test-secret-with-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  MESSENGER_META_APP_ID: "000GLOBAL_MESSENGER_LIFECYCLE",
  MESSENGER_PROVIDER_ENVIRONMENT: "MESSENGER_LIFECYCLE_TEST",
  MESSENGER_INTEGRATION_ENABLED: "true",
  MESSENGER_INBOUND_ENABLED: "true",
  MESSENGER_APP_SECRET: "test-only-messenger-app-secret",
  MESSENGER_WEBHOOK_VERIFY_TOKEN: "test-only-messenger-verify-token",
});
delete process.env.PLATFORM_ADMIN_EMAILS;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  let cleanupError;
  try {
    if (prisma && createdTenantIds.length) {
      const where = { empresaId: { in: createdTenantIds } };
      await prisma.auditoriaFuncionalidade.deleteMany({ where });
      await prisma.empresaFuncionalidade.deleteMany({ where });
      await prisma.canalIntegracao.deleteMany({ where });
      await prisma.usuario.deleteMany({ where });
      await prisma.empresa.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
  } catch (error) {
    cleanupError = error;
  } finally {
    if (server) {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (prisma) await prisma.$disconnect();
    if (databasePath) removeDatabase(databasePath);
  }
  if (cleanupError) throw cleanupError;
});

test("lifecycle Messenger protege RBAC, allowlist, configuracao e canais nao canonicos", async () => {
  const operator = await register("Operadora Messenger Lifecycle", "Operadora", uniqueEmail("operator"));
  const target = await register("Tenant Messenger Lifecycle", "Admin Alvo", uniqueEmail("target"));
  const manager = await createUser(target, "Gerente Alvo", uniqueEmail("manager"), "GERENTE");
  const seller = await createUser(target, "Vendedor Alvo", uniqueEmail("seller"), "VENDEDOR");
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();

  assert.equal((await status(target.empresaId, target.token)).status, 403);
  assert.equal((await status(target.empresaId, manager.token)).status, 403);
  assert.equal((await status(target.empresaId, seller.token)).status, 403);
  assert.equal((await status(999999999, operator.token)).status, 404);

  let response = await status(target.empresaId, operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "NOT_CONFIGURED");
  assert.equal(response.body.nextRequirement, "PROVISION_MESSENGER_INBOUND");

  response = await action("activate", target.empresaId, lifecycleBody(new Date()), operator.token);
  assert.equal(response.status, 404);
  assert.equal(response.body.codigo, "MESSENGER_CHANNEL_NOT_FOUND");

  const testTenant = await register(
    "Tenant Teste Messenger Lifecycle",
    "Admin Teste",
    uniqueEmail("test-channel"),
  );
  const testChannel = await createTestChannel(testTenant.empresaId);
  response = await action(
    "activate",
    testTenant.empresaId,
    lifecycleBody(testChannel.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 404);
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: testChannel.id } }),
    testChannel,
  );

  const legacyTenant = await register(
    "Tenant Legado Messenger Lifecycle",
    "Admin Legado",
    uniqueEmail("legacy"),
  );
  const legacy = await createRealChannel(legacyTenant.empresaId, {
    chaveInterna: "messenger-meta-inbound-legacy",
  });
  response = await action(
    "activate",
    legacyTenant.empresaId,
    lifecycleBody(legacy.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 409);
  assert.equal(response.body.codigo, "MESSENGER_LEGACY_CHANNEL_CONFLICT");

  const configured = await createRealChannel(target.empresaId);
  const appId = process.env.MESSENGER_META_APP_ID;
  delete process.env.MESSENGER_META_APP_ID;
  response = await action(
    "activate",
    target.empresaId,
    lifecycleBody(configured.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.codigo, "MESSENGER_GLOBAL_CONFIGURATION_INVALID");
  process.env.MESSENGER_META_APP_ID = appId;

  const appSecret = process.env.MESSENGER_APP_SECRET;
  delete process.env.MESSENGER_APP_SECRET;
  response = await status(target.empresaId, operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "ERROR");
  response = await action(
    "activate",
    target.empresaId,
    lifecycleBody(configured.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.codigo, "MESSENGER_GLOBAL_CONFIGURATION_INVALID");
  process.env.MESSENGER_APP_SECRET = appSecret;

  const protectedSnapshot = await prisma.canalIntegracao.findUnique({
    where: { id: configured.id },
  });
  for (const token of [target.token, manager.token, seller.token]) {
    for (const actionName of ["activate", "pause", "reactivate"]) {
      response = await action(
        actionName,
        target.empresaId,
        lifecycleBody(configured.updatedAt),
        token,
      );
      assert.equal(response.status, 403, `${actionName} deve exigir platform operator`);
    }
  }
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: configured.id } }),
    protectedSnapshot,
  );
  assert.equal(
    await prisma.empresaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    0,
  );

  for (const field of [
    "ativo",
    "status",
    "capabilities",
    "empresaId",
    "tenantId",
    "messengerPageId",
    "messengerPageNameMasked",
    "metaAppId",
    "providerEnvironment",
    "accessTokenRef",
    "connectedAt",
    "verifiedAt",
    "lastWebhookAt",
    "unknown",
  ]) {
    response = await action("activate", target.empresaId, {
      ...lifecycleBody(configured.updatedAt),
      [field]: "blocked",
    }, operator.token);
    assert.equal(response.status, 422, field);
    assert.equal(response.body.codigo, "MESSENGER_LIFECYCLE_INVALID", field);
  }
});

test("lifecycle Messenger ativa, pausa e reativa com CAS, idempotencia e auditoria atomicos", async () => {
  const operator = await register(
    "Operadora Fluxo Messenger",
    "Operadora",
    uniqueEmail("operator-flow"),
  );
  const target = await register(
    "Tenant Fluxo Messenger",
    "Admin Alvo",
    uniqueEmail("target-flow"),
  );
  const untouched = await register(
    "Tenant Isolado Messenger",
    "Admin Isolado",
    uniqueEmail("untouched"),
  );
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();
  let channel = await createRealChannel(target.empresaId);
  const untouchedChannel = await createRealChannel(untouched.empresaId);
  const initialTimestamps = operationalTimestamps(channel);
  const initialEffects = await effectCounts(target.empresaId);

  let response = await status(target.empresaId, operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "CONFIGURED_INACTIVE");
  assert.equal(response.body.messengerPageIdMasked, maskOpaqueId(
    channel.messengerPageId,
  ));
  assert.equal(JSON.stringify(response.body).includes(channel.messengerPageId), false);
  assert.equal(JSON.stringify(response.body).includes("accessTokenRef"), false);

  response = await action("activate", target.empresaId, lifecycleBody(new Date(0)), operator.token);
  assert.equal(response.status, 409);
  assert.equal(response.body.codigo, "MESSENGER_CHANNEL_CONFLICT");

  const logLines = [];
  const originalInfo = console.info;
  console.info = (line) => logLines.push(String(line));
  try {
    response = await action("activate", target.empresaId, {
      expectedUpdatedAt: channel.updatedAt.toISOString(),
      reason: `Ativar inbound ${channel.messengerPageId} token=segredo payload=dados`,
    }, operator.token, { "x-correlation-id": "messenger-lifecycle-activate" });
  } finally {
    console.info = originalInfo;
  }
  assert.equal(response.status, 200);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.state, "WAITING_META_AUTH");
  assert.equal(response.body.nextRequirement, "CONFIGURE_META_CALLBACK");
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: true });

  channel = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.equal(channel.ativo, true);
  assert.equal(channel.status, "ATIVO");
  assert.deepEqual(operationalTimestamps(channel), initialTimestamps);
  assert.deepEqual(await featureState(target.empresaId), {
    MESSENGER_INBOUND: true,
    MESSENGER_INTEGRATION: true,
  });

  const activationAudits = await prisma.auditoriaFuncionalidade.findMany({
    where: { empresaId: target.empresaId },
    orderBy: { id: "asc" },
  });
  assert.equal(activationAudits.length, 2);
  for (const audit of activationAudits) {
    assert.equal(audit.motivo.includes(channel.messengerPageId), false);
    assert.equal(audit.motivo.includes("segredo"), false);
    assert.equal(audit.motivo.includes("payload=dados"), false);
  }
  assert.equal(logLines.length, 1);
  assert.equal(logLines[0].includes(channel.messengerPageId), false);
  assert.equal(logLines[0].includes("segredo"), false);
  assert.match(logLines[0], /messenger-lifecycle-activate/);

  const activeVersion = channel.updatedAt;
  const activateReplay = await action(
    "activate",
    target.empresaId,
    lifecycleBody(new Date(0)),
    operator.token,
  );
  assert.equal(activateReplay.status, 200);
  assert.equal(activateReplay.body.changed, false);
  assert.equal(
    await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    2,
  );

  const stalePause = await action(
    "pause",
    target.empresaId,
    lifecycleBody(new Date(0)),
    operator.token,
  );
  assert.equal(stalePause.status, 409);
  assert.equal(stalePause.body.codigo, "MESSENGER_CHANNEL_CONFLICT");

  response = await action("pause", target.empresaId, lifecycleBody(activeVersion), operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.state, "CONFIGURED_INACTIVE");
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: false });
  channel = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.deepEqual(operationalTimestamps(channel), initialTimestamps);

  const pauseReplay = await action(
    "pause",
    target.empresaId,
    lifecycleBody(new Date(0)),
    operator.token,
  );
  assert.equal(pauseReplay.status, 200);
  assert.equal(pauseReplay.body.changed, false);

  const staleReactivate = await action(
    "reactivate",
    target.empresaId,
    lifecycleBody(activeVersion),
    operator.token,
  );
  assert.equal(staleReactivate.status, 409);
  assert.equal(staleReactivate.body.codigo, "MESSENGER_CHANNEL_CONFLICT");

  response = await action(
    "reactivate",
    target.empresaId,
    lifecycleBody(channel.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.state, "WAITING_META_AUTH");
  assert.equal(
    await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    4,
  );
  assert.deepEqual(await effectCounts(target.empresaId), initialEffects);
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: untouchedChannel.id } }),
    untouchedChannel,
  );
  assert.equal(
    await prisma.empresaFuncionalidade.count({ where: { empresaId: untouched.empresaId } }),
    0,
  );
});

test("lifecycle Messenger preserva timestamps e deriva CONNECTED e PAUSED", async () => {
  const operator = await register(
    "Operadora Estados Messenger",
    "Operadora",
    uniqueEmail("operator-states"),
  );
  const target = await register(
    "Tenant Estados Messenger",
    "Admin Alvo",
    uniqueEmail("target-states"),
  );
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();
  const verifiedAt = new Date("2026-01-02T03:04:05.000Z");
  const connectedAt = new Date("2026-01-02T03:04:06.000Z");
  const lastWebhookAt = new Date("2026-01-02T03:04:07.000Z");
  let channel = await createRealChannel(target.empresaId, {
    ativo: true,
    status: "ATIVO",
    verifiedAt,
    connectedAt,
    lastWebhookAt,
  });
  await createFeature(target.empresaId, "MESSENGER_INTEGRATION", true);
  await createFeature(target.empresaId, "MESSENGER_INBOUND", true);

  let response = await status(target.empresaId, operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "CONNECTED");
  assert.equal(response.body.nextRequirement, null);

  response = await action("pause", target.empresaId, lifecycleBody(channel.updatedAt), operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "PAUSED");
  assert.equal(response.body.nextRequirement, "REACTIVATE_MESSENGER_INBOUND");
  channel = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.deepEqual(operationalTimestamps(channel), {
    connectedAt: connectedAt.toISOString(),
    verifiedAt: verifiedAt.toISOString(),
    lastWebhookAt: lastWebhookAt.toISOString(),
  });

  response = await action(
    "reactivate",
    target.empresaId,
    lifecycleBody(channel.updatedAt),
    operator.token,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "CONNECTED");
  channel = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.deepEqual(operationalTimestamps(channel), {
    connectedAt: connectedAt.toISOString(),
    verifiedAt: verifiedAt.toISOString(),
    lastWebhookAt: lastWebhookAt.toISOString(),
  });

  channel = await prisma.canalIntegracao.update({
    where: { id: channel.id },
    data: {
      lastFailureAt: new Date("2026-01-02T03:04:08.000Z"),
      lastFailureCode: "MESSENGER_SYNTHETIC_FAILURE",
    },
  });
  response = await action("pause", target.empresaId, lifecycleBody(channel.updatedAt), operator.token);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "ERROR");
  assert.equal(response.body.ativo, false);
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: false });
  const pausedAfterFailure = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.equal(
    pausedAfterFailure.lastFailureAt.toISOString(),
    "2026-01-02T03:04:08.000Z",
  );
  assert.equal(pausedAfterFailure.lastFailureCode, "MESSENGER_SYNTHETIC_FAILURE");
});

test("lifecycle Messenger reverte canal e capabilities se auditoria falhar", async () => {
  const operator = await register(
    "Operadora Rollback Messenger",
    "Operadora",
    uniqueEmail("operator-rollback"),
  );
  const target = await register(
    "Tenant Rollback Messenger",
    "Admin Alvo",
    uniqueEmail("target-rollback"),
  );
  const channel = await createRealChannel(target.empresaId);
  const {
    createMessengerInboundLifecycleService,
  } = require("../src/integrations/messengerInboundLifecycle");
  const lifecycle = createMessengerInboundLifecycleService({ prisma, logger: { info() {} } });

  await assert.rejects(
    lifecycle.activate({
      tenantId: target.empresaId,
      actorUserId: 2147483647,
      body: lifecycleBody(channel.updatedAt),
    }),
  );
  const rolledBack = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.equal(rolledBack.ativo, false);
  assert.equal(rolledBack.status, "INATIVO");
  assert.equal(rolledBack.updatedAt.toISOString(), channel.updatedAt.toISOString());
  assert.equal(
    await prisma.empresaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    0,
  );
  assert.equal(
    await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    0,
  );

  const loggerFailure = createMessengerInboundLifecycleService({
    prisma,
    logger: { info() { throw new Error("synthetic logger failure"); } },
  });
  const activated = await loggerFailure.activate({
    tenantId: target.empresaId,
    actorUserId: operator.usuarioId,
    body: lifecycleBody(channel.updatedAt),
  });
  assert.equal(activated.changed, true);
  assert.equal(activated.state, "WAITING_META_AUTH");
  assert.equal(
    await prisma.empresaFuncionalidade.count({
      where: { empresaId: target.empresaId, habilitada: true },
    }),
    2,
  );
  assert.equal(
    await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    2,
  );
});

test("lifecycle Messenger serializa ativacao concorrente sem duplicar auditoria", async () => {
  const operator = await register(
    "Operadora Concorrencia Messenger",
    "Operadora",
    uniqueEmail("operator-concurrency"),
  );
  const target = await register(
    "Tenant Concorrencia Messenger",
    "Admin Alvo",
    uniqueEmail("target-concurrency"),
  );
  const isolated = await register(
    "Tenant Concorrencia Isolado",
    "Admin Isolado",
    uniqueEmail("isolated-concurrency"),
  );
  process.env.PLATFORM_ADMIN_EMAILS = operator.email.toUpperCase();
  const channel = await createRealChannel(target.empresaId);
  const isolatedChannel = await createRealChannel(isolated.empresaId);
  const payload = lifecycleBody(channel.updatedAt);

  const results = await Promise.all([
    action("activate", target.empresaId, payload, operator.token),
    action("activate", target.empresaId, payload, operator.token),
  ]);
  assert.equal(results.filter((result) => result.status === 200 && result.body.changed).length, 1);
  assert.equal(results.every((result) => (
    result.status === 200 || (
      result.status === 409 && result.body.codigo === "MESSENGER_CHANNEL_CONFLICT"
    )
  )), true);

  const persisted = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.equal(persisted.ativo, true);
  assert.equal(persisted.status, "ATIVO");
  assert.deepEqual(await featureState(target.empresaId), {
    MESSENGER_INBOUND: true,
    MESSENGER_INTEGRATION: true,
  });
  assert.equal(
    await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.empresaId } }),
    2,
  );
  assert.deepEqual(
    await prisma.canalIntegracao.findUnique({ where: { id: isolatedChannel.id } }),
    isolatedChannel,
  );
  assert.equal(
    await prisma.empresaFuncionalidade.count({ where: { empresaId: isolated.empresaId } }),
    0,
  );
});

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaMessengerLifecycle123";
  const registration = await request("POST", "/auth/register-company", {
    empresaNome: `${empresaNome} ${suffix}`,
    adminNome,
    email,
    senha,
  });
  assert.equal(registration.status, 201);
  createdTenantIds.push(registration.body.empresa.id);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return {
    token: login.body.access_token,
    email,
    empresaId: registration.body.empresa.id,
    usuarioId: registration.body.usuario.id,
  };
}

async function createUser(admin, nome, email, papel) {
  const senha = "SenhaMessengerUsuario123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token };
}

async function createRealChannel(empresaId, overrides = {}) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "MESSENGER_META",
      nome: "Messenger inbound lifecycle",
      chaveInterna: "messenger-meta-inbound-real",
      publicId: `messenger-lifecycle-${empresaId}-${suffix}`,
      status: "INATIVO",
      modoTeste: false,
      ativo: false,
      providerEnvironment: process.env.MESSENGER_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.MESSENGER_META_APP_ID,
      messengerPageId: `IG_LIFECYCLE_${empresaId}_${suffix}`,
      messengerPageNameMasked: "@insta***",
      ...overrides,
    },
  });
}

async function createTestChannel(empresaId) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "MESSENGER_META",
      nome: "Messenger test lifecycle",
      chaveInterna: "messenger-meta-test-lifecycle",
      publicId: `messenger-lifecycle-test-${empresaId}-${suffix}`,
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
      messengerPageId: `IG_TEST_${empresaId}_${suffix}`,
    },
  });
}

async function createFeature(empresaId, chave, habilitada) {
  return prisma.empresaFuncionalidade.create({
    data: {
      empresaId,
      chave,
      habilitada,
      habilitadoEm: habilitada ? new Date() : null,
    },
  });
}

async function featureState(empresaId) {
  const rows = await prisma.empresaFuncionalidade.findMany({
    where: {
      empresaId,
      chave: { in: ["MESSENGER_INTEGRATION", "MESSENGER_INBOUND"] },
    },
    orderBy: { chave: "asc" },
    select: { chave: true, habilitada: true },
  });
  return Object.fromEntries(rows.map((row) => [row.chave, row.habilitada]));
}

async function effectCounts(empresaId) {
  const [events, messages, contacts, conversations] = await Promise.all([
    prisma.eventoWebhook.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.contatoCanal.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
  ]);
  return { events, messages, contacts, conversations };
}

function operationalTimestamps(channel) {
  return {
    connectedAt: channel.connectedAt?.toISOString() || null,
    verifiedAt: channel.verifiedAt?.toISOString() || null,
    lastWebhookAt: channel.lastWebhookAt?.toISOString() || null,
  };
}

function lifecycleBody(updatedAt) {
  return {
    expectedUpdatedAt: updatedAt.toISOString(),
    reason: "Operacao controlada do lifecycle Messenger",
  };
}

function maskOpaqueId(value) {
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

async function status(tenantId, token) {
  return request(
    "GET",
    `/platform/tenants/${tenantId}/integrations/messenger/inbound/status`,
    undefined,
    token,
  );
}

async function action(name, tenantId, body, token, headers) {
  return request(
    "POST",
    `/platform/tenants/${tenantId}/integrations/messenger/inbound/${name}`,
    body,
    token,
    headers,
  );
}

async function request(method, pathname, body, token, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null,
  };
}

function uniqueEmail(label) {
  return `${label}-${suffix}@platform.test`;
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const ending of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${ending}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}
