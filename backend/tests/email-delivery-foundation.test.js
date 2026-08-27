"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { openDeliveryToken, sealDeliveryToken } = require("../src/email-delivery/crypto");
const { createEmailDeliveryService } = require("../src/email-delivery/service");
const { createTestCaptureEmailDeliveryPort, createUnconfiguredEmailDeliveryPort } = require("../src/email-delivery/port");
const { createSecurityDelivery } = require("../src/security-delivery");

const ENV = Object.freeze({
  NODE_ENV: "test",
  SECURITY_EMAIL_DELIVERY_ENCRYPTION_KEY: "email-delivery-test-key-with-at-least-32-bytes",
  SECURITY_EMAIL_PUBLIC_APP_URL: "https://crm-staging.example.test",
});

test("token fica selado com AAD e nunca aparece no ciphertext", () => {
  const context = { empresaId: 7, deliveryId: "delivery-1", kind: "USER_INVITE", targetId: "invite-1", targetVersion: 1 };
  const token = "token-super-secreto-de-teste";
  const ciphertext = sealDeliveryToken(token, context, { env: ENV });
  assert.equal(ciphertext.includes(token), false);
  assert.equal(openDeliveryToken(ciphertext, context, { env: ENV }), token);
  assert.throws(
    () => openDeliveryToken(ciphertext, { ...context, empresaId: 8 }, { env: ENV }),
    (error) => error.code === "EMAIL_DELIVERY_CONTEXT_INVALID",
  );
});

test("porta default falha fechada e capture só existe em NODE_ENV=test", async () => {
  const unconfigured = createUnconfiguredEmailDeliveryPort();
  assert.equal(unconfigured.configured, false);
  await assert.rejects(unconfigured.send({}), (error) => error.code === "EMAIL_DELIVERY_PROVIDER_NOT_CONFIGURED");
  assert.throws(
    () => createTestCaptureEmailDeliveryPort({ env: { NODE_ENV: "production" }, capture() {} }),
    (error) => error.code === "EMAIL_DELIVERY_TEST_CAPTURE_FORBIDDEN",
  );
  const disabled = createSecurityDelivery({ env: { NODE_ENV: "production" }, prisma: { emailDeliveryOutbox: {}, emailDeliveryEvent: {} } });
  assert.equal((await disabled.deliver({})).status, "PENDING_DELIVERY");
  assert.throws(
    () => createSecurityDelivery({ env: { NODE_ENV: "production", SECURITY_EMAIL_DELIVERY_FOUNDATION_ENABLED: "true" }, prisma: { emailDeliveryOutbox: {}, emailDeliveryEvent: {} } }),
    (error) => error.code === "EMAIL_DELIVERY_ENCRYPTION_KEY_REQUIRED",
  );
});

test("enqueue é atômico por revisão, entrega usa idempotency key estável e limpa token", async () => {
  const db = fakePrisma();
  db.state.invites.push(inviteRow());
  const sent = [];
  const service = createEmailDeliveryService({
    prisma: db,
    env: ENV,
    port: { configured: true, async send(message) { sent.push(message); return { providerMessageId: "provider-message-1" }; } },
    logger: silentLogger(),
  });
  const expiresAt = new Date(Date.now() + 60_000);
  const queued = await db.$transaction((tx) => service.enqueue({
    tx,
    empresaId: 1,
    kind: "USER_INVITE",
    sourceId: "invite-1",
    expectedRevision: 0,
    recipient: "invite@example.test",
    token: "invite-token-1",
    expiresAt,
    correlationId: "email-test-1",
  }));
  assert.equal(queued.status, "PENDING");
  assert.equal(db.state.invites[0].deliveryRevision, 1);
  assert.equal(db.state.outbox[0].payloadCiphertext.includes("invite-token-1"), false);
  assert.equal(db.state.events[0].type, "QUEUED");

  const result = await service.processDue({ now: new Date(), leaseOwner: "worker-1" });
  assert.deepEqual({ delivered: result.delivered, failed: result.failed }, { delivered: 1, failed: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].idempotencyKey, db.state.outbox[0].idempotencyKey);
  assert.match(sent[0].actionUrl, /^https:\/\/crm-staging\.example\.test\/aceitar-convite\?token=/);
  assert.equal(db.state.outbox[0].status, "DELIVERED");
  assert.equal(db.state.outbox[0].payloadCiphertext, null);
  assert.equal(db.state.invites[0].deliveryStatus, "DELIVERED");
});

