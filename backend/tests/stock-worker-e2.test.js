"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runStockWorkerCycle, createProjectionConsumer } = require("../src/stock/worker");
const { processStockOutboxBatch, claimStockOutbox } = require("../src/stock/outbox");

test("stock worker stays dormant when flags are absent and does not query schema", async () => {
  let touched = false;
  const prisma = new Proxy({}, { get() { touched = true; throw new Error("schema should not be queried"); } });
  const result = await runStockWorkerCycle({ prisma, env: {}, now: new Date() });
  assert.deepEqual(result, { enabled: false, claimed: 0, processed: 0, quarantined: 0, evaluated: 0, tenants: 0 });
  assert.equal(touched, false);
});

test("stock worker respeita cancelamento antes de tocar tenant ou outbox", async () => {
  const controller = new AbortController();
  controller.abort();
  let touched = false;
  const prisma = new Proxy({}, { get() { touched = true; throw new Error("worker cancelled before query"); } });
  const result = await runStockWorkerCycle({
    prisma,
    env: { STOCK_DOMAIN_ENABLED: "true", STOCK_SYNC_WORKER_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1" },
    signal: controller.signal,
  });
  assert.equal(result.cancelled, true);
  assert.equal(touched, false);
});

test("stock worker stops after an aborted rule evaluation before outbox, retention, or checkpoint work", async () => {
  const controller = new AbortController();
  let checkpointWritten = false;
  let evaluationSignal = null;
  const result = await runStockWorkerCycle({
    prisma: new Proxy({}, { get(_target, property) {
      if (property === "linhaImportacaoEstoque") throw new Error("retention must not start after evaluation abort");
      return undefined;
    } }),
    rules: {
      async evaluateTenant(_tenantId, options) {
        evaluationSignal = options.signal;
        controller.abort();
        return { evaluated: 1, matched: 1, resolved: 0, nextCursor: 8 };
      },
    },
    env: {
      STOCK_DOMAIN_ENABLED: "true",
      STOCK_SYNC_WORKER_ENABLED: "true",
      STOCK_RULE_ENGINE_ENABLED: "true",
      STOCK_H8_PROJECTION_ENABLED: "false",
      STOCK_RETENTION_ENABLED: "true",
      STOCK_RETENTION_WORKER_ENABLED: "true",
      STOCK_TENANT_ALLOWLIST: "1",
    },
    signal: controller.signal,
    checkpointStore: {
      async read() { return null; },
      async write() { checkpointWritten = true; },
      async clear() { checkpointWritten = true; },
    },
    logger: { error() {}, info() {} },
  });
  assert.equal(evaluationSignal, controller.signal);
  assert.equal(result.cancelled, true);
  assert.equal(result.evaluated, 0);
  assert.equal(checkpointWritten, false);
});

test("stock worker reports cancellation when an evaluator aborts and throws", async () => {
  const controller = new AbortController();
  const result = await runStockWorkerCycle({
    prisma: new Proxy({}, { get() { throw new Error("outbox must not start after an evaluator abort"); } }),
    rules: {
      async evaluateTenant() {
        controller.abort();
        throw Object.assign(new Error("aborted"), { code: "ABORT_ERR" });
      },
    },
    env: {
      STOCK_DOMAIN_ENABLED: "true",
      STOCK_SYNC_WORKER_ENABLED: "true",
      STOCK_RULE_ENGINE_ENABLED: "true",
      STOCK_H8_PROJECTION_ENABLED: "false",
      STOCK_TENANT_ALLOWLIST: "1,2",
    },
    signal: controller.signal,
    checkpointStore: { async read() { return null; }, async write() {}, async clear() {} },
    logger: { error() {}, info() {} },
  });
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.failedTenants, []);
});

