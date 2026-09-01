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
  assert.deepEqual(
    _private.redactSensitiveConfig({ callback: { state: "opaque-state", code: "oauth-code", signature: "signed" } }),
    { callback: { state: "[redacted]", code: "[redacted]", signature: "[redacted]" } },
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
  assert.throws(
    () => _private.stringifySafeConfig({ connection: "redis://:password@cache.internal/0" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
  assert.throws(
    () => _private.stringifySafeConfig({ endpoint: "https://provider.test/callback?password=secret" }),
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
  const emptyUserRedacted = _private.redactSensitiveText("redis://:uri-secret@provider.test/queue?password=query-secret");
  assert.equal(emptyUserRedacted.includes("uri-secret"), false);
  assert.equal(emptyUserRedacted.includes("query-secret"), false);
  for (const scheme of ["postgresql", "redis", "amqps"]) {
    const redactedUri = _private.redactSensitiveText(`${scheme}://user:uri-secret@provider.test/queue`);
    assert.equal(redactedUri.includes("uri-secret"), false, scheme);
    assert.match(redactedUri, new RegExp(`${scheme}://\\[redacted\\]@`));
  }
  const opaqueRedacted = _private.redactSensitiveConfig({
    callback: "mailto:alice@example.com?body=code=secret123",
    opaque: "urn:crm:tenant:token:secret123",
    custom: "custom+provider:accessToken=secret123",
    data: "data:text/plain,secret123",
    slashCallback: "/mailto:alice@example.com?body=code=secret123",
    slashData: "/data:text/plain,secret123",
    hierarchicalUnknown: "https://provider.test/private/tenant-42?opaque=secret123",
  });
  assert.deepEqual(opaqueRedacted, {
    callback: "[redacted]",
    opaque: "[redacted]",
    custom: "[redacted]",
    data: "[redacted]",
    slashCallback: "/[redacted]",
    slashData: "/[redacted]",
    hierarchicalUnknown: "https://provider.test/[redacted]",
  });
  const standalone = _private.redactSensitiveText("cookie=marker-1 state=marker-2 code=marker-3");
  assert.equal(standalone.includes("marker-1"), false);
  assert.equal(standalone.includes("marker-2"), false);
  assert.equal(standalone.includes("marker-3"), false);
  assert.match(standalone, /cookie=\[redacted\]/i);
  assert.match(standalone, /state=\[redacted\]/i);
  assert.match(standalone, /code=\[redacted\]/i);
  const networkPath = _private.redactSensitiveText("//provider.test/private/tenant-42?opaque=marker#fragment");
  assert.equal(networkPath.includes("tenant-42"), false);
  assert.equal(networkPath.includes("marker"), false);
  assert.equal(networkPath, "//provider.test/[redacted]");
  const networkPathUserinfo = _private.redactSensitiveText("//123:synthetic-secret@example.test/private/tenant-42");
  assert.equal(networkPathUserinfo.includes("synthetic-secret"), false);
  assert.equal(networkPathUserinfo, "//[redacted]@example.test/[redacted]");
  const quotedStandalone = _private.redactSensitiveText('cookie="synthetic-secret-part-one synthetic-secret-part-two"');
  assert.equal(quotedStandalone.includes("synthetic-secret"), false);
  assert.equal(quotedStandalone, "cookie=[redacted]");
  for (const key of ["cookie", "state", "code"]) {
    assert.throws(
      () => _private.stringifySafeConfig({ note: `${key}=marker-1` }),
      (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
    );
  }
  assert.throws(
    () => _private.stringifySafeConfig({ note: "//provider.test/private/tenant-42?opaque=marker" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
  assert.throws(
    () => _private.stringifySafeConfig({ note: "//123:synthetic-secret@example.test/private" }),
    (error) => error.code === "INTEGRATION_CONFIG_SENSITIVE_FIELD",
  );
});

test("ativação externa permanece fechada fora do modo de teste", () => {
  assert.throws(
    () => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "production", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED",
  );
  assert.equal(_private.assertExternalProviderActivationEnabled({ NODE_ENV: "test", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" }), true);
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
  assert.throws(
    () => _private.assertIntegrationStatusTransitionAllowed({
      current: { status: "INATIVA", ativo: false, ultimoSucessoEm: new Date(), credenciaisCriptografadas: "ciphertext" },
      data: { status: "ATIVA", ativo: true },
      encryptedCredentials: undefined,
      env: { NODE_ENV: "staging", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" },
    }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED",
  );
  assert.throws(
    () => _private.assertIntegrationStatusTransitionAllowed({
      current: {
        tipo: "OMIE",
        status: "ATIVA",
        ativo: true,
        configuracaoJson: "{\"endpoint\":\"https://provider.test/old\"}",
        ultimoSucessoEm: new Date(),
        credenciaisCriptografadas: "ciphertext",
      },
      data: {
        tipo: "CUSTOM",
        configuracaoJson: "{\"endpoint\":\"https://provider.test/new\"}",
      },
      encryptedCredentials: undefined,
      env: { NODE_ENV: "staging", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" },
    }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED",
  );
});
