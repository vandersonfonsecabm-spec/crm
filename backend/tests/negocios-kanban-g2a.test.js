const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "g2a-services");
const databasePath = path.join(auditDir, `g2a-services-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "negocios-kanban-g2a-test-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "negocios-kanban-g2a-encryption-key",
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

test("G2A aplica rollout duplo, tenant, RBAC e lock sem alterar entidades legadas", async () => {
  const adminA = await registerAndLogin("Empresa G2A A", "Admin G2A A", "admin-a@g2a.test", true);
  const adminB = await registerAndLogin("Empresa G2A B", "Admin G2A B", "admin-b@g2a.test", true);
  const control = await registerAndLogin("Empresa G2A Controle", "Admin Controle", "controle@g2a.test", false);
  const managerA = await createUserAndLogin(adminA, "Gerente G2A", "gerente@g2a.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor G2A A", "vendedor-a@g2a.test", "VENDEDOR");
  const sellerB = await createUserAndLogin(adminA, "Vendedor G2A B", "vendedor-b@g2a.test", "VENDEDOR");

  const clienteA = await prisma.cliente.create({ data: { empresaId: adminA.empresaId, nome: "Cliente Negocio A", empresa: "Fazenda A", status: "Proposta", valor: 3210 } });
  const clienteSemNegocio = await prisma.cliente.create({ data: { empresaId: adminA.empresaId, nome: "Cliente legado sem Negocio", status: "Fechado", valor: 9999 } });
  const clienteB = await prisma.cliente.create({ data: { empresaId: adminB.empresaId, nome: "Cliente Negocio B", status: "Novo", valor: 4567 } });
  const leadA = await prisma.lead.create({ data: { empresaId: adminA.empresaId, clienteId: clienteA.id, responsavelId: sellerA.usuarioId, status: "CONVERTIDO", convertidoEm: new Date(), origem: "SITE" } });
  const leadSemConversao = await prisma.lead.create({ data: { empresaId: adminA.empresaId, clienteId: clienteSemNegocio.id, responsavelId: sellerB.usuarioId, status: "NOVO", origem: "MANUAL" } });
  const leadB = await prisma.lead.create({ data: { empresaId: adminB.empresaId, clienteId: clienteB.id, responsavelId: adminB.usuarioId, status: "CONVERTIDO", convertidoEm: new Date() } });
  const negocioA = await prisma.negocio.create({ data: { empresaId: adminA.empresaId, clienteId: clienteA.id, leadId: leadA.id, responsavelId: sellerA.usuarioId, etapa: "NOVO", titulo: "Pulverizador G2A", valor: 1234 } });
  const negocioB = await prisma.negocio.create({ data: { empresaId: adminB.empresaId, clienteId: clienteB.id, leadId: leadB.id, responsavelId: adminB.usuarioId, etapa: "PROPOSTA", titulo: "Trator G2A B" } });
  const baseline = await legacySnapshot(adminA.empresaId, clienteA.id, leadA.id);

  assert.equal((await request("GET", "/negocios", undefined, control.token)).status, 404);
  assert.equal((await request("GET", "/negocios", undefined)).status, 401);
  assert.equal((await request("GET", "/negocios?empresaId=999", undefined, adminA.token)).status, 400);

  const listed = await request("GET", "/negocios?q=Pulverizador&etapa=NOVO", undefined, sellerB.token);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].id, negocioA.id);
  assert.equal(listed.body.data[0].cliente.nome, clienteA.nome);
  assert.equal(listed.body.data[0].permissoes.movimentar, false);
  assert.equal(listed.body.pagination.total, 1);
  assert.equal(listed.body.resumo.total, 1);
  assert.equal(listed.body.resumo.porEtapa.NOVO, 1);
  assert.equal(listed.body.data.some((item) => item.cliente.id === clienteSemNegocio.id), false);
  assert.equal(listed.body.data.some((item) => item.leadId === leadSemConversao.id), false);
  assert.equal((await request("GET", "/negocios", undefined, adminA.token)).status, 200);
  assert.equal((await request("GET", "/negocios", undefined, managerA.token)).status, 200);
  assert.equal((await request("GET", `/negocios/${negocioB.id}`, undefined, adminA.token)).status, 404);

  assert.equal((await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "CONTATO", etapaAnterior: "NOVO" }, sellerB.token)).status, 403);
  const moved = await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "CONTATO", etapaAnterior: "NOVO" }, sellerA.token);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.etapa, "CONTATO");
  const stale = await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "PROPOSTA", etapaAnterior: "NOVO" }, managerA.token);
  assert.equal(stale.status, 409);
  assert.equal((await prisma.negocio.findUnique({ where: { id: negocioA.id } })).etapa, "CONTATO");

  const managerMove = await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "PROPOSTA", etapaAnterior: "CONTATO" }, managerA.token);
  assert.equal(managerMove.status, 200);
  assert.equal(managerMove.body.etapa, "PROPOSTA");
  assert.equal((await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "INVALIDA", etapaAnterior: "PROPOSTA" }, adminA.token)).status, 400);

  await prisma.$executeRawUnsafe(`CREATE TRIGGER "g2a_force_rollback" BEFORE UPDATE OF "etapa" ON "Negocio" WHEN NEW."id" = ${negocioA.id} AND NEW."etapa" = 'FECHADO' BEGIN SELECT RAISE(ABORT, 'forced stage failure'); END`);
  assert.equal((await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "FECHADO", etapaAnterior: "PROPOSTA" }, adminA.token)).status, 500);
  assert.equal((await prisma.negocio.findUnique({ where: { id: negocioA.id } })).etapa, "PROPOSTA");
  await prisma.$executeRawUnsafe('DROP TRIGGER "g2a_force_rollback"');

  const adminMove = await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "FECHADO", etapaAnterior: "PROPOSTA" }, adminA.token);
  assert.equal(adminMove.status, 200);
  const concurrent = await Promise.all([
    request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "PERDIDO", etapaAnterior: "FECHADO" }, adminA.token),
    request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "PERDIDO", etapaAnterior: "FECHADO" }, managerA.token),
  ]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await prisma.negocio.findUnique({ where: { id: negocioA.id } })).etapa, "PERDIDO");
  assert.deepEqual(await legacySnapshot(adminA.empresaId, clienteA.id, leadA.id), baseline);

  process.env.NEGOCIOS_KANBAN_ENABLED = "false";
  const beforeDisabled = await prisma.negocio.findUnique({ where: { id: negocioA.id } });
  assert.equal((await request("GET", "/negocios", undefined, adminA.token)).status, 404);
  assert.equal((await request("PATCH", `/negocios/${negocioA.id}/etapa`, { etapa: "FECHADO", etapaAnterior: "PROPOSTA" }, adminA.token)).status, 404);
  assert.deepEqual(await prisma.negocio.findUnique({ where: { id: negocioA.id } }), beforeDisabled);
  process.env.NEGOCIOS_KANBAN_ENABLED = "true";

  await prisma.negocio.update({ where: { id: negocioA.id }, data: { legacyClienteId: clienteA.id } });
  const secondLead = await prisma.lead.create({ data: { empresaId: adminA.empresaId, clienteId: clienteA.id, status: "CONVERTIDO", convertidoEm: new Date() } });
  await assert.rejects(
    prisma.negocio.create({ data: { empresaId: adminA.empresaId, clienteId: clienteA.id, leadId: secondLead.id, legacyClienteId: clienteA.id, etapa: "NOVO" } }),
    (error) => error?.code === "P2002",
  );
});

async function legacySnapshot(empresaId, clienteId, leadId) {
  const [cliente, lead, conversa, mensagem, nota, acompanhamento] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { status: true, valor: true } }),
    prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, responsavelId: true } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.notaInternaConversa.count({ where: { empresaId } }),
    prisma.acompanhamento.count({ where: { empresaId } }),
  ]);
  return { cliente, lead, conversa, mensagem, nota, acompanhamento };
}

async function registerAndLogin(empresaNome, adminNome, email, enableKanban) {
  const senha = "SenhaG2ASegura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  if (enableKanban) {
    await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "NEGOCIOS_KANBAN", habilitada: true } });
  }
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaG2ASegura123";
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
