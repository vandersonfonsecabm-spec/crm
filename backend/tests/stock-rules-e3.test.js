const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateStockState } = require("../src/stock/rules");

const caps = {
  LOT_IDENTIFIER: true,
  EXPIRATION_DATE: true,
  ON_HAND_QUANTITY: true,
  UNIT_OF_MEASURE: true,
  SOURCE_UPDATED_AT: true,
};

test("expiry rules are timezone/date-only aware and share occurrence", () => {
  const common = {
    ruleType: "STOCK_LOT_EXPIRING",
    state: {
      empresaId: 7, sourceConnectionId: 2, produtoEstoqueId: 10, loteEstoqueId: 11, localEstoqueId: 12,
      lot: { id: 11, validadeEm: "2026-08-30", precisaoValidade: "DAY", revision: 3 },
      balance: { onHand: "2.5", quantityRelevantForExpiry: true }, dataConfidence: "HIGH", freshnessEstado: "FRESH", revision: 3,
    },
    config: { enabled: true, expiryWindowDays: 7, timezone: "America/Sao_Paulo" }, capabilities: caps,
    now: new Date("2026-08-23T23:30:00.000Z"),
  };
  const expiring = evaluateStockState(common);
  const expired = evaluateStockState({ ...common, ruleType: "STOCK_LOT_EXPIRED", now: new Date("2026-09-01T03:30:00.000Z") });
  assert.equal(expiring.match, true);
  assert.equal(expiring.expiryDate, "2026-08-30");
  assert.equal(expiring.occurrenceKey, expired.occurrenceKey);
  assert.equal(expired.match, true);
  assert.notEqual(expiring.materialVersion, expired.materialVersion);
});

test("unknown quantity and missing capability fail closed without becoming zero", () => {
  const result = evaluateStockState({
    ruleType: "STOCK_LOT_EXPIRING",
    state: { empresaId: 1, lot: { id: 1, validadeEm: "2026-08-25", precisaoValidade: "DAY" }, balance: { onHand: null, quantityRelevantForExpiry: false } },
    config: { enabled: true }, capabilities: { LOT_IDENTIFIER: true }, now: new Date("2026-08-23T12:00:00Z"),
  });
  assert.equal(result.match, false);
  assert.equal(result.noMatchReason, "CAPABILITY_MISSING");
  assert.equal(result.quantityRelevant, false);
  const unknown = evaluateStockState({ ruleType: "STOCK_LOT_EXPIRING", state: { empresaId: 1, lot: { id: 1, validadeEm: "2026-08-25", precisaoValidade: "DAY" }, balance: { onHand: null, quantityRelevantForExpiry: true } }, config: { enabled: true }, capabilities: caps, now: new Date("2026-08-23T12:00:00Z") });
  assert.equal(unknown.noMatchReason, "QUANTITY_UNKNOWN");
});

test("stale and failed rules coalesce by source/error family and require explicit state", () => {
  const stale = evaluateStockState({ ruleType: "STOCK_DATA_STALE", state: { empresaId: 4, sourceConnectionId: 9, freshnessEstado: "STALE" }, config: { enabled: true }, capabilities: caps });
  const failed = evaluateStockState({ ruleType: "STOCK_SYNC_FAILED", state: { empresaId: 4, sourceConnectionId: 9, syncFailed: true, retriesExhausted: true, errorFamily: "TIMEOUT" }, config: { enabled: true }, capabilities: caps });
  assert.equal(stale.match, true);
  assert.equal(failed.match, true);
  assert.notEqual(stale.materialVersion, failed.materialVersion);
  assert.match(stale.occurrenceKey, /STOCK_DATA_STALE/);
  assert.match(failed.occurrenceKey, /TIMEOUT/);
});

test("disabled rules and invalid calendar precision never match", () => {
  const disabled = evaluateStockState({ ruleType: "STOCK_LOT_EXPIRED", state: { empresaId: 1 }, config: { enabled: false }, capabilities: caps });
  const invalid = evaluateStockState({ ruleType: "STOCK_LOT_EXPIRED", state: { empresaId: 1, lot: { id: 2, validadeEm: "2026-99", precisaoValidade: "MONTH" }, balance: { onHand: 1, quantityRelevantForExpiry: true } }, config: { enabled: true }, capabilities: caps });
  assert.equal(disabled.noMatchReason, "RULE_DISABLED");
  assert.equal(invalid.match, false);
  assert.equal(invalid.noMatchReason, "EXPIRY_UNKNOWN_OR_INVALID");
});
