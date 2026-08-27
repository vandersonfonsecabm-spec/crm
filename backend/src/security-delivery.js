const { createEmailDeliveryService } = require("./email-delivery/service");
const { createTestCaptureEmailDeliveryPort, createUnconfiguredEmailDeliveryPort } = require("./email-delivery/port");
const { assertDeliveryEncryptionReady } = require("./email-delivery/crypto");
const { validatedPublicAppUrl } = require("./email-delivery/links");

function createSecurityDelivery({ env = process.env, capture, prisma, port, logger } = {}) {
  if (capture !== undefined) {
    const adapter = createTestCaptureEmailDeliveryPort({ capture, env });
    return {
      async deliver(message) {
        const deliveryId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await adapter.send({
          deliveryId,
          idempotencyKey: deliveryId,
          kind: message.kind,
          email: message.email,
          token: message.token,
          to: message.email,
          actionUrl: `test-capture:${message.token}`,
          expiresAt: message.expiresAt,
        });
        return { status: "TEST_CAPTURED" };
      },
    };
  }
  const foundationEnabled = String(env.SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED || "").trim().toLowerCase() === "true";
  if (!foundationEnabled || !prisma?.emailDeliveryOutbox || !prisma?.emailDeliveryEvent) {
    return {
      configured: false,
      async deliver() {
        return { status: "PENDING_DELIVERY" };
      },
    };
  }
  assertDeliveryEncryptionReady(env);
  validatedPublicAppUrl(env);
  return createEmailDeliveryService({ prisma, port: port || createUnconfiguredEmailDeliveryPort(), env, logger });
}

module.exports = { createSecurityDelivery };
