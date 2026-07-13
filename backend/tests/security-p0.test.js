const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `security-p0-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");
const jwtSecret = "security-p0-test-secret-with-sufficient-entropy";
const demoCompanySlug = `security-demo-${process.pid}`;
const demoUserEmail = `demo-${process.pid}@security.test`;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = jwtSecret;
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.ALLOW_DEMO_MODE = "true";
process.env.DEMO_COMPANY_SLUG = demoCompanySlug;
process.env.DEMO_USER_EMAIL = demoUserEmail;
process.env.DEMO_JWT_EXPIRES_IN = "15m";
process.env.INTEGRATION_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;
let demoCompany;
let demoUser;
let realCompany;
let realUser;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  api = require("../src/server");
  prisma = api.prisma;

  demoCompany = await prisma.empresa.create({
    data: { nome: "Tenant Demo P0", slug: demoCompanySlug },
  });
  demoUser = await prisma.usuario.create({
    data: {
      empresaId: demoCompany.id,
      nome: "Usuario Demo P0",
      email: demoUserEmail,
      senhaHash: await bcrypt.hash("SenhaDemoNaoPublica123", 12),
      papel: "VENDEDOR",
    },
  });
  realCompany = await prisma.empresa.create({
    data: { nome: "Tenant Real P0", slug: `security-real-${process.pid}` },
  });
  realUser = await prisma.usuario.create({
    data: {
      empresaId: realCompany.id,
      nome: "Admin Real P0",
      email: `admin-${process.pid}@security.test`,
      senhaHash: await bcrypt.hash("SenhaRealSegura123", 12),
      papel: "ADMIN",
    },
  });
  await prisma.cliente.createMany({
    data: [
      { empresaId: demoCompany.id, nome: "Cliente exclusivo do demo" },
      { empresaId: realCompany.id, nome: "Cliente exclusivo real" },
    ],
  });

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

test("P0: demo usa tenant dedicado, e somente leitura, e estoque global fica inacessivel", async () => {
  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 200);
  assert.notEqual(demo.body.access_token, "demo-sqlite-backend");
  assert.equal(demo.body.isDemo, true);
  assert.equal(demo.body.empresa.id, demoCompany.id);
  assert.equal(demo.body.usuario.id, demoUser.id);
  assert.equal(demo.body.papel, "VENDEDOR");

  const decodedDemo = jwt.verify(demo.body.access_token, jwtSecret, tokenOptions());
  assert.equal(decodedDemo.demo, true);
  assert.equal(decodedDemo.empresaId, demoCompany.id);
  assert.ok(decodedDemo.exp - decodedDemo.iat <= 15 * 60);

  const demoMe = await request("GET", "/auth/me", undefined, demo.body.access_token);
  assert.equal(demoMe.status, 200);
  assert.equal(demoMe.body.isDemo, true);
  assert.equal(demoMe.body.empresa.id, demoCompany.id);

  const demoClients = await request("GET", "/clientes", undefined, demo.body.access_token);
  assert.equal(demoClients.status, 200);
  assert.deepEqual(demoClients.body.map((client) => client.nome), ["Cliente exclusivo do demo"]);

  const beforeDemoClients = await prisma.cliente.count({ where: { empresaId: demoCompany.id } });
  const demoCreate = await request("POST", "/clientes", { nome: "Escrita indevida" }, demo.body.access_token);
  assert.equal(demoCreate.status, 403);
  assert.equal(demoCreate.body.codigo, "DEMO_READ_ONLY");
  assert.equal(await prisma.cliente.count({ where: { empresaId: demoCompany.id } }), beforeDemoClients);

  const demoAdmin = await request("GET", "/usuarios", undefined, demo.body.access_token);
  assert.equal(demoAdmin.status, 403);
  const demoRegistration = await request("POST", "/auth/register-company", {
    empresaNome: "Empresa indevida",
    adminNome: "Demo",
    email: "demo-registration@security.test",
    senha: "SenhaValida123",
  }, demo.body.access_token);
  assert.equal(demoRegistration.status, 403);
  const demoPasswordLogin = await request("POST", "/auth/login", {
    email: demoUser.email,
    senha: "SenhaDemoNaoPublica123",
  });
  assert.equal(demoPasswordLogin.status, 401);
  assert.equal(demoPasswordLogin.body.codigo, "AUTH_INVALID_CREDENTIALS");

  const oldToken = await request("GET", "/clientes", undefined, "demo-sqlite-backend");
  assert.equal(oldToken.status, 401);

  const missingUserToken = signedToken(999999, demoCompany.id);
  const missingUser = await request("GET", "/clientes", undefined, missingUserToken);
  assert.equal(missingUser.status, 401);
  const missingCompanyToken = signedToken(demoUser.id, 999999);
  const missingCompany = await request("GET", "/clientes", undefined, missingCompanyToken);
  assert.equal(missingCompany.status, 401);
  const missingTenantToken = signedToken(demoUser.id, undefined);
  const missingTenant = await request("GET", "/clientes", undefined, missingTenantToken);
  assert.equal(missingTenant.status, 401);

  const normalLogin = await request("POST", "/auth/login", {
    email: realUser.email,
    senha: "SenhaRealSegura123",
  });
  assert.equal(normalLogin.status, 200);
  assert.equal(normalLogin.body.isDemo, undefined);
  const realToken = normalLogin.body.access_token;
  const realClients = await request("GET", "/clientes", undefined, realToken);
  assert.equal(realClients.status, 200);
  assert.deepEqual(realClients.body.map((client) => client.nome), ["Cliente exclusivo real"]);

  const legacyPaths = [
    "/categorias-produtos",
    "/produtos",
    "/produtos/1",
    "/estoque/movimentacoes",
    "/estoque/resumo",
  ];
  for (const pathname of legacyPaths) {
    const unauthenticated = await request("GET", pathname);
    assert.equal(unauthenticated.status, 401);
    const authenticated = await request("GET", pathname, undefined, realToken);
    assert.equal(authenticated.status, 410);
    assert.equal(authenticated.body.codigo, "LEGACY_INVENTORY_DISABLED");
  }

  const legacyWrite = await request("POST", "/estoque/ajustes", { produtoId: 1, quantidade: 1 }, realToken);
  assert.equal(legacyWrite.status, 410);
  assert.equal(legacyWrite.body.codigo, "LEGACY_INVENTORY_DISABLED");

  const canonicalStock = await request("GET", "/hub/produtos", undefined, realToken);
  assert.equal(canonicalStock.status, 200);
  assert.deepEqual(canonicalStock.body.data, []);

  await prisma.usuario.update({ where: { id: demoUser.id }, data: { ativo: false } });
  const inactiveDemo = await request("POST", "/auth/demo");
  assert.equal(inactiveDemo.status, 403);
  assert.equal(inactiveDemo.body.codigo, "DEMO_CONTEXT_INVALID");
  const inactiveDemoToken = await request("GET", "/clientes", undefined, demo.body.access_token);
  assert.equal(inactiveDemoToken.status, 403);
  assert.equal(inactiveDemoToken.body.codigo, "USER_INACTIVE");
});

function signedToken(usuarioId, empresaId) {
  return jwt.sign(
    {
      ...(empresaId === undefined ? {} : { empresaId }),
      papel: "VENDEDOR",
    },
    jwtSecret,
    {
      subject: String(usuarioId),
      expiresIn: "15m",
      ...tokenOptions(),
    },
  );
}

function tokenOptions() {
  return {
    issuer: "crm-agro-saas-api",
    audience: "crm-agro-saas",
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
