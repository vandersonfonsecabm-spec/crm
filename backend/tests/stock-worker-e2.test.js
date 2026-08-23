"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runStockWorkerCycle } = require("../src/stock/worker");
const { processStockOutboxBatch, claimStockOutbox } = require("../src/stock/outbox");

test("stock worker stays dormant when flags are absent and does not query schema", async () => {
  let touched = false;
  const prisma = new Proxy({}, { get() { touched = true; throw new Error("schema should not be queried"); } });
  const result = await runStockWorkerCycle({ prisma, env: {}, now: new Date() });
  assert.deepEqual(result, { enabled: false, claimed: 0, processed: 0, quarantined: 0 });
  assert.equal(touched, false);
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
  const result = await processStockOutboxBatch({ prisma, empresaId: 1, owner: "w", limit: 1, now: new Date(), h8ProjectionEnabled: true, consumer: async () => {} });
  assert.equal(result.quarantined, 1);
  assert.equal(claims[0].where.empresaId, 1);
  assert.equal(updates.at(-1).data.status, "QUARANTINED");
});

test("worker leaves valid E2 outbox pending while H8 projection is OFF", async () => {
  let queried = false;
  const prisma = new Proxy({}, { get() { queried = true; throw new Error("outbox must remain pending while H8 is off"); } });
  const result = await runStockWorkerCycle({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_SYNC_WORKER_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1", STOCK_H8_PROJECTION_ENABLED: "false" } });
  assert.equal(result.enabled, false);
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