test("falha transitória agenda retry e a segunda tentativa converge sem duplicar claim", async () => {
  const db = fakePrisma();
  db.state.resets.push(resetRow());
  let calls = 0;
  const keys = [];
  const service = createEmailDeliveryService({
    prisma: db,
    env: ENV,
    port: {
      configured: true,
      async send(message) {
        calls += 1;
        keys.push(message.idempotencyKey);
        if (calls === 1) throw Object.assign(new Error("temporary"), { code: "ETIMEDOUT", transient: true });
        return { providerMessageId: "provider-reset-1" };
      },
    },
    logger: silentLogger(),
  });
  const start = new Date();
  await service.enqueue({
    empresaId: 1,
    kind: "PASSWORD_RESET",
    sourceId: "reset-1",
    expectedRevision: 0,
    recipient: "reset@example.test",
    token: "reset-token-1",
    expiresAt: new Date(start.getTime() + 60_000),
  });
  const claimNow = new Date(start.getTime() + 100);
  const [firstClaim, secondClaim] = await Promise.all([
    service.claimDue({ now: claimNow, leaseOwner: "worker-a", limit: 1 }),
    service.claimDue({ now: claimNow, leaseOwner: "worker-b", limit: 1 }),
  ]);
  assert.equal(firstClaim.length + secondClaim.length, 1);
  await resetClaimForProcess(db.state.outbox[0]);

  const first = await service.processDue({ now: claimNow, leaseOwner: "worker-a", maxAttempts: 3 });
  assert.equal(first.retried, 1);
  assert.equal(db.state.outbox[0].status, "RETRY_WAIT");
  assert.notEqual(db.state.outbox[0].payloadCiphertext, null);
  const second = await service.processDue({ now: new Date(claimNow.getTime() + 10_000), leaseOwner: "worker-b", maxAttempts: 3 });
  assert.equal(second.delivered, 1);
  assert.equal(db.state.outbox[0].status, "DELIVERED");
  assert.deepEqual(keys, [keys[0], keys[0]]);
});

test("falha permanente e expiração são terminais, sanitizadas e sem retenção do token", async () => {
  const db = fakePrisma();
  db.state.resets.push(resetRow());
  const service = createEmailDeliveryService({
    prisma: db,
    env: ENV,
    port: { configured: true, async send() { throw Object.assign(new Error("recipient rejected token=secret"), { code: "INVALID_RECIPIENT", status: 400 }); } },
    logger: silentLogger(),
  });
  await service.enqueue({ empresaId: 1, kind: "PASSWORD_RESET", sourceId: "reset-1", expectedRevision: 0, recipient: "reset@example.test", token: "permanent-token", expiresAt: new Date(Date.now() + 60_000) });
  const failed = await service.processDue({ now: new Date(), leaseOwner: "worker" });
  assert.equal(failed.failed, 1);
  assert.equal(db.state.outbox[0].status, "FAILED");
  assert.equal(db.state.outbox[0].payloadCiphertext, null);
  assert.equal(db.state.outbox[0].lastErrorCode, "INVALID_RECIPIENT");
  assert.equal(JSON.stringify(db.state.events).includes("recipient rejected"), false);

  db.state.resets.push({ ...resetRow(), id: "reset-expired" });
  await service.enqueue({ empresaId: 1, kind: "PASSWORD_RESET", sourceId: "reset-expired", expectedRevision: 0, recipient: "expired@example.test", token: "expired-token", expiresAt: new Date(Date.now() + 1) });
  const expired = await service.processDue({ now: new Date(Date.now() + 100), leaseOwner: "worker" });
  assert.equal(expired.expired, 1);
  const expiredRow = db.state.outbox.find((row) => row.sourceId === "reset-expired");
  assert.equal(expiredRow.status, "EXPIRED");
  assert.equal(expiredRow.payloadCiphertext, null);
});

