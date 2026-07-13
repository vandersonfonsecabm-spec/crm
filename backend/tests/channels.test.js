const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `channels-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "channels-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.ALLOW_DEMO_MODE = "false";
process.env.INTEGRATION_ENCRYPTION_KEY = "channels-test-encryption-key-with-32-bytes-minimum";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

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
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("fundacao multiempresa de canais isola, autoriza e nao altera CRM comercial", async () => {
  const { createChannelService, MAX_MESSAGE_TEXT } = require("../src/channels/channelService");
  const { normalizePhone } = require("../src/channels/phoneNormalizer");
  const service = createChannelService({ prisma });

  const initialCounts = await commercialCounts();
  assert.equal(await prisma.canalIntegracao.count(), 0);

  const adminA = await registerAndLogin("Empresa Canais A", "Admin Canais A", "admin-a@canais.test");
  const adminB = await registerAndLogin("Empresa Canais B", "Admin Canais B", "admin-b@canais.test");
  const gerente = await createUserAndLogin(adminA.token, "Gerente Canais", "gerente@canais.test", "GERENTE");
  const vendedor = await createUserAndLogin(adminA.token, "Vendedor Canais", "vendedor@canais.test", "VENDEDOR");
  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 404);

  assert.equal((await request("GET", "/canais")).status, 401);
  assert.equal((await request("GET", "/canais", undefined, "token-invalido")).status, 401);
  assert.equal((await request("POST", "/canais/whatsapp/teste", {}, gerente.token)).status, 403);
  assert.equal((await request("POST", "/canais/whatsapp/teste", {}, vendedor.token)).status, 403);

  const created = await request("POST", "/canais/whatsapp/teste", {}, adminA.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.tipo, "WHATSAPP_META");
  assert.equal(created.body.status, "MODO_TESTE");
  assert.equal(created.body.modoTeste, true);
  assert.equal(created.body.ativo, true);
  assert.equal(created.body.empresaId, undefined);
  assert.equal(created.body.chaveInterna, undefined);

  const repeated = await request("POST", "/canais/whatsapp/teste", {}, adminA.token);
  assert.equal(repeated.status, 201);
  assert.equal(repeated.body.id, created.body.id);
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => request("POST", "/canais/whatsapp/teste", {}, adminA.token)));
  assert.equal(new Set(concurrent.map((item) => item.body.id)).size, 1);
  assert.equal(await prisma.canalIntegracao.count({ where: { empresaId: adminA.empresaId } }), 1);

  const listA = await request("GET", "/canais", undefined, adminA.token);
  assert.equal(listA.status, 200);
  assert.equal(listA.body.data.length, 1);
  const listB = await request("GET", "/canais", undefined, adminB.token);
  assert.equal(listB.status, 200);
  assert.equal(listB.body.data.length, 0);
  assert.equal((await request("GET", `/canais/${created.body.id}`, undefined, adminB.token)).status, 404);
  assert.equal((await request("GET", `/canais/${created.body.id}/status`, undefined, adminA.token)).body.status, "MODO_TESTE");

  assert.equal((await request("PATCH", `/canais/${created.body.id}`, {}, adminA.token)).status, 400);
  assert.equal((await request("PATCH", `/canais/${created.body.id}`, { empresaId: adminB.empresaId }, adminA.token)).status, 400);
  assert.equal((await request("PATCH", `/canais/${created.body.id}`, { tipo: "WHATSAPP_META" }, adminA.token)).status, 400);
  const renamed = await request("PATCH", `/canais/${created.body.id}`, { nome: "WhatsApp Teste Canais", ativo: false }, adminA.token);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.nome, "WhatsApp Teste Canais");
  assert.equal(renamed.body.status, "INATIVO");
  const reactivated = await request("PATCH", `/canais/${created.body.id}`, { ativo: true }, adminA.token);
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.status, "MODO_TESTE");

  assert.equal(normalizePhone("+55 (11) 99999-0000"), "+5511999990000");
  assert.equal(normalizePhone("11 99999-0000", { defaultCountryCode: "55" }), "+5511999990000");
  assert.throws(() => normalizePhone("11 99999-0000"), /codigo do pais/i);
  assert.throws(() => normalizePhone("+1234567890123456"), /E.164/);

  const channelB = await service.createTestChannel({ empresaId: adminB.empresaId });
  await assert.rejects(
    service.createOrFindChannelContact({ empresaId: adminA.empresaId, canalIntegracaoId: channelB.id, externalId: "contato-b" }),
    /Canal nao encontrado/,
  );
  const contact = await service.createOrFindChannelContact({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    externalId: "contato-a-1",
    telefoneNormalizado: "+5511999991111",
    nome: "Contato Sintetico",
  });
  const sameContact = await service.createOrFindChannelContact({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    externalId: "contato-a-1",
  });
  assert.equal(sameContact.id, contact.id);

  const openConversation = await service.createOrFindOpenConversation({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    contatoCanalId: contact.id,
  });
  const sameConversation = await service.createOrFindOpenConversation({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    contatoCanalId: contact.id,
  });
  assert.equal(sameConversation.id, openConversation.id);
  const concurrentConversations = await Promise.all(Array.from({ length: 5 }, () => service.createOrFindOpenConversation({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    contatoCanalId: contact.id,
  })));
  assert.equal(new Set(concurrentConversations.map((item) => item.id)).size, 1);

  await service.closeConversation({ empresaId: adminA.empresaId, id: openConversation.id });
  const newConversation = await service.createOrFindOpenConversation({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    contatoCanalId: contact.id,
  });
  assert.notEqual(newConversation.id, openConversation.id);

  const message = await service.registerSimulatedMessage({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    conversaCanalId: newConversation.id,
    externalId: "msg-a-1",
    texto: "Mensagem sintetica",
  });
  const sameMessage = await service.registerSimulatedMessage({
    empresaId: adminA.empresaId,
    canalIntegracaoId: created.body.id,
    conversaCanalId: newConversation.id,
    externalId: "msg-a-1",
    texto: "Mensagem sintetica alterada",
  });
  assert.equal(sameMessage.id, message.id);
  const contactB = await service.createOrFindChannelContact({ empresaId: adminB.empresaId, canalIntegracaoId: channelB.id, externalId: "contato-b-1" });
  const conversationB = await service.createOrFindOpenConversation({ empresaId: adminB.empresaId, canalIntegracaoId: channelB.id, contatoCanalId: contactB.id });
  await assert.rejects(
    service.registerSimulatedMessage({
      empresaId: adminA.empresaId,
      canalIntegracaoId: created.body.id,
      conversaCanalId: conversationB.id,
      externalId: "msg-cross",
      texto: "Cross tenant",
    }),
    /Conversa do canal nao encontrada/,
  );
  await assert.rejects(
    service.registerSimulatedMessage({
      empresaId: adminA.empresaId,
      canalIntegracaoId: created.body.id,
      conversaCanalId: newConversation.id,
      externalId: "msg-long",
      texto: "x".repeat(MAX_MESSAGE_TEXT + 1),
    }),
    /excede/,
  );

  assert.deepEqual(await commercialCounts(), initialCounts);
});

async function registerAndLogin(empresaNome, adminNome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome,
    email,
    senha: "SenhaCanaisSegura123",
  });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaCanaisSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(token, nome, email, papel) {
  const created = await request("POST", "/usuarios", {
    nome,
    email,
    senha: "SenhaCanaisSegura123",
    papel,
  }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaCanaisSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
}

async function commercialCounts() {
  return {
    clientes: await prisma.cliente.count(),
    notas: await prisma.nota.count(),
    acompanhamentos: await prisma.acompanhamento.count(),
  };
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}
