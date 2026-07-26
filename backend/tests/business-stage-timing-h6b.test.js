const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const runDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "h6b-contracts");
const databasePath = path.join(runDir, `h6b-contracts-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "business-stage-timing-h6b-test-secret-with-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "business-stage-timing-h6b-encryption-key",
  LEADS_COMMUNICATION_ENABLED: "true",
  NEGOCIOS_KANBAN_ENABLED: "true",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
});

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync(runDir, { recursive: true });
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

test("H6B pagina o historico em ordem estavel e preserva o tenant", async () => {
  const accountA = await registerAndLogin("Empresa H6B A", "Admin H6B A", "admin-a@h6b.test");
  const accountB = await registerAndLogin("Empresa H6B B", "Admin H6B B", "admin-b@h6b.test");
  const clientA = await prisma.cliente.create({ data: { empresaId: accountA.empresaId, nome: "Cliente H6B A" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: accountB.empresaId, nome: "Cliente H6B B" } });
  const businessA = await createBusiness(accountA, clientA.id, "Historico H6B");
  const businessB = await createBusiness(accountB, clientB.id, "Outro tenant H6B");
  const start = new Date("2026-07-01T12:00:00.000Z");

  await prisma.historicoAtribuicao.createMany({
    data: Array.from({ length: 10 }, (_, index) => ({
      empresaId: accountA.empresaId,
      negocioId: businessA.id,
      alteradoPorId: accountA.usuarioId,
      tipo: "MOVIMENTAR_ETAPA",
      origem: "MANUAL",
      etapaAnterior: index % 2 === 0 ? "NOVO" : "CONTATO",
      etapaNova: index % 2 === 0 ? "CONTATO" : "NOVO",
      etapaEntrouEm: new Date(start.getTime() + index * 60000),
      etapaSaiuEm: new Date(start.getTime() + (index + 1) * 60000),
      duracaoEtapaSegundos: 60,
      duracaoEtapaEstimada: false,
      createdAt: new Date(start.getTime() + index * 60000),
    })),
  });

  const first = await request("GET", `/negocios/${businessA.id}/historico-etapas?page=1&limit=4`, accountA.token);
  const second = await request("GET", `/negocios/${businessA.id}/historico-etapas?page=2&limit=4`, accountA.token);
  const third = await request("GET", `/negocios/${businessA.id}/historico-etapas?page=3&limit=4`, accountA.token);

  assert.equal(first.status, 200);
  assert.deepEqual(first.body.pagination, { total: 10, page: 1, limit: 4, totalPages: 3 });
  assert.equal(first.body.data.length, 4);
  assert.equal(second.body.data.length, 4);
  assert.equal(third.body.data.length, 2);
  const ids = [...first.body.data, ...second.body.data, ...third.body.data].map((entry) => entry.id);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(ids, [...ids].sort((left, right) => left - right));

  assert.equal((await request("GET", `/negocios/${businessB.id}/historico-etapas`, accountA.token)).status, 404);
  assert.equal((await request("GET", `/negocios/${businessA.id}/historico-etapas?empresaId=${accountB.empresaId}`, accountA.token)).status, 400);
});

test("H6B filtra a lista paginada com as regras calculadas pela H6A", async () => {
  const account = await registerAndLogin("Empresa Filtros H6B", "Admin Filtros H6B", "filtros@h6b.test");
  const client = await prisma.cliente.create({ data: { empresaId: account.empresaId, nome: "Cliente Filtros H6B" } });
  const withoutAction = await createBusiness(account, client.id, "Sem proxima acao");
  const overdue = await createBusiness(account, client.id, "Acao atrasada");
  const today = await createBusiness(account, client.id, "Acao hoje");
  const future = await createBusiness(account, client.id, "Acao futura");
  const terminal = await createBusiness(account, client.id, "Encerrado sem acao", "FECHADO");
  const now = new Date();

  await prisma.acompanhamento.createMany({
    data: [
      followUp(account, overdue.id, "Atrasada", new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      followUp(account, today.id, "Hoje", new Date(now.getTime() + 5 * 60 * 1000)),
      followUp(account, future.id, "Futura", new Date(now.getTime() + 48 * 60 * 60 * 1000)),
    ],
  });

  const stopped = await filtered(account.token, "PARADOS");
  assert.deepEqual(new Set(stopped), new Set([withoutAction.id, overdue.id]));
  assert.ok(!stopped.includes(terminal.id));
  assert.deepEqual(await filtered(account.token, "SEM_PROXIMA_ACAO"), [withoutAction.id]);
  assert.deepEqual(await filtered(account.token, "PROXIMA_ACAO_ATRASADA"), [overdue.id]);
  assert.deepEqual(await filtered(account.token, "PROXIMA_ACAO_HOJE"), [today.id]);
  assert.equal((await request("GET", "/negocios?filtroOperacional=INVENTADO", account.token)).status, 400);
});

async function filtered(token, filter) {
  const response = await request("GET", `/negocios?limit=100&filtroOperacional=${filter}`, token);
  assert.equal(response.status, 200);
  return response.body.data.map((business) => business.id).sort((left, right) => left - right);
}

function followUp(account, negocioId, titulo, dataHora) {
  return {
    empresaId: account.empresaId,
    negocioId,
    responsavelId: account.usuarioId,
    autorId: account.usuarioId,
    titulo,
    dataHora,
    prioridade: "MEDIA",
    status: "PENDENTE",
    tipo: "RETORNO",
  };
}

async function createBusiness(account, clienteId, titulo, etapa = "NOVO") {
  return prisma.negocio.create({
    data: {
      empresaId: account.empresaId,
      clienteId,
      responsavelId: account.usuarioId,
      titulo,
      etapa,
      etapaEntrouEm: new Date(),
      ultimaMovimentacaoEm: new Date(),
    },
  });
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaH6BSegura123";
  const registration = await request("POST", "/auth/register-company", undefined, undefined, {
    empresaNome,
    adminNome,
    email,
    senha,
  });
  assert.equal(registration.status, 201);
  await prisma.empresaFuncionalidade.createMany({
    data: [
      { empresaId: registration.body.empresa.id, chave: "NEGOCIOS_KANBAN", habilitada: true },
      { empresaId: registration.body.empresa.id, chave: "LEADS_COMMUNICATION", habilitada: true },
    ],
  });
  const login = await request("POST", "/auth/login", undefined, undefined, { email, senha });
  assert.equal(login.status, 200);
  return {
    empresaId: registration.body.empresa.id,
    token: login.body.access_token,
    usuarioId: registration.body.usuario.id,
  };
}

async function request(method, pathname, token, headers, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
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
