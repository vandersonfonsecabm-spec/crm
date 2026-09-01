function assertExternalProviderActivationEnabled(env = process.env) {
  if (!externalProviderActivationEnabled(env)) {
    const error = new Error("A ativação externa está pausada nesta fase.");
    error.status = 503;
    error.code = "PROVIDER_ACTIVATION_PAUSED";
    throw error;
  }
  return true;
}

function externalProviderActivationEnabled(env = process.env) {
  const enabled = String(env.EXTERNAL_PROVIDER_ACTIVATION_ENABLED || "").trim().toLowerCase() === "true";
  return env.NODE_ENV === "test" || enabled;
}

module.exports = {
  assertExternalProviderActivationEnabled,
  externalProviderActivationEnabled,
};
