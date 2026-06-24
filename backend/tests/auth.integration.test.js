const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `auth-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
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

test("fundacao SaaS autentica, autoriza e preserva o token demo", async () => {
  const initialCompanies = await prisma.empresa.count();
  const initialUsers = await prisma.usuario.count();

  const registration = await request("POST", "/auth/register-company", {
    empresaNome: "  Fazenda QA Principal  ",
    adminNome: "  Administrador QA  ",
    email: "  ADMIN@QA.EXAMPLE  ",
    senha: "SenhaSegura123",
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.empresa.slug, "fazenda-qa-principal");
  assert.equal(registration.body.usuario.email, "admin@qa.example");
  assert.equal(registration.body.usuario.papel, "ADMIN");
  assert.equal(registration.body.usuario.senhaHash, undefined);
  assert.equal(await prisma.empresa.count(), initialCompanies + 1);
  assert.equal(await prisma.usuario.count(), initialUsers + 1);

  const storedAdmin = await prisma.usuario.findUnique({
    where: { id: registration.body.usuario.id },
  });
  assert.notEqual(storedAdmin.senhaHash, "SenhaSegura123");
  assert.equal(await bcrypt.compare("SenhaSegura123", storedAdmin.senhaHash), true);

  const duplicate = await request("POST", "/auth/register-company", {
    empresaNome: "Fazenda QA Principal",
    adminNome: "Outro Admin",
    email: "outro@qa.example",
    senha: "SenhaSegura123",
  });
  assert.equal(duplicate.status, 409);

  const unknown = await request("POST", "/auth/login", {
    email: "inexistente@qa.example",
    senha: "SenhaSegura123",
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.codigo, "AUTH_INVALID_CREDENTIALS");

  const wrongPassword = await request("POST", "/auth/login", {
    email: "admin@qa.example",
    senha: "senha-incorreta",
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.erro, unknown.body.erro);

  const login = await request("POST", "/auth/login", {
    email: "admin@qa.example",
    senha: "SenhaSegura123",
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.papel, "ADMIN");
  assert.ok(login.body.access_token);
  assert.ok(login.body.expires_at);
  const adminToken = login.body.access_token;

  const missingToken = await request("GET", "/auth/me");
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.body.codigo, "AUTH_TOKEN_REQUIRED");
  const invalidToken = await request("GET", "/auth/me", undefined, "token-invalido");
  assert.equal(invalidToken.status, 401);
  assert.equal(invalidToken.body.codigo, "AUTH_TOKEN_INVALID");
  const me = await request("GET", "/auth/me", undefined, adminToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.usuario.id, storedAdmin.id);
  assert.equal(me.body.empresa.id, storedAdmin.empresaId);

  const managerCreation = await request("POST", "/usuarios", {
    nome: "Gerente QA",
    email: "gerente@qa.example",
    senha: "SenhaGerente123",
    papel: "GERENTE",
  }, adminToken);
  assert.equal(managerCreation.status, 201);
  assert.equal(managerCreation.body.senhaHash, undefined);

  const managerLogin = await request("POST", "/auth/login", {
    email: "gerente@qa.example",
    senha: "SenhaGerente123",
  });
  const managerToken = managerLogin.body.access_token;
  const managerCreateAttempt = await request("POST", "/usuarios", {
    nome: "Nao Permitido",
    email: "nao-permitido@qa.example",
    senha: "SenhaValida123",
    papel: "VENDEDOR",
  }, managerToken);
  assert.equal(managerCreateAttempt.status, 403);

  const secondRegistration = await request("POST", "/auth/register-company", {
    empresaNome: "Empresa QA Isolada",
    adminNome: "Admin Isolado",
    email: "admin-isolado@qa.example",
    senha: "SenhaIsolada123",
  });
  assert.equal(secondRegistration.status, 201);
  const secondLogin = await request("POST", "/auth/login", {
    email: "admin-isolado@qa.example",
    senha: "SenhaIsolada123",
  });
  const secondToken = secondLogin.body.access_token;

  const usersFirstCompany = await request("GET", "/usuarios", undefined, adminToken);
  assert.equal(usersFirstCompany.status, 200);
  assert.equal(usersFirstCompany.body.data.some((user) => user.id === secondRegistration.body.usuario.id), false);
  const crossCompanyPatch = await request(
    "PATCH",
    `/usuarios/${secondRegistration.body.usuario.id}`,
    { papel: "VENDEDOR" },
    adminToken,
  );
  assert.equal(crossCompanyPatch.status, 404);

  const roleUpdate = await request(
    "PATCH",
    `/usuarios/${managerCreation.body.id}`,
    { papel: "VENDEDOR" },
    adminToken,
  );
  assert.equal(roleUpdate.status, 200);
  assert.equal(roleUpdate.body.papel, "VENDEDOR");

  const lastAdminAttempt = await request(
    "PATCH",
    `/usuarios/${storedAdmin.id}`,
    { ativo: false },
    adminToken,
  );
  assert.equal(lastAdminAttempt.status, 409);
  assert.equal(lastAdminAttempt.body.codigo, "LAST_ADMIN_REQUIRED");

  await prisma.usuario.update({ where: { id: managerCreation.body.id }, data: { ativo: false } });
  const inactiveUserLogin = await request("POST", "/auth/login", {
    email: "gerente@qa.example",
    senha: "SenhaGerente123",
  });
  assert.equal(inactiveUserLogin.status, 403);
  assert.equal(inactiveUserLogin.body.codigo, "USER_INACTIVE");

  await prisma.empresa.update({
    where: { id: secondRegistration.body.empresa.id },
    data: { ativo: false },
  });
  const inactiveCompanyLogin = await request("POST", "/auth/login", {
    email: "admin-isolado@qa.example",
    senha: "SenhaIsolada123",
  });
  assert.equal(inactiveCompanyLogin.status, 403);
  assert.equal(inactiveCompanyLogin.body.codigo, "COMPANY_INACTIVE");
  const inactiveCompanyMe = await request("GET", "/auth/me", undefined, secondToken);
  assert.equal(inactiveCompanyMe.status, 403);

  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 200);
  assert.equal(demo.body.access_token, "demo-sqlite-backend");
  const demoProtectedLegacy = await request(
    "POST",
    "/categorias-produtos",
    { nome: "" },
    demo.body.access_token,
  );
  assert.equal(demoProtectedLegacy.status, 400);
  const demoAdminBlocked = await request("GET", "/usuarios", undefined, demo.body.access_token);
  assert.equal(demoAdminBlocked.status, 403);
  const demoCompanyBlocked = await request(
    "POST",
    "/auth/register-company",
    {
      empresaNome: "Empresa Indevida",
      adminNome: "Demo",
      email: "demo-indevido@qa.example",
      senha: "SenhaValida123",
    },
    demo.body.access_token,
  );
  assert.equal(demoCompanyBlocked.status, 403);

  const health = await request("GET", "/health");
  const dashboard = await request("GET", "/dashboard");
  const clientes = await request("GET", "/clientes");
  const clienteId = clientes.body[0].id;
  const notas = await request("GET", `/clientes/${clienteId}/notas`);
  const acompanhamentos = await request("GET", "/acompanhamentos");
  const categorias = await request("GET", "/categorias-produtos");
  const produtos = await request("GET", "/produtos");
  const movimentacoes = await request("GET", "/estoque/movimentacoes");
  const estoqueResumo = await request("GET", "/estoque/resumo");
  assert.equal(health.status, 200);
  assert.equal(dashboard.status, 200);
  assert.equal(clientes.status, 200);
  assert.equal(notas.status, 200);
  assert.equal(acompanhamentos.status, 200);
  assert.equal(categorias.status, 200);
  assert.equal(produtos.status, 200);
  assert.equal(movimentacoes.status, 200);
  assert.equal(estoqueResumo.status, 200);
});

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
