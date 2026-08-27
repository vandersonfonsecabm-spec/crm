"use strict";

function createUnconfiguredEmailDeliveryPort() {
  return Object.freeze({
    configured: false,
    name: "UNCONFIGURED",
    async send() {
      throw deliveryPortError("EMAIL_DELIVERY_PROVIDER_NOT_CONFIGURED", false);
    },
  });
}

function createTestCaptureEmailDeliveryPort({ capture, env = process.env } = {}) {
  if (String(env.NODE_ENV || "").toLowerCase() !== "test" || typeof capture !== "function") {
    throw deliveryPortError("EMAIL_DELIVERY_TEST_CAPTURE_FORBIDDEN", false);
  }
  return Object.freeze({
    configured: true,
    name: "TEST_CAPTURE",
    async send(message) {
      await capture({ ...message });
      return { providerMessageId: `test:${message.deliveryId}` };
    },
  });
}

function classifyDeliveryError(error) {
  const code = sanitizeErrorCode(error?.code);
  const transient = error?.transient === true
    || error?.status === 429
    || Number(error?.status) >= 500
    || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "P1001", "P1008", "P1017", "P2024", "P2028", "P2034", "EMAIL_DELIVERY_TIMEOUT", "EMAIL_DELIVERY_LEASE_LOST"].includes(code);
  return { code, transient };
}

function deliveryPortError(code, transient = false) {
  const error = new Error(code);
  error.code = sanitizeErrorCode(code);
  error.transient = transient === true;
  return error;
}

function sanitizeErrorCode(value) {
  const normalized = String(value || "EMAIL_DELIVERY_FAILED").toUpperCase().replace(/[^A-Z0-9_:-]/g, "_");
  return normalized.slice(0, 80) || "EMAIL_DELIVERY_FAILED";
}

module.exports = {
  classifyDeliveryError,
  createTestCaptureEmailDeliveryPort,
  createUnconfiguredEmailDeliveryPort,
  deliveryPortError,
  sanitizeErrorCode,
};
