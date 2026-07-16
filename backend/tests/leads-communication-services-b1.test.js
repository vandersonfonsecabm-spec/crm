const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-leads-services-b1");
const databasePath = path.join(auditDir, `services-b1-${process.pid}.db`);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "leads-services-b1-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "leads-services-b1-test-encryption-key";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.LEADS_COMMUNICATION_ENABLED = "true";

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  migrate();
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

test("Release B1 protege tenant, RBAC, fila, atribuicoes, mensagens e idempotencia", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices, validateAssignmentContext } = require("../src/leads-communication/services");
  const channelService = createChannelService({ prisma });
  const service = createLeadsCommunicationServices({ prisma });

  const adminA = await registerAndLogin("Empresa B1 A", "Admin B1 A", "admin-a@b1.test");
  const adminB = await registerAndLogin("Empresa B1 B", "Admin B1 B", "admin-b@b1.test");
  const managerA = await createUserAndLogin(adminA, "Gerente B1 A", "gerente-a@b1.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor B1 A", "vendedor-a@b1.test", "VENDEDOR");
  const sellerA2 = await createUserAndLogin(adminA, "Vendedor B1 A2", "vendedor-a2@b1.test", "VENDEDOR");
  const sellerB = await createUserAndLogin(adminB, "Vendedor B1 B", "vendedor-b@b1.test", "VENDEDOR");
  const contexts = {
    adminA: context(adminA, "ADMIN"),
    adminB: context(adminB, "ADMIN"),
    managerA: context(managerA, "GERENTE", adminA.empresaId),
  };

  assert.equal((await request("GET", "/leads")).status, 401);
  assert.equal((await request("GET", "/leads", undefined, "token-invalido")).status, 401);
  const missingUserToken = jwt.sign({ usuarioId: 99999999 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  assert.equal((await request("GET", "/leads", undefined, missingUserToken)).status, 401);

  const clientA = await createClient(adminA.empresaId, "QA-B1 Cliente A", "+5511999991001", "CLIENTE.A@B1.TEST");
  const clientA2 = await createClient(adminA.empresaId, "QA-B1 Cliente A2", "+5511999991002", "cliente.a2@b1.test");
  const clientB = await createClient(adminB.empresaId, "QA-B1 Cliente B", "+5511999991001", "cliente.a@b1.test");

  assert.equal((await request("POST", "/leads", { clienteId: clientA.id }, sellerA.token)).status, 403);
  assert.equal((await request("POST", "/leads", { clienteId: clientB.id }, adminA.token)).status, 404);
  assert.equal((await request("POST", "/leads", { clienteId: clientA.id, empresaId: adminB.empresaId }, adminA.token)).status, 400);

  const leadUnassigned = await request("POST", "/leads", {
    clienteId: clientA.id,
    origem: "Site",
    campanha: "Safra",
    interesse: "Sementes",
  }, adminA.token);
  assert.equal(leadUnassigned.status, 201);
  const secondLeadSameClient = await request("POST", "/leads", { clienteId: clientA.id, origem: "Indicacao" }, managerA.token);
  assert.equal(secondLeadSameClient.status, 201);
  assert.notEqual(secondLeadSameClient.body.id, leadUnassigned.body.id);

  const leadSellerA = await request("POST", "/leads", { clienteId: clientA2.id, responsavelId: sellerA.usuarioId }, adminA.token);
  const leadSellerA2 = await request("POST", "/leads", { clienteId: clientA.id, responsavelId: sellerA2.usuarioId }, managerA.token);
  const leadB = await request("POST", "/leads", { clienteId: clientB.id, responsavelId: sellerB.usuarioId }, adminB.token);
  assert.equal(leadSellerA.status, 201);
  assert.equal(leadSellerA2.status, 201);
  assert.equal(leadB.status, 201);

  const adminList = await request("GET", "/leads?limit=2&page=1", undefined, adminA.token);
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.pagination.total, 4);
  assert.equal(adminList.body.data.length, 2);
  assert.equal((await request("GET", "/leads?page=0", undefined, adminA.token)).status, 400);
  assert.equal((await request("GET", "/leads?limit=101", undefined, adminA.token)).status, 400);
  assert.equal((await request("GET", `/leads?empresaId=${adminB.empresaId}`, undefined, adminA.token)).status, 400);
  assert.equal((await request("GET", "/leads?q=Sementes", undefined, adminA.token)).body.pagination.total, 1);
  assert.equal((await request("GET", "/leads?origem=Site", undefined, adminA.token)).body.pagination.total, 1);
  const partialLeadPatch = await request("PATCH", `/leads/${leadUnassigned.body.id}`, { interesse: "Defensivos" }, managerA.token);
  assert.equal(partialLeadPatch.body.origem, "Site");
  assert.equal(partialLeadPatch.body.campanha, "Safra");

  const sellerList = await request("GET", "/leads", undefined, sellerA.token);
  assert.equal(sellerList.body.pagination.total, 4);
  assert.ok(sellerList.body.data.some((item) => item.id === leadSellerA2.body.id));
  assert.equal((await request("GET", `/leads/${leadSellerA2.body.id}`, undefined, sellerA.token)).status, 200);
  assert.equal((await request("GET", `/leads/${leadB.body.id}`, undefined, adminA.token)).status, 404);

  const patched = await request("PATCH", `/leads/${leadSellerA.body.id}`, { interesse: null }, sellerA.token);
  assert.equal(patched.status, 200);
  assert.equal(patched.body.interesse, null);
  const preserved = await request("GET", `/leads/${leadSellerA.body.id}`, undefined, sellerA.token);
  assert.equal(preserved.body.origem, null);
  assert.equal(preserved.body.responsavelId, sellerA.usuarioId);
  assert.equal((await request("PATCH", `/leads/${leadSellerA.body.id}`, { status: "EM_ATENDIMENTO" }, sellerA.token)).status, 200);
  assert.equal((await request("PATCH", `/leads/${leadSellerA.body.id}`, { status: "QUALIFICADO" }, sellerA.token)).status, 200);
  assert.equal((await request("PATCH", `/leads/${leadSellerA.body.id}`, { status: "CONVERTIDO" }, sellerA.token)).status, 409);
  assert.equal((await request("PATCH", `/leads/${leadSellerA.body.id}`, { status: "NOVO" }, sellerA.token)).status, 409);

  assert.equal((await request("POST", `/leads/${secondLeadSameClient.body.id}/assumir`, {}, sellerA.token)).status, 200);
  const concurrentLead = await request("POST", "/leads", { clienteId: clientA2.id }, adminA.token);
  const leadClaims = await Promise.all([
    request("POST", `/leads/${concurrentLead.body.id}/assumir`, {}, adminA.token),
    request("POST", `/leads/${concurrentLead.body.id}/assumir`, {}, managerA.token),
  ]);
  assert.deepEqual(leadClaims.map((item) => item.status).sort(), [200, 409]);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { leadId: concurrentLead.body.id, tipo: "ASSUMIR" } }), 1);

  assert.equal((await request("POST", `/leads/${leadSellerA.body.id}/atribuir`, { responsavelId: sellerA2.usuarioId }, sellerA.token)).status, 403);
  assert.equal((await request("POST", `/leads/${leadSellerA.body.id}/atribuir`, { responsavelId: sellerB.usuarioId }, adminA.token)).status, 404);
  const transferredLead = await request("POST", `/leads/${leadSellerA.body.id}/atribuir`, {
    responsavelId: sellerA2.usuarioId,
    motivo: "Redistribuicao manual de teste",
  }, managerA.token);
  assert.equal(transferredLead.status, 200);
  assert.equal(transferredLead.body.responsavelId, sellerA2.usuarioId);
  const leadHistory = await request("GET", `/leads/${leadSellerA.body.id}/historico-atribuicao`, undefined, managerA.token);
  assert.deepEqual(leadHistory.body.map((item) => item.tipo), ["ATRIBUIR", "TRANSFERIR"]);
  const concurrentTransferLead = await request("POST", "/leads", {
    clienteId: clientA2.id,
    responsavelId: adminA.usuarioId,
  }, adminA.token);
  const concurrentTransfers = await Promise.all([
    request("POST", `/leads/${concurrentTransferLead.body.id}/atribuir`, { responsavelId: sellerA.usuarioId }, adminA.token),
    request("POST", `/leads/${concurrentTransferLead.body.id}/atribuir`, { responsavelId: sellerA2.usuarioId }, managerA.token),
  ]);
  assert.ok(concurrentTransfers.some((item) => item.status === 200));
  assert.ok(concurrentTransfers.every((item) => [200, 409].includes(item.status)));
  const transferFinal = await request("GET", `/leads/${concurrentTransferLead.body.id}`, undefined, adminA.token);
  assert.ok([sellerA.usuarioId, sellerA2.usuarioId].includes(transferFinal.body.responsavelId));
  const successfulTransfers = concurrentTransfers.filter((item) => item.status === 200).length;
  assert.equal(await prisma.historicoAtribuicao.count({ where: { leadId: concurrentTransferLead.body.id } }), 1 + successfulTransfers);

  const channelAResponse = await request("POST", "/canais/whatsapp/teste", {}, adminA.token);
  const channelBResponse = await request("POST", "/canais/whatsapp/teste", {}, adminB.token);
  const channelA = channelAResponse.body;
  const channelB = channelBResponse.body;
  const contactA = await channelService.createOrFindChannelContact({
    empresaId: adminA.empresaId,
    canalIntegracaoId: channelA.id,
    externalId: "wa-a-1",
    telefoneNormalizado: "+5511999991002",
    nome: "Contato B1 A",
  });
  await prisma.contatoCanal.update({ where: { id: contactA.id }, data: { clienteId: clientA2.id } });
  const unchangedContact = await channelService.createOrFindChannelContact({
    empresaId: adminA.empresaId,
    canalIntegracaoId: channelA.id,
    externalId: "wa-a-1",
  });
  assert.equal(unchangedContact.nome, "Contato B1 A");
  assert.equal(unchangedContact.telefoneNormalizado, "+5511999991002");

  const mismatchedContact = await channelService.createOrFindChannelContact({
    empresaId: adminA.empresaId,
    canalIntegracaoId: channelA.id,
    externalId: "wa-a-mismatch",
  });
  await prisma.contatoCanal.update({ where: { id: mismatchedContact.id }, data: { clienteId: clientA.id } });
  await assert.rejects(service.createOrFindConversation(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    contatoCanalId: mismatchedContact.id,
    leadId: leadSellerA.body.id,
  }), /clientes diferentes/);

  const conversationA = await service.createOrFindConversation(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    contatoCanalId: contactA.id,
    leadId: leadSellerA.body.id,
  });
  assert.equal(conversationA.status, "NOVA");
  const secondConversationA = await prisma.conversaCanal.create({
    data: {
      empresaId: adminA.empresaId,
      canalIntegracaoId: channelA.id,
      contatoCanalId: contactA.id,
      leadId: leadSellerA.body.id,
      status: "NOVA",
    },
  });
  assert.notEqual(secondConversationA.id, conversationA.id);
  assert.equal((await request("GET", "/conversas?semResponsavel=true", undefined, managerA.token)).body.pagination.total, 2);
  assert.equal((await request("GET", "/conversas?semResponsavel=true", undefined, sellerA.token)).body.pagination.total, 2);
  assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, sellerA.token)).status, 200);

  const conversationClaims = await Promise.all([
    request("POST", `/conversas/${conversationA.id}/assumir`, {}, adminA.token),
    request("POST", `/conversas/${conversationA.id}/assumir`, {}, managerA.token),
  ]);
  assert.deepEqual(conversationClaims.map((item) => item.status).sort(), [200, 409]);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { conversaCanalId: conversationA.id, tipo: "ASSUMIR" } }), 1);

  const conversationTransfer = await request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: sellerA.usuarioId }, managerA.token);
  assert.equal(conversationTransfer.status, 200);
  assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, sellerA.token)).status, 200);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: sellerA2.usuarioId }, sellerA.token)).status, 403);

  assert.equal((await request("PATCH", `/conversas/${conversationA.id}/estado`, { estado: "EM_ATENDIMENTO" }, sellerA.token)).status, 200);
  assert.equal((await request("PATCH", `/conversas/${conversationA.id}/estado`, { estado: "NOVA" }, sellerA.token)).status, 409);
  const note = await request("POST", `/conversas/${conversationA.id}/notas-internas`, { conteudo: "Nota interna QA B1" }, sellerA.token);
  assert.equal(note.status, 201);
  assert.equal(note.body.autorId, sellerA.usuarioId);
  assert.equal((await request("GET", `/conversas/${conversationA.id}/notas-internas`, undefined, sellerA.token)).body.length, 1);

  const incoming = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "msg-b1-in-1",
    direcao: "ENTRADA",
    texto: "Mensagem recebida simulada",
  }, sellerA.token);
  const duplicateIncoming = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "msg-b1-in-1",
    direcao: "ENTRADA",
    texto: "Texto repetido nao deve sobrescrever",
  }, sellerA.token);
  const outgoing = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "msg-b1-out-1",
    direcao: "SAIDA",
    texto: "Resposta manual simulada",
  }, sellerA.token);
  assert.equal(incoming.status, 201);
  assert.equal(duplicateIncoming.body.id, incoming.body.id);
  assert.equal(outgoing.body.statusEntrega, "PENDENTE_ENVIO");
  const messages = await request("GET", `/conversas/${conversationA.id}/mensagens`, undefined, sellerA.token);
  assert.equal(messages.body.pagination.total, 2);
  assert.equal(messages.body.data.some((item) => item.texto === "Nota interna QA B1"), false);
  const concurrentMessages = await Promise.all(Array.from({ length: 4 }, () => service.createSimulatedMessage(
    context(sellerA, "VENDEDOR", adminA.empresaId),
    conversationA.id,
    { externalId: "msg-b1-concurrent", direcao: "ENTRADA", texto: "Duplicidade concorrente" },
  )));
  assert.equal(new Set(concurrentMessages.map((item) => item.id)).size, 1);
  assert.equal(await prisma.mensagemCanal.count({ where: { canalIntegracaoId: channelA.id, externalId: "msg-b1-concurrent" } }), 1);
  assert.equal((await request("PATCH", `/conversas/${conversationA.id}/estado`, { estado: "ENCERRADA" }, sellerA.token)).status, 200);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "msg-after-close",
    direcao: "ENTRADA",
    texto: "Nao deve persistir",
  }, sellerA.token)).status, 409);
  assert.equal(await prisma.mensagemCanal.count({ where: { externalId: "msg-after-close" } }), 0);

  const contactB = await channelService.createOrFindChannelContact({
    empresaId: adminB.empresaId,
    canalIntegracaoId: channelB.id,
    externalId: "wa-b-1",
    telefoneNormalizado: "+5511999991001",
  });
  await prisma.contatoCanal.update({ where: { id: contactB.id }, data: { clienteId: clientB.id } });
  const conversationB = await service.createOrFindConversation(contexts.adminB, {
    canalIntegracaoId: channelB.id,
    contatoCanalId: contactB.id,
    leadId: leadB.body.id,
  });
  assert.equal((await request("GET", `/conversas/${conversationB.id}`, undefined, adminA.token)).status, 404);
  const messageB = await service.createSimulatedMessage(contexts.adminB, conversationB.id, {
    externalId: "msg-b1-in-1",
    direcao: "ENTRADA",
    texto: "Mesmo external ID em outro tenant",
  });
  assert.notEqual(messageB.id, incoming.body.id);

  const event = await service.registerWebhookEvent(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    provedor: "META",
    externalEventId: "evt-b1-1",
    tipoEvento: "message",
    payload: { id: "seguro" },
  });
  const duplicateEvent = await service.registerWebhookEvent(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    provedor: "META",
    externalEventId: "evt-b1-1",
    payload: { id: "duplicado" },
  });
  assert.equal(event.duplicado, false);
  assert.equal(duplicateEvent.duplicado, true);
  assert.equal(duplicateEvent.statusDuplicata, "IGNORADO_DUPLICADO");
  assert.equal(await prisma.eventoWebhook.count({ where: { empresaId: adminA.empresaId, externalEventId: "evt-b1-1" } }), 1);
  const secondChannelA = await prisma.canalIntegracao.create({
    data: {
      empresaId: adminA.empresaId,
      tipo: "WHATSAPP_META",
      nome: "Canal B1 secundario",
      chaveInterna: "b1-secondary",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const sameEventOtherIntegration = await service.registerWebhookEvent(contexts.adminA, {
    canalIntegracaoId: secondChannelA.id,
    provedor: "META",
    externalEventId: "evt-b1-1",
  });
  assert.equal(sameEventOtherIntegration.duplicado, false);
  await assert.rejects(service.updateWebhookEvent(contexts.adminA, event.evento.id, "PROCESSADO"), /Transicao/);
  let processedEvent = await service.updateWebhookEvent(contexts.adminA, event.evento.id, "PROCESSANDO");
  assert.equal(processedEvent.tentativas, 1);
  processedEvent = await service.updateWebhookEvent(contexts.adminA, event.evento.id, "FALHOU", { erroCodigo: "TEMP", erroResumo: "Falha segura" });
  assert.equal(processedEvent.statusProcessamento, "FALHOU");
  processedEvent = await service.updateWebhookEvent(contexts.adminA, event.evento.id, "PROCESSANDO");
  assert.equal(processedEvent.tentativas, 2);
  processedEvent = await service.updateWebhookEvent(contexts.adminA, event.evento.id, "PROCESSADO");
  assert.equal(processedEvent.statusProcessamento, "PROCESSADO");

  const eventB = await service.registerWebhookEvent(contexts.adminB, {
    canalIntegracaoId: channelB.id,
    provedor: "META",
    externalEventId: "evt-b1-1",
  });
  assert.equal(eventB.duplicado, false);
  const concurrentEvents = await Promise.all(Array.from({ length: 4 }, () => service.registerWebhookEvent(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    provedor: "META",
    externalEventId: "evt-b1-concurrent",
  })));
  assert.equal(concurrentEvents.filter((item) => !item.duplicado).length, 1);
  assert.equal(await prisma.eventoWebhook.count({ where: { empresaId: adminA.empresaId, externalEventId: "evt-b1-concurrent" } }), 1);

  const emailMatch = await service.findContactMatches(contexts.adminA, { email: "cliente.a@b1.test" });
  assert.equal(emailMatch.tipo, "CORRESPONDENCIA");
  assert.equal(emailMatch.candidatos[0].id, clientA.id);
  const maskedPhoneMatch = await service.findContactMatches(contexts.adminA, { telefone: "(11) 99999-1001" });
  assert.equal(maskedPhoneMatch.tipo, "CORRESPONDENCIA");
  assert.equal(maskedPhoneMatch.candidatos[0].id, clientA.id);
  const duplicateClientA = await createClient(adminA.empresaId, "QA-B1 Cliente duplicado", "+5511999991001", "outro@b1.test");
  const ambiguous = await service.findContactMatches(contexts.adminA, { telefone: "11 99999-1001" });
  assert.equal(ambiguous.tipo, "AMBIGUO");
  assert.deepEqual(new Set(ambiguous.candidatos.map((item) => item.id)), new Set([clientA.id, duplicateClientA.id]));
  assert.equal((await service.findContactMatches(contexts.adminB, { telefone: "11 99999-1001" })).candidatos.length, 1);
  assert.equal((await service.findContactMatches(contexts.adminA, {})).tipo, "NENHUM");

  assert.throws(() => validateAssignmentContext({ empresaId: adminA.empresaId }), /exatamente um contexto/);
  assert.throws(() => validateAssignmentContext({ leadId: 1, conversaCanalId: 1 }), /exatamente um contexto/);
  assert.doesNotThrow(() => validateAssignmentContext({ leadId: 1 }));

  const simulationRoute = fs.readFileSync(path.join(backendDir, "src", "channels", "whatsapp", "simulationRoutes.js"), "utf8");
  assert.match(simulationRoute, /req\.auth\.usuarioId/);
  assert.doesNotMatch(simulationRoute, /req\.auth\.sub/);
});

function context(identity, papel, empresaId = identity.empresaId) {
  return { usuarioId: identity.usuarioId, empresaId, papel };
}

async function createClient(empresaId, nome, telefone, email) {
  return prisma.cliente.create({
    data: { empresaId, nome, telefone, email, empresa: "QA B1", interesse: "", status: "Lead", valor: 0, origem: "QA B1" },
  });
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaB1Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaB1Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
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

function migrate() {
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
