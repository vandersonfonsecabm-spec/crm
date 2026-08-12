const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const testRoot = path.join(os.tmpdir(), "crm-prisma-tests");
fs.mkdirSync(testRoot, { recursive: true });
const databaseName = `meta-oauth-local-wiring-${process.pid}.db`;
const databasePath = path.join(testRoot, databaseName);
const sourceDatabase = String(process.env.CRM_TEST_BASE_DATABASE_PATH || "");
if (!sourceDatabase || !path.isAbsolute(sourceDatabase) || !fs.existsSync(sourceDatabase)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_REQUIRED");
if (path.resolve(sourceDatabase).toLowerCase().includes(`${path.sep}backend${path.sep}prisma${path.sep}dev.db`)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_PROTECTED");

process.env.NODE_ENV = "test";
process.env.CRM_TEST_DATABASE_URL = `file:${databasePath}`;
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.INSTAGRAM_INTEGRATION_ENABLED = "true";
process.env.INSTAGRAM_INBOUND_ENABLED = "true";
process.env.INSTAGRAM_META_APP_ID = "test-instagram-app";
process.env.INSTAGRAM_PROVIDER_ENVIRONMENT = "test-instagram-environment";
process.env.INTEGRATION_ENCRYPTION_KEY = "meta-credential-test-key-with-32-bytes";

let prisma;
let tenant;
let user;
let channel;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });
  const { PrismaClient } = require("@prisma/client");
  const { createMetaOAuthService } = require("../src/integrations/metaOAuthService");
  prisma = new PrismaClient();
  tenant = await prisma.empresa.create({ data: { nome: "Meta OAuth Wiring Test", slug: `meta-oauth-wiring-${process.pid}` } });
  user = await prisma.usuario.create({ data: { empresaId: tenant.id, nome: "Meta Admin", email: `meta-oauth-wiring-${process.pid}@test.local`, senhaHash: "test-only", papel: "ADMIN" } });
  channel = await prisma.canalIntegracao.create({ data: { empresaId: tenant.id, tipo: "INSTAGRAM_META", nome: "Instagram Meta Wiring", chaveInterna: `instagram-meta-wiring-${process.pid}`, modoTeste: false, status: "ATIVO", instagramBusinessAccountId: "17841400000000000", metaAppId: "test-instagram-app", providerEnvironment: "test-instagram-environment" } });
  await prisma.empresaFuncionalidade.createMany({ data: [
    { empresaId: tenant.id, chave: "INSTAGRAM_INTEGRATION", habilitada: true },
    { empresaId: tenant.id, chave: "INSTAGRAM_INBOUND", habilitada: true },
  ] });
  globalThis.metaOAuthService = createMetaOAuthService({
    prisma,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
    client: {
      buildAuthorizationUrl({ state }) {
        return `https://www.instagram.com/oauth/authorize?state=${encodeURIComponent(state)}&scope=instagram_business_basic%2Cinstagram_business_manage_messages`;
      },
      async exchangeAuthorizationCode({ code }) {
        assert.equal(code, "authorized-code");
        return { accessToken: "short-token-only-in-memory", userId: "17841400000000000", expiresIn: 3600, tokenType: "bearer" };
      },
      async exchangeLongLivedToken({ accessToken }) {
        assert.equal(accessToken, "short-token-only-in-memory");
        return { accessToken: "long-token-only-in-memory", userId: "17841400000000000", expiresIn: 5184000, tokenType: "bearer", scopes: ["instagram_business_basic", "instagram_business_manage_messages"] };
      },
      async subscribeMessages() { return { subscribedFields: ["messages"], result: { success: true } }; },
      async getSubscription() { return { data: [{ subscribed_fields: ["messages"] }] }; },
    },
    credentialStore: {
      async createLocalCredential(input) {
        assert.equal(input.provider, "META_INSTAGRAM");
        assert.equal(input.credentials.accessToken, "long-token-only-in-memory");
        return { reference: "opaque-reference-test-only", revision: 1 };
      },
    },
  });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("Meta OAuth local wiring cria URL com state persistente e conclui somente local", async () => {
  const started = await globalThis.metaOAuthService.iniciarOAuth({ auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" }, canalIntegracaoId: channel.id });
  const parsed = new URL(started.authorizationUrl);
  const rawState = parsed.searchParams.get("state");
  assert.equal(parsed.origin, "https://www.instagram.com");
  assert.equal(parsed.searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages");
  assert.ok(rawState && rawState.length >= 40);
  const result = await globalThis.metaOAuthService.concluirOAuth({ code: "authorized-code", state: rawState });
  assert.equal(result.mode, "LOCAL_ONLY");
  assert.equal(result.subscription, "VERIFIED");
  assert.equal(JSON.stringify(result).includes("authorized-code"), false);
  assert.equal(JSON.stringify(result).includes(rawState), false);
});

test("Meta OAuth callback rejeita replay e parametros duplicados", async () => {
  const started = await globalThis.metaOAuthService.iniciarOAuth({ auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" }, canalIntegracaoId: channel.id });
  const rawState = new URL(started.authorizationUrl).searchParams.get("state");
  await assert.rejects(() => globalThis.metaOAuthService.concluirOAuth({ code: ["a", "b"], state: rawState }), (error) => error.code === "META_CALLBACK_INVALID");
  await globalThis.metaOAuthService.concluirOAuth({ code: "authorized-code", state: rawState });
  await assert.rejects(() => globalThis.metaOAuthService.concluirOAuth({ code: "authorized-code", state: rawState }), (error) => error.code === "META_INVALID_STATE");
});

test("Meta cliente default falha fechado e a subscription usa apenas messages", async () => {
  const { createMetaInstagramClient } = require("../src/integrations/metaInstagramClient");
  const client = createMetaInstagramClient({ config: { META_INSTAGRAM_APP_ID: "test-app", META_INSTAGRAM_OAUTH_REDIRECT_URI: "https://example.test/meta/callback", META_INSTAGRAM_APP_SECRET: "test-secret-only" } });
  const url = client.buildAuthorizationUrl({ state: "state-value-test-only" });
  assert.equal(new URL(url).searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages");
  await assert.rejects(() => client.exchangeAuthorizationCode({ code: "test-code" }), (error) => error.code === "META_EXTERNAL_NETWORK_DISABLED");
  const calls = [];
  const mock = createMetaInstagramClient({
    config: { META_INSTAGRAM_APP_ID: "test-app", META_INSTAGRAM_OAUTH_REDIRECT_URI: "https://example.test/meta/callback", META_INSTAGRAM_APP_SECRET: "test-secret-only" },
    transport: { async post(input) { calls.push(input); return { success: true }; }, async get() { return { data: [] }; }, async delete() { return { success: true }; } },
  });
  await mock.subscribeMessages({ instagramUserId: "17841400000000000", accessToken: "token-in-memory" });
  assert.equal(new URLSearchParams(calls[0].body).get("subscribed_fields"), "messages");
});

test("Meta cliente fixa endpoints oficiais de code, long-lived e refresh", async () => {
  const calls = [];
  const client = require("../src/integrations/metaInstagramClient").createMetaInstagramClient({
    config: {
      META_INSTAGRAM_APP_ID: "test-app",
      META_INSTAGRAM_OAUTH_REDIRECT_URI: "https://example.test/meta/callback",
      META_INSTAGRAM_APP_SECRET: "test-secret-only",
    },
    transport: {
      async post(input) {
        calls.push({ method: "POST", ...input });
        return { access_token: "token-response", expires_in: 3600, user_id: "17841400000000000" };
      },
      async get(input) {
        calls.push({ method: "GET", ...input });
        return { access_token: "token-response", expires_in: 5184000, user_id: "17841400000000000" };
      },
      async delete() { throw new Error("unused"); },
    },
  });

  await client.exchangeAuthorizationCode({ code: "code-only-in-memory" });
  await client.exchangeLongLivedToken({ accessToken: "short-only-in-memory" });
  await client.refreshLongLivedToken({ accessToken: "long-only-in-memory" });

  assert.equal(calls[0].url, "https://api.instagram.com/oauth/access_token");
  const shortBody = new URLSearchParams(calls[0].body);
  assert.equal(shortBody.get("grant_type"), "authorization_code");
  assert.equal(shortBody.get("redirect_uri"), "https://example.test/meta/callback");
  assert.equal(calls[1].url.startsWith("https://graph.instagram.com/access_token?"), true);
  assert.equal(new URL(calls[1].url).searchParams.get("grant_type"), "ig_exchange_token");
  assert.equal(calls[2].url.startsWith("https://graph.instagram.com/refresh_access_token?"), true);
  assert.equal(new URL(calls[2].url).searchParams.get("grant_type"), "ig_refresh_token");
});

test("Meta OAuth marca credencial como erro quando subscription nao e confirmada", async () => {
  const failingChannel = await prisma.canalIntegracao.create({ data: { empresaId: tenant.id, tipo: "INSTAGRAM_META", nome: "Instagram Meta Failure", chaveInterna: `instagram-meta-failure-${process.pid}`, modoTeste: false, status: "ATIVO", instagramBusinessAccountId: "17841400000000001", metaAppId: "test-instagram-app", providerEnvironment: "test-instagram-environment" } });
  let marked;
  const service = require("../src/integrations/metaOAuthService").createMetaOAuthService({
    prisma,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
    client: {
      buildAuthorizationUrl({ state }) { return `https://www.instagram.com/oauth/authorize?state=${state}`; },
      async exchangeAuthorizationCode() { return { accessToken: "short-only-in-memory", userId: "17841400000000001", expiresIn: 3600 }; },
      async exchangeLongLivedToken() { return { accessToken: "long-only-in-memory", userId: "17841400000000001", expiresIn: 5184000 }; },
      async subscribeMessages() { return { success: false }; },
      async getSubscription() { return { data: [] }; },
    },
    credentialStore: {
      async createLocalCredential() { return { reference: "opaque-failure-reference", revision: 1 }; },
      async markLocalCredentialError(input) { marked = input; return { marked: true }; },
    },
  });
  const started = await service.iniciarOAuth({ auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" }, canalIntegracaoId: failingChannel.id });
  const rawState = new URL(started.authorizationUrl).searchParams.get("state");
  await assert.rejects(() => service.concluirOAuth({ code: "authorized-code", state: rawState }), (error) => error.code === "META_SUBSCRIPTION_FAILED");
  assert.equal(marked.reference, "opaque-failure-reference");
  assert.equal(marked.canalIntegracaoId, failingChannel.id);
});

test("Meta OAuth subscription resolve token somente do store vinculado", async () => {
  let receivedToken;
  const service = require("../src/integrations/metaOAuthService").createMetaOAuthService({
    prisma,
    client: { async subscribeMessages(input) { receivedToken = input.accessToken; return { success: true }; } },
    credentialStore: {
      async resolveCurrentCredential() { return { credentials: { accessToken: "stored-only-in-memory" } }; },
    },
  });
  await service.subscribeMessages({
    auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" },
    canalIntegracaoId: channel.id,
    instagramUserId: "17841400000000000",
  });
  assert.equal(receivedToken, "stored-only-in-memory");
});

test("Meta OAuth falha fechado sem identidade ou verificador de subscription", async () => {
  const incompleteChannel = await prisma.canalIntegracao.create({ data: { empresaId: tenant.id, tipo: "INSTAGRAM_META", nome: "Instagram Meta Incomplete", chaveInterna: `instagram-meta-incomplete-${process.pid}`, modoTeste: false, status: "ATIVO", metaAppId: "test-instagram-app", providerEnvironment: "test-instagram-environment" } });
  let marked;
  const service = require("../src/integrations/metaOAuthService").createMetaOAuthService({
    prisma,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
    client: {
      buildAuthorizationUrl({ state }) { return `https://www.instagram.com/oauth/authorize?state=${state}`; },
      async exchangeAuthorizationCode() { return { accessToken: "short-no-identity" }; },
      async exchangeLongLivedToken() { return { accessToken: "long-no-identity" }; },
    },
    credentialStore: {
      async createLocalCredential() { return { reference: "opaque-incomplete-reference", revision: 1 }; },
      async markLocalCredentialError(input) { marked = input; return { marked: true }; },
    },
  });
  const started = await service.iniciarOAuth({ auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" }, canalIntegracaoId: incompleteChannel.id });
  const rawState = new URL(started.authorizationUrl).searchParams.get("state");
  await assert.rejects(() => service.concluirOAuth({ code: "authorized-code", state: rawState }), (error) => error.code === "META_IDENTITY_MISSING");
  assert.equal(marked, undefined);
});

test("Meta OAuth vincula userId exato ao canal antes de persistir credencial", async () => {
  const mismatchChannel = await prisma.canalIntegracao.create({ data: {
    empresaId: tenant.id,
    tipo: "INSTAGRAM_META",
    nome: "Instagram Meta Identity Mismatch",
    chaveInterna: `instagram-meta-identity-${process.pid}`,
    modoTeste: false,
    status: "ATIVO",
    instagramBusinessAccountId: "17841400000000009",
    metaAppId: "test-instagram-app",
    providerEnvironment: "test-instagram-environment",
  } });
  const { createMetaCredentialStore } = require("../src/integrations/metaCredentialStore");
  const service = require("../src/integrations/metaOAuthService").createMetaOAuthService({
    prisma,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
    client: {
      buildAuthorizationUrl({ state }) { return `https://www.instagram.com/oauth/authorize?state=${state}`; },
      async exchangeAuthorizationCode() { return { accessToken: "identity-short", userId: "17841400000000010" }; },
      async exchangeLongLivedToken() { return { accessToken: "identity-long", userId: "17841400000000010", expiresIn: 5184000 }; },
      async subscribeMessages() { return { success: true }; },
      async getSubscription() { return { data: [{ subscribed_fields: ["messages"] }] }; },
    },
    credentialStore: createMetaCredentialStore({ prisma }),
  });
  const started = await service.iniciarOAuth({ auth: { empresaId: tenant.id, usuarioId: user.id, papel: "ADMIN" }, canalIntegracaoId: mismatchChannel.id });
  const rawState = new URL(started.authorizationUrl).searchParams.get("state");
  await assert.rejects(() => service.concluirOAuth({ code: "authorized-code", state: rawState }), (error) => error.code === "META_IDENTITY_CHANNEL_MISMATCH");
  assert.equal(await prisma.metaCredential.count({ where: { canalIntegracaoId: mismatchChannel.id } }), 0);
});
