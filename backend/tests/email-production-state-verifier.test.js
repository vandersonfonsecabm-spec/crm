const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertSafeEmailProductionState,
  gateState,
} = require("../scripts/check-email-production-state.cjs");

function safeState(overrides = {}) {
  return {
    gates: { integration: "MISSING", inbound: "OFF" },
    migrationApplied: 1,
    tables: 2,
    channels: 0,
    activeOrTimestampedChannels: 0,
    capabilities: 0,
    enabledCapabilities: 0,
    mailboxAddresses: 0,
    messageMetadata: 0,
    events: 0,
    messages: 0,
    contacts: 0,
    conversations: 0,
    ...overrides,
  };
}

test("verificador aceita somente o perfil gates OFF e estado vazio", () => {
  const state = safeState();
  assert.equal(assertSafeEmailProductionState(state), state);
  assert.equal(gateState("true"), "ON");
  assert.equal(gateState("TRUE"), "OFF");
  assert.equal(gateState(""), "MISSING");
});

test("verificador falha fechado para gate, schema ou mutacao inesperada", () => {
  assert.throws(() => assertSafeEmailProductionState(safeState({ gates: { integration: "ON", inbound: "OFF" } })), (error) => error.code === "EMAIL_PRODUCTION_GATES_ENABLED");
  assert.throws(() => assertSafeEmailProductionState(safeState({ migrationApplied: 0 })), (error) => error.code === "EMAIL_PRODUCTION_SCHEMA_INVALID");
  assert.throws(() => assertSafeEmailProductionState(safeState({ messages: 1 })), (error) => error.code === "EMAIL_PRODUCTION_STATE_NOT_EMPTY");
});
