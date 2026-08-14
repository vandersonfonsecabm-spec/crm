const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-inbox-operations-v61");
const databasePath = path.join(auditDir, `inbox-v61-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "inbox-v61-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "inbox-v61-encryption-key";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.LEADS_COMMUNICATION_ENABLED = "true";
process.env.LEADS_REPLY_LEASE_SECONDS = "120";

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
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try { fs.rmSync(`${databasePath}${suffix}`, { force: true }); } catch { /* best effort */ }
  }
});

test("V61 fila aguardando, lembrete server-side, EM_ATENDIMENTO e responder concluem retorno", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
  const admin = await registerAndLogin("Empresa Inbox V61", "Admin Inbox V61", "admin-v61@inbox.test");
  const channelService = createChannelService({ prisma });
  const service = createLeadsCommunicationServices({ prisma });
  const channel = (await request("POST", "/canais/whatsapp/teste", {}, admin.token)).body;
  const client = await prisma.cliente.create({ data: { empresaId: admin.empresaId, nome: "Cliente Inbox V61", telefone: "", email: "", empresa: "QA V61", interesse: "", status: "Lead", valor: 0, origem: "QA V61" } });
  const contact = await channelService.createOrFindChannelContact({ empresaId: admin.empresaId, canalIntegracaoId: channel.id, clienteId: client.id, externalId: "v61-contact" });
  await prisma.contatoCanal.update({ where: { id: contact.id }, data: { clienteId: client.id } });
  const conversation = await service.createOrFindConversation({ empresaId: admin.empresaId, usuarioId: admin.usuarioId, papel: "ADMIN" }, { canalIntegracaoId: channel.id, contatoCanalId: contact.id });

  const otherAdmin = await registerAndLogin("Empresa Inbox V61 Outro Tenant", "Outro Admin Inbox V61", "admin-v61-outro@inbox.test");
  const foreignSnooze = await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, otherAdmin.token);
  assert.equal(foreignSnooze.status, 404, "lembrete nao atravessa tenant");

  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 0);
  const inbound = await request("POST", `/conversas/${conversation.id}/mensagens/simuladas`, { externalId: "v61-inbound-1", direcao: "ENTRADA", texto: "Preciso de retorno" }, admin.token);
  assert.ok([200, 201].includes(inbound.status));
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 1);
  assert.equal((await request("GET", "/conversas?fila=AGUARDANDO_RESPOSTA", undefined, admin.token)).body.pagination.total, 1);
  assert.equal((await request("GET", `/conversas/${conversation.id}`, undefined, admin.token)).body.status, "AGUARDANDO_ATENDIMENTO", "abrir nao limpa pendencia");

  const assumed = await request("POST", `/conversas/${conversation.id}/assumir`, {}, admin.token);
  assert.equal(assumed.status, 200);
  const inboundAssigned = await request("POST", `/conversas/${conversation.id}/mensagens/simuladas`, { externalId: "v61-inbound-2", direcao: "ENTRADA", texto: "Ainda aguardo" }, admin.token);
  assert.ok([200, 201].includes(inboundAssigned.status));
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 1, "EM_ATENDIMENTO com aguardandoDesde continua elegivel");
  const legacyNullMessage = await prisma.mensagemCanal.create({ data: { empresaId: admin.empresaId, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, externalId: "v61-legacy-null-time", direcao: "ENTRADA", tipo: "TEXTO", texto: "Mensagem legada sem horario do provedor", status: "RECEBIDA", statusEntrega: "RECEBIDA", enviadaEm: null, createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), simulada: false } });
  const legacyLatestMessage = await prisma.mensagemCanal.create({ data: { empresaId: admin.empresaId, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, externalId: "v61-legacy-null-latest", direcao: "ENTRADA", tipo: "TEXTO", texto: "Mensagem legada mais recente pelo fallback", status: "RECEBIDA", statusEntrega: "RECEBIDA", enviadaEm: null, createdAt: new Date(Date.now() + 1000), simulada: false } });
  const orderedMessages = await service.listMessages({ empresaId: admin.empresaId, usuarioId: admin.usuarioId, papel: "ADMIN" }, conversation.id, { page: 1, limit: 100 });
  assert.ok(orderedMessages.data.findIndex((message) => message.id === legacyNullMessage.id) < orderedMessages.data.findIndex((message) => message.id === legacyLatestMessage.id), "mensagens legadas usam createdAt como fallback na mesma cronologia");
  const latestConversation = await service.getConversation({ empresaId: admin.empresaId, usuarioId: admin.usuarioId, papel: "ADMIN" }, conversation.id);
  assert.equal(latestConversation.ultimaMensagem.id, legacyLatestMessage.id, "ultima mensagem usa a mesma cronologia COALESCE provider/createdAt");

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const snoozed = await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: future, motivo: "Retorno agendado" }, admin.token);
  assert.equal(snoozed.status, 200, JSON.stringify(snoozed.body));
  assert.equal(snoozed.body.status, "PENDENTE");
  assert.equal(new Date(snoozed.body.lembrarDepoisEm).toISOString(), future);
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 0);
  assert.equal((await request("GET", "/conversas?fila=LEMBRAR_DEPOIS", undefined, admin.token)).body.pagination.total, 1);

  const resnoozedWhilePending = await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), motivo: "Retorno reagendado sem reabrir" }, admin.token);
  assert.equal(resnoozedWhilePending.status, 200, JSON.stringify(resnoozedWhilePending.body));
  assert.equal(resnoozedWhilePending.body.status, "PENDENTE");

  const agendaReminder = await prisma.acompanhamento.findFirst({ where: { empresaId: admin.empresaId, conversaCanalId: conversation.id, titulo: "Lembrar conversa", tipo: "RETORNO", status: "PENDENTE" } });
  const redatedAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const redatedReminder = await request("PATCH", `/acompanhamentos/${agendaReminder.id}`, { dataHora: redatedAt, revisao: agendaReminder.revisao }, admin.token);
  assert.equal(redatedReminder.status, 200, JSON.stringify(redatedReminder.body));
  const afterRedateConversation = await prisma.conversaCanal.findUnique({ where: { id: conversation.id }, select: { status: true, aguardandoDesde: true } });
  assert.equal(afterRedateConversation.status, "PENDENTE");
  assert.equal(new Date(afterRedateConversation.aguardandoDesde).toISOString(), redatedAt, "reagendar o mesmo lembrete atualiza a espera operacional da conversa");
  const redatedSnapshot = await prisma.acompanhamento.findUnique({ where: { id: agendaReminder.id } });
  const editedReminder = await request("PATCH", `/acompanhamentos/${agendaReminder.id}`, { titulo: "Retorno manual", revisao: redatedSnapshot.revisao }, admin.token);
  assert.equal(editedReminder.status, 200, JSON.stringify(editedReminder.body));
  assert.equal((await request("GET", `/conversas/${conversation.id}`, undefined, admin.token)).body.status, "EM_ATENDIMENTO", "editar o lembrete para outro tipo retoma a conversa");
  const resnoozedAfterEdit = await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), motivo: "Retorno recriado apos edicao" }, admin.token);
  assert.equal(resnoozedAfterEdit.status, 200, JSON.stringify(resnoozedAfterEdit.body));
  const refreshedAgendaReminder = await prisma.acompanhamento.findFirst({ where: { empresaId: admin.empresaId, conversaCanalId: conversation.id, titulo: "Lembrar conversa", tipo: "RETORNO", status: "PENDENTE" } });
  const agendaComplete = await request("POST", `/acompanhamentos/${refreshedAgendaReminder.id}/concluir`, {}, admin.token);
  assert.equal(agendaComplete.status, 200, JSON.stringify(agendaComplete.body));
  assert.equal((await request("GET", `/conversas/${conversation.id}`, undefined, admin.token)).body.status, "EM_ATENDIMENTO", "concluir o lembrete pela Agenda retoma o atendimento");

  const returned = await request("POST", `/conversas/${conversation.id}/devolver-fila`, { motivo: "Retomar fila" }, admin.token);
  assert.equal(returned.status, 200);
  assert.equal(returned.body.status, "AGUARDANDO_ATENDIMENTO");
  assert.equal(returned.body.lembrete, null, "devolver para a fila cancela o lembrete ativo");
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 1);

  const resnoozed = await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: new Date(Date.now() + 60 * 60 * 1000).toISOString(), motivo: "Retorno reagendado" }, admin.token);
  assert.equal(resnoozed.status, 200);
  assert.equal((await request("GET", "/conversas?fila=LEMBRAR_DEPOIS", undefined, admin.token)).body.pagination.total, 1);

  const { applyInboundConversationActivity } = require("../src/leads-communication/inboundActivity");
  const receiptTime = new Date();
  const providerTime = new Date(receiptTime.getTime() - 2 * 60 * 60 * 1000);
  await prisma.mensagemCanal.create({ data: { empresaId: admin.empresaId, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, externalId: "v61-provider-inbound", direcao: "ENTRADA", tipo: "TEXTO", texto: "Retorno recebido pelo canal", status: "RECEBIDA", statusEntrega: "RECEBIDA", enviadaEm: providerTime, simulada: false } });
  const pendingSnapshot = await prisma.conversaCanal.findUnique({ where: { id: conversation.id } });
  const reminderBeforeInbound = await prisma.acompanhamento.findFirst({ where: { empresaId: admin.empresaId, conversaCanalId: conversation.id, titulo: "Lembrar conversa", tipo: "RETORNO", status: "PENDENTE" } });
  const reminderHistoryBeforeInbound = await prisma.historicoAcompanhamento.count({ where: { empresaId: admin.empresaId, acompanhamentoId: reminderBeforeInbound.id } });
  await prisma.$transaction((tx) => applyInboundConversationActivity(tx, pendingSnapshot, providerTime, receiptTime));
  const afterProviderInbound = await service.getConversation({ empresaId: admin.empresaId, usuarioId: admin.usuarioId, papel: "ADMIN" }, conversation.id);
  assert.equal(afterProviderInbound.status, "AGUARDANDO_ATENDIMENTO", "inbound real reabre a pendência na fila quando não há responsável");
  assert.equal(afterProviderInbound.lembrete, null, "inbound real cancela o retorno adiado");
  const providerMessage = await prisma.mensagemCanal.findFirst({ where: { empresaId: admin.empresaId, externalId: "v61-provider-inbound" }, select: { enviadaEm: true } });
  assert.equal(new Date(providerMessage.enviadaEm).toISOString(), providerTime.toISOString(), "a cronologia preserva o horario do provedor");
  const afterInboundConversation = await prisma.conversaCanal.findUnique({ where: { id: conversation.id }, select: { aguardandoDesde: true } });
  assert.ok(Math.abs(new Date(afterInboundConversation.aguardandoDesde).getTime() - receiptTime.getTime()) < 5000, "SLA usa recebimento do servidor, nao horario atrasado do provedor");
  const reminderAfterInbound = await prisma.acompanhamento.findUnique({ where: { id: reminderBeforeInbound.id } });
  assert.equal(reminderAfterInbound.status, "CANCELADO");
  assert.equal(reminderAfterInbound.revisao, reminderBeforeInbound.revisao + 1, "cancelamento automatico usa revisao CAS");
  assert.equal(await prisma.historicoAcompanhamento.count({ where: { empresaId: admin.empresaId, acompanhamentoId: reminderBeforeInbound.id } }), reminderHistoryBeforeInbound + 1, "cancelamento automatico preserva historico");
  const automaticHistory = await prisma.historicoAcompanhamento.findFirst({ where: { empresaId: admin.empresaId, acompanhamentoId: reminderBeforeInbound.id, acao: "CANCELAR" }, orderBy: [{ id: "desc" }], include: { autor: { select: { nome: true, ativo: true } } } });
  assert.equal(automaticHistory.autor.nome, "Sistema", "cancelamento automatico nao e atribuido a um humano");
  assert.equal(automaticHistory.autor.ativo, false, "o ator automatico e uma identidade interna inativa");

  await request("POST", `/conversas/${conversation.id}/devolver-fila`, { motivo: "Fila após inbound" }, admin.token);
  await request("POST", `/conversas/${conversation.id}/lembrar-depois`, { dataHora: new Date(Date.now() + 60 * 60 * 1000).toISOString(), motivo: "Retorno final" }, admin.token);

  const reminder = await prisma.acompanhamento.findFirst({ where: { empresaId: admin.empresaId, conversaCanalId: conversation.id, titulo: "Lembrar conversa", tipo: "RETORNO", status: "PENDENTE" } });
  await prisma.$transaction([
    prisma.acompanhamento.update({ where: { id: reminder.id }, data: { dataHora: new Date(Date.now() - 60 * 1000) } }),
    prisma.conversaCanal.update({ where: { id: conversation.id }, data: { aguardandoDesde: new Date(Date.now() - 60 * 1000) } }),
  ]);
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 1);

  const replied = await request("POST", `/conversas/${conversation.id}/mensagens/simuladas`, { externalId: "v61-outbound-1", direcao: "SAIDA", texto: "Retorno registrado" }, admin.token);
  assert.ok([200, 201].includes(replied.status));
  const afterReply = await request("GET", `/conversas/${conversation.id}`, undefined, admin.token);
  assert.equal(afterReply.body.status, "AGUARDANDO_CLIENTE");
  assert.equal(afterReply.body.lembrete, null);
  assert.equal((await request("GET", "/conversas/resumo", undefined, admin.token)).body.pendentes, 0);
  assert.equal((await request("GET", "/conversas?fila=AGUARDANDO_RESPOSTA", undefined, admin.token)).body.pagination.total, 0);
});

test("V61 perdedor de CAS do lembrete aborta a mudanca da conversa", async () => {
  const { applyInboundConversationActivity } = require("../src/leads-communication/inboundActivity");
  let conversationUpdates = 0;
  const tx = {
    conversaCanal: {
      findFirst: async () => ({ id: 901, empresaId: 77, status: "PENDENTE", responsavelId: null, primeiraMensagemEm: null, ultimaMensagemEm: null, encerradaEm: null }),
      findUnique: async () => ({ contatoCanal: { clienteId: null }, lead: { clienteId: null } }),
      updateMany: async () => { conversationUpdates += 1; return { count: 1 }; },
    },
    acompanhamento: {
      findMany: async () => [{ id: 902, status: "PENDENTE", revisao: 4, clienteId: null }],
      updateMany: async () => ({ count: 0 }),
    },
    usuario: { findFirst: async () => ({ id: 903 }) },
    historicoAcompanhamento: { create: async () => { throw new Error("history must not be written after CAS loss"); } },
  };
  await assert.rejects(
    applyInboundConversationActivity(tx, { id: 901, empresaId: 77 }, new Date("2026-08-14T11:00:00.000Z"), new Date("2026-08-14T11:01:00.000Z")),
    (error) => error?.codigo === "REMINDER_CONFLICT",
  );
  assert.equal(conversationUpdates, 0, "a conversa nao muda quando o lembrete perdeu o CAS");
});

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaInboxV61Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
