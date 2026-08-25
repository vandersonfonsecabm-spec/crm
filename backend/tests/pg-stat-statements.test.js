"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  READ_ONLY_SQL,
  checkDatabase,
  databaseUrlFromEnv,
  isOfficialDatabaseUrl,
  sqlReport,
} = require("../scripts/pg-stat-statements.cjs");

test("relatorio pg_stat_statements e somente leitura", () => {
  const sql = sqlReport();
  assert.match(sql, /pg_extension/);
  assert.match(sql, /pg_stat_statements/);
  assert.doesNotMatch(sql, /CREATE\s+EXTENSION|pg_stat_statements_reset/i);
  assert.equal(READ_ONLY_SQL.top.includes("query FROM"), false);
});
test("check exige URL explicita, confirmacao read-only e rejeita producao", () => {
  assert.throws(() => databaseUrlFromEnv({}), /obrigatoria/);
  assert.throws(
    () => databaseUrlFromEnv({ CRM_PG_STATS_DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db" }),
    /read-only/,
  );
  assert.throws(
    () => databaseUrlFromEnv({
      CRM_PG_STATS_DATABASE_URL: "postgresql://u:p@db.railway.app:5432/db",
      CRM_PG_STATS_CONFIRM: "read-only",
    }),
    /oficial|producao/,
  );
  assert.equal(isOfficialDatabaseUrl("postgresql://u:p@127.0.0.1:5432/test", {}), false);
});

test("check retorna apenas queryid e metricas numericas da extensao", async () => {
  const calls = [];
  class FakePool {
    constructor(options) { calls.push({ type: "constructor", options }); }
    async query(sql) {
      calls.push({ type: "query", sql });
      if (sql === READ_ONLY_SQL.extension) return { rows: [{ installed: true }] };
      return { rows: [{ queryid: 123, calls: "2", total_exec_time: "30.5", mean_exec_time: "15.25", rows: "4", query: "SECRET" }] };
    }
    async end() { calls.push({ type: "end" }); }
  }
  const result = await checkDatabase({
    CRM_PG_STATS_DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/test",
    CRM_PG_STATS_CONFIRM: "read-only",
  }, FakePool);
  assert.deepEqual(result, {
    installed: true,
    topQueries: [{ queryid: "123", calls: 2, totalExecMs: 30.5, meanExecMs: 15.25, rows: 4 }],
  });
  assert.equal(calls.at(-1).type, "end");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});
