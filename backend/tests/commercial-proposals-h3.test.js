const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(os.tmpdir(), "crm-prisma-tests", "commercial-proposals-h3");
const databasePath = path.join(auditDir, `h3-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "commercial-proposals-h3-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "commercial-proposals-h3-encryption-key";
process.env.NEGOCIOS_KANBAN_ENABLED = "true";
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

test("H3 cria, calcula, versiona e protege propostas por tenant e concorrencia", async () => {
  const adminA = await registerAndLogin("Empresa Propostas H3 A", "Admin H3 A", "admin-a@h3.test");
  const adminB = await registerAndLogin("Empresa Propostas H3 B", "Admin H3 B", "admin-b@h3.test");
  const sellerA = await createUserAndLogin(adminA, "Vendedor H3 A", "seller-a@h3.test", "VENDEDOR");
  const sellerOther = await createUserAndLogin(adminA, "Vendedor H3 Outro", "seller-other@h3.test", "VENDEDOR");
  const fixtureA = await businessFixture(adminA, sellerA.usuarioId, "Cliente Proposta H3 A");
  const fixtureB = await businessFixture(adminB, adminB.usuarioId, "Cliente Proposta H3 B");
  const invariants = await invariantRows(fixtureA);

  const proposalService = require("../src/commercial-proposals/service").createCommercialProposalService({ prisma });
  await proposalService.listProposals({ empresaId: sellerOther.empresaId, usuarioId: sellerOther.usuarioId, papel: "VENDEDOR" }, { negocioId: String(fixtureA.business.id) });
  const emptyList = await request("GET", `/propostas?negocioId=${fixtureA.business.id}`, undefined, sellerOther.token);
  assert.equal(emptyList.status, 200, JSON.stringify(emptyList.body));
  assert.equal((await request("POST", `/negocios/${fixtureA.business.id}/propostas`, validProposal(), sellerOther.token)).status, 403);
  assert.equal((await request("GET", `/propostas?negocioId=${fixtureB.business.id}`, undefined, adminA.token)).status, 404);
  assert.equal((await request("POST", `/negocios/${fixtureB.business.id}/propostas`, validProposal(), adminA.token)).status, 404);

  assert.equal((await request("POST", `/negocios/${fixtureA.business.id}/propostas`, { ...validProposal(), empresaId: adminA.empresaId }, sellerA.token)).status, 422);
  assert.equal((await request("POST", `/negocios/${fixtureA.business.id}/propostas`, { ...validProposal(), validade: "2026-02-31" }, sellerA.token)).status, 422);
  assert.equal((await request("POST", `/negocios/${fixtureA.business.id}/propostas`, { ...validProposal(), itens: [{ descricao: "Item", quantidade: "0", valorUnitarioCentavos: 1000 }] }, sellerA.token)).status, 422);
  assert.equal((await request("POST", `/negocios/${fixtureA.business.id}/propostas`, { ...validProposal(), descontoGeralCentavos: 999999 }, sellerA.token)).status, 422);

  const created = await request("POST", `/negocios/${fixtureA.business.id}/propostas`, validProposal(), sellerA.token);
  assert.equal(created.status, 201);
  assert.match(created.body.codigo, /^PROP-\d{4}-\d{5}$/);
  assert.equal(created.body.status, "RASCUNHO");
  assert.equal(created.body.versao, 1);
  assert.equal(created.body.subtotalCentavos, 29000);
  assert.equal(created.body.totalCentavos, 27000);
  assert.equal(created.body.itens[0].subtotalCentavos, 25000);
  assert.equal(created.body.itens[0].totalCentavos, 24000);
  assert.equal(created.body.clienteId, fixtureA.client.id);
  assert.equal(created.body.leadId, fixtureA.lead.id);

  const listed = await request("GET", `/propostas?negocioId=${fixtureA.business.id}`, undefined, sellerA.token);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].id, created.body.id);

  const updatePayload = { ...validProposal(), titulo: "Proposta H3 revisada", revisao: created.body.revisao };
  const updated = await request("PATCH", `/propostas/${created.body.id}/rascunho`, updatePayload, sellerA.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.titulo, "Proposta H3 revisada");
  assert.equal(updated.body.revisao, 2);
  const stale = await request("PATCH", `/propostas/${created.body.id}/rascunho`, updatePayload, sellerA.token);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.codigo, "PROPOSAL_REVISION_CONFLICT");

  const concurrent = await Promise.all([
    request("POST", `/propostas/${created.body.id}/status`, { status: "PRONTA", revisao: 2 }, sellerA.token),
    request("POST", `/propostas/${created.body.id}/status`, { status: "CANCELADA", revisao: 2 }, sellerA.token),
  ]);
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1);
  assert.equal(concurrent.filter((response) => response.status === 409).length, 1);
  let current = (await request("GET", `/propostas/${created.body.id}`, undefined, sellerA.token)).body;

  if (current.status === "CANCELADA") {
    const immutable = await request("PATCH", `/propostas/${current.id}/rascunho`, { ...validProposal(), revisao: current.revisao }, sellerA.token);
    assert.equal(immutable.status, 409);
  } else {
    const invalidTransition = await request("POST", `/propostas/${current.id}/status`, { status: "VENCIDA", revisao: current.revisao }, sellerA.token);
    assert.equal(invalidTransition.status, 422);
  }

  const duplicated = await request("POST", `/propostas/${current.id}/duplicar-versao`, {}, sellerA.token);
  assert.equal(duplicated.status, 201);
  assert.equal(duplicated.body.versao, 2);
  assert.equal(duplicated.body.status, "RASCUNHO");
  assert.equal(duplicated.body.propostaOrigemId, current.id);
  assert.equal(duplicated.body.totalCentavos, current.totalCentavos);

  const ready = await request("POST", `/propostas/${duplicated.body.id}/status`, { status: "PRONTA", revisao: duplicated.body.revisao }, sellerA.token);
  assert.equal(ready.status, 200);
  const accepted = await request("POST", `/propostas/${duplicated.body.id}/status`, { status: "ACEITA", revisao: ready.body.revisao }, sellerA.token);
  assert.equal(accepted.status, 200);
  assert.equal((await request("PATCH", `/propostas/${accepted.body.id}/rascunho`, { ...validProposal(), revisao: accepted.body.revisao }, sellerA.token)).status, 409);

  const history = await request("GET", `/propostas/${duplicated.body.id}/historico`, undefined, sellerA.token);
  assert.equal(history.status, 200);
  assert.ok(history.body.data.some((entry) => entry.acao === "DUPLICAR_VERSAO"));
  assert.ok(history.body.data.some((entry) => entry.acao === "ALTERAR_STATUS" && entry.statusNovo === "ACEITA"));

  const pdf = await requestBinary("GET", `/propostas/${accepted.body.id}/pdf`, sellerA.token);
  assert.equal(pdf.status, 200);
  assert.match(pdf.contentType, /^application\/pdf/);
  assert.equal(pdf.body.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.body.toString("latin1"), /PROPOSTA COMERCIAL/);

  assert.deepEqual(await invariantRows(fixtureA), invariants);
  assert.equal(await prisma.propostaComercial.count({ where: { empresaId: adminA.empresaId } }), 2);
  assert.equal(await prisma.propostaComercial.count({ where: { empresaId: adminB.empresaId } }), 0);
  assert.equal(await prisma.negocio.count({ where: { id: fixtureA.business.id } }), 1);
});

function validProposal() {
  return {
    titulo: "Proposta H3 Pulverizador",
    descricao: "Configuracao comercial validada",
    validade: "2026-08-31",
    descontoGeralCentavos: 2000,
    condicoesComerciais: "Entrada e saldo na entrega",
    observacoes: "Frete a combinar",
    itens: [
      { descricao: "Pulverizador", quantidade: "2.5", valorUnitarioCentavos: 10000, descontoCentavos: 1000 },
      { descricao: "Instalacao", quantidade: "1", valorUnitarioCentavos: 5000, descontoCentavos: 0 },
    ],
  };
}

async function businessFixture(account, responsavelId, name) {
  const client = await prisma.cliente.create({ data: { empresaId: account.empresaId, nome: name, origem: "QA H3" } });
  const lead = await prisma.lead.create({ data: { empresaId: account.empresaId, clienteId: client.id, responsavelId, status: "CONVERTIDO", origem: "QA H3", interesse: "Pulverizador", convertidoEm: new Date() } });
  const business = await prisma.negocio.create({ data: { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, responsavelId, titulo: `Negocio ${name}`, etapa: "PROPOSTA", valor: 27000 } });
  return { client, lead, business };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaPropostasH3Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "NEGOCIOS_KANBAN", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaPropostasH3Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
}

async function invariantRows(fixture) {
  const [client, lead, business, messageCount] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: fixture.client.id } }),
    prisma.lead.findUnique({ where: { id: fixture.lead.id } }),
    prisma.negocio.findUnique({ where: { id: fixture.business.id } }),
    prisma.mensagemCanal.count(),
  ]);
  return { client, lead, business, messageCount };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function requestBinary(method, pathname, token) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: response.status, contentType: response.headers.get("content-type") || "", body: Buffer.from(await response.arrayBuffer()) };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
