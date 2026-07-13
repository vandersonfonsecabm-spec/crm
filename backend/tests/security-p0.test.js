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

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = jwtSecret;
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;
let primaryCompany;
let secondaryCompany;
let primaryAdmin;
let primarySeller;
let inactiveUser;
let secondaryAdmin;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  api = require("../src/server");
  prisma = api.prisma;

  primaryCompany = await prisma.empresa.create({
    data: { nome: "Tenant Primario P0", slug: `security-primary-${process.pid}` },
  });
  secondaryCompany = await prisma.empresa.create({
    data: { nome: "Tenant Secundario P0", slug: `security-secondary-${process.pid}` },
  });
  primaryAdmin = await createUser(primaryCompany.id, "Admin Primario P0", `admin-${process.pid}@security.test`, "ADMIN");
  primarySeller = await createUser(primaryCompany.id, "Vendedor Primario P0", `seller-${process.pid}@security.test`, "VENDEDOR");
  inactiveUser = await createUser(primaryCompany.id, "Usuario Inativo P0", `inactive-${process.pid}@security.test`, "VENDEDOR", false);
  secondaryAdmin = await createUser(secondaryCompany.id, "Admin Secundario P0", `admin-secondary-${process.pid}@security.test`, "ADMIN");

  await prisma.cliente.createMany({
    data: [
      { empresaId: primaryCompany.id, nome: "Cliente exclusivo primario" },
      { empresaId: secondaryCompany.id, nome: "Cliente exclusivo secundario" },
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

test("P0: autenticacao normal, tenant e estoque permanecem protegidos", async () => {
  const removedEndpoint = await request("POST", "/auth/demo");
  assert.equal(removedEndpoint.status, 404);
  assert.equal(typeof removedEndpoint.body, "string");
  assert.doesNotMatch(removedEndpoint.body, /access_token|codigo/i);

  const rejectedLegacyToken = await request("GET", "/clientes", undefined, "demo-sqlite-backend");
  assert.equal(rejectedLegacyToken.status, 401);

  const missingCredentials = await request("POST", "/auth/login", {
    email: `missing-${process.pid}@security.test`,
    senha: "SenhaNormalSegura123",
  });
  assert.equal(missingCredentials.status, 401);

  const invalidPassword = await request("POST", "/auth/login", {
    email: primaryAdmin.email,
    senha: "SenhaIncorreta123",
  });
  assert.equal(invalidPassword.status, 401);

  const inactiveLogin = await request("POST", "/auth/login", {
    email: inactiveUser.email,
    senha: "SenhaNormalSegura123",
  });
  assert.equal(inactiveLogin.status, 403);
  assert.equal(inactiveLogin.body.codigo, "USER_INACTIVE");

  const adminLogin = await login(primaryAdmin.email);
  const sellerLogin = await login(primarySeller.email);
  const secondaryLogin = await login(secondaryAdmin.email);
  const decoded = jwt.verify(adminLogin.body.access_token, jwtSecret, tokenOptions());
  assert.deepEqual(
    Object.keys(decoded).sort(),
    ["aud", "empresaId", "exp", "iat", "iss", "papel", "sub"],
  );
  assert.equal(decoded.empresaId, primaryCompany.id);

  const unauthenticated = await request("GET", "/clientes");
  assert.equal(unauthenticated.status, 401);

  const primaryClients = await request("GET", "/clientes", undefined, adminLogin.body.access_token);
  assert.equal(primaryClients.status, 200);
  assert.deepEqual(primaryClients.body.map((client) => client.nome), ["Cliente exclusivo primario"]);

  const secondaryClients = await request("GET", "/clientes", undefined, secondaryLogin.body.access_token);
  assert.equal(secondaryClients.status, 200);
  assert.deepEqual(secondaryClients.body.map((client) => client.nome), ["Cliente exclusivo secundario"]);

  const adminUsers = await request("GET", "/usuarios", undefined, adminLogin.body.access_token);
  assert.equal(adminUsers.status, 200);
  const sellerUsers = await request("GET", "/usuarios", undefined, sellerLogin.body.access_token);
  assert.equal(sellerUsers.status, 403);

  const missingUser = await request("GET", "/clientes", undefined, signedToken(999999, primaryCompany.id));
  assert.equal(missingUser.status, 401);
  const missingCompany = await request("GET", "/clientes", undefined, signedToken(primarySeller.id, 999999));
  assert.equal(missingCompany.status, 401);
  const missingTenant = await request("GET", "/clientes", undefined, signedToken(primarySeller.id, undefined));
  assert.equal(missingTenant.status, 401);
  const invalidLink = await request("GET", "/clientes", undefined, signedToken(primarySeller.id, secondaryCompany.id));
  assert.equal(invalidLink.status, 401);
  const unsupportedClaim = await request(
    "GET",
    "/clientes",
    undefined,
    signedToken(primarySeller.id, primaryCompany.id, { legacyContext: true }),
  );
  assert.equal(unsupportedClaim.status, 401);

  const legacyPaths = [
    "/categorias-produtos",
    "/produtos",
    "/produtos/1",
    "/estoque/movimentacoes",
    "/estoque/resumo",
  ];
  for (const pathname of legacyPaths) {
    const withoutToken = await request("GET", pathname);
    assert.equal(withoutToken.status, 401);
    const withToken = await request("GET", pathname, undefined, adminLogin.body.access_token);
    assert.equal(withToken.status, 410);
    assert.equal(withToken.body.codigo, "LEGACY_INVENTORY_DISABLED");
  }

  const legacyWrite = await request("POST", "/estoque/ajustes", { produtoId: 1, quantidade: 1 }, adminLogin.body.access_token);
  assert.equal(legacyWrite.status, 410);
  assert.equal(legacyWrite.body.codigo, "LEGACY_INVENTORY_DISABLED");

  const primaryStock = await request("GET", "/hub/produtos", undefined, adminLogin.body.access_token);
  const secondaryStock = await request("GET", "/hub/produtos", undefined, secondaryLogin.body.access_token);
  assert.equal(primaryStock.status, 200);
  assert.equal(secondaryStock.status, 200);
  assert.deepEqual(primaryStock.body.data, []);
  assert.deepEqual(secondaryStock.body.data, []);
});

async function createUser(empresaId, nome, email, papel, ativo = true) {
  return prisma.usuario.create({
    data: {
      empresaId,
      nome,
      email,
      senhaHash: await bcrypt.hash("SenhaNormalSegura123", 12),
      papel,
      ativo,
    },
  });
}

async function login(email) {
  const response = await request("POST", "/auth/login", {
    email,
    senha: "SenhaNormalSegura123",
  });
  assert.equal(response.status, 200);
  return response;
}

function signedToken(usuarioId, empresaId, extraClaims = {}) {
  return jwt.sign(
    {
      ...(empresaId === undefined ? {} : { empresaId }),
      papel: "VENDEDOR",
      ...extraClaims,
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
  let parsed = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed || null };
}
