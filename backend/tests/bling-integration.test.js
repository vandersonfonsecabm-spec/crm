const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { decryptCredentials } = require("../src/integrations/crypto");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `bling-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "bling-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "bling-test-encryption-key-with-32-bytes";
process.env.BLING_CLIENT_ID = "client-id-test";
process.env.BLING_CLIENT_SECRET = "client-secret-test";
process.env.BLING_REDIRECT_URI = "https://api.test/integracoes/bling/callback";
process.env.BLING_TIMEOUT_MS = "200";
process.env.BLING_MAX_PAGES = "2";
process.env.BLING_PAGE_SIZE = "2";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;
let originalFetch;
let fetchCalls = [];

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  originalFetch = global.fetch;
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = originalFetch;
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("Bling OAuth bloqueia perfis, usa state persistente e criptografa tokens", async () => {
  const admin = await registerAndLogin("Empresa Bling A", "Admin Bling A", "admin-bling-a@test.local");
  const gerente = await createUserAndLogin(admin.token, "Gerente Bling", "gerente-bling@test.local", "GERENTE");
  const vendedor = await createUserAndLogin(admin.token, "Vendedor Bling", "vendedor-bling@test.local", "VENDEDOR");
  const demo = await request("POST", "/auth/demo");

  assert.equal((await request("POST", "/integracoes/bling/iniciar", {}, demo.body.access_token)).status, 403);
  assert.equal((await request("POST", "/integracoes/bling/iniciar", {}, gerente.token)).status, 403);
  assert.equal((await request("POST", "/integracoes/bling/iniciar", {}, vendedor.token)).status, 403);

  const started = await request("POST", "/integracoes/bling/iniciar", {}, admin.token);
  assert.equal(started.status, 200);
  assert.match(started.body.authorizationUrl, /^https:\/\/www\.bling\.com\.br\/Api\/v3\/oauth\/authorize/);
  const authorizationUrl = new URL(started.body.authorizationUrl);
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.BLING_REDIRECT_URI);
  assert.equal(authorizationUrl.searchParams.get("client_id"), process.env.BLING_CLIENT_ID);
  assert.equal(authorizationUrl.toString().includes(process.env.BLING_CLIENT_SECRET), false);
  const state = authorizationUrl.searchParams.get("state");
  assert.ok(state);
  assert.equal(await prisma.integracaoOAuthState.count({ where: { empresaId: admin.empresaId, usedAt: null } }), 1);

  const invalid = await request("GET", "/integracoes/bling/callback?code=abc&state=invalido");
  assert.equal(invalid.status, 302);
  assert.match(invalid.headers.location, /bling=erro/);
  assert.match(invalid.headers.location, /motivo=state/);
  assert.equal(invalid.headers.location.includes("code=abc"), false);
  assert.equal(invalid.headers.location.includes("state=invalido"), false);

  mockFetch(async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    assert.equal(String(url), "https://api.bling.com.br/Api/v3/oauth/token");
    assert.equal(options.headers.Authorization.startsWith("Basic "), true);
    assert.equal(options.headers["enable-jwt"], "1");
    const body = new URLSearchParams(options.body);
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "oauth-code");
    assert.equal(body.get("redirect_uri"), process.env.BLING_REDIRECT_URI);
    return jsonResponse({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      token_type: "Bearer",
      expires_in: 21600,
      scope: "product stock",
    });
  });

  const callback = await request("GET", `/integracoes/bling/callback?code=oauth-code&state=${encodeURIComponent(state)}`);
  assert.equal(callback.status, 302);
  assert.match(callback.headers.location, /bling=conectado/);
  assert.equal(callback.headers.location.includes("integracaoId"), false);
  assert.equal(callback.headers.location.includes("oauth-code"), false);
  assert.equal(callback.headers.location.includes(state), false);
  assert.equal(callback.headers.location.includes("access-secret"), false);
  assert.equal(callback.headers.location.includes("refresh-secret"), false);
  const integration = await prisma.integracao.findFirst({ where: { empresaId: admin.empresaId, tipo: "BLING" } });
  assert.equal(integration.status, "ATIVA");
  assert.equal(integration.modo, "SOMENTE_LEITURA");
  assert.equal(integration.credenciaisCriptografadas.includes("access-secret"), false);
  assert.equal(integration.credenciaisCriptografadas.includes("refresh-secret"), false);
  assert.equal(decryptCredentials(integration.credenciaisCriptografadas).accessToken, "access-secret");
  assert.equal(await prisma.integracaoOAuthState.count({ where: { empresaId: admin.empresaId, usedAt: { not: null } } }), 1);

  const reused = await request("GET", `/integracoes/bling/callback?code=oauth-code&state=${encodeURIComponent(state)}`);
  assert.equal(reused.status, 302);
  assert.match(reused.headers.location, /bling=erro/);
  assert.match(reused.headers.location, /motivo=state/);

  const expiredStart = await prisma.integracaoOAuthState.create({
    data: {
      empresaId: admin.empresaId,
      usuarioId: admin.usuarioId,
      provedor: "BLING",
      stateHash: "expired-state-hash",
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  assert.ok(expiredStart.id);
});

test("Bling sincroniza com refresh, 429, paginação, normalização e idempotência", async () => {
  const adminA = await registerAndLogin("Empresa Bling Sync A", "Admin Sync A", "admin-sync-a@test.local");
  const adminB = await registerAndLogin("Empresa Bling Sync B", "Admin Sync B", "admin-sync-b@test.local");
  const integration = await prisma.integracao.create({
    data: {
      empresaId: adminA.empresaId,
      nome: "Bling Teste",
      tipo: "BLING",
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      credenciaisCriptografadas: require("../src/integrations/crypto").encryptCredentials({
        accessToken: "expired-access",
        refreshToken: "refresh-original",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
      configuracaoJson: "{}",
      ativo: true,
    },
  });

  let productsPageOneAttempts = 0;
  const stockProductIdBatches = [];
  mockFetch(async (url, options) => {
    const parsed = new URL(String(url));
    fetchCalls.push({ url: String(url), authorization: options.headers?.Authorization });
    if (parsed.pathname.endsWith("/oauth/token")) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "refresh-original");
      assert.equal(body.has("redirect_uri"), false);
      return jsonResponse({ access_token: "new-access", refresh_token: "refresh-rotated", expires_in: 21600, token_type: "Bearer" });
    }
    assert.equal(options.headers.Authorization.includes("new-access"), true);
    if (parsed.pathname.endsWith("/produtos") && parsed.searchParams.get("pagina") === "1") {
      productsPageOneAttempts += 1;
      if (productsPageOneAttempts === 1) return jsonResponse({ error: { message: "rate" } }, 429, { "Retry-After": "0" });
      return jsonResponse({ data: [
        { id: 101, codigo: "SKU-BLG-101", gtin: "7891000000101", nome: "Produto Bling 101", descricaoComplementar: "Produto teste", categoria: { descricao: "Categoria Bling" }, marca: "Marca Bling", unidade: "UN", situacao: "A", preco: 125.5 },
        { id: 102, codigo: "SKU-BLG-102", gtin: "7891000000102", nome: "Produto Bling 102", unidade: "KG", situacao: "I", preco: "99,90" },
      ] });
    }
    if (parsed.pathname.endsWith("/produtos") && parsed.searchParams.get("pagina") === "2") {
      return jsonResponse({ data: [] });
    }
    if (parsed.pathname.endsWith("/estoques/saldos") && parsed.searchParams.get("pagina") === "1") {
      stockProductIdBatches.push(parsed.searchParams.getAll("idsProdutos[]"));
      return jsonResponse({ data: [
        { produto: { id: 101 }, deposito: { id: 1, descricao: "Geral" }, saldoFisicoTotal: 10, reservado: 2 },
        { produto: { id: 999 }, deposito: { id: 1, descricao: "Geral" }, saldoFisicoTotal: 5 },
      ] });
    }
    if (parsed.pathname.endsWith("/estoques/saldos")) {
      stockProductIdBatches.push(parsed.searchParams.getAll("idsProdutos[]"));
      return jsonResponse({ data: [] });
    }
    if (parsed.pathname.endsWith("/formas-pagamentos") && parsed.searchParams.get("pagina") === "1") {
      return jsonResponse({ data: [{ id: 50, descricao: "Boleto 30 dias", parcelas: 1, situacao: "A" }] });
    }
    if (parsed.pathname.endsWith("/formas-pagamentos")) {
      return jsonResponse({ data: [] });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const crossSync = await request("POST", `/integracoes/${integration.id}/sincronizar`, { entidades: ["PRODUTOS"] }, adminB.token);
  assert.equal(crossSync.status, 404);

  const sync = await request("POST", `/integracoes/${integration.id}/sincronizar`, {
    entidades: ["PRODUTOS", "ESTOQUE", "PRECOS", "CONDICOES_PAGAMENTO"],
  }, adminA.token);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.resultado.produtosCriados, 2);
  assert.equal(sync.body.resultado.estoquesCriados, 1);
  assert.equal(sync.body.resultado.precosCriados, 2);
  assert.equal(sync.body.resultado.condicoesCriadas, 1);
  assert.equal(sync.body.resultado.erros, 1);
  assert.equal(productsPageOneAttempts, 2);
  assert.deepEqual(stockProductIdBatches[0], ["101", "102"]);

  const stored = await prisma.integracao.findUnique({ where: { id: integration.id } });
  assert.equal(decryptCredentials(stored.credenciaisCriptografadas).refreshToken, "refresh-rotated");
  assert.equal(await prisma.produtoExterno.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 2);
  assert.equal(await prisma.estoqueExterno.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 1);
  assert.equal(await prisma.precoExterno.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 2);
  assert.equal(await prisma.condicaoPagamentoExterna.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 1);
  const product101 = await prisma.produtoExterno.findUnique({ where: { integracaoId_externalId: { integracaoId: integration.id, externalId: "101" } }, include: { estoques: true, precos: true } });
  assert.equal(product101.nome, "Produto Bling 101");
  assert.equal(product101.estoques[0].disponivel.toString(), "8");
  assert.equal(product101.precos[0].precoCentavos, 12550);

  productsPageOneAttempts = 1;
  const syncAgain = await request("POST", `/integracoes/${integration.id}/sincronizar`, { entidades: ["PRODUTOS", "PRECOS"] }, adminA.token);
  assert.equal(syncAgain.status, 200);
  assert.equal(syncAgain.body.resultado.produtosAtualizados, 2);
  assert.equal(await prisma.produtoExterno.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 2);
  assert.equal(await prisma.precoExterno.count({ where: { empresaId: adminA.empresaId, integracaoId: integration.id } }), 2);

  const disconnect = await request("POST", `/integracoes/${integration.id}/bling/desconectar`, {}, adminA.token);
  assert.equal(disconnect.status, 200);
  assert.equal(disconnect.body.ativo, false);
  const disconnected = await prisma.integracao.findUnique({ where: { id: integration.id } });
  assert.equal(disconnected.credenciaisCriptografadas, null);
});

test("Bling consulta saldo apenas com ids de produtos validos e preserva estoque zero", async () => {
  const admin = await registerAndLogin("Empresa Bling Estoque", "Admin Estoque", "admin-estoque@test.local");
  const integration = await prisma.integracao.create({
    data: {
      empresaId: admin.empresaId,
      nome: "Bling Estoque",
      tipo: "BLING",
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      credenciaisCriptografadas: require("../src/integrations/crypto").encryptCredentials({
        accessToken: "access-stock",
        refreshToken: "refresh-stock",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      configuracaoJson: "{}",
      ativo: true,
    },
  });

  let stockCalls = 0;
  mockFetch(async (url, options) => {
    const parsed = new URL(String(url));
    fetchCalls.push({ url: String(url), authorization: options.headers?.Authorization });
    assert.equal(options.headers.Authorization.includes("access-stock"), true);
    if (parsed.pathname.endsWith("/produtos") && parsed.searchParams.get("pagina") === "1") {
      return jsonResponse({ data: [
        { id: 201, codigo: "SKU-BLG-201", nome: "Produto Bling 201", preco: 10 },
        { codigo: "SKU-SEM-ID", nome: "Produto sem ID Bling", preco: 20 },
      ] });
    }
    if (parsed.pathname.endsWith("/produtos")) return jsonResponse({ data: [] });
    if (parsed.pathname.endsWith("/estoques/saldos")) {
      stockCalls += 1;
      assert.deepEqual(parsed.searchParams.getAll("idsProdutos[]"), ["201"]);
      if (parsed.searchParams.get("pagina") === "1") {
        return jsonResponse({ data: [
          { produto: { id: 201 }, deposito: { id: 7, descricao: "Central" }, saldoFisicoTotal: 0, reservado: 0 },
        ] });
      }
      return jsonResponse({ data: [] });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const sync = await request("POST", `/integracoes/${integration.id}/sincronizar`, { entidades: ["PRODUTOS", "ESTOQUE"] }, admin.token);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.resultado.produtosCriados, 2);
  assert.equal(sync.body.resultado.estoquesCriados, 1);
  assert.equal(sync.body.resultado.erros, 0);
  assert.equal(stockCalls, 1);

  const product201 = await prisma.produtoExterno.findUnique({ where: { integracaoId_externalId: { integracaoId: integration.id, externalId: "201" } }, include: { estoques: true } });
  assert.equal(product201.estoques[0].quantidade.toString(), "0");
  assert.equal(product201.estoques[0].disponivel.toString(), "0");
});

test("Bling nao consulta saldo quando nao ha produtos", async () => {
  const admin = await registerAndLogin("Empresa Bling Sem Produtos", "Admin Sem Produtos", "admin-sem-produtos@test.local");
  const integration = await prisma.integracao.create({
    data: {
      empresaId: admin.empresaId,
      nome: "Bling Sem Produtos",
      tipo: "BLING",
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      credenciaisCriptografadas: require("../src/integrations/crypto").encryptCredentials({
        accessToken: "access-empty",
        refreshToken: "refresh-empty",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      configuracaoJson: "{}",
      ativo: true,
    },
  });

  mockFetch(async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/produtos")) return jsonResponse({ data: [] });
    if (parsed.pathname.endsWith("/estoques/saldos")) throw new Error("Saldo nao deveria ser consultado sem produtos.");
    throw new Error(`Unexpected URL ${url}`);
  });

  const sync = await request("POST", `/integracoes/${integration.id}/sincronizar`, { entidades: ["PRODUTOS", "ESTOQUE"] }, admin.token);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.resultado.produtosRecebidos, 0);
  assert.equal(sync.body.resultado.estoquesRecebidos, 0);
  assert.equal(sync.body.resultado.erros, 0);
});

test("Bling sanitiza falta de escopo ao consultar saldo", async () => {
  const admin = await registerAndLogin("Empresa Bling Escopo", "Admin Escopo", "admin-escopo@test.local");
  const integration = await prisma.integracao.create({
    data: {
      empresaId: admin.empresaId,
      nome: "Bling Escopo",
      tipo: "BLING",
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      credenciaisCriptografadas: require("../src/integrations/crypto").encryptCredentials({
        accessToken: "access-scope",
        refreshToken: "refresh-scope",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      configuracaoJson: "{}",
      ativo: true,
    },
  });

  mockFetch(async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/produtos") && parsed.searchParams.get("pagina") === "1") {
      return jsonResponse({ data: [{ id: 301, codigo: "SKU-BLG-301", nome: "Produto Bling 301" }] });
    }
    if (parsed.pathname.endsWith("/produtos")) return jsonResponse({ data: [] });
    if (parsed.pathname.endsWith("/estoques/saldos")) {
      assert.deepEqual(parsed.searchParams.getAll("idsProdutos[]"), ["301"]);
      return jsonResponse({ error: { message: "escopo insuficiente" } }, 403);
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const sync = await request("POST", `/integracoes/${integration.id}/sincronizar`, { entidades: ["PRODUTOS", "ESTOQUE"] }, admin.token);
  assert.equal(sync.status, 403);
  assert.equal(sync.body.codigo, "BLING_HTTP_ERROR");
  assert.equal(JSON.stringify(sync.body).includes("access-scope"), false);
  assert.equal(JSON.stringify(sync.body).includes("refresh-scope"), false);
});

test("Bling trata timeout e ausência de configuração sem vazar tokens", async () => {
  const admin = await registerAndLogin("Empresa Bling Timeout", "Admin Timeout", "admin-timeout@test.local");
  const integration = await prisma.integracao.create({
    data: {
      empresaId: admin.empresaId,
      nome: "Bling Timeout",
      tipo: "BLING",
      status: "ATIVA",
      modo: "SOMENTE_LEITURA",
      credenciaisCriptografadas: require("../src/integrations/crypto").encryptCredentials({
        accessToken: "token-timeout",
        refreshToken: "refresh-timeout",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      configuracaoJson: "{}",
      ativo: true,
    },
  });
  mockFetch((url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));
  const result = await request("POST", `/integracoes/${integration.id}/bling/testar`, {}, admin.token);
  assert.equal(result.status, 502);
  assert.equal(JSON.stringify(result.body).includes("token-timeout"), false);

  const previousId = process.env.BLING_CLIENT_ID;
  process.env.BLING_CLIENT_ID = "";
  const notConfigured = await request("POST", "/integracoes/bling/iniciar", {}, admin.token);
  assert.equal(notConfigured.status, 501);
  process.env.BLING_CLIENT_ID = previousId;

  const previousRedirect = process.env.BLING_REDIRECT_URI;
  process.env.BLING_REDIRECT_URI = "";
  const missingRedirect = await request("POST", "/integracoes/bling/iniciar", {}, admin.token);
  assert.equal(missingRedirect.status, 501);
  process.env.BLING_REDIRECT_URI = previousRedirect;
});

function mockFetch(handler) {
  fetchCalls = [];
  global.fetch = async (url, options = {}) => handler(url, options);
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function registerAndLogin(empresaNome, nome, email) {
  const password = "SenhaBlingSegura123";
  const registered = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome: nome,
    email,
    senha: password,
  });
  assert.equal(registered.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: password });
  assert.equal(login.status, 200);
  return {
    token: login.body.access_token,
    empresaId: login.body.empresa.id,
    usuarioId: login.body.usuario.id,
  };
}

async function createUserAndLogin(token, nome, email, papel) {
  const password = "SenhaBlingSegura123";
  const created = await request("POST", "/usuarios", { nome, email, senha: password, papel }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: password });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
}

async function request(method, pathname, body, token) {
  const response = await originalFetch(`${baseUrl}${pathname}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text || null;
  }
  return {
    status: response.status,
    headers: { location: response.headers.get("location") || "" },
    body: parsed,
  };
}
