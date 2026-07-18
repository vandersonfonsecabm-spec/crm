const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "whatsapp-f1a1");
const databasePath = path.join(auditDir, `whatsapp-f1a1-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "whatsapp-f1a1-test-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "whatsapp-f1a1-encryption-key",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  WHATSAPP_INTEGRATION_ENABLED: "false",
  WHATSAPP_INBOUND_ENABLED: "false",
  WHATSAPP_OUTBOUND_ENABLED: "false",
});

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("flags e capabilities WhatsApp sao fail-closed e respeitam a dependencia pai", async () => {
  const {
    FEATURE_KEYS,
    isFeatureEnabledForTenant,
    isGlobalFeatureEnabled,
  } = require("../src/tenant-features/service");

  for (const featureKey of [
    FEATURE_KEYS.WHATSAPP_INTEGRATION,
    FEATURE_KEYS.WHATSAPP_INBOUND,
    FEATURE_KEYS.WHATSAPP_OUTBOUND,
  ]) {
    assert.equal(isGlobalFeatureEnabled(featureKey, {}), false);
  }
  assert.equal(isGlobalFeatureEnabled(FEATURE_KEYS.WHATSAPP_INTEGRATION, { WHATSAPP_INTEGRATION_ENABLED: "TRUE" }), false);
  assert.equal(isGlobalFeatureEnabled(FEATURE_KEYS.WHATSAPP_INTEGRATION, { WHATSAPP_INTEGRATION_ENABLED: "true" }), true);
  assert.equal(isGlobalFeatureEnabled(FEATURE_KEYS.WHATSAPP_INBOUND, { WHATSAPP_INBOUND_ENABLED: "true" }), false);
  assert.equal(isGlobalFeatureEnabled(FEATURE_KEYS.WHATSAPP_OUTBOUND, { WHATSAPP_OUTBOUND_ENABLED: "true" }), false);

  const tenant = await registerAndLogin("Empresa Capabilities F1A1", "Admin Capabilities", "admin-capabilities@f1a1.test");
  await prisma.empresaFuncionalidade.create({
    data: { empresaId: tenant.empresaId, chave: FEATURE_KEYS.WHATSAPP_INBOUND, habilitada: true },
  });
  const enabledEnv = { WHATSAPP_INTEGRATION_ENABLED: "true", WHATSAPP_INBOUND_ENABLED: "true" };
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: tenant.empresaId, featureKey: FEATURE_KEYS.WHATSAPP_INBOUND, env: enabledEnv }), false);
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: tenant.empresaId } }), 1);

  await prisma.empresaFuncionalidade.create({
    data: { empresaId: tenant.empresaId, chave: FEATURE_KEYS.WHATSAPP_INTEGRATION, habilitada: true },
  });
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: tenant.empresaId, featureKey: FEATURE_KEYS.WHATSAPP_INBOUND, env: enabledEnv }), true);
  assert.equal(await isFeatureEnabledForTenant({ prisma, empresaId: tenant.empresaId, featureKey: FEATURE_KEYS.WHATSAPP_OUTBOUND, env: { ...enabledEnv, WHATSAPP_OUTBOUND_ENABLED: "true" } }), false);
  assert.equal(await prisma.auditoriaFuncionalidade.count({ where: { empresaId: tenant.empresaId } }), 0);
});

test("endpoint administrativo usa tenant da sessao e retorna somente estado local sanitizado", async () => {
  const { FEATURE_KEYS } = require("../src/tenant-features/service");
  const adminA = await registerAndLogin("Empresa WhatsApp A", "Admin WhatsApp A", "admin-a@whatsapp-f1a1.test");
  const adminB = await registerAndLogin("Empresa WhatsApp B", "Admin WhatsApp B", "admin-b@whatsapp-f1a1.test");
  const gerenteA = await createUserAndLogin(adminA.token, "Gerente WhatsApp A", "gerente-a@whatsapp-f1a1.test", "GERENTE");
  const vendedorA = await createUserAndLogin(adminA.token, "Vendedor WhatsApp A", "vendedor-a@whatsapp-f1a1.test", "VENDEDOR");

  assert.equal((await request("GET", "/integracoes/whatsapp/status")).status, 401);
  assert.equal((await request("GET", "/integracoes/whatsapp/status", undefined, adminA.token)).status, 404);

  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  assert.equal((await request("GET", "/integracoes/whatsapp/status", undefined, adminA.token)).status, 404);
  await prisma.empresaFuncionalidade.createMany({
    data: [
      { empresaId: adminA.empresaId, chave: FEATURE_KEYS.WHATSAPP_INTEGRATION, habilitada: true },
      { empresaId: adminB.empresaId, chave: FEATURE_KEYS.WHATSAPP_INTEGRATION, habilitada: true },
    ],
  });

  const channelB = await createConfiguredChannel(adminB.empresaId, "b");
  const injected = await request("GET", `/integracoes/whatsapp/status?empresaId=${adminB.empresaId}`, undefined, adminA.token);
  assert.deepEqual(injected.body, { status: "NOT_CONFIGURED", ready: false });
  assert.equal((await request("GET", "/integracoes/whatsapp/status", undefined, adminB.token)).body.status, "CONFIGURED");
  assert.equal((await request("GET", "/integracoes/whatsapp/status", undefined, gerenteA.token)).status, 403);
  assert.equal((await request("GET", "/integracoes/whatsapp/status", undefined, vendedorA.token)).status, 403);

  const channelA = await createConfiguredChannel(adminA.empresaId, "a");
  const configured = await request("GET", "/integracoes/whatsapp/status", undefined, adminA.token);
  assert.equal(configured.status, 200);
  assert.equal(configured.body.status, "CONFIGURED");
  assert.equal(configured.body.ready, true);
  assert.deepEqual(Object.keys(configured.body).sort(), [
    "connectedAt",
    "lastFailureAt",
    "lastWebhookAt",
    "ready",
    "status",
    "verifiedAt",
  ]);
  const serialized = JSON.stringify(configured.body);
  for (const forbidden of [
    "accessTokenRef",
    "sandbox-ref-a",
    "metaAppId",
    "wabaId",
    "phoneNumberId",
    "publicId",
    "configuracaoJson",
    "WHATSAPP_INTEGRATION_ENABLED",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `resposta expos: ${forbidden}`);
  }

  const patch = await request("PATCH", `/canais/${channelA.id}`, { accessTokenRef: "forbidden-input" }, adminA.token);
  assert.equal(patch.status, 400);
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: channelA.id } })).accessTokenRef, "sandbox-ref-a");
  const listed = await request("GET", "/canais", undefined, adminA.token);
  assert.equal(listed.status, 200);
  assert.equal(JSON.stringify(listed.body).includes("sandbox-ref-a"), false);
  assert.equal(channelB.empresaId, adminB.empresaId);

  const capabilities = await request("GET", "/auth/me", undefined, adminA.token);
  assert.deepEqual(capabilities.body.capabilities, {
    leadsCommunication: false,
    siteLeadCapture: false,
    negociosKanban: false,
    whatsappIntegration: true,
    whatsappInbound: false,
    whatsappOutbound: false,
  });
});

test("fundacao nao importa cliente de rede nem cria fluxo de credencial", () => {
  const source = fs.readFileSync(path.join(backendDir, "src", "integrations", "whatsappFoundation.js"), "utf8");
  assert.doesNotMatch(source, /require\(["'](?:node:)?(?:http|https|net|dns)["']\)|\bfetch\s*\(|axios/i);
  assert.doesNotMatch(source, /metaAppSecret|verifyToken|accessToken\s*[:=]/i);
  assert.match(source, /select:\s*\{/);
});

async function createConfiguredChannel(empresaId, suffix) {
  const now = new Date();
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "WHATSAPP_META",
      nome: `WhatsApp F1A1 ${suffix.toUpperCase()}`,
      chaveInterna: `whatsapp-f1a1-${suffix}`,
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
      providerEnvironment: `PILOT_${suffix.toUpperCase()}`,
      metaAppId: `meta-app-${suffix}`,
      metaBusinessId: `meta-business-${suffix}`,
      wabaId: `waba-${suffix}`,
      phoneNumberId: `phone-${suffix}`,
      displayPhoneMasked: `***${suffix}`,
      verifiedDisplayName: `Empresa ${suffix.toUpperCase()}`,
      qualityRating: "UNKNOWN",
      graphApiVersion: "sandbox-version",
      onboardingMethod: "MANUAL",
      accessTokenRef: `sandbox-ref-${suffix}`,
      credentialStatus: "ATIVA",
      connectedAt: now,
      verifiedAt: now,
    },
  });
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaF1A1Segura123";
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

async function createUserAndLogin(token, nome, email, papel) {
  const senha = "SenhaF1A1Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
