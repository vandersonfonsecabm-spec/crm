const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { after, before, test } = require("node:test");

const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "g1-services");
const databasePath = path.join(auditDir, `g1-services-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "lead-to-business-g1-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "lead-to-business-g1-encryption-key";
process.env.LEADS_COMMUNICATION_ENABLED = "true";
process.env.SITE_LEAD_CAPTURE_ENABLED = "true";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.CRM_TEST_DATABASE_URL = process.env.DATABASE_URL;

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

test("G1 converte Lead uma vez com tenant, RBAC, auditoria e rollback transacional", async () => {
  const adminA = await registerAndLogin("Empresa G1 A", "Admin G1 A", "admin-a@g1.test");
  const adminB = await registerAndLogin("Empresa G1 B", "Admin G1 B", "admin-b@g1.test");
  const managerA = await createUserAndLogin(adminA, "Gerente G1 A", "gerente-a@g1.test", "GERENTE");
  const sellerA = await createUserAndLogin(adminA, "Vendedor G1 A", "vendedor-a@g1.test", "VENDEDOR");
  const sellerA2 = await createUserAndLogin(adminA, "Vendedor G1 A2", "vendedor-a2@g1.test", "VENDEDOR");

  const clientA = await createClient(adminA.empresaId, "Cliente G1 A", "Novo");
  const clientA2 = await createClient(adminA.empresaId, "Cliente G1 A2", "Contato");
  const clientB = await createClient(adminB.empresaId, "Cliente G1 B", "Proposta");

  const leadAdmin = await createLead(adminA, clientA.id, adminA.usuarioId, { origem: "SITE", interesse: "Pulverizador" });
  const baseline = await invariantCounts(adminA.empresaId);
  const conversion = await request("POST", `/leads/${leadAdmin.id}/converter-negocio`, {
    titulo: "Oportunidade QA G1",
    observacao: "Conversao controlada de teste.",
  }, adminA.token);
  assert.equal(conversion.status, 201);
  assert.equal(conversion.body.created, true);
  assert.equal(conversion.body.lead.status, "CONVERTIDO");
  assert.ok(conversion.body.lead.convertidoEm);
  assert.equal(conversion.body.negocio.leadId, leadAdmin.id);
  assert.equal(conversion.body.negocio.clienteId, clientA.id);
  assert.equal(conversion.body.negocio.empresaId, adminA.empresaId);
  assert.equal(conversion.body.negocio.responsavelId, adminA.usuarioId);
  assert.equal(conversion.body.negocio.convertidoPorId, adminA.usuarioId);
  assert.equal(conversion.body.negocio.convertidoPor.nome, "Admin G1 A");
  assert.equal(conversion.body.negocio.statusLeadAnterior, "NOVO");
  assert.equal(conversion.body.negocio.etapa, "NOVO");
  assert.equal(conversion.body.negocio.valor, null);
  assert.equal(conversion.body.negocio.titulo, "Oportunidade QA G1");
  assert.equal((await prisma.cliente.findUnique({ where: { id: clientA.id } })).status, "Novo");
  assert.deepEqual(await invariantCounts(adminA.empresaId), { ...baseline, negocio: baseline.negocio + 1 });

  const retry = await request("POST", `/leads/${leadAdmin.id}/converter-negocio`, {
    titulo: "Titulo de retry nao deve sobrescrever",
  }, adminA.token);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.negocio.id, conversion.body.negocio.id);
  assert.equal(retry.body.negocio.titulo, "Oportunidade QA G1");
  assert.equal(await prisma.negocio.count({ where: { leadId: leadAdmin.id } }), 1);

  const leadManager = await createLead(adminA, clientA2.id, sellerA.usuarioId);
  assert.equal((await request("POST", `/leads/${leadManager.id}/converter-negocio`, {}, managerA.token)).status, 201);

  const leadSeller = await createLead(adminA, clientA2.id, sellerA.usuarioId);
  assert.equal((await request("POST", `/leads/${leadSeller.id}/converter-negocio`, {}, sellerA.token)).status, 201);
  const leadOtherSeller = await createLead(adminA, clientA2.id, sellerA.usuarioId);
  assert.equal((await request("POST", `/leads/${leadOtherSeller.id}/converter-negocio`, {}, sellerA2.token)).status, 403);

  const leadB = await createLead(adminB, clientB.id, adminB.usuarioId);
  assert.equal((await request("POST", `/leads/${leadB.id}/converter-negocio`, {}, adminA.token)).status, 404);
  for (const payload of [{ empresaId: adminB.empresaId }, { clienteId: clientB.id }, { usuarioId: adminB.usuarioId }, { responsavelId: adminB.usuarioId }]) {
    const injectedLead = await createLead(adminA, clientA2.id, adminA.usuarioId);
    assert.equal((await request("POST", `/leads/${injectedLead.id}/converter-negocio`, payload, adminA.token)).status, 400);
  }

  const unassigned = await createLead(adminA, clientA2.id, null);
  const unassignedResponse = await request("POST", `/leads/${unassigned.id}/converter-negocio`, {}, adminA.token);
  assert.equal(unassignedResponse.status, 409);
  assert.equal(unassignedResponse.body.codigo, "LEAD_RESPONSIBLE_REQUIRED");
  assert.match(unassignedResponse.body.erro, /Assuma o Lead/);

  const disqualified = await createLead(adminA, clientA2.id, adminA.usuarioId);
  await prisma.lead.update({ where: { id: disqualified.id }, data: { status: "DESQUALIFICADO", desqualificadoEm: new Date() } });
  assert.equal((await request("POST", `/leads/${disqualified.id}/converter-negocio`, {}, adminA.token)).status, 409);

  const capabilityLead = await createLead(adminA, clientA2.id, adminA.usuarioId);
  await prisma.empresaFuncionalidade.update({
    where: { empresaId_chave: { empresaId: adminA.empresaId, chave: "LEADS_COMMUNICATION" } },
    data: { habilitada: false },
  });
  assert.equal((await request("POST", `/leads/${capabilityLead.id}/converter-negocio`, {}, adminA.token)).status, 404);
  assert.equal(await prisma.negocio.count({ where: { leadId: capabilityLead.id } }), 0);
  await prisma.empresaFuncionalidade.update({
    where: { empresaId_chave: { empresaId: adminA.empresaId, chave: "LEADS_COMMUNICATION" } },
    data: { habilitada: true },
  });
  process.env.LEADS_COMMUNICATION_ENABLED = "false";
  assert.equal((await request("POST", `/leads/${capabilityLead.id}/converter-negocio`, {}, adminA.token)).status, 404);
  process.env.LEADS_COMMUNICATION_ENABLED = "true";
  assert.equal(await prisma.negocio.count({ where: { leadId: capabilityLead.id } }), 0);

  const concurrentLead = await createLead(adminA, clientA2.id, adminA.usuarioId);
  const concurrent = await Promise.all([
    request("POST", `/leads/${concurrentLead.id}/converter-negocio`, { titulo: "Concorrente G1" }, adminA.token),
    request("POST", `/leads/${concurrentLead.id}/converter-negocio`, { titulo: "Concorrente G1" }, adminA.token),
  ]);
  assert.equal(await prisma.negocio.count({ where: { leadId: concurrentLead.id } }), 1);
  assert.ok(concurrent.some(({ status }) => status === 201));
  assert.ok(concurrent.every(({ status }) => [200, 201, 409].includes(status)));
  if (concurrent.some(({ status }) => status === 409)) {
    assert.equal((await request("POST", `/leads/${concurrentLead.id}/converter-negocio`, {}, adminA.token)).status, 200);
  }

  const rollbackLead = await createLead(adminA, clientA2.id, adminA.usuarioId);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "g1_force_rollback" BEFORE UPDATE OF "status" ON "Lead" WHEN NEW."id" = ${rollbackLead.id} AND NEW."status" = 'CONVERTIDO' BEGIN SELECT RAISE(ABORT, 'forced conversion failure'); END`);
  const failed = await request("POST", `/leads/${rollbackLead.id}/converter-negocio`, {}, adminA.token);
  assert.equal(failed.status, 500);
  assert.equal(await prisma.negocio.count({ where: { leadId: rollbackLead.id } }), 0);
  assert.equal((await prisma.lead.findUnique({ where: { id: rollbackLead.id } })).status, "NOVO");
  await prisma.$executeRawUnsafe('DROP TRIGGER "g1_force_rollback"');

  await assert.rejects(
    prisma.lead.create({ data: { empresaId: adminA.empresaId, clienteId: 99999999, status: "NOVO" } }),
    (error) => error?.code === "P2003",
  );

  const missingUserToken = jwt.sign({ usuarioId: 99999999 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  assert.equal((await request("POST", `/leads/${capabilityLead.id}/converter-negocio`, {}, missingUserToken)).status, 401);
  assert.equal((await request("POST", `/leads/${capabilityLead.id}/converter-negocio`, {})).status, 401);
});

async function invariantCounts(empresaId) {
  const [cliente, lead, negocio, conversa, mensagem, nota, acompanhamento] = await Promise.all([
    prisma.cliente.count({ where: { empresaId } }),
    prisma.lead.count({ where: { empresaId } }),
    prisma.negocio.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.notaInternaConversa.count({ where: { empresaId } }),
    prisma.acompanhamento.count({ where: { empresaId } }),
  ]);
  return { cliente, lead, negocio, conversa, mensagem, nota, acompanhamento };
}

async function createClient(empresaId, nome, status) {
  return prisma.cliente.create({
    data: { empresaId, nome, empresa: "QA G1", interesse: "", status, valor: 9876, origem: "QA G1" },
  });
}

async function createLead(admin, clienteId, responsavelId, extra = {}) {
  const response = await request("POST", "/leads", { clienteId, responsavelId, ...extra }, admin.token);
  assert.equal(response.status, 201);
  return response.body;
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaG1Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.createMany({
    data: [
      { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true },
      { empresaId: registration.body.empresa.id, chave: "SITE_LEAD_CAPTURE", habilitada: true },
    ],
  });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaG1Segura123";
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
