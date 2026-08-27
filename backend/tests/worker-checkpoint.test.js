"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  KEYS,
  assertCheckpointKey,
  createWorkerCheckpointStore,
} = require("../src/shared/workerCheckpoint");

test("checkpoint restringe chaves a escopos internos conhecidos", () => {
  assert.equal(KEYS.automationTenants(), "automation:temporal:tenants");
  assert.equal(KEYS.automationLeads(7, 9), "automation:temporal:leads:7:9");
  assert.equal(KEYS.automationDeals(7, 9), "automation:temporal:deals:7:9");
  assert.equal(KEYS.notificationSources(7), "notifications:sources:7");
  assert.equal(KEYS.stockRules(7), "stock:rules:7");
  assert.throws(() => assertCheckpointKey("request:controlled:key"), /WORKER_CHECKPOINT_KEY_INVALID/);
  assert.throws(() => KEYS.stockRules(0), /WORKER_CHECKPOINT_SCOPE_INVALID/);
});

test("checkpoint persiste cursor com CAS e retoma em nova instancia", async () => {
  const delegate = checkpointDelegate();
  const prisma = { workerCheckpoint: delegate };
  const first = createWorkerCheckpointStore({ prisma });
  const key = KEYS.automationLeads(3, 11);
  await first.write(key, { id: 42, createdAt: new Date("2026-08-27T12:00:00.000Z") });

  const restarted = createWorkerCheckpointStore({ prisma });
  assert.deepEqual(await restarted.read(key), { id: 42, createdAt: "2026-08-27T12:00:00.000Z" });
  await restarted.write(key, { id: 43, createdAt: "2026-08-27T12:01:00.000Z" });
  assert.equal(delegate.rows.get(key).revisao, 2);
  await restarted.clear(key);
  assert.equal(await first.read(key), null);
  assert.equal(delegate.rows.get(key).revisao, 3);
  await restarted.clear(key);
  assert.equal(delegate.rows.get(key).revisao, 3);
  assert.equal(await restarted.clear(KEYS.stockRules(99)), null);
});

test("checkpoint nao aceita cursor arbitrario ou sem limite", async () => {
  const store = createWorkerCheckpointStore({ prisma: {} });
  const key = KEYS.notificationTenants();
  await assert.rejects(store.write(key, { nested: { deeper: { too: { far: true } } } }), /WORKER_CHECKPOINT_CURSOR_INVALID/);
  await assert.rejects(store.write(key, { value: "x".repeat(4096) }), /WORKER_CHECKPOINT_CURSOR_TOO_LARGE/);
});

function checkpointDelegate() {
  const rows = new Map();
  let nextId = 1;
  return {
    rows,
    async findUnique({ where }) {
      const row = rows.get(where.chave);
      return row ? structuredClone(row) : null;
    },
    async create({ data }) {
      if (rows.has(data.chave)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      const row = { id: nextId++, revisao: 1, cursorJson: null, ...data };
      rows.set(row.chave, row);
      return structuredClone(row);
    },
    async updateMany({ where, data }) {
      const row = rows.get(where.chave);
      if (!row || row.id !== where.id || row.revisao !== where.revisao) return { count: 0 };
      row.cursorJson = data.cursorJson;
      row.revisao += Number(data.revisao?.increment || 0);
      return { count: 1 };
    },
  };
}
