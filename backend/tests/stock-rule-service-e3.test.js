const assert = require("node:assert/strict");
const test = require("node:test");
const { createStockRuleService } = require("../src/stock/rule-service");

function mockPrisma() {
  const evaluations = [];
  const outbox = [];
  const prisma = {
    evaluations,
    outbox,
    saldoEstoque: { findMany: async () => [{ id: 1, empresaId: 3, produtoEstoqueId: 10, loteId: 11, localId: 12, fonteAutoritativaId: 2, onHand: 4, quantityRelevantForExpiry: true, semanticaDisponivel: "DECLARED", freshnessEstado: "FRESH", dataConfidence: "HIGH", revision: 2, lote: { id: 11, validadeEm: "2026-08-28", precisaoValidade: "DAY", revision: 2 }, local: { id: 12, nome: "A" }, produtoEstoque: { id: 10, nomeExibicao: "Produto" }, fonteAutoritativa: { id: 2, nome: "CSV", statusCiclo: "ACTIVE" } }] },
    configuracaoRegraEstoque: { findMany: async () => [{ ruleType: "STOCK_LOT_EXPIRING", enabled: true, expiryWindowDays: 7, scopeType: "TENANT", scopeKey: "TENANT" }] },
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
  assert.equal(result.evaluated, 4);
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
