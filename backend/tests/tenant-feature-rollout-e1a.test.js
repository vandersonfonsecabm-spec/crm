const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "tenant-feature-e1a");
const databasePath = path.join(auditDir, `tenant-feature-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "tenant-feature-e1a-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "tenant-feature-e1a-encryption-key",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  LEADS_COMMUNICATION_ENABLED: "true",
  SITE_LEAD_CAPTURE_ENABLED: "true",
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
  await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("E1A combina kill switch global e liberacao tenant sem vazamento", async () => {
  const { FEATURE_KEYS, setTenantFeature } = require("../src/tenant-features/service");
  const pilot = await register("Empresa Piloto E1A", "Admin Piloto", "admin-piloto@e1a.test");
  const control = await register("Empresa Controle E1A", "Admin Controle", "admin-controle@e1a.test");

  assert.deepEqual((await authRequest("GET", "/auth/me", undefined, pilot.token)).body.capabilities, {
    leadsCommunication: false,
    siteLeadCapture: false,
    negociosKanban: false,
  });
  assert.equal((await authRequest("GET", "/leads", undefined, pilot.token)).status, 404);
  assert.equal((await authRequest("GET", "/canais/site-form", undefined, pilot.token)).status, 404);

  await setTenantFeature({ prisma, empresaId: pilot.empresaId, featureKey: FEATURE_KEYS.LEADS_COMMUNICATION, enabled: true, operatedBy: "qa-platform", reason: "Validacao temporaria E1A", usuarioId: pilot.usuarioId });
  await setTenantFeature({ prisma, empresaId: pilot.empresaId, featureKey: FEATURE_KEYS.SITE_LEAD_CAPTURE, enabled: true, operatedBy: "qa-platform", reason: "Validacao temporaria E1A", usuarioId: pilot.usuarioId });

  const pilotCapabilities = await authRequest("GET", "/auth/me", undefined, pilot.token);
  const controlCapabilities = await authRequest("GET", "/auth/me", undefined, control.token);
  assert.deepEqual(pilotCapabilities.body.capabilities, { leadsCommunication: true, siteLeadCapture: true, negociosKanban: false });
  assert.deepEqual(controlCapabilities.body.capabilities, { leadsCommunication: false, siteLeadCapture: false, negociosKanban: false });
  assert.equal((await authRequest("GET", "/leads", undefined, pilot.token)).status, 200);
  assert.equal((await authRequest("GET", "/leads", undefined, control.token)).status, 404);
  assert.equal((await authRequest("POST", "/tenant-features", { chave: "LEADS_COMMUNICATION" }, pilot.token)).status, 404);

  const cliente = await prisma.cliente.create({ data: { empresaId: pilot.empresaId, nome: "Cliente Piloto", telefone: "11999990000", email: "cliente@e1a.test" } });
  assert.equal((await authRequest("POST", "/leads", { clienteId: cliente.id }, pilot.token)).status, 201);
  assert.equal(await prisma.lead.count({ where: { empresaId: control.empresaId } }), 0);

  const integration = await authRequest("POST", "/canais/site-form", integrationPayload(), pilot.token);
  assert.equal(integration.status, 201);
  const submissionId = crypto.randomUUID();
  assert.equal((await publicRequest(integration.body.publicId, submission(submissionId))).status, 202);
  const counts = await domainCounts(pilot.empresaId);
  assert.equal((await publicRequest(integration.body.publicId, submission(submissionId))).status, 202);
  assert.deepEqual(await domainCounts(pilot.empresaId), counts);

  const disabledPublicId = crypto.randomUUID();
  await prisma.canalIntegracao.create({ data: { empresaId: control.empresaId, tipo: "SITE_FORM", nome: "Site controle", chaveInterna: `site-${disabledPublicId}`, publicId: disabledPublicId, configuracaoJson: JSON.stringify({ origensPermitidas: ["http://127.0.0.1:4178"] }), status: "ATIVO", modoTeste: true, ativo: true } });
  const beforeControl = await domainCounts(control.empresaId);
  assert.equal((await publicRequest(disabledPublicId, submission(crypto.randomUUID()))).status, 404);
  assert.deepEqual(await domainCounts(control.empresaId), beforeControl);

  process.env.LEADS_COMMUNICATION_ENABLED = "false";
  assert.equal((await authRequest("GET", "/leads", undefined, pilot.token)).status, 404);
  assert.equal((await authRequest("GET", "/auth/me", undefined, pilot.token)).body.capabilities.leadsCommunication, false);
  process.env.LEADS_COMMUNICATION_ENABLED = "true";

  process.env.SITE_LEAD_CAPTURE_ENABLED = "false";
  assert.equal((await publicRequest(integration.body.publicId, submission(crypto.randomUUID()))).status, 404);
  process.env.SITE_LEAD_CAPTURE_ENABLED = "true";

  assert.equal(await prisma.auditoriaFuncionalidade.count({ where: { empresaId: pilot.empresaId } }), 2);
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: control.empresaId } }), 0);
});

test("E1A e fail-closed para ausencia, valor falso e falha de consulta", async () => {
  const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../src/tenant-features/service");
  const fakePrisma = { empresaFuncionalidade: { findUnique: async () => { throw Object.assign(new Error("database unavailable"), { code: "DB_DOWN" }); } } };
  assert.equal(await isFeatureEnabledForTenant({ prisma: fakePrisma, empresaId: 1, featureKey: FEATURE_KEYS.LEADS_COMMUNICATION, env: { LEADS_COMMUNICATION_ENABLED: "true" } }), false);
  assert.equal(await isFeatureEnabledForTenant({ prisma: fakePrisma, empresaId: 1, featureKey: FEATURE_KEYS.LEADS_COMMUNICATION, env: { LEADS_COMMUNICATION_ENABLED: "false" } }), false);
  assert.equal(await isFeatureEnabledForTenant({ prisma: { empresaFuncionalidade: { findUnique: async () => null } }, empresaId: 1, featureKey: FEATURE_KEYS.LEADS_COMMUNICATION, env: { LEADS_COMMUNICATION_ENABLED: "true" } }), false);
  assert.equal(await isFeatureEnabledForTenant({ prisma: { empresaFuncionalidade: { findUnique: async () => ({ habilitada: false }) } }, empresaId: 1, featureKey: FEATURE_KEYS.LEADS_COMMUNICATION, env: { LEADS_COMMUNICATION_ENABLED: "true" } }), false);
});

function integrationPayload() { return { nome: "Site piloto", identificacao: "Formulario E1A", origensPermitidas: ["http://127.0.0.1:4178"], politicaPrivacidade: "politica-e1a", ativo: true }; }
function submission(submissionId) { return { submissionId, nome: "Visitante E1A", telefone: "11988887777", produtoInteresse: "Trator E1A", mensagem: "Contato de teste local.", paginaOrigem: "http://127.0.0.1:4178/e1a", aceitePoliticaPrivacidade: true, versaoPoliticaPrivacidade: "politica-e1a", campoHoneypot: "" }; }

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaE1ASegura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function authRequest(method, pathname, body, token) { return request(method, pathname, body, token); }
async function publicRequest(publicId, body) { return request("POST", `/public/site-leads/${publicId}`, body, undefined, "http://127.0.0.1:4178"); }
async function request(method, pathname, body, token, origin) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return { status: response.status, body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null };
}

async function domainCounts(empresaId) {
  const [clientes, leads, contatos, conversas, mensagens, eventos] = await Promise.all([
    prisma.cliente.count({ where: { empresaId } }), prisma.lead.count({ where: { empresaId } }), prisma.contatoCanal.count({ where: { empresaId } }), prisma.conversaCanal.count({ where: { empresaId } }), prisma.mensagemCanal.count({ where: { empresaId } }), prisma.eventoWebhook.count({ where: { empresaId } }),
  ]);
  return { clientes, leads, contatos, conversas, mensagens, eventos };
}

function removeDatabase(file) { for (const suffix of ["", "-wal", "-shm", "-journal"]) { const target = `${file}${suffix}`; if (fs.existsSync(target)) fs.rmSync(target, { force: true }); } }
function requiredEnv(name) { if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`); return process.env[name]; }