test("stock worker stops after outbox observes abort and does not begin retention or checkpoint work", async () => {
  const controller = new AbortController();
  let outboxUpdates = 0;
  let checkpointWritten = false;
  const prisma = {
    eventoOutboxEstoque: {
      async findMany() {
        controller.abort();
        return [{ id: 41, empresaId: 1, attempts: 0, payloadStructuredJson: "{}" }];
      },
      async updateMany() { outboxUpdates += 1; return { count: 1 }; },
    },
    linhaImportacaoEstoque: {
      async findMany() { throw new Error("retention must not start after outbox abort"); },
      async deleteMany() { throw new Error("retention must not delete after outbox abort"); },
    },
  };
  const result = await runStockWorkerCycle({
    prisma,
    rules: { async evaluateTenant() { return { evaluated: 0, matched: 0, resolved: 0, nextCursor: 7 }; } },
    env: {
      STOCK_DOMAIN_ENABLED: "true",
      STOCK_SYNC_WORKER_ENABLED: "true",
      STOCK_RULE_ENGINE_ENABLED: "true",
      STOCK_H8_PROJECTION_ENABLED: "true",
      STOCK_RETENTION_ENABLED: "true",
      STOCK_RETENTION_WORKER_ENABLED: "true",
      STOCK_TENANT_ALLOWLIST: "1",
    },
    signal: controller.signal,
    checkpointStore: {
      async read() { return null; },
      async write() { checkpointWritten = true; },
      async clear() { checkpointWritten = true; },
    },
    logger: { error() {}, info() {}, warn() {} },
  });
  assert.equal(result.cancelled, true);
  assert.equal(outboxUpdates, 0);
  assert.equal(checkpointWritten, false);
});

