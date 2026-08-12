const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "h6a-services");
const databasePath = path.join(auditDir, `h6a-services-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "business-stage-timing-h6a-test-secret-with-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "business-stage-timing-h6a-encryption-key",
  LEADS_COMMUNICATION_ENABLED: "true",
  SITE_LEAD_CAPTURE_ENABLED: "true",
  NEGOCIOS_KANBAN_ENABLED: "true",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
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

test("H6A registra movimentos, calcula tempos e deriva a proxima acao da Agenda", async () => {
  const adminA = await registerAndLogin("Empresa H6A A", "Admin H6A A", "admin-a@h6a.test", true);
  const adminB = await registerAndLogin("Empresa H6A B", "Admin H6A B", "admin-b@h6a.test", true);
  const managerA = await createUserAndLogin(adminA, "Gerente H6A", "gerente@h6a.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor H6A A", "vendedor-a@h6a.test", "VENDEDOR");
  const sellerB = await createUserAndLogin(adminA, "Vendedor H6A B", "vendedor-b@h6a.test", "VENDEDOR");

  const clientA = await prisma.cliente.create({ data: { empresaId: adminA.empresaId, nome: "Cliente H6A A", status: "Lead" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: adminB.empresaId, nome: "Cliente H6A B", status: "Lead" } });
  const leadA = await prisma.lead.create({ data: { empresaId: adminA.empresaId, clienteId: clientA.id, responsavelId: sellerA.usuarioId, status: "CONVERTIDO", convertidoEm: new Date() } });
  const leadB = await prisma.lead.create({ data: { empresaId: adminB.empresaId, clienteId: clientB.id, responsavelId: adminB.usuarioId, status: "CONVERTIDO", convertidoEm: new Date() } });
  const stageEntry = new Date(Date.now() - 20 * 60 * 1000);
  const businessA = await prisma.negocio.create({
    data: {
      empresaId: adminA.empresaId,
      clienteId: clientA.id,
      leadId: leadA.id,
      responsavelId: sellerA.usuarioId,
      titulo: "Negocio H6A A",
      etapa: "NOVO",
      etapaEntrouEm: stageEntry,
      ultimaMovimentacaoEm: stageEntry,
      createdAt: stageEntry,
      updatedAt: stageEntry,
    },
  });
  const businessB = await prisma.negocio.create({
    data: {
      empresaId: adminB.empresaId,
      clienteId: clientB.id,
      leadId: leadB.id,
      responsavelId: adminB.usuarioId,
      titulo: "Negocio H6A B",
      etapa: "NOVO",
    },
  });
  const baseline = await commercialSnapshot(adminA.empresaId, clientA.id, leadA.id, businessA.id);

  const withoutAction = await request("GET", `/negocios/${businessA.id}`, undefined, sellerB.token);
  assert.equal(withoutAction.status, 200);
  assert.equal(withoutAction.body.negocioParado, true);
  assert.equal(withoutAction.body.motivoParado, "SEM_PROXIMA_ACAO");
  assert.ok(withoutAction.body.tempoEtapa.atualSegundos >= 1195);
  assert.equal(withoutAction.body.tempoEtapa.estimado, false);

  const actionDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const action = await request("POST", "/acompanhamentos", {
    negocioId: businessA.id,
    titulo: "Retornar proposta H6A",
    dataHora: actionDate.toISOString(),
    prioridade: "ALTA",
    tipo: "RETORNO",
    responsavelId: sellerA.usuarioId,
  }, adminA.token);
  assert.equal(action.status, 201);

  const withAction = await request("GET", `/negocios/${businessA.id}`, undefined, sellerA.token);
  assert.equal(withAction.status, 200);
  assert.equal(withAction.body.proximaAcao.id, action.body.id);
  assert.equal(withAction.body.proximaAcao.titulo, "Retornar proposta H6A");
  assert.equal(withAction.body.negocioParado, false);

  const moved = await request("PATCH", `/negocios/${businessA.id}/etapa`, { etapa: "CONTATO", etapaAnterior: "NOVO" }, sellerA.token);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.etapa, "CONTATO");
  assert.ok(moved.body.etapaEntrouEm);
  assert.ok(moved.body.ultimaMovimentacaoEm);
  assert.ok(moved.body.tempoEtapa.atualSegundos <= 2);
  assert.ok(moved.body.tempoEtapa.acumuladoSegundos >= 1195);

  const history = await request("GET", `/negocios/${businessA.id}/historico-etapas`, undefined, managerA.token);
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].etapaAnterior, "NOVO");
  assert.equal(history.body.data[0].etapaNova, "CONTATO");
  assert.equal(history.body.data[0].duracaoEtapaEstimada, false);
  assert.ok(history.body.data[0].duracaoEtapaSegundos >= 1195);
  assert.equal(history.body.data[0].autor.id, sellerA.usuarioId);

  const overdue = await request("PATCH", `/acompanhamentos/${action.body.id}`, {
    revisao: action.body.revisao,
    dataHora: new Date(Date.now() - 60 * 1000).toISOString(),
  }, adminA.token);
  assert.equal(overdue.status, 200);
  const stalled = await request("GET", `/negocios/${businessA.id}`, undefined, sellerA.token);
  assert.equal(stalled.body.proximaAcao.id, action.body.id);
  assert.equal(stalled.body.proximaAcao.atrasada, true);
  assert.equal(stalled.body.negocioParado, true);
  assert.equal(stalled.body.motivoParado, "PROXIMA_ACAO_ATRASADA");

  assert.equal((await request("PATCH", `/negocios/${businessA.id}/etapa`, { etapa: "PROPOSTA", etapaAnterior: "CONTATO" }, sellerB.token)).status, 403);
  assert.equal((await request("GET", `/negocios/${businessB.id}`, undefined, adminA.token)).status, 404);
  assert.equal((await request("GET", `/negocios/${businessB.id}/historico-etapas`, undefined, adminA.token)).status, 404);
  assert.equal((await request("PATCH", `/negocios/${businessA.id}/etapa`, { etapa: "INVALIDA", etapaAnterior: "CONTATO" }, adminA.token)).status, 400);
  assert.equal((await request("PATCH", `/negocios/${businessA.id}/etapa`, { empresaId: adminB.empresaId, etapa: "PROPOSTA", etapaAnterior: "CONTATO" }, adminA.token)).status, 400);

  const concurrent = await Promise.all([
    request("PATCH", `/negocios/${businessA.id}/etapa`, { etapa: "PROPOSTA", etapaAnterior: "CONTATO" }, adminA.token),
    request("PATCH", `/negocios/${businessA.id}/etapa`, { etapa: "FECHADO", etapaAnterior: "CONTATO" }, managerA.token),
  ]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);
  const afterConcurrent = await prisma.negocio.findUnique({ where: { id: businessA.id } });
  const movementCount = await prisma.historicoAtribuicao.count({
    where: { empresaId: adminA.empresaId, negocioId: businessA.id, tipo: "MOVIMENTAR_ETAPA" },
  });
  assert.ok(["PROPOSTA", "FECHADO"].includes(afterConcurrent.etapa));
  assert.equal(movementCount, 2);

  await prisma.acompanhamento.update({ where: { id: action.body.id }, data: { status: "CONCLUIDO", concluidoEm: new Date() } });
  await prisma.negocio.update({ where: { id: businessA.id }, data: { etapa: "FECHADO", fechadoEm: new Date() } });
  const closed = await request("GET", `/negocios/${businessA.id}`, undefined, adminA.token);
  assert.equal(closed.body.proximaAcao, null);
  assert.equal(closed.body.negocioParado, false);

  const finalSnapshot = await commercialSnapshot(adminA.empresaId, clientA.id, leadA.id, businessA.id);
  assert.deepEqual(withoutFollowUpProjection(finalSnapshot.cliente), withoutFollowUpProjection(baseline.cliente));
  assert.notEqual(finalSnapshot.cliente.proximoFollowUp, baseline.cliente.proximoFollowUp);
  assert.equal(finalSnapshot.cliente.revisao, baseline.cliente.revisao + 2);
  assert.deepEqual(finalSnapshot.lead, baseline.lead);
  assert.equal(finalSnapshot.messages, baseline.messages);
  assert.equal(finalSnapshot.negocios, baseline.negocios);
  assert.equal(finalSnapshot.acompanhamentos, baseline.acompanhamentos + 1);
});

test("H6A inicializa a entrada da etapa ao converter Lead pelo servico oficial", async () => {
  const account = await registerAndLogin("Empresa H6A Conversao", "Admin H6A Conversao", "conversao@h6a.test", true);
  const seller = await createUserAndLogin(account, "Vendedor Conversao H6A", "vendedor-conversao@h6a.test", "VENDEDOR");
  const client = await prisma.cliente.create({ data: { empresaId: account.empresaId, nome: "Cliente Conversao H6A" } });
  const lead = await prisma.lead.create({
    data: {
      empresaId: account.empresaId,
      clienteId: client.id,
      responsavelId: seller.usuarioId,
      status: "QUALIFICADO",
      interesse: "Implemento",
    },
  });
  const converted = await request("POST", `/leads/${lead.id}/converter-negocio`, { titulo: "Conversao H6A" }, seller.token);
  assert.equal(converted.status, 201);
  assert.ok(converted.body.negocio.etapaEntrouEm);
  assert.ok(converted.body.negocio.ultimaMovimentacaoEm);
  assert.equal(converted.body.negocio.etapa, "NOVO");
});

async function commercialSnapshot(empresaId, clienteId, leadId, negocioId) {
  const [cliente, lead, messages, negocios, acompanhamentos] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId } }),
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.negocio.count({ where: { empresaId } }),
    prisma.acompanhamento.count({ where: { empresaId, negocioId } }),
  ]);
  return { cliente, lead, messages, negocios, acompanhamentos };
}

function withoutFollowUpProjection(client) {
  const stable = { ...client };
  delete stable.proximoFollowUp;
  delete stable.revisao;
  return stable;
}

async function registerAndLogin(empresaNome, adminNome, email, enableKanban) {
  const senha = "SenhaH6ASegura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  if (enableKanban) {
    await prisma.empresaFuncionalidade.createMany({
      data: [
        { empresaId: registration.body.empresa.id, chave: "NEGOCIOS_KANBAN", habilitada: true },
        { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true },
      ],
    });
  }
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaH6ASegura123";
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

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}