test("receipt é idempotente, bounce posterior vence e evento antigo não regride", async () => {
  const db = fakePrisma();
  db.state.invites.push(inviteRow());
  const service = createEmailDeliveryService({
    prisma: db,
    env: ENV,
    port: { configured: true, async send() { return { providerMessageId: "provider-2" }; } },
    logger: silentLogger(),
  });
  await service.enqueue({ empresaId: 1, kind: "USER_INVITE", sourceId: "invite-1", expectedRevision: 0, recipient: "invite@example.test", token: "token-2", expiresAt: new Date(Date.now() + 60_000) });
  await service.processDue({ leaseOwner: "worker" });
  const delivery = db.state.outbox[0];
  const deliveredAt = new Date("2026-08-27T12:00:00.000Z");
  const bouncedAt = new Date("2026-08-27T12:01:00.000Z");
  const delivered = await service.recordProviderEvent({ empresaId: 1, deliveryId: delivery.id, providerEventId: "event-delivered", providerOccurredAt: deliveredAt, status: "DELIVERED", providerMessageId: "provider-2" });
  assert.equal(delivered.applied, true);
  const bounce = await service.recordProviderEvent({ empresaId: 1, deliveryId: delivery.id, providerEventId: "event-bounce", providerOccurredAt: bouncedAt, status: "BOUNCED", providerMessageId: "provider-2", metadata: { category: "hard", token: "must-not-persist" } });
  assert.equal(bounce.applied, true);
  const duplicate = await service.recordProviderEvent({ empresaId: 1, deliveryId: delivery.id, providerEventId: "event-bounce", providerOccurredAt: bouncedAt, status: "BOUNCED", providerMessageId: "provider-2" });
  assert.equal(duplicate.duplicate, true);
  const stale = await service.recordProviderEvent({ empresaId: 1, deliveryId: delivery.id, providerEventId: "event-stale", providerOccurredAt: new Date("2026-08-27T11:59:00.000Z"), status: "DELIVERED", providerMessageId: "provider-2" });
  assert.equal(stale.applied, false);
  assert.equal(db.state.outbox[0].status, "BOUNCED");
  assert.equal(db.state.invites[0].deliveryStatus, "BOUNCED");
  const bounceEvent = db.state.events.find((event) => event.providerEventId === "event-bounce");
  assert.equal(bounceEvent.metadataSanitizedJson.includes("token"), false);
});

