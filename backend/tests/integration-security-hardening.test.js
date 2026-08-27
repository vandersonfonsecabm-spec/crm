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
});
