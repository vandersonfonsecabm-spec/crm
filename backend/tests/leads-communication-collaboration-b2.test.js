const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-leads-collaboration-b2");
const databasePath = path.join(auditDir, `collaboration-b2-${process.pid}.db`);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "leads-collaboration-b2-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "leads-collaboration-b2-encryption-key";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.LEADS_COMMUNICATION_ENABLED = "true";
process.env.LEADS_REPLY_LEASE_SECONDS = "30";

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

test("Release B2 habilita atendimento colaborativo sem misturar autoria e responsabilidade", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices, getReplyLeaseSeconds } = require("../src/leads-communication/services");
  const channelService = createChannelService({ prisma });
  const service = createLeadsCommunicationServices({ prisma });

  assert.equal(getReplyLeaseSeconds({}), 120);
  assert.equal(getReplyLeaseSeconds({ LEADS_REPLY_LEASE_SECONDS: "29" }), 120);
  assert.equal(getReplyLeaseSeconds({ LEADS_REPLY_LEASE_SECONDS: "301" }), 120);
  assert.equal(getReplyLeaseSeconds({ LEADS_REPLY_LEASE_SECONDS: "60x" }), 120);
  assert.equal(getReplyLeaseSeconds({ LEADS_REPLY_LEASE_SECONDS: "60" }), 60);

  const adminA = await registerAndLogin("Empresa Colaboracao A", "Admin Colaboracao A", "admin-a@b2.test");
  const adminB = await registerAndLogin("Empresa Colaboracao B", "Admin Colaboracao B", "admin-b@b2.test");
  const managerA = await createUserAndLogin(adminA, "Gerente A", "gerente-a@b2.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor A", "vendedor-a@b2.test", "VENDEDOR");
  const sellerB = await createUserAndLogin(adminA, "Vendedor B", "vendedor-b@b2.test", "VENDEDOR");
  const sellerC = await createUserAndLogin(adminA, "Vendedor C", "vendedor-c@b2.test", "VENDEDOR");
  const sellerBCompany = await createUserAndLogin(adminB, "Vendedor Empresa B", "vendedor-b-empresa@b2.test", "VENDEDOR");
  const contexts = {
    adminA: context(adminA, "ADMIN"),
    adminB: context(adminB, "ADMIN"),
  };

  const clientA = await createClient(adminA.empresaId, "QA-B2 Cliente A");
  const clientA2 = await createClient(adminA.empresaId, "QA-B2 Cliente A2");
  const clientB = await createClient(adminB.empresaId, "QA-B2 Cliente B");

  const leadA = await createLead(adminA, clientA.id, sellerA.usuarioId, "Site");
  const leadFree = await createLead(adminA, clientA2.id, null, "Indicacao");
  const leadB = await createLead(adminB, clientB.id, sellerBCompany.usuarioId, "Site");

  for (const seller of [sellerA, sellerB, sellerC]) {
    const list = await request("GET", "/leads", undefined, seller.token);
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 2);
    assert.ok(list.body.data.some((item) => item.id === leadA.id));
    assert.equal((await request("GET", `/leads/${leadA.id}`, undefined, seller.token)).status, 200);
  }
  assert.equal((await request("GET", "/leads?semResponsavel=true", undefined, sellerC.token)).body.pagination.total, 1);
  assert.equal((await request("GET", "/leads?meus=true", undefined, sellerA.token)).body.pagination.total, 1);
  assert.equal((await request("GET", `/leads?responsavelId=${sellerA.usuarioId}`, undefined, sellerC.token)).body.pagination.total, 1);
  assert.equal((await request("GET", `/leads/${leadB.id}`, undefined, sellerA.token)).status, 404);
  assert.equal((await request("GET", `/leads?empresaId=${adminB.empresaId}`, undefined, sellerA.token)).status, 400);

  assert.equal((await request("PATCH", `/leads/${leadA.id}`, { interesse: "Nao permitido" }, sellerC.token)).status, 403);
  assert.equal((await request("PATCH", `/leads/${leadA.id}`, { interesse: "Permitido ao responsavel" }, sellerA.token)).status, 200);
  assert.equal((await request("POST", `/leads/${leadFree.id}/assumir`, {}, sellerB.token)).status, 200);
  assert.equal((await request("POST", `/leads/${leadFree.id}/assumir`, {}, sellerC.token)).status, 409);
  assert.equal((await request("POST", `/leads/${leadFree.id}/devolver-fila`, {}, sellerB.token)).status, 400);
  const returnedLead = await request("POST", `/leads/${leadFree.id}/devolver-fila`, { motivo: "  Retorno para atendimento geral  " }, sellerB.token);
  assert.equal(returnedLead.status, 200);
  assert.equal(returnedLead.body.responsavelId, null);
  const returnedHistory = await request("GET", `/leads/${leadFree.id}/historico-atribuicao`, undefined, sellerC.token);
  assert.deepEqual(returnedHistory.body.slice(-2).map((item) => item.tipo), ["ASSUMIR", "DESATRIBUIR"]);
  assert.equal(returnedHistory.body.at(-1).motivo, "Retorno para atendimento geral");
  assert.equal(returnedHistory.body.at(-1).responsavelAnterior.nome, "Vendedor B");
  assert.equal(returnedHistory.body.at(-1).alteradoPor.nome, "Vendedor B");
  assert.equal((await request("POST", `/leads/${leadA.id}/devolver-fila`, { motivo: "Tentativa indevida" }, sellerC.token)).status, 403);
  assert.equal((await request("POST", `/leads/${leadA.id}/atribuir`, { responsavelId: sellerC.usuarioId }, sellerC.token)).status, 403);

  const inactiveSeller = await createUserAndLogin(adminA, "Vendedor Inativo", "inativo@b2.test", "VENDEDOR");
  assert.equal((await request("PATCH", `/usuarios/${inactiveSeller.usuarioId}`, { ativo: false }, adminA.token)).status, 200);
  assert.equal((await request("POST", `/leads/${leadA.id}/atribuir`, { responsavelId: inactiveSeller.usuarioId }, managerA.token)).status, 404);

  const channelA = (await request("POST", "/canais/whatsapp/teste", {}, adminA.token)).body;
  const channelB = (await request("POST", "/canais/whatsapp/teste", {}, adminB.token)).body;
  const contactA = await createContact(channelService, adminA.empresaId, channelA.id, clientA.id, "b2-contact-a");
  const contactA2 = await createContact(channelService, adminA.empresaId, channelA.id, clientA2.id, "b2-contact-a2");
  const contactB = await createContact(channelService, adminB.empresaId, channelB.id, clientB.id, "b2-contact-b");

  const conversationA = await service.createOrFindConversation(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    contatoCanalId: contactA.id,
    leadId: leadA.id,
  });
  const conversationFree = await service.createOrFindConversation(contexts.adminA, {
    canalIntegracaoId: channelA.id,
    contatoCanalId: contactA2.id,
    leadId: leadFree.id,
  });
  const conversationB = await service.createOrFindConversation(contexts.adminB, {
    canalIntegracaoId: channelB.id,
    contatoCanalId: contactB.id,
    leadId: leadB.id,
  });
  assert.equal((await request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: sellerA.usuarioId }, managerA.token)).status, 200);
  assert.equal((await request("PATCH", `/conversas/${conversationA.id}/estado`, { estado: "EM_ATENDIMENTO" }, managerA.token)).status, 200);

  for (const seller of [sellerA, sellerB, sellerC]) {
    const list = await request("GET", "/conversas", undefined, seller.token);
    assert.equal(list.body.pagination.total, 2);
    assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, seller.token)).status, 200);
  }
  assert.equal((await request("GET", "/conversas?semResponsavel=true", undefined, sellerC.token)).body.pagination.total, 1);
  assert.equal((await request("GET", "/conversas?meus=true", undefined, sellerA.token)).body.pagination.total, 1);
  assert.equal((await request("GET", `/conversas?q=${encodeURIComponent("QA-B2")}`, undefined, sellerB.token)).status, 200);
  assert.equal((await request("GET", `/conversas/${conversationB.id}`, undefined, sellerA.token)).status, 404);

  const historyBeforeReply = await prisma.historicoAtribuicao.count({ where: { conversaCanalId: conversationA.id } });
  assert.equal((await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "forged-author",
    direcao: "SAIDA",
    texto: "Tentativa",
    autorUsuarioId: sellerA.usuarioId,
  }, sellerC.token)).status, 400);
  const collaborativeReply = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "reply-by-c",
    direcao: "SAIDA",
    texto: "Resposta do vendedor C",
  }, sellerC.token);
  assert.equal(collaborativeReply.status, 201);
  assert.equal(collaborativeReply.body.autor.id, sellerC.usuarioId);
  assert.equal(collaborativeReply.body.autor.nome, "Vendedor C");
  assert.equal(collaborativeReply.body.autor.email, undefined);
  assert.equal((await prisma.conversaCanal.findUnique({ where: { id: conversationA.id } })).responsavelId, sellerA.usuarioId);
  assert.equal((await prisma.lead.findUnique({ where: { id: leadA.id } })).responsavelId, sellerA.usuarioId);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { conversaCanalId: conversationA.id } }), historyBeforeReply);
  assert.equal((await prisma.conversaCanal.findUnique({ where: { id: conversationA.id } })).status, "AGUARDANDO_CLIENTE");
  assert.equal((await request("PATCH", `/conversas/${conversationA.id}/estado`, { estado: "PENDENTE" }, sellerC.token)).status, 403);

  const received = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "received-without-author",
    direcao: "ENTRADA",
    texto: "Mensagem recebida",
  }, sellerB.token);
  assert.equal(received.body.autor, null);
  assert.equal(received.body.autorUsuarioId, null);
  const messageList = await request("GET", `/conversas/${conversationA.id}/mensagens`, undefined, sellerB.token);
  assert.ok(messageList.body.data.some((message) => message.autor?.id === sellerC.usuarioId));
  const conversationProjection = await request("GET", `/conversas/${conversationA.id}`, undefined, sellerA.token);
  assert.equal(conversationProjection.status, 200);
  assert.equal(conversationProjection.body.ultimaMensagem.autor, null);
  assert.equal(conversationProjection.body.contatoCanal.cliente.nome, "QA-B2 Cliente A");

  const stateBeforeNote = (await prisma.conversaCanal.findUnique({ where: { id: conversationA.id } })).status;
  const note = await request("POST", `/conversas/${conversationA.id}/notas-internas`, { conteudo: "Nota colaborativa B2" }, sellerB.token);
  assert.equal(note.status, 201);
  assert.equal(note.body.autorId, sellerB.usuarioId);
  const notes = await request("GET", `/conversas/${conversationA.id}/notas-internas`, undefined, sellerC.token);
  assert.equal(notes.body.length, 1);
  assert.equal(notes.body[0].autor.nome, "Vendedor B");
  assert.equal((await prisma.conversaCanal.findUnique({ where: { id: conversationA.id } })).status, stateBeforeNote);

  const leaseA = await request("POST", `/conversas/${conversationA.id}/reserva-resposta`, {}, sellerA.token);
  assert.equal(leaseA.status, 200);
  assert.equal(leaseA.body.reservaResposta.usuarioId, sellerA.usuarioId);
  const leaseConflict = await request("POST", `/conversas/${conversationA.id}/reserva-resposta`, {}, sellerC.token);
  assert.equal(leaseConflict.status, 409);
  assert.equal(leaseConflict.body.reservaResposta.nome, "Vendedor A");
  assert.equal(leaseConflict.body.reservaResposta.email, undefined);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/reserva-resposta/renovar`, {}, sellerC.token)).status, 409);
  const renewed = await request("POST", `/conversas/${conversationA.id}/reserva-resposta/renovar`, {}, sellerA.token);
  assert.equal(renewed.status, 200);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "blocked-by-lease",
    direcao: "SAIDA",
    texto: "Nao pode enviar",
  }, sellerC.token)).status, 409);
  assert.equal(await prisma.mensagemCanal.count({ where: { externalId: "blocked-by-lease" } }), 0);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "owner-reply-releases-lease",
    direcao: "SAIDA",
    texto: "Resposta do titular da reserva",
  }, sellerA.token)).status, 201);
  assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, sellerC.token)).body.reservaResposta, null);

  assert.equal((await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "reply-without-lease",
    direcao: "SAIDA",
    texto: "Resposta sem reserva obrigatoria",
  }, sellerC.token)).status, 201);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/reserva-resposta`, {}, sellerC.token)).status, 200);
  await prisma.conversaCanal.update({ where: { id: conversationA.id }, data: { respostaReservadaAte: new Date(Date.now() - 1000) } });
  assert.equal((await request("POST", `/conversas/${conversationA.id}/reserva-resposta`, {}, sellerB.token)).status, 200);
  assert.equal((await request("DELETE", `/conversas/${conversationA.id}/reserva-resposta`, undefined, sellerB.token)).status, 200);

  const leaseRace = await Promise.all([
    request("POST", `/conversas/${conversationFree.id}/reserva-resposta`, {}, sellerA.token),
    request("POST", `/conversas/${conversationFree.id}/reserva-resposta`, {}, sellerB.token),
  ]);
  assert.deepEqual(leaseRace.map((item) => item.status).sort(), [200, 409]);
  const claimRace = await Promise.all([
    request("POST", `/conversas/${conversationFree.id}/assumir`, {}, sellerA.token),
    request("POST", `/conversas/${conversationFree.id}/assumir`, {}, sellerB.token),
  ]);
  assert.deepEqual(claimRace.map((item) => item.status).sort(), [200, 409]);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { conversaCanalId: conversationFree.id, tipo: "ASSUMIR" } }), 1);
  const managerReturnedConversation = await request("POST", `/conversas/${conversationFree.id}/devolver-fila`, {
    motivo: "Gerente devolveu para redistribuicao",
  }, managerA.token);
  assert.equal(managerReturnedConversation.status, 200);
  assert.equal(managerReturnedConversation.body.responsavelId, null);
  assert.equal(managerReturnedConversation.body.status, "AGUARDANDO_ATENDIMENTO");
  assert.equal((await request("POST", `/conversas/${conversationFree.id}/assumir`, {}, sellerB.token)).status, 200);
  const sellerReturnedConversation = await request("POST", `/conversas/${conversationFree.id}/devolver-fila`, {
    motivo: "Vendedor devolveu seu proprio atendimento",
  }, sellerB.token);
  assert.equal(sellerReturnedConversation.status, 200);
  assert.equal(sellerReturnedConversation.body.responsavelId, null);

  await prisma.conversaCanal.update({ where: { id: conversationA.id }, data: { respostaReservadaPorId: null, respostaReservadaAte: null } });
  const duplicateReplies = await Promise.all([
    request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, { externalId: "same-reply-id", direcao: "SAIDA", texto: "Resposta A" }, sellerA.token),
    request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, { externalId: "same-reply-id", direcao: "SAIDA", texto: "Resposta C" }, sellerC.token),
  ]);
  assert.ok(duplicateReplies.some((item) => item.status === 201));
  assert.ok(duplicateReplies.every((item) => [201, 409].includes(item.status)));
  assert.equal(await prisma.mensagemCanal.count({ where: { canalIntegracaoId: channelA.id, externalId: "same-reply-id" } }), 1);

  const transferAndReply = await Promise.all([
    request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, { externalId: "reply-during-transfer", direcao: "SAIDA", texto: "Resposta durante transferencia" }, sellerC.token),
    request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: sellerB.usuarioId, motivo: "Troca paralela" }, managerA.token),
  ]);
  assert.equal(transferAndReply[0].status, 201);
  assert.equal(transferAndReply[1].status, 200);
  const repliedDuringTransfer = await prisma.mensagemCanal.findUnique({
    where: { canalIntegracaoId_externalId: { canalIntegracaoId: channelA.id, externalId: "reply-during-transfer" } },
  });
  assert.equal(repliedDuringTransfer.autorUsuarioId, sellerC.usuarioId);
  assert.equal((await prisma.conversaCanal.findUnique({ where: { id: conversationA.id } })).responsavelId, sellerB.usuarioId);

  const concurrentLead = await createLead(adminA, clientA2.id, sellerA.usuarioId, "Concorrencia");
  const beforeConcurrentHistory = await prisma.historicoAtribuicao.count({ where: { leadId: concurrentLead.id } });
  const queueAndTransfer = await Promise.all([
    request("POST", `/leads/${concurrentLead.id}/devolver-fila`, { motivo: "Devolucao concorrente" }, sellerA.token),
    request("POST", `/leads/${concurrentLead.id}/atribuir`, { responsavelId: sellerC.usuarioId, motivo: "Transferencia concorrente" }, managerA.token),
  ]);
  assert.ok(queueAndTransfer.some((item) => item.status === 200));
  assert.ok(queueAndTransfer.every((item) => [200, 403, 409].includes(item.status)));
  const successfulAssignmentChanges = queueAndTransfer.filter((item) => item.status === 200).length;
  assert.equal(await prisma.historicoAtribuicao.count({ where: { leadId: concurrentLead.id } }), beforeConcurrentHistory + successfulAssignmentChanges);

  assert.equal((await request("POST", `/conversas/${conversationA.id}/reserva-resposta`, {}, sellerBCompany.token)).status, 404);
  assert.equal((await request("GET", `/conversas/${conversationA.id}/mensagens`, undefined, sellerBCompany.token)).status, 404);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/notas-internas`, { conteudo: "Cross tenant" }, sellerBCompany.token)).status, 404);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: sellerBCompany.usuarioId }, managerA.token)).status, 404);

  const removableAuthor = await createUserAndLogin(adminA, "Autor Removivel", "autor-removivel@b2.test", "VENDEDOR");
  const removableReply = await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, {
    externalId: "reply-author-set-null",
    direcao: "SAIDA",
    texto: "Autoria sera preservada como nula apos remocao",
  }, removableAuthor.token);
  assert.equal(removableReply.body.autor.id, removableAuthor.usuarioId);
  await prisma.usuario.delete({ where: { id: removableAuthor.usuarioId } });
  const afterAuthorRemoval = await prisma.mensagemCanal.findUnique({ where: { id: removableReply.body.id } });
  assert.equal(afterAuthorRemoval.autorUsuarioId, null);
  assert.equal((await request("GET", `/conversas/${conversationA.id}/mensagens`, undefined, adminA.token)).body.data.find((item) => item.id === removableReply.body.id).autor, null);
});

function context(identity, papel) {
  return { usuarioId: identity.usuarioId, empresaId: identity.empresaId, papel };
}

async function createLead(admin, clienteId, responsavelId, origem) {
  const result = await request("POST", "/leads", { clienteId, responsavelId, origem }, admin.token);
  assert.equal(result.status, 201);
  return result.body;
}

async function createClient(empresaId, nome) {
  return prisma.cliente.create({ data: { empresaId, nome, telefone: "", email: "", empresa: "QA B2", interesse: "", status: "Lead", valor: 0, origem: "QA B2" } });
}

async function createContact(channelService, empresaId, canalIntegracaoId, clienteId, externalId) {
  const contact = await channelService.createOrFindChannelContact({ empresaId, canalIntegracaoId, externalId, nome: externalId });
  return prisma.contatoCanal.update({ where: { id: contact.id }, data: { clienteId } });
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaB2Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaB2Segura123";
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
