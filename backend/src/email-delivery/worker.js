"use strict";

const { createEmailDeliveryService } = require("./service");
const { createUnconfiguredEmailDeliveryPort } = require("./port");

function shouldStartEmailDeliveryWorker(env = process.env) {
  if (String(env.CRM_MAINTENANCE_READ_ONLY || "").trim().toLowerCase() === "true") return false;
  return String(env.SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED || "").trim().toLowerCase() === "true"
    && String(env.SECURITY_EMAIL_DELIVERY_WORKER_ENABLED || "").trim().toLowerCase() === "true";
}

function createEmailDeliveryWorkerRuntime({ prisma, env = process.env, port = createUnconfiguredEmailDeliveryPort(), logger = console } = {}) {
  const enabled = shouldStartEmailDeliveryWorker(env);
  if (enabled && port?.configured !== true) {
    const error = new Error("EMAIL_DELIVERY_PROVIDER_NOT_CONFIGURED");
    error.code = "EMAIL_DELIVERY_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  return {
    enabled,
    service: createEmailDeliveryService({ prisma, env, port, logger }),
  };
}

module.exports = { createEmailDeliveryWorkerRuntime, shouldStartEmailDeliveryWorker };
