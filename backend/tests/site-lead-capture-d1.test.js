const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-site-leads-d1");
const databasePath = path.join(auditDir, `site-leads-${process.pid}.db`);

Object.assign(process.env, { NODE_ENV: "test", JWT_SECRET: "site-leads-d1-secret-with-sufficient-entropy", JWT_EXPIRES_IN: "1h", ALLOW_COMPANY_REGISTRATION: "true", INTEGRATION_ENCRYPTION_KEY: "site-leads-d1-encryption-key", DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`, LEADS_COMMUNICATION_ENABLED: "true", SITE_LEAD_CAPTURE_ENABLED: "true", SITE_LEAD_RATE_IP_LIMIT: "50", SITE_LEAD_RATE_PUBLIC_LIMIT: "200" });

let api; let prisma; let server; let baseUrl;
before(async () => { fs.mkdirSync(auditDir, { recursive: true }); fs.copyFileSync(path.join(backendDir, "prisma", "dev.db"), databasePath); migrate(); api = require("../src/server"); prisma = api.prisma; await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); }); baseUrl = `http://127.0.0.1:${server.address().port}`; });
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await new Promise((resolve) => server.close(resolve)); removeDatabase(databasePath); });

test("D1 capta formulario Site com seguranca, tenant e idempotencia", async () => {
  const adminA = await register("Empresa Site A", "Admin Site A", "admin-a@d1.test");
  const adminB = await register("Empresa Site B", "Admin Site B", "admin-b@d1.test");
  const manager = await createUser(adminA, "Gerente Site", "gerente@d1.test", "GERENTE");
  const seller = await createUser(adminA, "Vendedor Site", "vendedor@d1.test", "VENDEDOR");
  assert.equal((await authRequest("POST", "/canais/site-form", integrationPayload(), manager.token)).status, 403);
  assert.equal((await authRequest("POST", "/canais/site-form", integrationPayload(), seller.token)).status, 403);

  const created = await authRequest("POST", "/canais/site-form", integrationPayload(), adminA.token);
  assert.equal(created.status, 201);
  assert.match(created.body.publicId, /^[0-9a-f-]{36}$/);
  assert.notEqual(created.body.publicId, String(created.body.id));
  const integration = created.body;

  const submissionId = crypto.randomUUID();
  const payload = submission(submissionId, { telefone: "(11) 99999-1000", email: "NOVO@EXEMPLO.COM" });
  const accepted = await publicRequest(integration.publicId, payload);
  assert.equal(accepted.status, 202);
  assert.deepEqual(accepted.body, { accepted: true, submissionId });
  const lead = await prisma.lead.findFirst({ where: { empresaId: adminA.empresaId, origem: "SITE" } });
  assert.equal(lead.status, "NOVO"); assert.equal(lead.responsavelId, null); assert.equal(lead.campanha, "Safra D1"); assert.equal(lead.paginaOrigem, "http://127.0.0.1:4178/tratores"); assert.equal(lead.aceitePoliticaPrivacidade, true);
  const conversation = await prisma.conversaCanal.findFirst({ where: { leadId: lead.id }, include: { canalIntegracao: true, mensagens: true, contatoCanal: { include: { cliente: true } } } });
  assert.equal(conversation.status, "AGUARDANDO_ATENDIMENTO"); assert.equal(conversation.responsavelId, null); assert.equal(conversation.canalIntegracao.tipo, "SITE_FORM"); assert.equal(conversation.mensagens.length, 1); assert.equal(conversation.mensagens[0].direcao, "ENTRADA"); assert.equal(conversation.mensagens[0].autorUsuarioId, null); assert.equal(conversation.mensagens[0].simulada, false);
  assert.equal((await authRequest("POST", `/conversas/${conversation.id}/mensagens/simuladas`, { externalId: "site-reply", texto: "Resposta indevida", direcao: "SAIDA" }, seller.token)).status, 409);
  const detail = await authRequest("GET", `/conversas/${conversation.id}`, undefined, seller.token);
  assert.equal(detail.body.podeResponderDiretamente, false); assert.equal(detail.body.tipoCanal, "SITE_FORM");

  const counts = await domainCounts(adminA.empresaId);
  assert.equal((await publicRequest(integration.publicId, payload)).status, 202);
  assert.deepEqual(await domainCounts(adminA.empresaId), counts);
  const raceId = crypto.randomUUID();
  const race = await Promise.all([publicRequest(integration.publicId, submission(raceId)), publicRequest(integration.publicId, submission(raceId))]);
  assert.deepEqual(race.map((item) => item.status), [202, 202]);
  assert.equal(await prisma.eventoWebhook.count({ where: { canalIntegracaoId: integration.id, externalEventId: raceId } }), 1);

  const existingClient = await prisma.cliente.create({ data: { empresaId: adminA.empresaId, nome: "Cliente Existente", telefone: "5511988887777", email: "preservar@d1.test", empresa: "Empresa preservada" } });
  await publicRequest(integration.publicId, submission(crypto.randomUUID(), { nome: "Nome recebido", telefone: "11 98888-7777", email: null, empresa: "Nao sobrescrever" }));
  const preserved = await prisma.cliente.findUnique({ where: { id: existingClient.id } });
  assert.equal(preserved.nome, "Cliente Existente"); assert.equal(preserved.empresa, "Empresa preservada");

  const beforeBlocked = await domainCounts(adminA.empresaId);
  assert.equal((await publicRequest(integration.publicId, submission(crypto.randomUUID()), "http://malicioso.local")).status, 403);
  assert.deepEqual(await domainCounts(adminA.empresaId), beforeBlocked);
  const honey = await publicRequest(integration.publicId, submission(crypto.randomUUID(), { campoHoneypot: "spam" }));
  assert.equal(honey.status, 202); assert.deepEqual(await domainCounts(adminA.empresaId), beforeBlocked);
  assert.equal((await publicRequest(integration.publicId, { ...submission(crypto.randomUUID()), empresaId: adminB.empresaId })).status, 400);
  assert.equal((await publicRequest(integration.publicId, submission(crypto.randomUUID(), { aceitePoliticaPrivacidade: false }))).status, 400);
  assert.equal((await publicRequest(integration.publicId, submission(crypto.randomUUID(), { email: "invalido", telefone: null }))).status, 400);
  assert.equal((await publicRequest(integration.publicId, { ...submission(crypto.randomUUID()), desconhecido: true })).status, 400);
  assert.equal((await publicRequest(integration.publicId, { ...submission(crypto.randomUUID()), mensagem: "x".repeat(33000) })).status, 413);
  assert.equal((await publicRequest(integration.publicId, { ...submission(crypto.randomUUID()), mensagem: "x".repeat(120000) })).status, 413);
  assert.equal((await rawPublicRequest(integration.publicId, "{" )).status, 400);
  assert.equal(await prisma.lead.count({ where: { empresaId: adminB.empresaId } }), 0);

  const integrationB = (await authRequest("POST", "/canais/site-form", integrationPayload("Site B"), adminB.token)).body;
  assert.equal((await publicRequest(integrationB.publicId, submission(submissionId))).status, 202);
  assert.equal(await prisma.lead.count({ where: { empresaId: adminB.empresaId } }), 1);

  const oldPublicId = integration.publicId;
  const rotated = await authRequest("POST", `/canais/site-form/${integration.id}/rotacionar`, {}, adminA.token);
  assert.notEqual(rotated.body.publicId, oldPublicId);
  assert.equal((await publicRequest(oldPublicId, submission(crypto.randomUUID()))).status, 404);
  const disabled = await authRequest("PATCH", `/canais/site-form/${integration.id}`, { ativo: false }, adminA.token);
  assert.equal(disabled.body.ativo, false);
  assert.equal((await publicRequest(rotated.body.publicId, submission(crypto.randomUUID()))).status, 404);

  process.env.SITE_LEAD_CAPTURE_ENABLED = "false";
  assert.equal((await publicRequest(integrationB.publicId, submission(crypto.randomUUID()))).status, 404);
  assert.equal((await authRequest("GET", "/canais/site-form", undefined, adminB.token)).status, 404);
  process.env.SITE_LEAD_CAPTURE_ENABLED = "true";

  const { createSiteLeadRateLimiter } = require("../src/site-leads/rateLimiter");
  process.env.SITE_LEAD_RATE_IP_LIMIT = "2";
  const limiter = createSiteLeadRateLimiter({ now: () => 1 });
  limiter.consume({ publicId: "test", ip: "local" }); limiter.consume({ publicId: "test", ip: "local" });
  assert.throws(() => limiter.consume({ publicId: "test", ip: "local" }), (error) => error.status === 429);
});

