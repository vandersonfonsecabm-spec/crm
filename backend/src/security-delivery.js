function createSecurityDelivery({ env = process.env, capture } = {}) {
  const enabled = String(env.NODE_ENV || "development").toLowerCase() !== "production"
    && String(env.AUTH_TEST_CAPTURE || "").toLowerCase() === "true"
    && typeof capture === "function";

  return {
    async deliver(message) {
      if (!enabled) return { status: "PENDING_DELIVERY" };
      if (typeof capture === "function") {
        await capture({
          kind: message.kind,
          email: message.email,
          token: message.token,
          expiresAt: message.expiresAt,
        });
      }
      return { status: "TEST_CAPTURED" };
    },
  };
}

module.exports = { createSecurityDelivery };
