"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCanonicalStockService } = require("../src/stock/canonical");
const { buildStockEvent } = require("../src/stock/events");
const { processStockOutboxBatch } = require("../src/stock/outbox");
const { createStockSyncService } = require("../src/stock/sync");

const ENABLED_ENV = {
  STOCK_DOMAIN_ENABLED: "true",
  STOCK_SOURCE_ENABLED: "true",
  STOCK_TENANT_ALLOWLIST: "1",
};

test("CSV source creation keeps source, declared capabilities, and audit in one transaction", async () => {
  const writes = [];
  const tx = {
    fonteEstoque: {
      create: async ({ data }) => { writes.push("source"); return { id: 4, ...data }; },
    },
    capacidadeFonteEstoque: {
      create: async () => { writes.push("capability"); },
    },
    eventoAuditoriaEstoque: {
      create: async () => { writes.push("audit"); },
    },
  };
  let transactionCalls = 0;
  const service = createCanonicalStockService({
    prisma: {
      $transaction: async (callback) => { transactionCalls += 1; return callback(tx); },
    },
    env: ENABLED_ENV,
  });

  const source = await service.createSource({
    empresaId: 1,
    actorUsuarioId: 3,
    data: { tipoFonte: "FILE_IMPORT_CSV", nome: "CSV controlado" },
  });

  assert.equal(source.id, 4);
  assert.equal(transactionCalls, 1);
  assert.equal(writes[0], "source");
  assert.equal(writes.at(-1), "audit");
  assert.equal(writes.filter((write) => write === "capability").length, 10);
});

test("sync direct lease acquisition requires an active source before mutating a run", async () => {
  const updates = [];
  const service = createStockSyncService({
    prisma: {
      fonteEstoque: { findFirst: async () => ({ id: 4, empresaId: 1, statusCiclo: "DISABLED" }) },
      execucaoSincronizacaoEstoque: {
        findFirst: async () => ({ id: 9, empresaId: 1, fonteId: 4, estado: "PENDING", revision: 1 }),
        updateMany: async (query) => { updates.push(query); return { count: 1 }; },
      },
    },
    canonicalService: {},
    env: ENABLED_ENV,
  });

  await assert.rejects(
    service.acquireLease({ empresaId: 1, runId: 9, owner: "worker-a" }),
    (error) => error.code === "STOCK_SOURCE_DISABLED",
  );
  assert.equal(updates.length, 0);
});

test("sync lease loss at final CAS does not release or fail a lease it no longer owns", async () => {
  const now = new Date();
  const run = {
    id: 7,
    empresaId: 1,
    fonteId: 4,
    estado: "RUNNING",
    leaseOwner: "worker-a",
    leaseExpiresAt: new Date(now.getTime() + 60000),
    revision: 4,
    correlationId: "sync-correlation",
  };
  const updates = [];
  const prisma = {
    fonteEstoque: { findFirst: async () => ({ id: 4, empresaId: 1, statusCiclo: "ACTIVE" }) },
    execucaoSincronizacaoEstoque: {
      findFirst: async () => ({ ...run }),
      updateMany: async (query) => { updates.push(query); return { count: 0 }; },
    },
    checkpointSincronizacaoEstoque: {
      findFirst: async () => null,
      create: async ({ data }) => ({ id: 1, ...data }),
    },
    $transaction: async (callback) => callback(prisma),
  };
  const service = createStockSyncService({
    prisma,
    canonicalService: { applyNormalizedRecord: async () => ({ duplicate: false }) },
    env: ENABLED_ENV,
    clock: () => now,
  });

  await assert.rejects(
    service.processRecords({ empresaId: 1, fonteId: 4, runId: 7, owner: "worker-a", records: [{}] }),
    (error) => error.code === "STOCK_CONFLICT" && error.syncLeaseLost === true,
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.leaseOwner, "worker-a");
  assert.equal(updates[0].where.AND[0].leaseExpiresAt.getTime(), run.leaseExpiresAt.getTime());
});

test("sync failure cleanup compares the original lease token before retrying a run", async () => {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 60000);
  const run = { id: 8, empresaId: 1, fonteId: 4, estado: "RUNNING", leaseOwner: "worker-a", leaseExpiresAt, revision: 2 };
  const updates = [];
  const prisma = {
    fonteEstoque: { findFirst: async () => ({ id: 4, empresaId: 1, statusCiclo: "ACTIVE" }) },
    execucaoSincronizacaoEstoque: {
      findFirst: async () => ({ ...run }),
      updateMany: async (query) => { updates.push(query); return { count: 1 }; },
    },
    $transaction: async (callback) => callback(prisma),
  };
  const service = createStockSyncService({
    prisma,
    canonicalService: { applyNormalizedRecord: async () => { throw new Error("canonical failure"); } },
    env: ENABLED_ENV,
    clock: () => now,
    logger: { warn() {} },
  });

  await assert.rejects(service.processRecords({ empresaId: 1, fonteId: 4, runId: 8, owner: "worker-a", records: [{}] }));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.AND[0].leaseExpiresAt.getTime(), leaseExpiresAt.getTime());
});

test("outbox lease loss after a consumer result cannot quarantine a reclaimed event", async () => {
  const event = buildStockEvent({
    type: "StockRecordObserved.v1",
    empresaId: 1,
    syncRunId: 3,
    aggregateType: "StockRecord",
    aggregateId: "42",
    materialVersion: 1,
    correlationId: "outbox-correlation",
    payload: { observationId: 42 },
  });
  const updates = [];
  const prisma = {
    eventoOutboxEstoque: {
      findMany: async () => [{ id: 42, empresaId: 1, attempts: 0, payloadStructuredJson: JSON.stringify(event) }],
      updateMany: async (query) => {
        updates.push(query);
        return { count: updates.length === 1 ? 1 : 0 };
      },
    },
  };

  const result = await processStockOutboxBatch({
    prisma,
    empresaId: 1,
    owner: "worker-a",
    h8ProjectionEnabled: true,
    consumer: async () => {},
  });

  assert.deepEqual(result, { claimed: 1, processed: 0, quarantined: 0 });
  assert.equal(updates.length, 2);
  assert.equal(updates[1].data.status, "PROCESSED");
  assert.equal(Array.isArray(updates[1].where.AND), true);
});
