const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BlingHttpClient, _private: clientPrivate } = require("../src/integrations/blingClient");
const { _private: servicePrivate } = require("../src/integrations/blingService");

test("Bling rejeita token OAuth incompleto sem aceitar credencial vazia", () => {
  assert.throws(
    () => clientPrivate.normalizeTokenResponse({ access_token: "", refresh_token: "refresh" }, { requireRefreshToken: true }),
    (error) => error.code === "BLING_TOKEN_RESPONSE_INVALID",
  );
  assert.throws(
    () => clientPrivate.normalizeTokenResponse({ access_token: "access" }, { requireRefreshToken: true }),
    (error) => error.code === "BLING_TOKEN_RESPONSE_INVALID",
  );
  assert.throws(
    () => clientPrivate.normalizeTokenResponse({ access_token: { value: "access" }, refresh_token: "refresh" }, { requireRefreshToken: true }),
    (error) => error.code === "BLING_TOKEN_RESPONSE_INVALID",
  );
  assert.throws(
    () => clientPrivate.normalizeTokenResponse({ access_token: "access", refresh_token: ["refresh"] }, { requireRefreshToken: true }),
    (error) => error.code === "BLING_TOKEN_RESPONSE_INVALID",
  );
  const refresh = clientPrivate.normalizeTokenResponse({ access_token: "access" }, { requireRefreshToken: false });
  assert.equal(refresh.accessToken, "access");
  assert.equal(refresh.refreshToken, "");
  for (const expires_in of [0, "", false, -1, "not-a-number", null]) {
    assert.throws(
      () => clientPrivate.normalizeTokenResponse({ access_token: "access", expires_in }),
      (error) => error.code === "BLING_TOKEN_RESPONSE_INVALID",
    );
  }
});

test("Bling converte moeda com ROUND_HALF_UP, rejeita negativos e limita inteiros", () => {
  const moneyToCents = servicePrivate.moneyToCents;
  assert.equal(moneyToCents("10,004"), 1000);
  assert.equal(moneyToCents("10,005"), 1001);
  assert.equal(moneyToCents("R$ 1.234,56"), 123456);
  assert.equal(moneyToCents("1,234.56"), 123456);
  assert.equal(moneyToCents("21.474.836,47"), 2147483647);
  assert.equal(moneyToCents("21.474.836,48"), null);
  assert.equal(moneyToCents("-1,00"), null);
  assert.equal(moneyToCents("90071992547409.92"), null);
});

test("Bling marca autenticação inválida como erro e sanitiza mensagem externa", () => {
  const integration = { ativo: true, credenciaisCriptografadas: "encrypted" };
  assert.equal(servicePrivate.statusAfterSyncError(integration, { code: "BLING_TOKEN_RESPONSE_INVALID" }), "ERRO");
  assert.equal(servicePrivate.statusAfterSyncError(integration, { code: "BLING_HTTP_ERROR", status: 401 }), "ERRO");
  assert.equal(servicePrivate.statusAfterSyncError(integration, { code: "BLING_HTTP_ERROR", status: 503 }), "ATIVA");
  const safe = servicePrivate.sanitizeError({ code: "BLING_HTTP_ERROR", status: 401, message: "token=secret" });
  assert.equal(safe.message, "A autenticação do Bling foi rejeitada.");
  assert.equal(JSON.stringify(safe).includes("secret"), false);
});

test("Bling valida callback HTTPS sem userinfo, query ou fragmento", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.equal(clientPrivate.isValidRedirectUri("https://api.example.test/integracoes/bling/callback"), true);
  for (const value of [
    "http://api.example.test/integracoes/bling/callback",
    "https://user:password@api.example.test/integracoes/bling/callback",
    "https://api.example.test/integracoes/bling/callback?next=1",
    "https://api.example.test/integracoes/bling/callback#fragment",
    "https://localhost/integracoes/bling/callback",
    "not-a-url",
  ]) {
    assert.equal(clientPrivate.isValidRedirectUri(value), false, value);
  }
  process.env.NODE_ENV = "test";
  assert.equal(clientPrivate.isValidRedirectUri("https://localhost/integracoes/bling/callback"), true);
  restoreEnv("NODE_ENV", previousNodeEnv);
});

test("Bling nunca devolve mensagem arbitrária do provider", () => {
  const raw = { error: { type: "unknown", description: "access_token=secret-provider-value" } };
  const sanitized = clientPrivate.sanitizeBlingError(raw, "Falha segura.");
  assert.equal(sanitized, "Falha segura.");
  assert.equal(sanitized.includes("secret-provider-value"), false);
  assert.equal(
    clientPrivate.sanitizeBlingError({ error: { type: "invalid_grant", description: "token=secret" } }, "fallback"),
    "A autorização do Bling expirou ou foi rejeitada.",
  );
});

test("Bling coalesce refresh concorrente dentro do mesmo client", async () => {
  const originalFetch = global.fetch;
  const previous = {
    clientId: process.env.BLING_CLIENT_ID,
    clientSecret: process.env.BLING_CLIENT_SECRET,
    redirectUri: process.env.BLING_REDIRECT_URI,
  };
  process.env.BLING_CLIENT_ID = "client-test";
  process.env.BLING_CLIENT_SECRET = "secret-test";
  process.env.BLING_REDIRECT_URI = "https://api.example.test/integracoes/bling/callback";
  let tokenCalls = 0;
  let apiCalls = 0;
  let saves = 0;
  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes("/oauth/token")) {
      tokenCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 21600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    apiCalls += 1;
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new BlingHttpClient({
      credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: new Date(0).toISOString() },
      onTokenRefresh: async () => { saves += 1; },
    });
    await Promise.all([client.get("/produtos"), client.get("/produtos"), client.get("/produtos")]);
    assert.equal(tokenCalls, 1);
    assert.equal(saves, 1);
    assert.equal(apiCalls, 3);
  } finally {
    global.fetch = originalFetch;
    restoreEnv("BLING_CLIENT_ID", previous.clientId);
    restoreEnv("BLING_CLIENT_SECRET", previous.clientSecret);
    restoreEnv("BLING_REDIRECT_URI", previous.redirectUri);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