function fakePrisma() {
  const state = { invites: [], resets: [], outbox: [], events: [] };
  const db = {
    state,
    async $transaction(callback) { return callback(db); },
    conviteUsuario: sourceDelegate(state.invites),
    tokenRecuperacaoSenha: sourceDelegate(state.resets),
    emailDeliveryOutbox: {
      async create({ data }) {
        if (state.outbox.some((row) => row.empresaId === data.empresaId && row.idempotencyKey === data.idempotencyKey)) throw prismaUnique();
        const now = new Date();
        const row = { ...data, createdAt: now, updatedAt: now, leaseOwner: null, leaseToken: null, leaseExpiresAt: null, providerMessageId: null, lastErrorCode: null, deliveredAt: null, failedAt: null };
        state.outbox.push(row);
        return { ...row };
      },
      async findMany({ where = {}, orderBy, take } = {}) {
        return state.outbox.filter((row) => matchesOutbox(row, where)).slice(0, take || state.outbox.length).map((row) => ({ ...row }));
      },
      async findFirst({ where }) { const row = state.outbox.find((item) => matchesOutbox(item, where)); return row ? { ...row } : null; },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of state.outbox) {
          if (!matchesOutbox(row, where)) continue;
          applyData(row, data);
          row.updatedAt = new Date(row.updatedAt.getTime() + 1);
          count += 1;
        }
        return { count };
      },
    },
    emailDeliveryEvent: {
      async create({ data }) {
        if (data.providerEventId && state.events.some((row) => row.empresaId === data.empresaId && row.providerEventId === data.providerEventId)) throw prismaUnique();
        const row = { id: state.events.length + 1, occurredAt: new Date(), providerEventId: null, providerOccurredAt: null, ...data };
        state.events.push(row);
        return { ...row };
      },
      async findFirst({ where, orderBy } = {}) {
        const rows = state.events.filter((row) => matchesEvent(row, where));
        if (orderBy) rows.sort((left, right) => Number(right.providerOccurredAt || 0) - Number(left.providerOccurredAt || 0) || right.id - left.id);
        return rows[0] ? { ...rows[0] } : null;
      },
    },
  };
  return db;
}

function sourceDelegate(rows) {
  return {
    async findFirst({ where }) { const row = rows.find((item) => matchesSource(item, where)); return row ? { ...row } : null; },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of rows) {
        if (!matchesSource(row, where)) continue;
        applyData(row, data);
        count += 1;
      }
      return { count };
    },
  };
}

function matchesSource(row, where = {}) {
  for (const [key, expected] of Object.entries(where)) {
    if (expected === null) { if (row[key] !== null) return false; continue; }
    if (expected && typeof expected === "object" && Object.hasOwn(expected, "gt")) { if (!(row[key] > expected.gt)) return false; continue; }
    if (row[key] !== expected) return false;
  }
  return true;
}

function matchesOutbox(row, where = {}) {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR") { if (!expected.some((item) => matchesOutbox(row, item))) return false; continue; }
    if (key === "status" && expected?.in) { if (!expected.in.includes(row.status)) return false; continue; }
    if (key === "sourceId" && expected?.in) { if (!expected.in.includes(row.sourceId)) return false; continue; }
    if (expected === null) { if (row[key] !== null) return false; continue; }
    if (expected && typeof expected === "object") {
      if (Object.hasOwn(expected, "lt") && !(row[key] < expected.lt)) return false;
      if (Object.hasOwn(expected, "lte") && !(row[key] <= expected.lte)) return false;
      if (Object.hasOwn(expected, "gt") && !(row[key] > expected.gt)) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function matchesEvent(row, where = {}) {
  for (const [key, expected] of Object.entries(where || {})) {
    if (expected && typeof expected === "object" && Object.hasOwn(expected, "not")) { if (row[key] === expected.not) return false; continue; }
    if (row[key] !== expected) return false;
  }
  return true;
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && Object.hasOwn(value, "increment")) row[key] = Number(row[key] || 0) + value.increment;
    else row[key] = value;
  }
}

function inviteRow() {
  return { id: "invite-1", empresaId: 1, deliveryRevision: 0, deliveryStatus: "PENDING", aceitoEm: null, revogadoEm: null, expiraEm: new Date(Date.now() + 60_000) };
}

function resetRow() {
  return { id: "reset-1", empresaId: 1, deliveryRevision: 0, usadoEm: null, revogadoEm: null, expiraEm: new Date(Date.now() + 60_000) };
}

function prismaUnique() {
  const error = new Error("unique");
  error.code = "P2002";
  return error;
}

function silentLogger() { return { warn() {}, info() {}, error() {} }; }

async function resetClaimForProcess(row) {
  row.status = "PENDING";
  row.attempts = 0;
  row.leaseOwner = null;
  row.leaseToken = null;
  row.leaseExpiresAt = null;
}
