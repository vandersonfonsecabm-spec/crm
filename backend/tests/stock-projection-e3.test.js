const assert = require("node:assert/strict");
const test = require("node:test");
const { projectStockEvaluation } = require("../src/stock/projection");
const { routeForTarget } = require("../src/notifications/service");
const { createProjectionConsumer } = require("../src/stock/worker");

function makePrisma() {
  const rows = [];
  return {
    rows,
    usuario: { findFirst: async ({ where }) => where.id === 7 && where.empresaId === 3 ? { id: 7 } : null },
    configuracaoNotificacaoEmpresa: { findUnique: async () => ({ habilitada: true }) },
    loteEstoque: { findFirst: async ({ where }) => where.id === 11 && where.empresaId === 3 ? { id: 11 } : null },
    produtoEstoque: { findFirst: async () => null },
    fonteEstoque: { findFirst: async () => null },
    notificacao: {
      findUnique: async ({ where }) => rows.find((row) => row.empresaId === where.empresaId_destinatarioId_occurrenceKey.empresaId && row.destinatarioId === where.empresaId_destinatarioId_occurrenceKey.destinatarioId && row.occurrenceKey === where.empresaId_destinatarioId_occurrenceKey.occurrenceKey) || null,
      create: async ({ data }) => { const row = { id: rows.length + 1, ...data, resolvidaEm: null, lidaEm: null, versao: 1, presentationVersion: 1 }; rows.push(row); return row; },
      updateMany: async ({ where, data }) => {
        const row = rows.find((item) => item.id === where.id && item.empresaId === where.empresaId && item.versao === where.versao && item.stockMaterialVersion === where.stockMaterialVersion);
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && Object.hasOwn(value, "increment") ? Number(row[key] || 0) + value.increment : value;
        return { count: 1 };
      },
      update: async ({ where, data }) => { const row = rows.find((item) => item.id === where.id); Object.assign(row, data); return row; },
    },
  };
}

const env = {
  STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_H8_PROJECTION_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3",
  H8_NOTIFICATIONS_ENABLED: "true", H8_NOTIFICATION_TENANT_ALLOWLIST: "3",
};

test("stock projection uses existing H8 row, coalesces and keeps canonical target tenant-bound", async () => {
  const prisma = makePrisma();
  const evaluation = { empresaId: 3, ruleType: "STOCK_LOT_EXPIRING", match: true, priority: "ATENCAO", occurrenceKey: "3:logicalExpiryLifecycle:11:scope", loteEstoqueId: 11, materialVersion: 2, confidence: "HIGH", freshnessObserved: "FRESH", expiryDate: "2026-08-30", expiryPrecision: "DAY" };
  const first = await projectStockEvaluation({ prisma, evaluation, recipients: [7], env, now: new Date("2026-08-23T12:00:00Z") });
  const second = await projectStockEvaluation({ prisma, evaluation: { ...evaluation, materialVersion: 3, match: true }, recipients: [7], env, now: new Date("2026-08-23T12:00:00Z") });
  assert.deepEqual(first, { created: 1, updated: 0, reopened: 0 });
  assert.deepEqual(second, { created: 0, updated: 1, reopened: 0 });
  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].alvoTipo, "ESTOQUE_LOTE");
  assert.equal(prisma.rows[0].stockMaterialVersion, 3);
  prisma.rows[0].lidaEm = new Date("2026-08-23T13:00:00Z");
  await projectStockEvaluation({ prisma, evaluation: { ...evaluation, materialVersion: 4, match: true }, recipients: [7], env, now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(prisma.rows[0].lidaEm, null);
  await assert.rejects(() => projectStockEvaluation({ prisma, evaluation: { ...evaluation, materialVersion: 2, match: true }, recipients: [7], env, now: new Date("2026-08-23T12:00:00Z") }), /atrasado|regress/i);
});

test("projection stays disabled in shadow mode and never touches H8", async () => {
  const prisma = makePrisma();
  const result = await projectStockEvaluation({ prisma, evaluation: { empresaId: 3, ruleType: "STOCK_DATA_STALE", match: true, occurrenceKey: "3:stale:2", sourceConnectionId: 2, materialVersion: 1 }, recipients: [7], env: { ...env, STOCK_H8_PROJECTION_ENABLED: "false" } });
  assert.equal(result.disabled, true);
  assert.equal(prisma.rows.length, 0);
});

test("projection respects the existing H8 tenant setting", async () => {
  const prisma = makePrisma();
  prisma.configuracaoNotificacaoEmpresa.findUnique = async () => ({ habilitada: false });
  const result = await projectStockEvaluation({ prisma, evaluation: { empresaId: 3, ruleType: "STOCK_DATA_STALE", match: true, occurrenceKey: "3:stale:2", sourceConnectionId: 2, materialVersion: 1 }, recipients: [7], env });
  assert.equal(result.disabled, true);
  assert.equal(prisma.rows.length, 0);
});

test("H8 stock targets resolve only to structured internal routes", () => {
  assert.equal(routeForTarget("ESTOQUE_LOTE", 11), "/estoque/lotes/11");
  assert.equal(routeForTarget("ESTOQUE_PRODUTO", 10), "/estoque/produtos/10");
  assert.equal(routeForTarget("ESTOQUE_FONTE", 2), "/estoque/fontes/2");
  assert.equal(routeForTarget("ESTOQUE_LOTE", 0), null);
});

test("missing H8 recipients become an explicit quality issue", async () => {
  const quality = [];
  const prisma = {
    avaliacaoRegraEstoque: { findFirst: async () => ({ ruleType: "STOCK_DATA_STALE", occurrenceKey: "3:stale:2", sourceConnectionId: 2, matched: true, priority: "ATENCAO", materialVersion: 1 }) },
    usuario: { findMany: async () => [] },
    problemaQualidadeEstoque: { create: async ({ data }) => quality.push(data) },
  };
  const consumer = createProjectionConsumer({ prisma, empresaId: 3, env: {}, now: new Date("2026-08-23T12:00:00Z") });
  const outcome = await consumer({ eventType: "StockProjectionRequested.v1", materialVersion: 1, payload: { occurrenceKey: "3:stale:2" } });
  assert.equal(quality.length, 1);
  assert.equal(quality[0].tipo, "STOCK_RECIPIENT_MISSING");
  assert.equal(outcome.handled, false);
});
