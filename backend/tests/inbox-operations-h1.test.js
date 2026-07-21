const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-inbox-operations-h1");
const databasePath = path.join(auditDir, `inbox-h1-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "inbox-h1-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "inbox-h1-encryption-key";
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
  removeDatabase(databasePath);
});

test("H1 opera fila colaborativa, historico, SLA, nao lidas e concorrencia por tenant", async () => {
  const { createChannelService } = require("../src/channels/channelService");
  const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
  const { calculateConversationSla } = require("../src/leads-communication/inboxOperations");
  const channelService = createChannelService({ prisma });
  const service = createLeadsCommunicationServices({ prisma });
  const businessCountBefore = await prisma.negocio.count();

  const adminA = await registerAndLogin("Empresa Inbox H1 A", "Admin Inbox H1 A", "admin-a@inbox-h1.test");
  const adminB = await registerAndLogin("Empresa Inbox H1 B", "Admin Inbox H1 B", "admin-b@inbox-h1.test");
  const sellerA = await createUserAndLogin(adminA, "Atendente H1 A", "seller-a@inbox-h1.test", "VENDEDOR");
  const sellerB = await createUserAndLogin(adminA, "Atendente H1 B", "seller-b@inbox-h1.test", "VENDEDOR");
  const sellerOtherTenant = await createUserAndLogin(adminB, "Atendente H1 Externo", "seller-other@inbox-h1.test", "VENDEDOR");
  const clientA = await createClient(adminA.empresaId, "Cliente Inbox H1");
  const clientB = await createClient(adminB.empresaId, "Cliente Inbox H1 Externo");
  const leadA = await createLead(adminA, clientA.id);
  const leadB = await createLead(adminB, clientB.id);
  const channelA = (await request("POST", "/canais/whatsapp/teste", {}, adminA.token)).body;
  const channelB = (await request("POST", "/canais/whatsapp/teste", {}, adminB.token)).body;
  const contactA = await createContact(channelService, adminA.empresaId, channelA.id, clientA.id, "h1-contact-a");
  const contactB = await createContact(channelService, adminB.empresaId, channelB.id, clientB.id, "h1-contact-b");
  const conversationA = await service.createOrFindConversation(context(adminA, "ADMIN"), { canalIntegracaoId: channelA.id, contatoCanalId: contactA.id, leadId: leadA.id });
  const conversationB = await service.createOrFindConversation(context(adminB, "ADMIN"), { canalIntegracaoId: channelB.id, contatoCanalId: contactB.id, leadId: leadB.id });

  assert.equal((await request("GET", "/conversas", undefined, sellerA.token)).body.pagination.total, 1);
  const teamA = await request("GET", "/conversas/equipe", undefined, sellerA.token);
  assert.equal(teamA.status, 200);
  assert.ok(teamA.body.data.some((user) => user.id === sellerB.usuarioId));
  assert.ok(!teamA.body.data.some((user) => user.id === sellerOtherTenant.usuarioId));
  assert.ok(teamA.body.data.every((user) => user.email === undefined));
  assert.equal((await request("GET", `/conversas/${conversationB.id}`, undefined, sellerA.token)).status, 404);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/assumir`, {}, sellerOtherTenant.token)).status, 404);
  assert.equal((await request("GET", "/conversas", undefined)).status, 401);

  const claims = await Promise.all([
    request("POST", `/conversas/${conversationA.id}/assumir`, {}, sellerA.token),
    request("POST", `/conversas/${conversationA.id}/assumir`, {}, sellerB.token),
  ]);
  assert.deepEqual(claims.map((result) => result.status).sort(), [200, 409]);
  const claimed = claims.find((result) => result.status === 200);
  const winner = claimed.body.responsavelId === sellerA.usuarioId ? sellerA : sellerB;
  const other = winner.usuarioId === sellerA.usuarioId ? sellerB : sellerA;
  assert.equal(claimed.body.status, "EM_ATENDIMENTO");
  assert.equal(await prisma.historicoAtribuicao.count({ where: { conversaCanalId: conversationA.id, acaoAtendimento: "ASSUMIR" } }), 1);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/marcar-pendente`, {}, other.token)).status, 403);

  const transferred = await request("POST", `/conversas/${conversationA.id}/atribuir`, { responsavelId: other.usuarioId, motivo: "Troca de turno" }, winner.token);
  assert.equal(transferred.status, 200);
  assert.equal(transferred.body.responsavelId, other.usuarioId);
  assert.equal(transferred.body.status, "EM_ATENDIMENTO");
  const transferHistory = await prisma.historicoAtribuicao.findFirst({ where: { conversaCanalId: conversationA.id, acaoAtendimento: "TRANSFERIR" } });
  assert.equal(transferHistory.estadoAnterior, "EM_ATENDIMENTO");
  assert.equal(transferHistory.estadoNovo, "EM_ATENDIMENTO");
  assert.equal(transferHistory.motivo, "Troca de turno");

  const queued = await request("POST", `/conversas/${conversationA.id}/devolver-fila`, {}, other.token);
  assert.equal(queued.status, 200);
  assert.equal(queued.body.responsavelId, null);
  assert.equal(queued.body.status, "AGUARDANDO_ATENDIMENTO");
  assert.equal((await request("POST", `/conversas/${conversationA.id}/assumir`, {}, other.token)).status, 200);

  const waiting = await request("POST", `/conversas/${conversationA.id}/aguardar-cliente`, {}, other.token);
  assert.equal(waiting.status, 200);
  assert.equal(waiting.body.status, "AGUARDANDO_CLIENTE");
  assert.equal(waiting.body.sla, null);
  const pending = await request("POST", `/conversas/${conversationA.id}/marcar-pendente`, { motivo: "Retorno interno" }, other.token);
  assert.equal(pending.status, 200);
  assert.equal(pending.body.status, "PENDENTE");
  const closed = await request("POST", `/conversas/${conversationA.id}/encerrar`, {}, other.token);
  assert.equal(closed.status, 200);
  assert.equal(closed.body.status, "ENCERRADA");
  assert.ok(closed.body.encerradaEm);
  assert.equal((await request("POST", `/conversas/${conversationA.id}/aguardar-cliente`, {}, other.token)).status, 422);
  const reopened = await request("POST", `/conversas/${conversationA.id}/reabrir`, {}, other.token);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.status, "EM_ATENDIMENTO");
  assert.ok(reopened.body.reabertaEm);

  await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, { externalId: "h1-unread-in", direcao: "ENTRADA", texto: "  Mensagem com espacos  " }, other.token);
  const withUnread = await request("GET", `/conversas/${conversationA.id}`, undefined, other.token);
  assert.equal(withUnread.body.naoLidas, 1);
  assert.equal(withUnread.body.ultimaMensagem.texto, "Mensagem com espacos");
  const markedRead = await request("POST", `/conversas/${conversationA.id}/marcar-lida`, {}, other.token);
  assert.equal(markedRead.status, 200);
  assert.equal(markedRead.body.marcadasComoLidas, 1);
  assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, other.token)).body.naoLidas, 0);
  await request("POST", `/conversas/${conversationA.id}/mensagens/simuladas`, { externalId: "h1-out", direcao: "SAIDA", texto: "Resposta humana" }, other.token);
  assert.equal((await request("GET", `/conversas/${conversationA.id}`, undefined, other.token)).body.naoLidas, 0);

  const now = new Date("2026-07-21T18:00:00.000Z");
  assert.equal(calculateConversationSla({ status: "NOVA", aguardandoDesde: new Date(now.getTime() - 10 * 60000) }, now).status, "DENTRO_PRAZO");
  assert.equal(calculateConversationSla({ status: "NOVA", aguardandoDesde: new Date(now.getTime() - 11 * 60000) }, now).status, "ATENCAO");
  assert.equal(calculateConversationSla({ status: "NOVA", aguardandoDesde: new Date(now.getTime() - 16 * 60000) }, now).status, "ATRASADO");
  assert.equal(calculateConversationSla({ status: "NOVA", aguardandoDesde: new Date(now.getTime() - 31 * 60000) }, now).status, "CRITICO");
  assert.equal(calculateConversationSla({ status: "AGUARDANDO_CLIENTE", aguardandoDesde: new Date(now.getTime() - 60 * 60000) }, now), null);

  await prisma.conversaCanal.update({ where: { id: conversationA.id }, data: { status: "EM_ATENDIMENTO", aguardandoDesde: new Date(Date.now() - 31 * 60000) } });
  const critical = await request("GET", "/conversas?sla=CRITICO", undefined, other.token);
  assert.ok(critical.body.data.some((item) => item.id === conversationA.id && item.sla.status === "CRITICO"));
  const attention = await request("GET", "/conversas?sla=ATENCAO", undefined, other.token);
  assert.ok(!attention.body.data.some((item) => item.id === conversationA.id));

  const history = await request("GET", `/conversas/${conversationA.id}/historico-atribuicao`, undefined, other.token);
  assert.deepEqual(history.body.filter((entry) => entry.acaoAtendimento).map((entry) => entry.acaoAtendimento), [
    "ASSUMIR", "TRANSFERIR", "DEVOLVER_FILA", "ASSUMIR", "AGUARDAR_CLIENTE", "MARCAR_PENDENTE", "ENCERRAR", "REABRIR",
  ]);
  assert.ok(history.body.every((entry) => !Object.hasOwn(entry, "empresa")));
  assert.equal(await prisma.negocio.count(), businessCountBefore);
  assert.equal(await prisma.mensagemCanal.count({ where: { conversaCanalId: conversationA.id } }), 2);
  assert.equal((await prisma.conversaCanal.findUnique({ where: { id: conversationB.id } })).responsavelId, null);
});

function context(identity, papel) {
  return { usuarioId: identity.usuarioId, empresaId: identity.empresaId, papel };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaInboxH1Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaInboxH1Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
}

async function createClient(empresaId, nome) {
  return prisma.cliente.create({ data: { empresaId, nome, telefone: "", email: "", empresa: "QA H1", interesse: "", status: "Lead", valor: 0, origem: "QA H1" } });
}

async function createLead(admin, clienteId) {
  const response = await request("POST", "/leads", { clienteId, origem: "QA H1" }, admin.token);
  assert.equal(response.status, 201);
  return response.body;
}

async function createContact(channelService, empresaId, canalIntegracaoId, clienteId, externalId) {
  const contact = await channelService.createOrFindChannelContact({ empresaId, canalIntegracaoId, externalId, nome: externalId });
  return prisma.contatoCanal.update({ where: { id: contact.id }, data: { clienteId } });
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
