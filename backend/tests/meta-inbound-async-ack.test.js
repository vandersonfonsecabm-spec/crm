const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  claimMetaInboundWebhook,
  recordMetaInboundFailure,
} = require("../src/integrations/metaInboundRetry");
const {
  createMetaInboundWebhookWorker,
  shouldStartMetaInboundWebhookWorker,
} = require("../src/integrations/metaInboundWebhookWorker");
const {
  createMetaInstagramClient,
} = require("../src/integrations/metaInstagramClient");
const { startAutomationWorker } = require("../src/automations/worker");
const { inspectGlobalConfiguration: inspectWhatsapp } = require("../src/integrations/whatsappInboundLifecycle");
const { inspectGlobalConfiguration: inspectInstagram } = require("../src/integrations/instagramInboundLifecycle");
const { inspectGlobalConfiguration: inspectMessenger } = require("../src/integrations/messengerInboundLifecycle");

test("server ACK path wires durable intakes instead of synchronous orchestrators", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
  for (const channel of ["WhatsApp", "Instagram", "Messenger"]) {
    assert.match(source, new RegExp(`processWebhook: create${channel}WebhookIntake\\(\\{ prisma \\}\\)`));
    assert.doesNotMatch(source, new RegExp(`processWebhook: create${channel}WebhookOrchestrator`));
  }
});

test("Meta inbound worker is deny-by-default and maintenance-safe", () => {
  assert.equal(shouldStartMetaInboundWebhookWorker({ NODE_ENV: "production" }), false);
  assert.equal(shouldStartMetaInboundWebhookWorker({ NODE_ENV: "test", META_INBOUND_WORKER_ENABLED: "true" }), false);
  assert.equal(shouldStartMetaInboundWebhookWorker({
    NODE_ENV: "production",
    META_INBOUND_WORKER_ENABLED: "true",
    CRM_MAINTENANCE_READ_ONLY: "true",
  }), false);
  assert.equal(shouldStartMetaInboundWebhookWorker({
    NODE_ENV: "production",
    META_INBOUND_WORKER_ENABLED: "true",
  }), true);
});

test("lifecycle Meta não fica ready quando o consumidor assíncrono está OFF", () => {
  const common = { NODE_ENV: "production", META_INBOUND_WORKER_ENABLED: "false" };
  assert.equal(inspectWhatsapp({ ...common, WHATSAPP_INTEGRATION_ENABLED: "true", WHATSAPP_INBOUND_ENABLED: "true", WHATSAPP_META_APP_ID: "app", WHATSAPP_PROVIDER_ENVIRONMENT: "STAGING", WHATSAPP_APP_SECRET: "secret-123", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-123" }).valid, false);
  assert.equal(inspectInstagram({ ...common, INSTAGRAM_INTEGRATION_ENABLED: "true", INSTAGRAM_INBOUND_ENABLED: "true", INSTAGRAM_META_APP_ID: "app", INSTAGRAM_PROVIDER_ENVIRONMENT: "STAGING", INSTAGRAM_APP_SECRET: "secret-123", INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "verify-123" }).valid, false);
  assert.equal(inspectMessenger({ ...common, MESSENGER_INTEGRATION_ENABLED: "true", MESSENGER_INBOUND_ENABLED: "true", MESSENGER_META_APP_ID: "app", MESSENGER_PROVIDER_ENVIRONMENT: "STAGING", MESSENGER_APP_SECRET: "secret-123", MESSENGER_WEBHOOK_VERIFY_TOKEN: "verify-123" }).valid, false);
});

test("dedicated worker process can run Meta inbound independently of automations", async () => {
  const scheduled = [];
  const calls = [];
  const worker = startAutomationWorker({
    service: null,
    metaInboundWorker: {
      async processDue(input) {
        calls.push(input);
        return { found: 0, processed: 0, deferred: 0, failed: 0 };
      },
    },
    env: { NODE_ENV: "production", META_INBOUND_WORKER_ENABLED: "true" },
    logger: { log() {}, info() {}, warn() {}, error() {} },
    workerId: "worker-meta-only",
    setTimeoutImpl(callback) {
      scheduled.push(callback);
      return scheduled.length;
    },
    clearTimeoutImpl() {},
  });
  assert.equal(worker.started, true);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  await worker.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].leaseOwner, "worker-meta-only");
});

test("bounded worker dispatches due provider events without touching future retries", async () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const calls = [];
  let query;
  const prisma = {
    eventoWebhook: {
      findMany: async (args) => {
        query = args;
        return [
          { id: 1, provedor: "WHATSAPP" },
          { id: 2, provedor: "INSTAGRAM" },
          { id: 3, provedor: "MESSENGER" },
        ];
      },
    },
  };
  const storedProcessors = Object.fromEntries(
    ["WHATSAPP", "INSTAGRAM", "MESSENGER"].map((provider) => [provider, async (input) => {
      calls.push({ provider, ...input });
      return { state: provider === "WHATSAPP" ? "PROCESSED" : "RETRYABLE" };
    }]),
  );
  const worker = createMetaInboundWebhookWorker({ prisma, clock: () => now, storedProcessors });
  const result = await worker.processDue({ now, limit: 3, leaseOwner: "worker-meta-a" });

  assert.deepEqual(result, { found: 3, processed: 1, deferred: 2, failed: 0 });
  assert.deepEqual(calls.map((entry) => [entry.provider, entry.eventoWebhookId, entry.leaseOwner]), [
    ["WHATSAPP", 1, "worker-meta-a"],
    ["INSTAGRAM", 2, "worker-meta-a"],
    ["MESSENGER", 3, "worker-meta-a"],
  ]);
  assert.equal(query.where.processadoEm, null);
  assert.deepEqual(query.where.provedor.in, ["WHATSAPP", "INSTAGRAM", "MESSENGER"]);
  assert.equal(query.take, 3);
});

