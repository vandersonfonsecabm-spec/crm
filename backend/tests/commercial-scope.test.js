const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `commercial-scope-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "commercial-scope-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.ALLOW_DEMO_MODE = "false";
process.env.INTEGRATION_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("nucleo comercial isola clientes, notas, acompanhamentos e funil por empresa", async () => {
  const beforeCounts = await coreCounts();
  const beforeChannelCounts = await channelCounts();

  const companyA = await registerCompany("Empresa Comercial A", "admin-a@comercial.test");
  const companyB = await registerCompany("Empresa Comercial B", "admin-b@comercial.test");
  const tokenA = companyA.token;
  const tokenB = companyB.token;

  const manager = await request("POST", "/usuarios", {
    nome: "Gerente Comercial A",
    email: "gerente-a@comercial.test",
    senha: "SenhaGerente123",
    papel: "GERENTE",
  }, tokenA);
  assert.equal(manager.status, 201);
  const seller = await request("POST", "/usuarios", {
    nome: "Vendedor Comercial A",
    email: "vendedor-a@comercial.test",
    senha: "SenhaVendedor123",
    papel: "VENDEDOR",
  }, tokenA);
  assert.equal(seller.status, 201);

  const managerLogin = await login("gerente-a@comercial.test", "SenhaGerente123");
  const sellerLogin = await login("vendedor-a@comercial.test", "SenhaVendedor123");

  const clientA = await createClient(tokenA, "Cliente Empresa A", "Novo", 1500);
  const clientB = await createClient(tokenB, "Cliente Empresa B", "Proposta", 7000);
  assert.equal(clientA.body.empresaId, companyA.empresa.id);
  assert.equal(clientB.body.empresaId, companyB.empresa.id);

  const clientWithTenant = await request("POST", "/clientes", {
    empresaId: companyB.empresa.id,
    nome: "Cliente Tenant Indevido",
  }, tokenA);
  assert.equal(clientWithTenant.status, 400);

  const clientQueryTenant = await request("GET", "/clientes?empresaId=999", undefined, tokenA);
  assert.equal(clientQueryTenant.status, 400);

  const listA = await request("GET", "/clientes", undefined, tokenA);
  assert.equal(listA.status, 200);
  assert.ok(listA.body.some((cliente) => cliente.id === clientA.body.id));
  assert.equal(listA.body.some((cliente) => cliente.id === clientB.body.id), false);

  const listB = await request("GET", "/clientes", undefined, tokenB);
  assert.equal(listB.body.some((cliente) => cliente.id === clientB.body.id), true);
  assert.equal(listB.body.some((cliente) => cliente.id === clientA.body.id), false);

  const readCrossClient = await request("GET", `/clientes/${clientB.body.id}/notas`, undefined, tokenA);
  assert.equal(readCrossClient.status, 404);

  const patchCrossClient = await request("PATCH", `/clientes/${clientB.body.id}`, { status: "Fechado" }, tokenA);
  assert.equal(patchCrossClient.status, 404);
  const preservedClientB = await prisma.cliente.findUnique({ where: { id: clientB.body.id } });
  assert.equal(preservedClientB.status, "Proposta");

  const deleteCrossClient = await request("DELETE", `/clientes/${clientB.body.id}`, undefined, tokenA);
  assert.equal(deleteCrossClient.status, 404);
  assert.equal(await prisma.cliente.count({ where: { id: clientB.body.id } }), 1);

  const updatedClientA = await request("PATCH", `/clientes/${clientA.body.id}`, { status: "Contato", quente: true }, tokenA);
  assert.equal(updatedClientA.status, 200);
  assert.equal(updatedClientA.body.status, "Contato");

  const noteA = await request("POST", `/clientes/${clientA.body.id}/notas`, {
    texto: "Nota isolada da empresa A",
    tipo: "nota",
  }, tokenA);
  assert.equal(noteA.status, 200);
  assert.equal(noteA.body.empresaId, companyA.empresa.id);

  const noteTenant = await request("POST", `/clientes/${clientA.body.id}/notas`, {
    empresaId: companyB.empresa.id,
    texto: "Nota com tenant externo",
  }, tokenA);
  assert.equal(noteTenant.status, 400);

  const crossNoteCreate = await request("POST", `/clientes/${clientB.body.id}/notas`, {
    texto: "Nota cruzada indevida",
  }, tokenA);
  assert.equal(crossNoteCreate.status, 404);

  const noteB = await request("POST", `/clientes/${clientB.body.id}/notas`, {
    texto: "Nota isolada da empresa B",
    tipo: "nota",
  }, tokenB);
  assert.equal(noteB.status, 200);
  const notesA = await request("GET", `/clientes/${clientA.body.id}/notas`, undefined, tokenA);
  assert.equal(notesA.status, 200);
  assert.ok(notesA.body.some((nota) => nota.id === noteA.body.id));
  assert.equal(notesA.body.some((nota) => nota.id === noteB.body.id), false);

  const crossNoteDelete = await request("DELETE", `/clientes/${clientB.body.id}/notas/${noteB.body.id}`, undefined, tokenA);
  assert.equal(crossNoteDelete.status, 404);
  assert.equal(await prisma.nota.count({ where: { id: noteB.body.id } }), 1);

  const scheduleA = await createSchedule(tokenA, clientA.body.id, "Agenda empresa A");
  assert.equal(scheduleA.status, 201);
  assert.equal(scheduleA.body.clienteId, clientA.body.id);
  const storedScheduleA = await prisma.acompanhamento.findUnique({ where: { id: scheduleA.body.id } });
  assert.equal(storedScheduleA.empresaId, companyA.empresa.id);

  const scheduleTenant = await request("POST", "/acompanhamentos", {
    empresaId: companyB.empresa.id,
    clienteId: clientA.body.id,
    titulo: "Agenda com tenant externo",
    dataHora: futureDate(),
  }, tokenA);
  assert.equal(scheduleTenant.status, 400);

  const crossScheduleCreate = await createSchedule(tokenA, clientB.body.id, "Agenda cruzada");
  assert.equal(crossScheduleCreate.status, 404);

  const scheduleB = await createSchedule(tokenB, clientB.body.id, "Agenda empresa B");
  assert.equal(scheduleB.status, 201);
  const schedulesA = await request("GET", "/acompanhamentos", undefined, tokenA);
  assert.equal(schedulesA.status, 200);
  assert.ok(schedulesA.body.data.some((item) => item.id === scheduleA.body.id));
  assert.equal(schedulesA.body.data.some((item) => item.id === scheduleB.body.id), false);

  const crossSchedulePatch = await request("PATCH", `/acompanhamentos/${scheduleB.body.id}`, {
    titulo: "Alteracao cruzada",
  }, tokenA);
  assert.equal(crossSchedulePatch.status, 404);

  const agendaSummaryA = await request("GET", "/acompanhamentos/resumo", undefined, tokenA);
  assert.equal(agendaSummaryA.status, 200);
  assert.ok(agendaSummaryA.body.proximos.every((item) => item.clienteId !== clientB.body.id));

  const dashboardA = await request("GET", "/dashboard", undefined, tokenA);
  const dashboardB = await request("GET", "/dashboard", undefined, tokenB);
  assert.equal(dashboardA.status, 200);
  assert.equal(dashboardB.status, 200);
  assert.equal(dashboardA.body.indicadores.clientes, 1);
  assert.equal(dashboardB.body.indicadores.clientes, 1);
  assert.equal(dashboardA.body.pedidosRecentes.some((cliente) => cliente.id === clientB.body.id), false);
  assert.equal(dashboardB.body.pedidosRecentes.some((cliente) => cliente.id === clientA.body.id), false);

  const funnelA = await request("GET", "/clientes", undefined, tokenA);
  assert.equal(funnelA.status, 200);
  assert.ok(funnelA.body.some((cliente) => cliente.id === clientA.body.id && cliente.status === "Contato"));
  assert.equal(funnelA.body.some((cliente) => cliente.id === clientB.body.id), false);

  const managerClient = await createClient(managerLogin.body.access_token, "Cliente Gerente A", "Novo", 500);
  assert.equal(managerClient.status, 200);
  assert.equal(managerClient.body.empresaId, companyA.empresa.id);
  const sellerList = await request("GET", "/clientes", undefined, sellerLogin.body.access_token);
  assert.equal(sellerList.status, 200);

  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 404);
  assert.equal(demo.body.codigo, "DEMO_DISABLED");

  const noteRelation = await prisma.nota.findUnique({
    where: { id: noteA.body.id },
    include: { cliente: true },
  });
  assert.equal(noteRelation.empresaId, noteRelation.cliente.empresaId);
  const scheduleRelation = await prisma.acompanhamento.findUnique({
    where: { id: scheduleA.body.id },
    include: { cliente: true },
  });
  assert.equal(scheduleRelation.empresaId, scheduleRelation.cliente.empresaId);

  assert.deepEqual(await channelCounts(), beforeChannelCounts);
  assert.equal((await coreCounts()).cliente, beforeCounts.cliente + 3);
});

async function registerCompany(nome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome: nome,
    adminNome: `Admin ${nome}`,
    email,
    senha: "SenhaComercial123",
  });
  assert.equal(registration.status, 201);
  const loginResponse = await login(email);
  return {
    empresa: registration.body.empresa,
    usuario: registration.body.usuario,
    token: loginResponse.body.access_token,
  };
}

async function login(email, senha = "SenhaComercial123") {
  const response = await request("POST", "/auth/login", {
    email,
    senha,
  });
  assert.equal(response.status, 200);
  return response;
}

async function createClient(token, nome, status, valor) {
  return request("POST", "/clientes", {
    nome,
    telefone: "11999990000",
    email: `${nome.toLowerCase().replace(/\s+/g, "-")}@example.test`,
    empresa: "Empresa ficticia",
    interesse: "Teste comercial",
    status,
    valor,
    origem: "Teste",
    tags: ["qa"],
  }, token);
}

async function createSchedule(token, clienteId, titulo) {
  return request("POST", "/acompanhamentos", {
    clienteId,
    titulo,
    descricao: "Acompanhamento ficticio",
    dataHora: futureDate(),
    prioridade: "MEDIA",
    tipo: "LIGACAO",
    responsavel: "QA",
  }, token);
}

function futureDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function coreCounts() {
  return {
    cliente: await prisma.cliente.count(),
    nota: await prisma.nota.count(),
    acompanhamento: await prisma.acompanhamento.count(),
  };
}

async function channelCounts() {
  return {
    canalIntegracao: await prisma.canalIntegracao.count(),
    contatoCanal: await prisma.contatoCanal.count(),
    conversaCanal: await prisma.conversaCanal.count(),
    mensagemCanal: await prisma.mensagemCanal.count(),
  };
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}
