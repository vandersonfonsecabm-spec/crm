const assert = require("node:assert/strict");
const test = require("node:test");
const { createStockRuleService } = require("../src/stock/rule-service");

function mockPrisma({ capabilities = true } = {}) {
  const evaluations = [];
  const outbox = [];
  const prisma = {
    evaluations,
    outbox,
    saldoEstoque: { findMany: async () => [{ id: 1, empresaId: 3, produtoEstoqueId: 10, loteId: 11, localId: 12, fonteAutoritativaId: 2, onHand: 4, quantityRelevantForExpiry: true, semanticaDisponivel: "DECLARED", freshnessEstado: "FRESH", dataConfidence: "HIGH", revision: 2, lote: { id: 11, validadeEm: "2026-08-28", precisaoValidade: "DAY", revision: 2 }, local: { id: 12, nome: "A" }, produtoEstoque: { id: 10, nomeExibicao: "Produto" }, fonteAutoritativa: { id: 2, nome: "CSV", statusCiclo: "ACTIVE" } }] },
    configuracaoRegraEstoque: { findMany: async () => [{ ruleType: "STOCK_LOT_EXPIRING", enabled: true, expiryWindowDays: 7, scopeType: "TENANT", scopeKey: "TENANT" }] },
    capacidadeFonteEstoque: { findMany: async () => capabilities ? [
      { fonteId: 2, codigo: "LOT_IDENTIFIER", suportada: true },
      { fonteId: 2, codigo: "EXPIRATION_DATE", suportada: true },
      { fonteId: 2, codigo: "ON_HAND_QUANTITY", suportada: true },
      { fonteId: 2, codigo: "UNIT_OF_MEASURE", suportada: true },
      { fonteId: 2, codigo: "SOURCE_UPDATED_AT", suportada: true },
    ] : [] },
    avaliacaoRegraEstoque: { findFirst: async () => null, create: async ({ data }) => { evaluations.push(data); return data; } },
    eventoOutboxEstoque: { create: async ({ data }) => { outbox.push(data); return data; }, findFirst: async () => null },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  return prisma;
}

test("rule service persists versioned evaluation and reserved E3 outbox events only when enabled", async () => {
  const prisma = mockPrisma();
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" }, clock: () => new Date("2026-08-23T12:00:00Z") });
  const result = await service.evaluateTenant(3, { capabilities: { capabilities: { LOT_IDENTIFIER: true, EXPIRATION_DATE: true, ON_HAND_QUANTITY: true, UNIT_OF_MEASURE: true, SOURCE_UPDATED_AT: true } } });
  assert.equal(result.disabled, false);
  assert.equal(result.evaluated, 2);
  assert.ok(result.matched >= 1);
  assert.ok(prisma.evaluations.some((row) => row.ruleType === "STOCK_LOT_EXPIRING" && row.matched === true));
  assert.ok(prisma.outbox.some((row) => row.eventType === "StockRuleMatched.v1"));
  assert.ok(prisma.outbox.some((row) => row.eventType === "StockProjectionRequested.v1"));
});

test("rule service stays dormant when allowlist or flag is missing", async () => {
  const prisma = mockPrisma();
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "" } });
  const result = await service.evaluateTenant(3);
  assert.equal(result.disabled, true);
  assert.equal(prisma.evaluations.length, 0);
});

test("rule service ignores caller-forged capabilities and uses persisted source capabilities", async () => {
  const prisma = mockPrisma({ capabilities: false });
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" }, clock: () => new Date("2026-08-23T12:00:00Z") });
  const result = await service.evaluateTenant(3, { capabilities: { capabilities: { LOT_IDENTIFIER: true, EXPIRATION_DATE: true, ON_HAND_QUANTITY: true, UNIT_OF_MEASURE: true, SOURCE_UPDATED_AT: true } } });
  assert.equal(result.matched, 0);
  assert.ok(prisma.evaluations.some((row) => row.noMatchReason === "CAPABILITY_MISSING"));
});

test("rule service evaluates stale state at source scope even without balances", async () => {
  const prisma = mockPrisma({ capabilities: false });
  prisma.saldoEstoque.findMany = async () => [];
  prisma.fonteEstoque = { findMany: async () => [{ id: 2, statusCiclo: "ACTIVE" }] };
  prisma.configuracaoRegraEstoque.findMany = async () => [{ ruleType: "STOCK_DATA_STALE", enabled: true, freshnessSlaMinutes: 60, scopeType: "TENANT", scopeKey: "TENANT" }];
  prisma.checkpointSincronizacaoEstoque = { findMany: async () => [{ fonteId: 2, lastSuccessfulSyncAt: new Date("2026-08-20T12:00:00Z") }] };
  prisma.execucaoSincronizacaoEstoque = { findMany: async () => [] };
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" }, clock: () => new Date("2026-08-23T12:00:00Z") });
  const result = await service.evaluateTenant(3);
  assert.equal(result.matched, 1);
  assert.ok(prisma.evaluations.some((row) => row.ruleType === "STOCK_DATA_STALE" && row.matched === true));
});

