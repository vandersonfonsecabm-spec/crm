const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-multichannel-reply-safety");
const databasePath = path.join(auditDir, `reply-safety-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "multichannel-reply-safety-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "multichannel-reply-safety-key";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.LEADS_COMMUNICATION_ENABLED = "true";

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  if (!sourceDatabase || !path.isAbsolute(sourceDatabase)) throw new Error("CRM_TEST_BASE_DATABASE_PATH absoluto e obrigatorio.");
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

test("writers simulados aceitam somente WhatsApp test-only e falham sem mutacao", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
  const channelService = createChannelService({ prisma });
  const communication = createLeadsCommunicationServices({ prisma });
  const tenantA = await registerAndLogin("Empresa Reply Safety A", "Admin Reply Safety A", "admin-a@reply-safety.test");
  const tenantB = await registerAndLogin("Empresa Reply Safety B", "Admin Reply Safety B", "admin-b@reply-safety.test");
  const testChannel = (await request("POST", "/canais/whatsapp/teste", {}, tenantA.token)).body;
  const channels = {
    whatsapp: await createChannel(tenantA.empresaId, "WHATSAPP_META", "whatsapp-real"),
    instagram: await createChannel(tenantA.empresaId, "INSTAGRAM_META", "instagram-real"),
    messenger: await createChannel(tenantA.empresaId, "MESSENGER_META", "messenger-real"),
    site: await createChannel(tenantA.empresaId, "SITE_FORM", "site-real"),
  };
  const testConversation = await createConversation(tenantA, testChannel, "whatsapp-test");
  const simulatedClient = await prisma.cliente.create({
    data: { empresaId: tenantA.empresaId, nome: "Cliente Simulacao Segura" },
  });
  await prisma.contatoCanal.update({
    where: { id: testConversation.contatoCanalId },
    data: { clienteId: simulatedClient.id },
  });
  const conversations = {};
  for (const [key, channel] of Object.entries(channels)) {
    conversations[key] = await createConversation(tenantA, channel, key);
  }

  const testDetail = await request("GET", `/conversas/${testConversation.id}`, undefined, tenantA.token);
  assert.equal(testDetail.status, 200);
  assert.equal(testDetail.body.podeResponderDiretamente, true);
  const allowed = await request("POST", `/conversas/${testConversation.id}/mensagens/simuladas`, {
    externalId: "reply-safety-allowed",
    direcao: "SAIDA",
    texto: "Resposta apenas no canal de teste",
  }, tenantA.token);
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.simulada, true);
  const { createCustomer360Service } = require("../src/customer-360/service");
  const timeline = await createCustomer360Service({ prisma }).getTimeline(
    { empresaId: tenantA.empresaId },
    simulatedClient.id,
    { tipo: "MENSAGEM" },
  );
  assert.equal(timeline.data[0].titulo, "Resposta simulada");

  const forged = await request("POST", `/conversas/${conversations.whatsapp.id}/mensagens/simuladas`, {
    externalId: "reply-safety-forged",
    direcao: "SAIDA",
    texto: "Tentativa com dados forjados",
    modoTeste: true,
    tipo: "WHATSAPP_META",
  }, tenantA.token);
  assert.equal(forged.status, 400);

  for (const [key, conversation] of Object.entries(conversations)) {
    const before = await prisma.conversaCanal.findUnique({ where: { id: conversation.id } });
    const detail = await request("GET", `/conversas/${conversation.id}`, undefined, tenantA.token);
    assert.equal(detail.body.podeResponderDiretamente, false, `${key} nao pode aparecer como respondivel`);
    for (const direcao of ["ENTRADA", "SAIDA"]) {
      const rejected = await request("POST", `/conversas/${conversation.id}/mensagens/simuladas`, {
        externalId: `reply-safety-${key}-${direcao.toLowerCase()}`,
        direcao,
        texto: "Mensagem que deve ser rejeitada",
      }, tenantA.token);
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.codigo, "CHANNEL_SIMULATION_UNAVAILABLE");
    }
    assert.equal(await prisma.mensagemCanal.count({ where: { conversaCanalId: conversation.id } }), 0);
    const after = await prisma.conversaCanal.findUnique({ where: { id: conversation.id } });
    assert.equal(after.ultimaMensagemEm?.toISOString() || null, before.ultimaMensagemEm?.toISOString() || null);
    assert.equal(after.status, before.status);
  }

  await assert.rejects(
    communication.createSimulatedMessage(context(tenantA), conversations.whatsapp.id, {
      externalId: "reply-safety-direct-service",
      direcao: "SAIDA",
      texto: "Chamada direta bloqueada",
    }),
    (error) => error.status === 409 && error.codigo === "CHANNEL_SIMULATION_UNAVAILABLE",
  );
  await assert.rejects(
    channelService.registerSimulatedMessage({
      empresaId: tenantA.empresaId,
      canalIntegracaoId: channels.instagram.id,
      conversaCanalId: conversations.instagram.id,
      externalId: "reply-safety-internal-writer",
      direcao: "SAIDA",
      texto: "Writer interno bloqueado",
    }),
    (error) => error.status === 409 && error.codigo === "CHANNEL_SIMULATION_UNAVAILABLE",
  );
  assert.equal((await request("POST", `/conversas/${conversations.whatsapp.id}/mensagens/simuladas`, {
    externalId: "reply-safety-cross-tenant",
    direcao: "SAIDA",
    texto: "Outro tenant",
  }, tenantB.token)).status, 404);
  assert.equal((await request("POST", `/conversas/${conversations.whatsapp.id}/mensagens/simuladas`, {
    externalId: "reply-safety-unauthenticated",
    direcao: "SAIDA",
    texto: "Sem autenticacao",
  })).status, 401);
  assert.equal(await prisma.mensagemCanal.count({ where: { conversaCanalId: testConversation.id } }), 1);
});

test("follow-up preserva WhatsApp e usa semantica neutra nos demais canais", async () => {
  const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
  const communication = createLeadsCommunicationServices({ prisma });
  const tenant = await registerAndLogin("Empresa Follow-up Safety", "Admin Follow-up Safety", "admin@follow-up-safety.test");
  const expectedTypes = {
    WHATSAPP_META: "WHATSAPP",
    INSTAGRAM_META: "OUTRO",
    MESSENGER_META: "OUTRO",
    SITE_FORM: "OUTRO",
  };

  for (const [channelType, expectedType] of Object.entries(expectedTypes)) {
    const key = channelType.toLowerCase();
    const channel = await createChannel(tenant.empresaId, channelType, `follow-up-${key}`, channelType === "WHATSAPP_META");
    const phone = channelType === "MESSENGER_META" ? "11999990000" : "";
    const client = await prisma.cliente.create({
      data: { empresaId: tenant.empresaId, nome: `Cliente ${channelType}`, telefone: phone },
    });
    const lead = await prisma.lead.create({
      data: { empresaId: tenant.empresaId, clienteId: client.id, origem: channelType },
    });
    const externalId = channelType === "MESSENGER_META" ? "987654321012345" : `opaque-${key}`;
    const contact = await prisma.contatoCanal.create({
      data: {
        empresaId: tenant.empresaId,
        canalIntegracaoId: channel.id,
        clienteId: client.id,
        externalId,
        telefoneNormalizado: null,
        nome: `Contato ${channelType}`,
      },
    });
    const conversation = await prisma.conversaCanal.create({
      data: {
        empresaId: tenant.empresaId,
        canalIntegracaoId: channel.id,
        contatoCanalId: contact.id,
        leadId: lead.id,
        responsavelId: tenant.usuarioId,
        status: "EM_ATENDIMENTO",
        chaveAberta: `follow-up-${key}-${contact.id}`,
      },
    });
    await communication.saveCommercialQualification(context(tenant), conversation.id, {
      interesse: "Atendimento multicanal",
      prioridade: "MEDIA",
      valorEstimado: null,
      proximaAcao: "Retomar contato pelo canal de origem",
      dataRetorno: null,
      observacao: "Sem semantica telefonica inventada",
    });
    const followUp = await prisma.acompanhamento.findFirst({ where: { conversaCanalId: conversation.id } });
    assert.equal(followUp.tipo, expectedType);
    assert.equal(followUp.titulo, "Retomar contato pelo canal de origem");
    const preservedClient = await prisma.cliente.findUnique({ where: { id: client.id } });
    assert.equal(preservedClient.telefone, phone);
    assert.notEqual(externalId, preservedClient.telefone);
  }
});

async function createChannel(empresaId, tipo, key, modoTeste = false) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo,
      nome: `Canal ${key}`,
      chaveInterna: `reply-safety-${key}-${empresaId}`,
      status: modoTeste ? "MODO_TESTE" : "INATIVO",
      modoTeste,
      ativo: modoTeste,
    },
  });
}

async function createConversation(tenant, channel, key) {
  const contact = await prisma.contatoCanal.create({
    data: {
      empresaId: tenant.empresaId,
      canalIntegracaoId: channel.id,
      externalId: `reply-safety-contact-${key}`,
      nome: `Contato ${key}`,
    },
  });
  return prisma.conversaCanal.create({
    data: {
      empresaId: tenant.empresaId,
      canalIntegracaoId: channel.id,
      contatoCanalId: contact.id,
      responsavelId: tenant.usuarioId,
      status: "EM_ATENDIMENTO",
      chaveAberta: `reply-safety-conversation-${key}-${contact.id}`,
    },
  });
}

function context(identity) {
  return { usuarioId: identity.usuarioId, empresaId: identity.empresaId, papel: "ADMIN" };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaReplySafety123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({
    data: { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true },
  });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return {
    token: login.body.access_token,
    empresaId: registration.body.empresa.id,
    usuarioId: registration.body.usuario.id,
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
