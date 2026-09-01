const assert = require("node:assert/strict");
const { test } = require("node:test");
const { _private } = require("../src/integrations/routes");

test("configuração rejeita secrets recursivos e redige legado", () => {
  assert.throws(
    () => _private.stringifySafeConfig({ nested: { api_key: "secret" } }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
  assert.deepEqual(
    _private.redactSensitiveConfig({ endpoint: "sandbox", nested: { refreshToken: "secret" } }),
    { endpoint: "sandbox", nested: { refreshToken: "[redacted]" } },
  );
  let legacy = { token: "deep-secret" };
  for (let depth = 0; depth < 10; depth += 1) legacy = { nested: legacy };
  const serialized = JSON.stringify(_private.redactSensitiveConfig(legacy));
  assert.equal(serialized.includes("deep-secret"), false);
  assert.equal(serialized.includes("[redacted]"), true);
  assert.throws(
    () => _private.stringifySafeConfig({ endpoint: "https://provider.test/callback?access_token=secret" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
  assert.throws(
    () => _private.stringifySafeConfig({ header: "Bearer abc.def.ghi" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
  assert.throws(
    () => _private.stringifySafeConfig({ connection: "postgresql://user:password@db.internal/crm" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
});

test("Bling não pode ser forjado pelo writer genérico", () => {
  assert.throws(
    () => _private.assertGenericIntegrationLifecycleAllowed(null, "BLING", { tipo: "BLING", credenciais: { accessToken: "x" } }),
    (error) => error.code === "BLING_OAUTH_REQUIRED",
  );
  assert.throws(
    () => _private.assertGenericIntegrationLifecycleAllowed("BLING", "BLING", { status: "ATIVA" }),
    (error) => error.code === "BLING_LIFECYCLE_REQUIRED",
  );
  assert.equal(_private.assertGenericIntegrationLifecycleAllowed("BLING", "BLING", { nome: "Conta Bling" }), true);
});

test("callbacks externos exigem frontend explícito e seguro", () => {
  assert.throws(() => _private.frontendCallbackBase({ NODE_ENV: "production" }), (error) => error.code === "PROVIDER_FRONTEND_URL_REQUIRED");
  assert.throws(() => _private.frontendCallbackBase({ NODE_ENV: "production", FRONTEND_URL: "http://crm.example.test" }), (error) => error.code === "PROVIDER_FRONTEND_URL_INVALID");
  assert.throws(() => _private.frontendCallbackBase({ NODE_ENV: "production", FRONTEND_URL: "https://user:pass@crm.example.test" }), (error) => error.code === "PROVIDER_FRONTEND_URL_INVALID");
  assert.equal(_private.frontendCallbackBase({ NODE_ENV: "production", FRONTEND_URL: "https://crm.example.test" }), "https://crm.example.test");
  assert.equal(_private.frontendCallbackBase({ NODE_ENV: "test", FRONTEND_URL: "http://localhost:5173" }), "http://localhost:5173");
});

test("mensagem de provider nunca persiste segredo bruto", () => {
  assert.equal(
    _private.safeAdapterErrorMessage({ code: "UNKNOWN", message: "token=secret" }),
    "Não foi possível testar a integração.",
  );
  const redacted = _private.redactSensitiveText("falha https://provider.test/cb?access_token=secret Authorization: Bearer abc.def");
  assert.equal(redacted.includes("secret"), false);
  assert.equal(redacted.includes("abc.def"), false);
  assert.equal(redacted.includes("[redacted]"), true);
  const urlRedacted = _private.redactSensitiveText("https://user:pass@provider.test/cb?state=state-secret&code=oauth-code&apiKey=api-secret#access_token=fragment-secret");
  assert.equal(urlRedacted.includes("pass@"), false);
  assert.equal(urlRedacted.includes("state-secret"), false);
  assert.equal(urlRedacted.includes("oauth-code"), false);
  assert.equal(urlRedacted.includes("api-secret"), false);
  assert.equal(urlRedacted.includes("fragment-secret"), false);
  for (const scheme of ["postgresql", "redis", "amqps"]) {
    const redactedUri = _private.redactSensitiveText(`${scheme}://user:uri-secret@provider.test/queue`);
    assert.equal(redactedUri.includes("uri-secret"), false, scheme);
    assert.match(redactedUri, new RegExp(`${scheme}://\\[redacted\\]@`));
  }
});

test("integração genérica não pode declarar ativa sem validação", () => {
  assert.throws(
    () => _private.assertIntegrationStatusTransitionAllowed({ current: null, data: { status: "ATIVA", ativo: true }, encryptedCredentials: null }),
    (error) => error.code === "INTEGRATION_STATUS_REQUIRES_VALIDATION",
  );
  assert.equal(
    _private.assertIntegrationStatusTransitionAllowed({ current: { status: "ATIVA", ativo: true, ultimoSucessoEm: new Date(), credenciaisCriptografadas: "ciphertext" }, data: {}, encryptedCredentials: undefined }),
    true,
  );
});
