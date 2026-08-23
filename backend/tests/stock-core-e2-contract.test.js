"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stockFlags, stockEnabledForTenant } = require("../src/stock/flags");
const { buildStockEvent, validateStockEvent } = require("../src/stock/events");
const { normalizePayload, validateExpiry, decimal } = require("../src/stock/canonical");
const { classifyFreshness, confidenceFor } = require("../src/stock/freshness");
const { evaluateStockRuleContract } = require("../src/stock/rules");
const { resolveStockContext } = require("../src/stock/context");

test("stock flags are deny-by-default and tenant scoped", () => {
  assert.equal(stockFlags({}).domainEnabled, false);
  assert.equal(stockEnabledForTenant(1, {}), false);
  const env = { STOCK_DOMAIN_ENABLED: "true", STOCK_TENANT_ALLOWLIST: "1,2" };
  assert.equal(stockEnabledForTenant(1, env), true);
  assert.equal(stockEnabledForTenant(3, env), false);
});

test("context never trusts a different tenant from request body", () => {
  assert.throws(() => resolveStockContext({ auth: { empresaId: 4, usuarioId: 9 }, req: { auth: { empresaId: 4, usuarioId: 9 }, body: { empresaId: 5 } } }), /Empresa nao autorizada/);
  assert.throws(() => resolveStockContext({ auth: { empresaId: 0, usuarioId: 9 } }), /Contexto autenticado invalido/);
});

test("event envelope is versioned and reserved E3 events are inactive", () => {
  const event = buildStockEvent({ type: "StockRecordObserved.v1", empresaId: 1, syncRunId: 4, aggregateType: "StockRecord", aggregateId: "8", materialVersion: 1, payload: { safe: true } });
  assert.equal(validateStockEvent(event, { activeOnly: true }), true);
  assert.throws(() => validateStockEvent({ ...event, eventType: "StockRuleMatched.v1" }, { activeOnly: true }), /reservado/);
  assert.equal(event.payloadHash, require("../src/stock/contracts").checksum(event.payload));
  const safe = buildStockEvent({ type: "StockRecordObserved.v1", empresaId: 1, aggregateType: "StockRecord", aggregateId: "9", materialVersion: 1, payload: { nested: { token: "secret" } } });
  assert.equal(safe.payload.nested.token, "[redacted]");
});

test("date-only and decimal semantics are strict", () => {
  assert.equal(validateExpiry("2026-08-23", "DAY"), "2026-08-23");
  assert.equal(validateExpiry("2026-08", "MONTH"), "2026-08");
  assert.throws(() => validateExpiry("2026-08-23T00:00:00Z", "DAY"));
  assert.equal(decimal("12.123456", "onHand"), "12.123456");
  assert.throws(() => decimal("12.1234567", "onHand"));
  assert.throws(() => decimal("-1", "onHand"));
  const normalized = normalizePayload({ sourceProductId: "p1", productName: "Produto", unitOfMeasure: "UN", quantities: { onHand: "2" } });
  assert.equal(normalized.sourceProductId, "p1");
  assert.equal(normalized.quantity.onHand, "2");
});

test("freshness never converts unknown or stale to zero", () => {
  assert.equal(classifyFreshness({ slaMs: null }), "UNKNOWN");
  assert.equal(classifyFreshness({ observedAt: new Date(Date.now() - 86400000 * 2), slaMs: 86400000 }), "STALE");
  assert.equal(confidenceFor({ freshness: "STALE", quality: "HIGH" }), "LOW");
});

test("rule contract is scaffold-only", () => {
  const result = evaluateStockRuleContract({ ruleType: "STOCK_LOT_EXPIRING", requiredCapabilities: ["EXPIRATION_DATE"], capabilities: {}, freshness: "FRESH" });
  assert.equal(result.decision, "BLOCKED_CAPABILITY");
  const inactive = evaluateStockRuleContract({ ruleType: "STOCK_LOT_EXPIRING", requiredCapabilities: [], capabilities: { EXPIRATION_DATE: true }, freshness: "FRESH" });
  assert.equal(inactive.decision, "NO_MATCH");
});
