const assert = require("node:assert/strict");
const { test } = require("node:test");
const { _private: clientPrivate } = require("../src/integrations/blingClient");
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
