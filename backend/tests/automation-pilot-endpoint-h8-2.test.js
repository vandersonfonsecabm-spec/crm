const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const runDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "automation-pilot-h8-2");
const databasePath = path.join(runDir, `automation-pilot-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "automation-pilot-h8-2-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  AUTOMATIONS_ENABLED: "true",
});
delete process.env.AUTOMATION_PILOT_TRIGGER_ENABLED;
delete process.env.PLATFORM_ADMIN_EMAILS;

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
  delete process.env.AUTOMATION_PILOT_TRIGGER_ENABLED;
  delete process.env.PLATFORM_ADMIN_EMAILS;
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("H8.2 endpoint piloto exige gate, operador e payload fechado", async () => {
  const operator = await register("Operador H82", "Operador H82", "operator-h82@platform.test");
  const control = await register("Controle H82", "Controle H82", "control-h82@platform.test");
  process.env.PLATFORM_ADMIN_EMAILS = "operator-h82@platform.test";

  await enableAutomations(operator);
  await enableAutomations(control);
  const rule = await request("POST", "/automacoes", {
    nome: "Piloto H82",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "PILOT_H82", resumo: "Evento tecnico de teste." }],
  }, operator.token);
  assert.equal(rule.status, 201);
  const activation = await request("POST", `/automacoes/${rule.body.id}/ativar`, undefined, operator.token);
  assert.equal(activation.status, 200, JSON.stringify(activation.body));

  assert.equal((await request("POST", "/automacoes/piloto/eventos", validPayload("gate-off"), operator.token)).status, 404);
  process.env.AUTOMATION_PILOT_TRIGGER_ENABLED = "true";

  assert.equal((await request("POST", "/automacoes/piloto/eventos", validPayload("no-auth"))).status, 401);
  assert.equal((await request("POST", "/automacoes/piloto/eventos", validPayload("not-operator"), control.token)).status, 403);
  assert.equal((await request("POST", "/automacoes/piloto/eventos", { ...validPayload("extra"), tenantId: operator.empresaId }, operator.token)).status, 422);
  assert.equal((await request("POST", "/automacoes/piloto/eventos", { ...validPayload("bad-type"), eventType: "DEAL_STALLED" }, operator.token)).status, 422);
  assert.equal((await request("POST", "/automacoes/piloto/eventos", { ...validPayload("secret"), payload: { name: "Lead", origin: "PILOT", token: "nao-registrar" } }, operator.token)).status, 422);

  const accepted = await request("POST", "/automacoes/piloto/eventos", validPayload("h8-2-endpoint-001"), operator.token);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.createdJobs, 1);
  assert.equal(JSON.stringify(accepted.body).includes("token"), false);
  assert.equal((await request("POST", "/automacoes/piloto/eventos", validPayload("h8-2-endpoint-001"), operator.token)).status, 409);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: operator.empresaId } }), 1);
  assert.equal(await prisma.lead.count({ where: { empresaId: operator.empresaId } }), 0);
  assert.equal(await prisma.cliente.count({ where: { empresaId: operator.empresaId } }), 0);
});

async function register(empresaNome, adminNome, email) {
  const senha = "SenhaH82Segura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function enableAutomations(account) {
  await prisma.empresaFuncionalidade.create({
    data: { empresaId: account.empresaId, chave: "AUTOMATIONS", habilitada: true, habilitadoEm: new Date(), habilitadoPorUsuarioId: account.usuarioId },
  });
}

function validPayload(key) {
  return {
    eventType: "LEAD_CREATED",
    sourceType: "PILOT_SYNTHETIC",
    sourceId: key,
    idempotencyKey: key,
    payload: { name: "Lead Sintetico H8.2", origin: "PILOT" },
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
  const contentType = response.headers.get("content-type") || "";
  return { status: response.status, body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null };
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
