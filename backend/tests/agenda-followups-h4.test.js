const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(os.tmpdir(), "crm-prisma-tests", "agenda-followups-h4");
const databasePath = path.join(auditDir, `h4-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "agenda-followups-h4-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "agenda-followups-h4-encryption-key";
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

test("H4 opera agenda por tenant, permissao, historico e concorrencia", async () => {
  const adminA = await registerAndLogin("Empresa Agenda H4 A", "Admin Agenda H4 A", "admin-a@h4.test");
  const adminB = await registerAndLogin("Empresa Agenda H4 B", "Admin Agenda H4 B", "admin-b@h4.test");
  const managerA = await createUserAndLogin(adminA, "Gerente Agenda H4", "manager@h4.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor Agenda H4", "seller@h4.test", "VENDEDOR");
  const sellerOther = await createUserAndLogin(adminA, "Outro Vendedor H4", "seller-other@h4.test", "VENDEDOR");
  const fixtureA = await commercialFixture(adminA, sellerA.usuarioId, "A");
  const fixtureB = await commercialFixture(adminB, adminB.usuarioId, "B");
  const invariants = await commercialInvariants(fixtureA);

  assert.equal((await request("GET", "/acompanhamentos")).status, 401);
  assert.equal((await request("GET", "/acompanhamentos?visao=EQUIPE", undefined, sellerA.token)).status, 403);
  const team = await request("GET", "/acompanhamentos/equipe", undefined, managerA.token);
  assert.equal(team.status, 200);
  assert.equal(team.body.podeVerEquipe, true);
  assert.ok(team.body.data.some((user) => user.id === sellerA.usuarioId));

  const invalidTenant = await request("POST", "/acompanhamentos", { empresaId: adminB.empresaId, titulo: "Tenant indevido", dataHora: futureDate() }, adminA.token);
  assert.equal(invalidTenant.status, 400);
  assert.equal((await request("POST", "/acompanhamentos", { titulo: "Data invalida", dataHora: "31/99/2026" }, sellerA.token)).status, 422);
  assert.equal((await request("POST", "/acompanhamentos", { titulo: "Responsavel externo", dataHora: futureDate(), responsavelId: adminA.usuarioId }, sellerA.token)).status, 403);
  assert.equal((await request("POST", "/acompanhamentos", { titulo: "Cliente externo", dataHora: futureDate(), clienteId: fixtureB.client.id }, adminA.token)).status, 404);

  const freeTask = await request("POST", "/acompanhamentos", {
    titulo: "Preparar pauta comercial",
    descricao: "Organizar os pontos da proxima conversa",
    dataHora: pastDate(),
    prioridade: "URGENTE",
    tipo: "TAREFA",
    observacao: "Criacao\u0000 controlada",
  }, sellerA.token);
  assert.equal(freeTask.status, 201, JSON.stringify(freeTask.body));
  assert.equal(freeTask.body.clienteId, null);
  assert.equal(freeTask.body.responsavelId, sellerA.usuarioId);
  assert.equal(freeTask.body.atrasado, true);

  const linked = await request("POST", "/acompanhamentos", {
    titulo: "Retorno da proposta",
    dataHora: futureDate(),
    prioridade: "ALTA",
    tipo: "RETORNO",
    responsavelId: sellerA.usuarioId,
    propostaComercialId: fixtureA.proposal.id,
    conversaCanalId: fixtureA.conversation.id,
  }, managerA.token);
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
  assert.equal(linked.body.clienteId, fixtureA.client.id);
  assert.equal(linked.body.leadId, fixtureA.lead.id);
  assert.equal(linked.body.negocioId, fixtureA.business.id);
  assert.equal(linked.body.propostaComercialId, fixtureA.proposal.id);
  assert.equal(linked.body.conversaCanalId, fixtureA.conversation.id);
  assert.equal((await request("GET", `/acompanhamentos/${linked.body.id}`, undefined, adminB.token)).status, 404);
  assert.equal((await request("GET", `/acompanhamentos/${linked.body.id}`, undefined, sellerOther.token)).status, 404);

  const mine = await request("GET", "/acompanhamentos?visao=MINHA&tipo=RETORNO", undefined, sellerA.token);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.data.map((item) => item.id), [linked.body.id]);
  const overdue = await request("GET", "/acompanhamentos?visao=ATRASADOS", undefined, sellerA.token);
  assert.ok(overdue.body.data.some((item) => item.id === freeTask.body.id));

  const revision = linked.body.revisao;
  const concurrent = await Promise.all([
    request("PATCH", `/acompanhamentos/${linked.body.id}`, { titulo: "Retorno revisado A", revisao: revision }, sellerA.token),
    request("PATCH", `/acompanhamentos/${linked.body.id}`, { titulo: "Retorno revisado B", revisao: revision }, sellerA.token),
  ]);
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((response) => response.status === 409).length, 1, JSON.stringify(concurrent));
  let current = (await request("GET", `/acompanhamentos/${linked.body.id}`, undefined, sellerA.token)).body;

  const started = await request("POST", `/acompanhamentos/${current.id}/iniciar`, { revisao: current.revisao }, sellerA.token);
  assert.equal(started.status, 200);
  assert.equal(started.body.status, "EM_ANDAMENTO");
  const completed = await request("POST", `/acompanhamentos/${current.id}/concluir`, { revisao: started.body.revisao }, sellerA.token);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, "CONCLUIDO");
  assert.equal(completed.body.concluidoPorId, sellerA.usuarioId);
  const repeatedCompletion = await request("POST", `/acompanhamentos/${current.id}/concluir`, { revisao: started.body.revisao }, sellerA.token);
  assert.equal(repeatedCompletion.status, 200);
  assert.equal(repeatedCompletion.body.revisao, completed.body.revisao);

  const reopened = await request("POST", `/acompanhamentos/${current.id}/reabrir`, { revisao: completed.body.revisao }, managerA.token);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.status, "PENDENTE");
  const cancelled = await request("POST", `/acompanhamentos/${current.id}/cancelar`, { revisao: reopened.body.revisao, observacao: "Sem retorno agora" }, sellerA.token);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, "CANCELADO");
  assert.equal((await request("POST", `/acompanhamentos/${current.id}/concluir`, { revisao: cancelled.body.revisao }, sellerA.token)).status, 422);
  const reopenedAgain = await request("POST", `/acompanhamentos/${current.id}/reabrir`, { revisao: cancelled.body.revisao }, managerA.token);
  assert.equal(reopenedAgain.status, 200);
  const transferred = await request("PATCH", `/acompanhamentos/${current.id}`, { responsavelId: managerA.usuarioId, revisao: reopenedAgain.body.revisao, observacao: "Transferencia para gerente" }, managerA.token);
  assert.equal(transferred.status, 200);
  assert.equal(transferred.body.responsavelId, managerA.usuarioId);
  assert.equal((await request("PATCH", `/acompanhamentos/${current.id}`, { responsavelId: sellerOther.usuarioId, revisao: transferred.body.revisao }, sellerA.token)).status, 403);

  const history = await request("GET", `/acompanhamentos/${current.id}/historico`, undefined, managerA.token);
  assert.equal(history.status, 200);
  for (const action of ["CRIAR", "EDITAR", "INICIAR", "CONCLUIR", "REABRIR", "CANCELAR", "ALTERAR_RESPONSAVEL"]) assert.ok(history.body.data.some((entry) => entry.acao === action), `Historico sem ${action}`);
  assert.equal(history.body.data.filter((entry) => entry.acao === "CONCLUIR").length, 1);
  assert.ok(history.body.data.every((entry) => !String(entry.observacao || "").includes("\u0000")));

  const summary = await request("GET", "/acompanhamentos/resumo", undefined, managerA.token);
  assert.equal(summary.status, 200);
  assert.ok(summary.body.indicadores.atrasados >= 1);
  assert.deepEqual(await commercialInvariants(fixtureA), invariants);
  assert.equal(await prisma.negocio.count({ where: { empresaId: adminA.empresaId } }), 1);
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: adminA.empresaId } }), 0);
});

async function commercialFixture(account, responsavelId, suffix) {
  const client = await prisma.cliente.create({ data: { empresaId: account.empresaId, nome: `Cliente Agenda ${suffix}`, origem: "QA H4" } });
  const lead = await prisma.lead.create({ data: { empresaId: account.empresaId, clienteId: client.id, responsavelId, status: "CONVERTIDO", origem: "QA H4", interesse: "Agenda", convertidoEm: new Date() } });
  const business = await prisma.negocio.create({ data: { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, responsavelId, titulo: `Negocio Agenda ${suffix}`, etapa: "PROPOSTA" } });
  const proposal = await prisma.propostaComercial.create({ data: { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, negocioId: business.id, responsavelId, autorId: account.usuarioId, codigo: `PROP-H4-${suffix}`, titulo: `Proposta Agenda ${suffix}`, validade: futureDate() } });
  const channel = await prisma.canalIntegracao.create({ data: { empresaId: account.empresaId, tipo: "SITE_FORM", nome: `Canal Agenda ${suffix}`, chaveInterna: `agenda-${suffix.toLowerCase()}` } });
  const contact = await prisma.contatoCanal.create({ data: { empresaId: account.empresaId, canalIntegracaoId: channel.id, clienteId: client.id, externalId: `contato-${suffix}` } });
  const conversation = await prisma.conversaCanal.create({ data: { empresaId: account.empresaId, canalIntegracaoId: channel.id, contatoCanalId: contact.id, leadId: lead.id, responsavelId } });
  return { client, lead, business, proposal, conversation };
}

async function commercialInvariants(fixture) {
  return {
    client: await prisma.cliente.findUnique({ where: { id: fixture.client.id } }),
    lead: await prisma.lead.findUnique({ where: { id: fixture.lead.id } }),
    business: await prisma.negocio.findUnique({ where: { id: fixture.business.id } }),
    proposal: await prisma.propostaComercial.findUnique({ where: { id: fixture.proposal.id } }),
    messages: await prisma.mensagemCanal.count({ where: { conversaCanalId: fixture.conversation.id } }),
  };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaAgendaH4Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaAgendaH4Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function futureDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function pastDate() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) if (fs.existsSync(`${file}${suffix}`)) fs.rmSync(`${file}${suffix}`, { force: true });
}