test("stock worker stops when retention observes abort before any deletion", async () => {
  const controller = new AbortController();
  let deleted = false;
  const prisma = {
    notificacao: {
      async findMany() {
        controller.abort();
        return [];
      },
    },
    linhaImportacaoEstoque: {
      async findMany() { return [{ id: 1 }]; },
      async deleteMany() { deleted = true; return { count: 1 }; },
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const result = await runStockWorkerCycle({
    prisma,
    env: {
      STOCK_DOMAIN_ENABLED: "true",
      STOCK_SYNC_WORKER_ENABLED: "true",
      STOCK_H8_PROJECTION_ENABLED: "false",
      STOCK_RETENTION_ENABLED: "true",
      STOCK_RETENTION_WORKER_ENABLED: "true",
      STOCK_RETENTION_DAYS: "30",
      STOCK_TENANT_ALLOWLIST: "1",
    },
    signal: controller.signal,
    logger: { error() {}, info() {} },
  });
  assert.equal(result.cancelled, true);
  assert.equal(deleted, false);
});

test("outbox releases an unstarted claim with the original lease CAS after abort", async () => {
  const controller = new AbortController();
  const updates = [];
  const prisma = {
    eventoOutboxEstoque: {
      async findMany() {
        return [{ id: 42, empresaId: 1, attempts: 0, payloadStructuredJson: JSON.stringify({ schemaVersion: "stock-event.v1", eventType: "StockRecordObserved.v1", empresaId: 1, aggregateType: "FonteEstoque", aggregateId: "source-1", materialVersion: 1, occurredAt: "2026-09-03T00:00:00.000Z", payload: {} }) }];
      },
      async updateMany(args) {
        updates.push(args);
        if (updates.length === 1) controller.abort();
        return { count: 1 };
      },
    },
  };
  const result = await processStockOutboxBatch({
    prisma,
    empresaId: 1,
    owner: "stock-abort-test",
    now: new Date("2026-09-03T00:00:00.000Z"),
    h8ProjectionEnabled: true,
    consumer: async () => { throw new Error("consumer must not start after abort"); },
    signal: controller.signal,
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.released, 1);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].where.id, 42);
  assert.equal(updates[1].where.leaseOwner, "stock-abort-test");
  assert.ok(updates[1].where.leaseExpiresAt instanceof Date);
  assert.equal(updates[1].data.status, "PENDING");
  assert.deepEqual(updates[1].data.attempts, { decrement: 1 });
});

test("outbox finishes an already-started consumer then releases later claims after abort", async () => {
  const controller = new AbortController();
  const updates = [];
  const seen = [];
  const event = (id) => ({
    schemaVersion: "stock-event.v1",
    eventType: "StockRecordObserved.v1",
    empresaId: 1,
    aggregateType: "FonteEstoque",
    aggregateId: `source-${id}`,
    materialVersion: 1,
    occurredAt: "2026-09-03T00:00:00.000Z",
    payload: {},
  });
  const prisma = {
    eventoOutboxEstoque: {
      async findMany() {
        return [
          { id: 51, empresaId: 1, attempts: 0, payloadStructuredJson: JSON.stringify(event(51)) },
          { id: 52, empresaId: 1, attempts: 0, payloadStructuredJson: JSON.stringify(event(52)) },
        ];
      },
      async updateMany(args) { updates.push(args); return { count: 1 }; },
    },
  };
  const result = await processStockOutboxBatch({
    prisma,
    empresaId: 1,
    owner: "stock-abort-test",
    limit: 2,
    now: new Date("2026-09-03T00:00:00.000Z"),
    h8ProjectionEnabled: true,
    consumer: async (eventRow, _row, options) => {
      seen.push({ id: eventRow.aggregateId, signal: options.signal });
      controller.abort();
      return { handled: true };
    },
    signal: controller.signal,
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.processed, 1);
  assert.equal(result.released, 1);
  assert.deepEqual(seen, [{ id: "source-51", signal: controller.signal }]);
  const releasedRow = updates.at(-1);
  assert.equal(releasedRow.where.id, 52);
  assert.equal(releasedRow.where.leaseOwner, "stock-abort-test");
  assert.equal(releasedRow.data.status, "PENDING");
});

test("outbox releases a consumer AbortError without quarantining or duplicating the event", async () => {
  const controller = new AbortController();
  const updates = [];
  const row = {
    id: 53,
    empresaId: 1,
    attempts: 0,
    status: "PENDING",
    leaseOwner: null,
    leaseExpiresAt: null,
    payloadStructuredJson: JSON.stringify({
      schemaVersion: "stock-event.v1",
      eventType: "StockRecordObserved.v1",
      empresaId: 1,
      aggregateType: "FonteEstoque",
      aggregateId: "source-53",
      materialVersion: 1,
      occurredAt: "2026-09-03T00:00:00.000Z",
      payload: {},
    }),
  };
  const prisma = {
    eventoOutboxEstoque: {
      async findMany() { return [row]; },
      async updateMany({ where, data }) {
        updates.push({ where, data });
        const ownerMatches = where.leaseOwner === undefined || row.leaseOwner === where.leaseOwner;
        const expiresMatches = where.leaseExpiresAt === undefined || row.leaseExpiresAt?.getTime() === where.leaseExpiresAt?.getTime();
        if (where.status?.in && row.status === "PENDING") {
          row.status = data.status;
          row.leaseOwner = data.leaseOwner;
          row.leaseExpiresAt = data.leaseExpiresAt;
          row.attempts += data.attempts.increment;
          return { count: 1 };
        }
        if (where.status === "PROCESSING" && ownerMatches && expiresMatches && row.status === "PROCESSING") {
          row.status = data.status;
          row.availableAt = data.availableAt;
          row.leaseOwner = data.leaseOwner;
          row.leaseExpiresAt = data.leaseExpiresAt;
          row.attempts -= data.attempts.decrement;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  const result = await processStockOutboxBatch({
    prisma,
    empresaId: 1,
    owner: "stock-consumer-abort",
    now: new Date("2026-09-03T00:00:00.000Z"),
    h8ProjectionEnabled: true,
    signal: controller.signal,
    consumer: async (_event, claimedRow, options) => {
      assert.equal(options.signal, controller.signal);
      assert.equal(claimedRow.leaseOwner, "stock-consumer-abort");
      assert.ok(claimedRow.leaseExpiresAt instanceof Date);
      controller.abort();
      throw Object.assign(new Error("consumer observed abort"), { name: "AbortError" });
    },
  });

  assert.deepEqual(result, { claimed: 1, processed: 0, quarantined: 0, cancelled: true, released: 1 });
  assert.equal(row.status, "PENDING");
  assert.equal(row.leaseOwner, null);
  assert.equal(row.leaseExpiresAt, null);
  assert.equal(row.attempts, 0);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].data.status, "PENDING");
  assert.equal(updates[1].where.leaseOwner, "stock-consumer-abort");
  assert.equal(updates[1].where.leaseExpiresAt.getTime(), updates[0].data.leaseExpiresAt.getTime());
});

test("outbox rejects malformed/future envelopes into quarantine without H8 calls", async () => {
  const rows = [{ id: 1, empresaId: 1, payloadStructuredJson: JSON.stringify({ schemaVersion: "stock-event.v999", eventType: "StockRecordObserved.v1" }), status: "PROCESSING", leaseOwner: "w" }];
  const updates = [];
  const claims = [];
  const prisma = {
    eventoOutboxEstoque: {
      findMany: async (args) => { claims.push(args); return rows; },
      updateMany: async (args) => { updates.push(args); return { count: 1 }; },
    },
  };
  const result = await processStockOutboxBatch({ prisma, empresaId: 1, owner: "w", limit: 1, now: new Date(), h8ProjectionEnabled: true, consumer: async () => ({ handled: true }) });
  assert.equal(result.quarantined, 1);
  assert.equal(claims[0].where.empresaId, 1);
  assert.equal(updates.at(-1).data.status, "QUARANTINED");
});

test("outbox retries transient Prisma transaction conflicts without quarantining the leased tenant row", async () => {
  const event = {
    schemaVersion: "stock-event.v1",
    eventType: "StockRecordObserved.v1",
    empresaId: 7,
    aggregateType: "FonteEstoque",
    aggregateId: "source-1",
    materialVersion: 1,
    occurredAt: "2026-08-24T12:00:00.000Z",
    payload: {},
  };
  for (const failure of [
    { code: "P2028", name: "PrismaClientKnownRequestError", message: "Transaction API error: transaction expired." },
    { code: "P2034", name: "PrismaClientKnownRequestError", message: "Transaction failed due to a write conflict or a deadlock." },
  ]) {
    const updates = [];
    const prisma = {
      eventoOutboxEstoque: {
        findMany: async () => [{ id: 1, empresaId: 7, attempts: 0, payloadStructuredJson: JSON.stringify(event) }],
        updateMany: async (args) => { updates.push(args); return { count: 1 }; },
      },
    };
    const error = Object.assign(new Error(failure.message), failure);
    const result = await processStockOutboxBatch({
      prisma,
      empresaId: 7,
      owner: "w",
      limit: 1,
      now: new Date("2026-08-24T12:00:00.000Z"),
      h8ProjectionEnabled: true,
      consumer: async () => { throw error; },
    });
    assert.equal(result.processed, 0);
    assert.equal(result.quarantined, 0);
    assert.equal(updates.length, 2);
    const retry = updates.at(-1);
    assert.equal(retry.data.status, "PENDING");
    assert.equal(retry.where.empresaId, 7);
    assert.equal(retry.where.leaseOwner, "w");
    assert.ok(retry.where.leaseExpiresAt instanceof Date);
    assert.equal(retry.where.leaseExpiresAt.getTime(), updates[0].data.leaseExpiresAt.getTime());
  }
});

test("worker leaves valid E2 outbox pending while H8 projection is OFF", async () => {
  let queried = false;
  const prisma = new Proxy({}, { get() { queried = true; throw new Error("outbox must remain pending while H8 is off"); } });
  const result = await runStockWorkerCycle({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_SYNC_WORKER_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1", STOCK_H8_PROJECTION_ENABLED: "false" } });
  assert.equal(result.enabled, true);
  assert.equal(result.claimed, 0);
  assert.equal(result.processed, 0);
  assert.equal(queried, false);
});

test("outbox claims every row for the scoped tenant and reclaims expired processing leases", async () => {
  const updates = [];
  const prisma = { eventoOutboxEstoque: {
    findMany: async (args) => { assert.equal(args.where.empresaId, 7); assert.deepEqual(args.where.status.in, ["PENDING", "PROCESSING"]); return [{ id: 1, empresaId: 7 }, { id: 2, empresaId: 7 }]; },
    updateMany: async (args) => { updates.push(args); return { count: 1 }; },
  } };
  const rows = await claimStockOutbox({ prisma, empresaId: 7, owner: "w", limit: 2, now: new Date() });
  assert.equal(rows.length, 2);
  assert.equal(updates.every((entry) => entry.where.empresaId === 7), true);
});

test("rule cursor rotates beyond the first bounded page", async () => {
  const cursors = [];
  const checkpointStore = memoryCheckpointStore();
  const rules = { evaluateTenant: async (_tenant, options) => { cursors.push(options.cursor || null); return { evaluated: 1, matched: 0, resolved: 0, nextCursor: cursors.length === 1 ? 10 : null }; } };
  const env = { STOCK_DOMAIN_ENABLED: "true", STOCK_SYNC_WORKER_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1", STOCK_H8_PROJECTION_ENABLED: "false" };
  const prisma = {};
  await runStockWorkerCycle({ prisma, rules, env, limit: 1, checkpointStore });
  await runStockWorkerCycle({ prisma, rules, env, limit: 1, checkpointStore });
  assert.deepEqual(cursors, [null, 10]);
});

test("active non-projection stock events use the durable outbox sink", async () => {
  const consumer = createProjectionConsumer({ prisma: {}, empresaId: 1, env: {}, now: new Date() });
  assert.deepEqual(await consumer({ eventType: "StockRecordObserved.v1" }), { handled: true, sinked: true });
  assert.deepEqual(await consumer({ eventType: "StockSyncFailed.v1" }), { handled: true, sinked: true });
});

test("one tenant failure is isolated from the remaining worker cycle", async () => {
  const seen = [];
  const telemetry = [];
  const result = await runStockWorkerCycle({
    prisma: {},
    rules: { evaluateTenant: async (tenantId) => { seen.push(tenantId); if (tenantId === 1) throw new Error("poison tenant"); return { evaluated: 2, matched: 0, resolved: 0 }; } },
    env: { STOCK_DOMAIN_ENABLED: "true", STOCK_SYNC_WORKER_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1,2", STOCK_H8_PROJECTION_ENABLED: "false" },
    logger: { error() {}, info: (event, fields) => telemetry.push({ event, fields }) },
  });
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(result.failedTenants, [1]);
  assert.equal(result.tenants, 2);
  const cycle = telemetry.find((entry) => entry.event === "stock_worker_cycle");
  assert.ok(cycle);
  assert.ok(cycle.fields.durationMs >= 0 && cycle.fields.durationMs <= 10 * 60 * 1000);
  assert.deepEqual(cycle.fields.failedTenants, [1]);
  assert.equal(cycle.fields.failedCount, 1);
});

test("target override recipient policy wins over tenant fallback", async () => {
  let projection;
  const prisma = {
    avaliacaoRegraEstoque: { findFirst: async () => ({ ruleType: "STOCK_LOT_EXPIRING", occurrenceKey: "1:logicalExpiryLifecycle:4:scope", loteEstoqueId: 4, sourceConnectionId: 9, matched: true, priority: "ATENCAO", materialVersion: 2 }) },
    configuracaoRegraEstoque: { findFirst: async () => ({ recipientPolicyJson: JSON.stringify({ usuarioIds: [10] }) }) },
    overrideEstoque: { findFirst: async () => ({ recipientPolicyJson: JSON.stringify({ usuarioIds: [11] }) }) },
    usuario: { findMany: async ({ where }) => { assert.deepEqual(where.id.in, [11]); return [{ id: 11 }]; } },
  };
  const consumer = createProjectionConsumer({ prisma, empresaId: 1, env: {}, now: new Date(), projector: async (input) => { projection = input; } });
  const outcome = await consumer({ eventType: "StockProjectionRequested.v1", materialVersion: 2, payload: { occurrenceKey: "1:logicalExpiryLifecycle:4:scope" } });
  assert.equal(outcome.handled, true);
  assert.deepEqual(projection.recipients, [11]);
});

function memoryCheckpointStore() {
  const values = new Map();
  return {
    async read(key) { return values.get(key) || null; },
    async write(key, value) { values.set(key, JSON.parse(JSON.stringify(value))); },
    async clear(key) { values.delete(key); },
  };
}
