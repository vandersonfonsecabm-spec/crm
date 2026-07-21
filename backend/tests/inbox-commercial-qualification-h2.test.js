const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-prisma-tests", "inbox-commercial-qualification-h2");
const databasePath = path.join(auditDir, `inbox-h2-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "inbox-h2-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "inbox-h2-encryption-key";
process.env.LEADS_COMMUNICATION_ENABLED = "true";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.CRM_TEST_DATABASE_URL = process.env.DATABASE_URL;

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

test("H2 qualifica, cria ou vincula Negocio com tenant, permissao e concorrencia", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
  const channelService = createChannelService({ prisma });
  const communication = createLeadsCommunicationServices({ prisma });

  const adminA = await registerAndLogin("Empresa Inbox H2 A", "Admin Inbox H2 A", "admin-a@inbox-h2.test");
  const adminB = await registerAndLogin("Empresa Inbox H2 B", "Admin Inbox H2 B", "admin-b@inbox-h2.test");
  const sellerA = await createUserAndLogin(adminA, "Vendedor Inbox H2 A", "seller-a@inbox-h2.test", "VENDEDOR");
  const sellerOther = await createUserAndLogin(adminA, "Vendedor Inbox H2 Outro", "seller-other@inbox-h2.test", "VENDEDOR");
  const channelA = (await request("POST", "/canais/whatsapp/teste", {}, adminA.token)).body;
  const channelB = (await request("POST", "/canais/whatsapp/teste", {}, adminB.token)).body;
  const initialCounts = await invariantCounts();

  const primary = await createConversationFixture({
    admin: adminA,
    channel: channelA,
    channelService,
    communication,
    name: "Cliente Qualificacao H2",
    key: "primary",
  });
  await communication.assumeConversation({ usuarioId: sellerA.usuarioId, empresaId: sellerA.empresaId, papel: "VENDEDOR" }, primary.conversation.id);
  assert.equal((await request("GET", `/conversas/${primary.conversation.id}/contexto-comercial`, undefined, sellerOther.token)).status, 200);
  assert.equal((await request("PATCH", `/conversas/${primary.conversation.id}/qualificacao-comercial`, validQualification(), sellerOther.token)).status, 403);
  assert.equal((await request("GET", `/conversas/${primary.conversation.id}/contexto-comercial`, undefined, adminB.token)).status, 404);

  assert.equal((await request("PATCH", `/conversas/${primary.conversation.id}/qualificacao-comercial`, { ...validQualification(), proximaAcao: "" }, sellerA.token)).status, 422);
  assert.equal((await request("PATCH", `/conversas/${primary.conversation.id}/qualificacao-comercial`, { ...validQualification(), valorEstimado: -1 }, sellerA.token)).status, 422);
  assert.equal((await request("PATCH", `/conversas/${primary.conversation.id}/qualificacao-comercial`, { ...validQualification(), dataRetorno: "2026-02-31" }, sellerA.token)).status, 422);

  const qualified = await request("PATCH", `/conversas/${primary.conversation.id}/qualificacao-comercial`, validQualification(), sellerA.token);
  assert.equal(qualified.status, 200);
  assert.equal(qualified.body.estado, "QUALIFICADO");
  assert.equal(qualified.body.qualificacao.interesse, "Pulverizador de barras");
  assert.equal(qualified.body.qualificacao.prioridade, "ALTA");
  assert.equal(qualified.body.qualificacao.valorEstimado, 45000);
  assert.equal(await prisma.negocio.count({ where: { leadId: primary.lead.id } }), 0);
  const leadAfterQualification = await prisma.lead.findUnique({ where: { id: primary.lead.id } });
  const clientAfterQualification = await prisma.cliente.findUnique({ where: { id: primary.client.id } });
  assert.equal(leadAfterQualification.status, "QUALIFICADO");
  assert.equal(leadAfterQualification.interesse, "Pulverizador de barras");
  assert.equal(clientAfterQualification.interesse, "Pulverizador de barras");
  assert.equal(clientAfterQualification.valor, 45000);
  assert.equal(clientAfterQualification.proximoFollowUp, "2026-08-05");
  const qualificationHistory = await prisma.historicoQualificacaoConversa.findFirst({ where: { conversaCanalId: primary.conversation.id, acao: "QUALIFICAR" } });
  assert.equal(qualificationHistory.observacao, "Produtor pediu simulacao");

  const withoutHumanContact = await request("POST", `/conversas/${primary.conversation.id}/criar-negocio`, {}, sellerA.token);
  assert.equal(withoutHumanContact.status, 422);
  assert.equal(withoutHumanContact.body.codigo, "COMMERCIAL_HUMAN_CONTACT_REQUIRED");
  await request("POST", `/conversas/${primary.conversation.id}/mensagens/simuladas`, { externalId: "h2-human-primary", direcao: "SAIDA", texto: "Contato humano registrado" }, sellerA.token);

  const duplicate = await prisma.negocio.create({
    data: { empresaId: adminA.empresaId, clienteId: primary.client.id, responsavelId: sellerA.usuarioId, titulo: "Negocio ativo existente", etapa: "CONTATO" },
  });
  const duplicateResponse = await request("POST", `/conversas/${primary.conversation.id}/criar-negocio`, {}, sellerA.token);
  assert.equal(duplicateResponse.status, 409);
  assert.equal(duplicateResponse.body.codigo, "COMMERCIAL_BUSINESS_DUPLICATE_CONFIRMATION_REQUIRED");
  assert.ok(duplicateResponse.body.negocios.some((business) => business.id === duplicate.id));

  const created = await request("POST", `/conversas/${primary.conversation.id}/criar-negocio`, {
    titulo: "Oportunidade pulverizador H2",
    observacao: "Criacao confirmada apos revisar duplicidade",
    confirmarDuplicidade: true,
  }, sellerA.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.created, true);
  assert.equal(created.body.negocio.leadId, primary.lead.id);
  assert.equal(created.body.negocio.valor, 45000);
  assert.equal(created.body.contexto.estado, "NEGOCIO_VINCULADO");
  assert.equal(await prisma.negocio.count({ where: { leadId: primary.lead.id } }), 1);
  assert.equal(await prisma.historicoQualificacaoConversa.count({ where: { conversaCanalId: primary.conversation.id, acao: "CRIAR_NEGOCIO" } }), 1);

  const linkedFixture = await createConversationFixture({
    admin: adminA,
    channel: channelA,
    channelService,
    communication,
    name: "Cliente Vinculo H2",
    key: "linked",
  });
  await request("POST", `/conversas/${linkedFixture.conversation.id}/assumir`, {}, sellerA.token);
  const linkedQualification = await request("PATCH", `/conversas/${linkedFixture.conversation.id}/qualificacao-comercial`, validQualification({ interesse: "Plantadeira", dataRetorno: null }), sellerA.token);
  assert.equal(linkedQualification.status, 200);
  assert.equal(linkedQualification.body.qualificacao.dataRetorno, null);
  await request("POST", `/conversas/${linkedFixture.conversation.id}/mensagens/simuladas`, { externalId: "h2-human-linked", direcao: "SAIDA", texto: "Contato para vinculo" }, sellerA.token);
  const existingBusiness = await prisma.negocio.create({
    data: { empresaId: adminA.empresaId, clienteId: linkedFixture.client.id, titulo: "Negocio existente elegivel", etapa: "PROPOSTA" },
  });
  const candidates = await request("GET", `/conversas/${linkedFixture.conversation.id}/negocios-elegiveis?q=existente`, undefined, sellerA.token);
  assert.equal(candidates.status, 200);
  assert.ok(candidates.body.data.some((business) => business.id === existingBusiness.id && business.elegivel));
  const linked = await request("POST", `/conversas/${linkedFixture.conversation.id}/vincular-negocio`, { negocioId: existingBusiness.id }, sellerA.token);
  assert.equal(linked.status, 200);
  assert.equal(linked.body.contexto.negocio.id, existingBusiness.id);
  assert.equal((await prisma.negocio.findUnique({ where: { id: existingBusiness.id } })).leadId, linkedFixture.lead.id);
  assert.equal(await prisma.historicoQualificacaoConversa.count({ where: { conversaCanalId: linkedFixture.conversation.id, acao: "VINCULAR_NEGOCIO" } }), 1);

  const tenantBFixture = await createConversationFixture({
    admin: adminB,
    channel: channelB,
    channelService,
    communication,
    name: "Cliente Externo H2",
    key: "tenant-b",
  });
  const tenantBBusiness = await prisma.negocio.create({ data: { empresaId: adminB.empresaId, clienteId: tenantBFixture.client.id, titulo: "Negocio externo", etapa: "NOVO" } });
  const crossTenantFixture = await createConversationFixture({
    admin: adminA,
    channel: channelA,
    channelService,
    communication,
    name: "Cliente Isolamento H2",
    key: "cross-tenant",
  });
  await request("POST", `/conversas/${crossTenantFixture.conversation.id}/assumir`, {}, sellerA.token);
  await request("PATCH", `/conversas/${crossTenantFixture.conversation.id}/qualificacao-comercial`, validQualification({ interesse: "Distribuidor" }), sellerA.token);
  await request("POST", `/conversas/${crossTenantFixture.conversation.id}/mensagens/simuladas`, { externalId: "h2-human-cross", direcao: "SAIDA", texto: "Contato para isolamento" }, sellerA.token);
  const crossTenantLink = await request("POST", `/conversas/${crossTenantFixture.conversation.id}/vincular-negocio`, { negocioId: tenantBBusiness.id }, adminA.token);
  assert.equal(crossTenantLink.status, 404);

  const concurrentFixture = await createConversationFixture({
    admin: adminA,
    channel: channelA,
    channelService,
    communication,
    name: "Cliente Concorrencia H2",
    key: "concurrent",
  });
  await request("POST", `/conversas/${concurrentFixture.conversation.id}/assumir`, {}, sellerA.token);
  await request("PATCH", `/conversas/${concurrentFixture.conversation.id}/qualificacao-comercial`, validQualification({ interesse: "Colheitadeira" }), sellerA.token);
  await request("POST", `/conversas/${concurrentFixture.conversation.id}/mensagens/simuladas`, { externalId: "h2-human-concurrent", direcao: "SAIDA", texto: "Contato para concorrencia" }, sellerA.token);
  const concurrent = await Promise.all([
    request("POST", `/conversas/${concurrentFixture.conversation.id}/criar-negocio`, { titulo: "Oportunidade concorrente H2" }, sellerA.token),
    request("POST", `/conversas/${concurrentFixture.conversation.id}/criar-negocio`, { titulo: "Oportunidade concorrente H2" }, sellerA.token),
  ]);
  assert.equal(await prisma.negocio.count({ where: { leadId: concurrentFixture.lead.id } }), 1);
  assert.ok(concurrent.some(({ status }) => status === 201));
  assert.ok(concurrent.some(({ status }) => status === 409));

  assert.equal((await invariantCounts()).cliente, initialCounts.cliente + 5);
  assert.equal((await invariantCounts()).lead, initialCounts.lead + 5);
  assert.equal(await prisma.conversaCanal.count({ where: { id: primary.conversation.id } }), 1);
  assert.equal(await prisma.mensagemCanal.count({ where: { conversaCanalId: primary.conversation.id } }), 1);
  assert.equal(await prisma.negocio.count({ where: { clienteId: tenantBFixture.client.id } }), 1);
});

function validQualification(overrides = {}) {
  return {
    interesse: "Pulverizador de barras",
    prioridade: "ALTA",
    valorEstimado: 45000,
    proximaAcao: "Preparar proposta comercial",
    dataRetorno: "2026-08-05",
    observacao: "  Produtor   pediu simulacao  ",
    ...overrides,
  };
}

async function createConversationFixture({ admin, channel, channelService, communication, name, key }) {
  const client = await prisma.cliente.create({
    data: { empresaId: admin.empresaId, nome: name, telefone: "", email: "", empresa: "QA H2", interesse: "", status: "Lead", valor: 0, origem: "QA H2" },
  });
  const leadResponse = await request("POST", "/leads", { clienteId: client.id, origem: "QA H2" }, admin.token);
  assert.equal(leadResponse.status, 201);
  const lead = leadResponse.body;
  const contact = await channelService.createOrFindChannelContact({ empresaId: admin.empresaId, canalIntegracaoId: channel.id, externalId: `h2-${key}`, nome: name });
  await prisma.contatoCanal.update({ where: { id: contact.id }, data: { clienteId: client.id } });
  const conversation = await communication.createOrFindConversation(
    { usuarioId: admin.usuarioId, empresaId: admin.empresaId, papel: "ADMIN" },
    { canalIntegracaoId: channel.id, contatoCanalId: contact.id, leadId: lead.id },
  );
  return { client, lead, conversation };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaInboxH2Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaInboxH2Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
}

async function invariantCounts() {
  const [cliente, lead, conversa, mensagem] = await Promise.all([
    prisma.cliente.count(),
    prisma.lead.count(),
    prisma.conversaCanal.count(),
    prisma.mensagemCanal.count(),
  ]);
  return { cliente, lead, conversa, mensagem };
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