test("durable claim writes explicit owner, expiry and clears retry schedule", async () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const event = {
    id: 11,
    empresaId: 7,
    canalIntegracaoId: 9,
    provedor: "WHATSAPP",
    statusProcessamento: "RECEBIDO",
    tentativas: 0,
    processadoEm: null,
    erroResumo: null,
    nextAttemptAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: new Date(now.getTime() - 1000),
  };
  let mutation;
  const prisma = {
    eventoWebhook: {
      findUnique: async () => event,
      updateMany: async (args) => {
        mutation = args;
        return { count: 1 };
      },
    },
  };
  const result = await claimMetaInboundWebhook({
    prisma,
    eventoWebhookId: event.id,
    provider: "WHATSAPP",
    leaseOwner: "worker-meta-a",
    clock: () => now,
    policy: { leaseMs: 30_000 },
  });

  assert.equal(result.state, "CLAIMED");
  assert.equal(result.lease.owner, "worker-meta-a");
  assert.equal(result.lease.expiresAt.getTime(), now.getTime() + 30_000);
  assert.equal(mutation.data.nextAttemptAt, null);
  assert.equal(mutation.data.leaseOwner, "worker-meta-a");
  assert.equal(mutation.data.leaseExpiresAt.getTime(), now.getTime() + 30_000);
});

