"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { startAutomationWorker } = require("../src/automations/worker");
const { createEmailDeliveryWorkerRuntime, shouldStartEmailDeliveryWorker } = require("../src/email-delivery/worker");

test("worker de e-mail permanece OFF por padrão e falha fechado sem provider configurado", () => {
  assert.equal(shouldStartEmailDeliveryWorker({ NODE_ENV: "production" }), false);
  assert.throws(
    () => createEmailDeliveryWorkerRuntime({
      prisma: { emailDeliveryOutbox: {}, emailDeliveryEvent: {} },
      env: { NODE_ENV: "production", SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED: "true", SECURITY_EMAIL_DELIVERY_WORKER_ENABLED: "true" },
    }),
    (error) => error.code === "EMAIL_DELIVERY_PROVIDER_NOT_CONFIGURED",
  );
});

test("worker compartilhado executa o subsistema injetado e aguarda o ciclo no shutdown", async () => {
  const timers = [];
  const calls = [];
  const worker = startAutomationWorker({
    emailDeliveryService: {
      async processDue(options) {
        calls.push(options);
        return { claimed: 1, delivered: 1, failed: 0 };
      },
    },
    env: {
      NODE_ENV: "production",
      SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED: "true",
      SECURITY_EMAIL_DELIVERY_WORKER_ENABLED: "true",
      AUTOMATION_WORKER_ENABLED: "false",
      NOTIFICATIONS_WORKER_ENABLED: "false",
      STOCK_DOMAIN_ENABLED: "false",
      STOCK_SYNC_WORKER_ENABLED: "false",
      META_INBOUND_WORKER_ENABLED: "false",
    },
    logger: { info() {}, warn() {}, error() {} },
    workerId: "email-worker-test",
    setTimeoutImpl(callback) { timers.push(callback); return callback; },
    clearTimeoutImpl() {},
  });
  assert.equal(worker.started, true);
  assert.equal(timers.length, 1);
  await timers.shift()();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].leaseOwner, "email-worker-test");
  await worker.stop();
});
