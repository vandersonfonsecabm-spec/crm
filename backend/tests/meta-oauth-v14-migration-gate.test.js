const assert = require("node:assert/strict");
const { test } = require("node:test");
const { GateFailure, validateMigrationHistory } = require("../scripts/tenant-isolation-gate.cjs");

const canonical = ["0001_base", "0002_meta", "0003_binding"];
const finished = (migration_name) => ({ migration_name, finished_at: "2026-08-11T12:00:00.000Z", rolled_back_at: null });

test("V14 pending-only migration gate covers empty and applied-prefix histories", () => {
  assert.deepEqual(validateMigrationHistory(canonical, [], 0), []);
  assert.deepEqual(validateMigrationHistory(canonical, [finished("0001_base")], 3), ["0001_base"]);
  assert.throws(() => validateMigrationHistory(canonical, [], 3), (error) => error instanceof GateFailure && error.code === "TENANT_GATE_MIGRATION_HISTORY_MISSING");
});

test("V14 pending-only migration gate rejects dirty, unknown, duplicate and out-of-order histories", () => {
  assert.throws(() => validateMigrationHistory(canonical, [{ migration_name: "0001_base", finished_at: null, rolled_back_at: null }]), (error) => error.code === "TENANT_GATE_MIGRATION_HISTORY_DIRTY");
  assert.throws(() => validateMigrationHistory(canonical, [finished("9999_unknown")]), (error) => error.code === "TENANT_GATE_MIGRATION_HISTORY_UNKNOWN");
  assert.throws(() => validateMigrationHistory(canonical, [finished("0001_base"), finished("0001_base")]), (error) => error.code === "TENANT_GATE_MIGRATION_HISTORY_DUPLICATE");
  assert.throws(() => validateMigrationHistory(canonical, [finished("0002_meta")]), (error) => error.code === "TENANT_GATE_MIGRATION_HISTORY_OUT_OF_ORDER");
});
