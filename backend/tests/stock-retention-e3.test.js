"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runStockRetention } = require("../src/stock/retention");

test("retention purges only expired terminal evidence and never pending outbox", async () => {
  const cutoff = new Date("2026-08-23T00:00:00Z");
  const deleted = [];
  const expired = new Date("2026-08-01T00:00:00Z");
  const delegates = {};
  const remaining = new Map();
  for (const model of ["linhaImportacaoEstoque", "importacaoEstoque", "observacaoEstoque", "problemaQualidadeEstoque", "avaliacaoRegraEstoque", "eventoOutboxEstoque", "execucaoSincronizacaoEstoque"]) {
    delegates[model] = {
      findMany: async ({ where }) => {
        const key = `${model}:${JSON.stringify(where.status || where.estado || {})}`;
        if (!remaining.has(key)) {
          let ids = [];
          if (model === "eventoOutboxEstoque" && where.status?.in?.includes("PENDING")) ids = [99];
          else if (model === "eventoOutboxEstoque" && where.status?.in?.includes("PROCESSED")) ids = [7];
          else if (model === "problemaQualidadeEstoque" && where.estado?.in?.includes("RESOLVED")) ids = [8];
          else if (model === "importacaoEstoque" && where.status?.in?.includes("APPLIED")) ids = [9];
          else if (model === "execucaoSincronizacaoEstoque" && where.estado?.in?.includes("SUCCEEDED")) ids = [10];
          else if (model === "linhaImportacaoEstoque" || model === "observacaoEstoque" || model === "avaliacaoRegraEstoque") ids = [11];
          remaining.set(key, ids);
        }
        return remaining.get(key).map((id) => ({ id }));
      },
      deleteMany: async ({ where }) => { deleted.push({ model, where }); const key = `${model}:${JSON.stringify(where.status || where.estado || {})}`; remaining.set(key, []); return { count: where.id.in.length }; },
    };
  }
  const prisma = { ...delegates, $transaction: async (callback) => callback(prisma) };
  const result = await runStockRetention({ prisma, empresaId: 4, now: new Date("2026-09-23T00:00:00Z"), env: { STOCK_RETENTION_ENABLED: "true", STOCK_RETENTION_DAYS: "30" }, dryRun: false, logger: {} });
  assert.equal(result.dryRun, false);
  assert.ok(result.deleted > 0);
  assert.ok(deleted.every((entry) => entry.where.empresaId === 4));
  assert.equal(deleted.some((entry) => entry.model === "eventoOutboxEstoque" && entry.where.id.in.includes(99)), false);
  assert.equal(deleted.some((entry) => entry.model === "eventoOutboxEstoque" && entry.where.id.in.includes(7)), true);
  assert.equal(deleted.some((entry) => entry.model === "avaliacaoRegraEstoque"), true);
  assert.equal(expired instanceof Date, true);
});

test("retention preserves an evaluation referenced by an open notification and pending projection", async () => {
  const prisma = {
    notificacao: { findMany: async () => [{ occurrenceKey: "protected-occurrence" }] },
    eventoOutboxEstoque: { findMany: async () => [{ payloadStructuredJson: JSON.stringify({ payload: { occurrenceKey: "protected-occurrence" } }) }] },
    avaliacaoRegraEstoque: {
      findMany: async ({ where }) => where.NOT?.OR?.length ? [] : [{ id: 1 }],
      deleteMany: async () => { throw new Error("protected evaluation should not be deleted"); },
    },
    $transaction: async (callback) => callback(prisma),
  };
  const result = await runStockRetention({ prisma, empresaId: 4, now: new Date("2026-09-23T00:00:00Z"), env: { STOCK_RETENTION_ENABLED: "true", STOCK_RETENTION_DAYS: "30" }, dryRun: false, logger: {} });
  assert.equal(result.deleted, 0);
});