function integrationPayload(name = "Site institucional") { return { nome: name, identificacao: "Formulario principal", origensPermitidas: ["http://127.0.0.1:4178", "http://localhost:4178"], politicaPrivacidade: "politica-d1-v1", ativo: true }; }
function submission(submissionId, patch = {}) { return { submissionId, nome: "Visitante QA", telefone: "11999991000", email: "visitante@d1.test", cidade: "Campinas", estado: "SP", produtoInteresse: "Trator D1", mensagem: "Gostaria de receber informacoes.", paginaOrigem: "http://127.0.0.1:4178/tratores", campanha: "Safra D1", aceitePoliticaPrivacidade: true, versaoPoliticaPrivacidade: "politica-d1-v1", campoHoneypot: "", ...patch }; }
async function publicRequest(publicId, body, origin = "http://127.0.0.1:4178") { return request("POST", `/public/site-leads/${publicId}`, body, undefined, origin); }
async function rawPublicRequest(publicId, body, origin = "http://127.0.0.1:4178") { const response = await fetch(`${baseUrl}/public/site-leads/${publicId}`, { method: "POST", headers: { "content-type": "application/json", origin }, body }); const text = await response.text(); return { status: response.status, body: text && response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text || null }; }
async function authRequest(method, pathname, body, token) { return request(method, pathname, body, token); }
async function request(method, pathname, body, token, origin) { const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const text = await response.text(); const contentType = response.headers.get("content-type") || ""; return { status: response.status, body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null }; }
async function register(empresaNome, adminNome, email) { const senha = "SenhaD1Segura123"; const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha }); assert.equal(registration.status, 201); await prisma.empresaFuncionalidade.createMany({ data: [{ empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true }, { empresaId: registration.body.empresa.id, chave: "SITE_LEAD_CAPTURE", habilitada: true }] }); const login = await request("POST", "/auth/login", { email, senha }); return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id }; }
async function createUser(admin, nome, email, papel) { const senha = "SenhaD1Segura123"; const created = await authRequest("POST", "/usuarios", { nome, email, senha, papel }, admin.token); const login = await request("POST", "/auth/login", { email, senha }); return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id }; }
async function domainCounts(empresaId) { const [clientes, leads, contatos, conversas, mensagens, eventos] = await Promise.all([prisma.cliente.count({ where: { empresaId } }), prisma.lead.count({ where: { empresaId } }), prisma.contatoCanal.count({ where: { empresaId } }), prisma.conversaCanal.count({ where: { empresaId } }), prisma.mensagemCanal.count({ where: { empresaId } }), prisma.eventoWebhook.count({ where: { empresaId } })]); return { clientes, leads, contatos, conversas, mensagens, eventos }; }
function migrate() { execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { cwd: backendDir, env: process.env, stdio: "pipe" }); }
function removeDatabase(file) { for (const suffix of ["", "-wal", "-shm", "-journal"]) { const target = `${file}${suffix}`; if (fs.existsSync(target)) fs.rmSync(target, { force: true }); } }
