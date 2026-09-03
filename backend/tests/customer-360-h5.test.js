const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(os.tmpdir(), "crm-prisma-tests", "customer-360-h5");
const databasePath = path.join(auditDir, `h5-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "customer-360-h5-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "customer-360-h5-encryption-key";
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

test("H5 entrega cadastro, resumo, compras e timeline reais por tenant", async () => {
  const adminA = await registerAndLogin("Empresa Cliente 360 A", "Admin Cliente 360 A", "admin-a@h5.test");
  const adminB = await registerAndLogin("Empresa Cliente 360 B", "Admin Cliente 360 B", "admin-b@h5.test");
  const sellerA = await createUserAndLogin(adminA, "Vendedor Cliente 360", "seller@h5.test", "VENDEDOR");
  const fixture = await customerFixture(adminA, sellerA.usuarioId);
  const otherClient = await prisma.cliente.create({ data: { empresaId: adminB.empresaId, nome: "Cliente externo H5", origem: "QA H5" } });

  assert.equal((await request("GET", `/clientes/${fixture.client.id}/360`)).status, 401);
  assert.equal((await request("GET", `/clientes/${otherClient.id}/360`, undefined, sellerA.token)).status, 404);
  assert.equal((await request("GET", `/clientes/${fixture.client.id}/360?empresaId=${adminB.empresaId}`, undefined, adminA.token)).status, 422);

  const overview = await request("GET", `/clientes/${fixture.client.id}/360`, undefined, sellerA.token);
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.equal(overview.body.cliente.cidade, "Campinas");
  assert.equal(overview.body.cliente.estado, "SP");
  assert.equal(overview.body.resumo.leadsAtivos, 1);
  assert.equal(overview.body.resumo.negociosAtivos, 1);
  assert.equal(overview.body.resumo.propostasAtivas, 1);
  assert.equal(overview.body.resumo.mensagens, 2);
  assert.equal(overview.body.comprasAnteriores.length, 1);
  assert.equal(overview.body.comprasAnteriores[0].id, fixture.sale.id);
  assert.equal(overview.body.comprasAnteriores[0].negocioId, fixture.closedBusiness.id);
  assert.equal(overview.body.comprasAnteriores[0].totalCentavos, 125000);
  assert.equal(overview.body.comprasAnteriores[0].origem, "MANUAL_CLOSE");
  assert.equal(overview.body.resumo.totalVendidoCentavos, 125000);
  assert.equal(overview.body.contexto.negocio.id, fixture.activeBusiness.id);

  const timeline = await request("GET", `/clientes/${fixture.client.id}/timeline?limit=4&page=1`, undefined, sellerA.token);
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  assert.equal(timeline.body.data.length, 4);
  assert.ok(timeline.body.paginacao.total >= 9);
  assert.ok(timeline.body.data.every((item) => item.origem && item.origem.entidade));
  for (let index = 1; index < timeline.body.data.length; index += 1) {
    assert.ok(new Date(timeline.body.data[index - 1].data).getTime() >= new Date(timeline.body.data[index].data).getTime());
  }

  const calls = await request("GET", `/clientes/${fixture.client.id}/timeline?tipo=LIGACAO`, undefined, adminA.token);
  assert.equal(calls.status, 200);
  assert.deepEqual(calls.body.data.map((item) => item.tipo), ["LIGACAO"]);
  const messages = await request("GET", `/clientes/${fixture.client.id}/timeline?tipo=MENSAGEM`, undefined, adminA.token);
  assert.equal(messages.body.data.length, 2);
  assert.ok(messages.body.data.every((item) => item.navegacao.destino === "INBOX"));
  const sales = await request("GET", `/clientes/${fixture.client.id}/timeline?tipo=VENDA`, undefined, adminA.token);
  assert.equal(sales.body.data.length, 1);
  assert.equal(sales.body.data[0].valorCentavos, 125000);
  assert.equal((await request("GET", `/clientes/${fixture.client.id}/timeline?tipo=INVENTADO`, undefined, adminA.token)).status, 422);

  const originalRevision = overview.body.cliente.revisao;
  const concurrent = await Promise.all([
    request("PATCH", `/clientes/${fixture.client.id}/cadastro`, { cidade: "Sao Paulo", estado: "SP", cpfCnpj: "52998224725", revisao: originalRevision }, adminA.token),
    request("PATCH", `/clientes/${fixture.client.id}/cadastro`, { cidade: "Ribeirao Preto", estado: "SP", cpfCnpj: "11222333000181", revisao: originalRevision }, sellerA.token),
  ]);
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((response) => response.status === 409).length, 1, JSON.stringify(concurrent));
  const updated = await prisma.cliente.findUnique({ where: { id: fixture.client.id } });
  assert.equal(updated.revisao, originalRevision + 1);
  assert.ok(["52998224725", "11222333000181"].includes(updated.cpfCnpj));
  assert.equal((await request("PATCH", `/clientes/${fixture.client.id}/cadastro`, { estado: "S", revisao: updated.revisao }, adminA.token)).status, 422);
  assert.equal((await request("PATCH", `/clientes/${fixture.client.id}/cadastro`, { cpfCnpj: "11111111111", revisao: updated.revisao }, adminA.token)).status, 422);
  assert.equal((await request("PATCH", `/clientes/${fixture.client.id}/cadastro`, { empresaId: adminB.empresaId, revisao: updated.revisao }, adminA.token)).status, 422);
  const updatedResponse = concurrent.find((response) => response.status === 200);
  assert.equal(updatedResponse.body.status, "Novo");
  assert.equal(updatedResponse.body.valor, null);
  assert.equal(updatedResponse.body.valorInformado, false);

  assert.equal(await prisma.negocio.count({ where: { empresaId: adminA.empresaId } }), 2);
  assert.equal(await prisma.lead.count({ where: { empresaId: adminA.empresaId } }), 1);
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: adminA.empresaId } }), 2);
});

async function customerFixture(account, responsavelId) {
  const client = await prisma.cliente.create({
    data: {
      empresaId: account.empresaId,
      nome: "Cliente 360 H5",
      telefone: "11999990000",
      email: "cliente@h5.test",
      empresa: "Fazenda Horizonte",
      cidade: "Campinas",
      estado: "SP",
      origem: "Site",
    },
  });
  const lead = await prisma.lead.create({ data: { empresaId: account.empresaId, clienteId: client.id, responsavelId, status: "QUALIFICADO", origem: "SITE", interesse: "Plantio" } });
  const activeBusiness = await prisma.negocio.create({ data: { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, responsavelId, titulo: "Renovacao de maquinario", etapa: "PROPOSTA", valor: 85000 } });
  const closedBusiness = await prisma.negocio.create({ data: { empresaId: account.empresaId, clienteId: client.id, responsavelId, titulo: "Negocio fechado sem valor informado", etapa: "FECHADO", valor: null, fechadoEm: new Date(Date.now() - 20 * 86400000) } });
  const sale = await prisma.vendaCanonica.create({ data: { empresaId: account.empresaId, negocioId: closedBusiness.id, clienteId: client.id, origem: "MANUAL_CLOSE", subtotalCentavos: 125000, descontoCentavos: 0, totalCentavos: 125000, etapaAbertaAnterior: "PROPOSTA", revisao: 1, idempotencyKey: "h5-canonical-sale", requestFingerprint: "h5-canonical-sale-fingerprint", fechadoEm: closedBusiness.fechadoEm, fechadoPorId: account.usuarioId } });
  await prisma.negocioContratoVenda.create({ data: { empresaId: account.empresaId, negocioId: closedBusiness.id, vendaAtivaId: sale.id, revisao: 2 } });
  await prisma.historicoVendaCanonica.create({ data: { empresaId: account.empresaId, vendaId: sale.id, negocioId: closedBusiness.id, autorId: account.usuarioId, acao: "CREATE", statusNovo: "ACTIVE" } });
  const proposal = await prisma.propostaComercial.create({ data: { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, negocioId: activeBusiness.id, responsavelId, autorId: account.usuarioId, codigo: "PROP-H5-001", titulo: "Proposta de renovacao", descricao: "Equipamentos para a proxima safra", validade: new Date(Date.now() + 10 * 86400000), totalCentavos: 8500000, status: "PRONTA" } });
  await prisma.acompanhamento.createMany({ data: [
    { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, negocioId: activeBusiness.id, responsavelId, autorId: account.usuarioId, titulo: "Ligacao de alinhamento", descricao: "Confirmar condicoes", dataHora: new Date(Date.now() - 3600000), tipo: "LIGACAO", status: "CONCLUIDO" },
    { empresaId: account.empresaId, clienteId: client.id, leadId: lead.id, negocioId: activeBusiness.id, responsavelId, autorId: account.usuarioId, titulo: "Visita tecnica", descricao: "Avaliar estrutura", dataHora: new Date(Date.now() + 86400000), tipo: "VISITA", status: "PENDENTE" },
  ] });
  await prisma.nota.create({ data: { empresaId: account.empresaId, clienteId: client.id, texto: "Cliente prefere contato pela manha.", tipo: "nota" } });
  const channel = await prisma.canalIntegracao.create({ data: { empresaId: account.empresaId, tipo: "SITE_FORM", nome: "Formulario H5", chaveInterna: "customer-360-h5" } });
  const contact = await prisma.contatoCanal.create({ data: { empresaId: account.empresaId, canalIntegracaoId: channel.id, clienteId: client.id, externalId: "customer-360-contact" } });
  const conversation = await prisma.conversaCanal.create({ data: { empresaId: account.empresaId, canalIntegracaoId: channel.id, contatoCanalId: contact.id, leadId: lead.id, responsavelId } });
  await prisma.mensagemCanal.createMany({ data: [
    { empresaId: account.empresaId, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, externalId: "h5-inbound", direcao: "ENTRADA", texto: "Tenho interesse na renovacao.", simulada: true },
    { empresaId: account.empresaId, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, autorUsuarioId: responsavelId, externalId: "h5-outbound", direcao: "SAIDA", texto: "Vamos preparar a proposta.", simulada: true },
  ] });
  await prisma.historicoQualificacaoConversa.create({ data: { empresaId: account.empresaId, conversaCanalId: conversation.id, clienteId: client.id, leadId: lead.id, negocioId: activeBusiness.id, autorId: account.usuarioId, acao: "QUALIFICAR", interesse: "Renovacao", prioridade: "ALTA", proximaAcao: "Validar proposta" } });
  return { client, lead, activeBusiness, closedBusiness, sale, proposal, conversation };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaCustomer360H5Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaCustomer360H5Segura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
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

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) if (fs.existsSync(`${file}${suffix}`)) fs.rmSync(`${file}${suffix}`, { force: true });
}