test("expiry lifecycle emits one effective occurrence and resolves only after quantity goes zero", async () => {
  const evaluations = [];
  const outbox = [];
  const state = { onHand: "2.000000", expiry: "2026-08-30" };
  const prisma = {
    saldoEstoque: { findMany: async () => [{ id: 1, empresaId: 3, produtoEstoqueId: 10, loteId: 11, localId: 12, fonteAutoritativaId: 2, onHand: state.onHand, quantityRelevantForExpiry: true, semanticaDisponivel: "DECLARED", freshnessEstado: "FRESH", dataConfidence: "HIGH", revision: 1, lote: { id: 11, validadeEm: state.expiry, precisaoValidade: "DAY", revision: 1 }, local: { id: 12, nome: "A" }, produtoEstoque: { id: 10, nomeExibicao: "Produto" }, fonteAutoritativa: { id: 2, nome: "CSV", statusCiclo: "ACTIVE" } }] },
    configuracaoRegraEstoque: { findMany: async () => [
      { ruleType: "STOCK_LOT_EXPIRING", enabled: true, expiryWindowDays: 7, scopeType: "TENANT", scopeKey: "TENANT" },
      { ruleType: "STOCK_LOT_EXPIRED", enabled: true, scopeType: "TENANT", scopeKey: "TENANT" },
    ] },
    capacidadeFonteEstoque: { findMany: async () => ["LOT_IDENTIFIER", "EXPIRATION_DATE", "ON_HAND_QUANTITY", "UNIT_OF_MEASURE"].map((codigo) => ({ fonteId: 2, codigo, suportada: true })) },
    fonteEstoque: { findMany: async () => [] },
    checkpointSincronizacaoEstoque: { findMany: async () => [] },
    execucaoSincronizacaoEstoque: { findMany: async () => [] },
    overrideEstoque: { findMany: async () => [] },
    avaliacaoRegraEstoque: {
      findFirst: async ({ where }) => [...evaluations].reverse().find((row) => row.empresaId === where.empresaId && row.occurrenceKey === where.occurrenceKey && (!where.ruleType || row.ruleType === where.ruleType) && (where.matched === undefined || row.matched === where.matched)) || null,
      create: async ({ data }) => { const row = { id: evaluations.length + 1, ...data }; evaluations.push(row); return row; },
    },
    eventoOutboxEstoque: { create: async ({ data }) => { outbox.push(data); return data; }, findFirst: async () => null },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const env = { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" };
  const service = createStockRuleService({ prisma, env });
  await service.evaluateTenant(3, { now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(outbox.filter((row) => row.eventType === "StockRuleResolved.v1").length, 0);
  const stableOutboxCount = outbox.length;
  await service.evaluateTenant(3, { now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(outbox.length, stableOutboxCount);
  await service.evaluateTenant(3, { now: new Date("2026-08-31T12:00:00Z") });
  assert.equal(outbox.filter((row) => row.eventType === "StockRuleResolved.v1").length, 0);
  state.onHand = "0.000000";
  await service.evaluateTenant(3, { now: new Date("2026-09-01T12:00:00Z") });
  assert.equal(outbox.filter((row) => row.eventType === "StockRuleResolved.v1").length, 1);

  evaluations.length = 0;
  outbox.length = 0;
  state.onHand = "2.000000";
  state.expiry = "2026-08-20";
  await service.evaluateTenant(3, { now: new Date("2026-08-23T12:00:00Z") });
  state.expiry = "2026-09-30";
  await service.evaluateTenant(3, { now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(outbox.filter((row) => row.eventType === "StockRuleResolved.v1").length, 1);
  const correctedCount = outbox.length;
  await service.evaluateTenant(3, { now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(outbox.length, correctedCount);
});

test("a healthy run resolves the latest sync failure occurrence", async () => {
  const prisma = mockPrisma({ capabilities: false });
  const run = { id: 1, fonteId: 2, estado: "FAILED", retryCount: 3, revision: 3, errorClass: "TIMEOUT", correlationId: "sync-failure" };
  prisma.saldoEstoque.findMany = async () => [];
  prisma.fonteEstoque = { findMany: async () => [{ id: 2, statusCiclo: "ACTIVE" }] };
  prisma.configuracaoRegraEstoque.findMany = async () => [{ ruleType: "STOCK_SYNC_FAILED", enabled: true, scopeType: "TENANT", scopeKey: "TENANT" }];
  prisma.checkpointSincronizacaoEstoque = { findMany: async () => [] };
  prisma.execucaoSincronizacaoEstoque = { findMany: async () => [run] };
  prisma.avaliacaoRegraEstoque.findFirst = async ({ where }) => [...prisma.evaluations].reverse().find((row) => row.empresaId === where.empresaId && (!where.occurrenceKey || row.occurrenceKey === where.occurrenceKey) && (!where.sourceConnectionId || row.sourceConnectionId === where.sourceConnectionId) && row.ruleType === where.ruleType && (where.matched === undefined || row.matched === where.matched)) || null;
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" } });
  const first = await service.evaluateTenant(3);
  assert.equal(first.matched, 1);
  run.estado = "RETRY_WAIT";
  const retrying = await service.evaluateTenant(3);
  assert.equal(retrying.resolved, 0);
  run.estado = "SUCCEEDED";
  run.retryCount = 0;
  run.errorClass = null;
  const second = await service.evaluateTenant(3);
  assert.equal(second.resolved, 1);
  const third = await service.evaluateTenant(3);
  assert.equal(third.resolved, 0);
});

test("different sync failure families receive distinct monotonic material versions", async () => {
  const evaluations = [];
  const outboxRows = [];
  const run = { id: 1, fonteId: 2, estado: "FAILED", retryCount: 3, revision: 3, errorClass: "TIMEOUT", correlationId: "sync-failure" };
  const prisma = {
    saldoEstoque: { findMany: async () => [] },
    fonteEstoque: { findMany: async () => [{ id: 2, statusCiclo: "ACTIVE" }] },
    configuracaoRegraEstoque: { findMany: async () => [{ ruleType: "STOCK_SYNC_FAILED", enabled: true, scopeType: "TENANT", scopeKey: "TENANT" }] },
    capacidadeFonteEstoque: { findMany: async () => [] },
    checkpointSincronizacaoEstoque: { findMany: async () => [] },
    execucaoSincronizacaoEstoque: { findMany: async () => [run] },
    avaliacaoRegraEstoque: {
      findMany: async ({ where }) => evaluations.filter((row) => row.empresaId === where.empresaId && row.sourceConnectionId === where.sourceConnectionId && row.ruleType === where.ruleType),
      findFirst: async ({ where }) => {
        const rows = evaluations.filter((row) => row.empresaId === where.empresaId
          && (!where.sourceConnectionId || row.sourceConnectionId === where.sourceConnectionId)
          && (!where.occurrenceKey || row.occurrenceKey === where.occurrenceKey)
          && (!where.ruleType || row.ruleType === where.ruleType)
          && (where.matched === undefined || row.matched === where.matched));
        return rows.at(-1) || null;
      },
      create: async ({ data }) => { const row = { id: evaluations.length + 1, ...data }; evaluations.push(row); return row; },
    },
    eventoOutboxEstoque: {
      create: async ({ data }) => {
        if (outboxRows.some((row) => row.empresaId === data.empresaId && row.eventType === data.eventType && row.aggregateType === data.aggregateType && row.aggregateId === data.aggregateId && row.materialVersion === data.materialVersion)) {
          const error = new Error("unique outbox conflict");
          error.code = "P2002";
          throw error;
        }
        outboxRows.push(data);
        return data;
      },
      findFirst: async ({ where }) => outboxRows.find((row) => row.empresaId === where.empresaId && row.eventType === where.eventType && row.aggregateType === where.aggregateType && row.aggregateId === where.aggregateId && row.materialVersion === where.materialVersion) || null,
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const service = createStockRuleService({ prisma, env: { STOCK_DOMAIN_ENABLED: "true", STOCK_RULE_ENGINE_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "3" }, clock: () => new Date("2026-08-23T12:00:00Z") });

  await service.evaluateTenant(3);
  run.errorClass = "AUTH";
  await assert.doesNotReject(() => service.evaluateTenant(3));

  const matched = outboxRows.filter((row) => row.eventType === "StockRuleMatched.v1");
  assert.equal(matched.length, 2);
  assert.notEqual(matched[0].materialVersion, matched[1].materialVersion);

  const highestBeforeRetention = Math.max(...matched.map((row) => row.materialVersion));
  evaluations.length = 0;
  outboxRows.length = 0;
  run.id = 2;
  run.errorClass = "TIMEOUT";
  await service.evaluateTenant(3);
  const afterRetention = outboxRows.find((row) => row.eventType === "StockRuleMatched.v1");
  assert.ok(afterRetention.materialVersion > highestBeforeRetention);
});
