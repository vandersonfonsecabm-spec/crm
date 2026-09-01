const assert = require("node:assert/strict");
const test = require("node:test");
const { _private } = require("../src/integrations/routes");

test("provider activation is paused in production until a separate mission enables it", () => {
  assert.throws(
    () => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "production", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED" && error.status === 503,
  );
  assert.doesNotThrow(() => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "test" }));
  assert.throws(
    () => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "staging", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false" }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED" && error.status === 503,
  );
  assert.throws(
    () => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "staging" }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED" && error.status === 503,
  );
  assert.throws(
    () => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "development" }),
    (error) => error.code === "PROVIDER_ACTIVATION_PAUSED" && error.status === 503,
  );
  assert.doesNotThrow(() => _private.assertExternalProviderActivationEnabled({ NODE_ENV: "production", EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "true" }));
});