test("transient failure releases lease and persists a future retry", async () => {
  const claimedAt = new Date("2026-08-27T12:00:00.000Z");
  const failedAt = new Date("2026-08-27T12:00:01.000Z");
  const expiresAt = new Date("2026-08-27T12:00:30.000Z");
  const event = {
    id: 12,
    empresaId: 7,
    canalIntegracaoId: 9,
    provedor: "INSTAGRAM",
    statusProcessamento: "PROCESSANDO",
    tentativas: 1,
    processadoEm: null,
    erroResumo: null,
    nextAttemptAt: null,
    leaseOwner: "worker-meta-a",
    leaseExpiresAt: expiresAt,
    updatedAt: claimedAt,
  };
  let mutation;
  const tx = {
    eventoWebhook: {
      findUnique: async () => event,
      updateMany: async (args) => {
        mutation = args;
        return { count: 1 };
      },
    },
    canalIntegracao: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const result = await recordMetaInboundFailure({
    prisma,
    eventoWebhookId: event.id,
    provider: "INSTAGRAM",
    lease: {
      eventoWebhookId: event.id,
      provider: "INSTAGRAM",
      attempt: 1,
      owner: "worker-meta-a",
      expiresAt,
      updatedAt: claimedAt,
    },
    error: Object.assign(new Error("temporary"), { code: "INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE" }),
    channel: {
      type: "INSTAGRAM_META",
      key: "instagram-meta-inbound-real",
      failureFallback: "INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE",
    },
    clock: () => failedAt,
    policy: { maxAttempts: 5, baseDelayMs: 5000, maxDelayMs: 5000 },
    scheduleRetry: true,
    random: () => 0.999999,
  });

  assert.equal(result.state, "RETRYABLE");
  assert.equal(mutation.data.statusProcessamento, "RECEBIDO");
  assert.equal(mutation.data.leaseOwner, null);
  assert.equal(mutation.data.leaseExpiresAt, null);
  assert.equal(mutation.data.nextAttemptAt.getTime(), failedAt.getTime() + 5000);
});

test("paused channel codes are retryable and not classified as permanent", () => {
  for (const channel of ["whatsapp", "instagram", "messenger"]) {
    const processor = fs.readFileSync(path.join(__dirname, `../src/integrations/${channel}WebhookProcessor.js`), "utf8");
    const orchestrator = fs.readFileSync(path.join(__dirname, `../src/integrations/${channel}WebhookOrchestrator.js`), "utf8");
    const code = `${channel.toUpperCase()}_EVENT_INTEGRATION_PAUSED`;
    assert.match(processor, new RegExp(code));
    assert.doesNotMatch(orchestrator, new RegExp(`PROCESSING_CONFLICT_CODES[\\s\\S]{0,1600}[\"']${code}[\"']`));
  }
});

test("paused channel remains pending without consuming its retry budget", async () => {
  const claimedAt = new Date("2026-08-27T12:00:00.000Z");
  const failedAt = new Date("2026-08-27T12:00:01.000Z");
  const expiresAt = new Date("2026-08-27T12:00:30.000Z");
  const event = {
    id: 13,
    empresaId: 7,
    canalIntegracaoId: 9,
    provedor: "MESSENGER",
    statusProcessamento: "PROCESSANDO",
    tentativas: 5,
    processadoEm: null,
    erroResumo: null,
    nextAttemptAt: null,
    leaseOwner: "worker-meta-a",
    leaseExpiresAt: expiresAt,
    updatedAt: claimedAt,
  };
  let mutation;
  const tx = {
    eventoWebhook: {
      findUnique: async () => event,
      updateMany: async (args) => {
        mutation = args;
        return { count: 1 };
      },
    },
    canalIntegracao: { updateMany: async () => ({ count: 0 }) },
  };
  const result = await recordMetaInboundFailure({
    prisma: { $transaction: async (callback) => callback(tx) },
    eventoWebhookId: event.id,
    provider: "MESSENGER",
    lease: {
      eventoWebhookId: event.id,
      provider: "MESSENGER",
      attempt: 5,
      owner: "worker-meta-a",
      expiresAt,
      updatedAt: claimedAt,
    },
    error: Object.assign(new Error("paused"), { code: "MESSENGER_EVENT_INTEGRATION_PAUSED" }),
    channel: {
      type: "MESSENGER_META",
      key: "messenger-meta-inbound-real",
      failureFallback: "MESSENGER_EVENT_PROCESSING_UNAVAILABLE",
    },
    clock: () => failedAt,
    policy: { maxAttempts: 5, baseDelayMs: 5000, maxDelayMs: 30_000 },
    scheduleRetry: true,
  });

  assert.equal(result.state, "RETRYABLE");
  assert.equal(mutation.data.statusProcessamento, "RECEBIDO");
  assert.deepEqual(mutation.data.tentativas, { decrement: 1 });
  assert.equal(mutation.data.nextAttemptAt.getTime(), failedAt.getTime() + 60_000);
});

test("Instagram OAuth transport is injectable and external network remains OFF-gated", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return { ok: true, async json() { return { access_token: "synthetic-token", expires_in: 3600 }; } };
  };
  const base = {
    NODE_ENV: "test",
    META_INSTAGRAM_APP_ID: "synthetic-app",
    META_INSTAGRAM_APP_SECRET: "synthetic-secret",
    META_INSTAGRAM_OAUTH_REDIRECT_URI: "https://example.test/oauth/meta/instagram",
  };
  const disabled = createMetaInstagramClient({ config: base, fetchImpl });
  await assert.rejects(
    () => disabled.exchangeAuthorizationCode({ code: "synthetic-code" }),
    (error) => error.code === "META_EXTERNAL_NETWORK_DISABLED",
  );
  assert.equal(requests, 0);

  const enabled = createMetaInstagramClient({
    config: { ...base, META_EXTERNAL_NETWORK_ENABLED: "true", META_INSTAGRAM_OAUTH_ENABLED: "true" },
    fetchImpl,
  });
  const token = await enabled.exchangeAuthorizationCode({ code: "synthetic-code" });
  assert.equal(token.accessToken, "synthetic-token");
  assert.equal(requests, 1);
});

test("Instagram redirect URI fails closed without fallback, query, fragment or production localhost", () => {
  const base = { NODE_ENV: "production", META_INSTAGRAM_APP_ID: "synthetic-app" };
  const state = "synthetic-state";
  const accepted = createMetaInstagramClient({
    config: { ...base, META_INSTAGRAM_OAUTH_REDIRECT_URI: "https://crm.example.test/oauth/meta/instagram" },
  });
  assert.match(accepted.buildAuthorizationUrl({ state }), /redirect_uri=https%3A%2F%2Fcrm\.example\.test/);

  for (const redirect of [
    "http://crm.example.test/oauth/meta/instagram",
    "https://user:pass@crm.example.test/oauth/meta/instagram",
    "https://crm.example.test/oauth/meta/instagram?next=1",
    "https://crm.example.test/oauth/meta/instagram#fragment",
    "https://localhost/oauth/meta/instagram",
  ]) {
    const client = createMetaInstagramClient({ config: { ...base, META_INSTAGRAM_OAUTH_REDIRECT_URI: redirect } });
    assert.throws(() => client.buildAuthorizationUrl({ state }), (error) => error.code === "META_REDIRECT_URI_INVALID");
  }

  const noLegacyFallback = createMetaInstagramClient({
    config: { ...base, INSTAGRAM_OAUTH_REDIRECT_URI: "https://legacy.example.test/callback" },
  });
  assert.throws(() => noLegacyFallback.buildAuthorizationUrl({ state }), (error) => error.code === "META_CONFIG_INVALID");

  const localDev = createMetaInstagramClient({
    config: {
      NODE_ENV: "development",
      META_INSTAGRAM_APP_ID: "synthetic-app",
      META_INSTAGRAM_OAUTH_REDIRECT_URI: "http://localhost:5173/oauth/meta/instagram",
    },
  });
  assert.match(localDev.buildAuthorizationUrl({ state }), /localhost%3A5173/);
});
