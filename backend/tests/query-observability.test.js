"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  attachPrismaQueryObservability,
  classifyPrismaError,
  createPrismaQueryObservability,
} = require("../src/database/query-observability");
const { createPrismaClient } = require("../src/database/prisma-client");
const path = require("node:path");
const os = require("node:os");

function logger() {
  const lines = [];
  return {
    lines,
    warn(value) { lines.push(String(value)); },
    info(value) { lines.push(String(value)); },
  };
}

test("observabilidade Prisma permanece desligada por padrao e nao registra query", () => {
  const output = logger();
  const observability = createPrismaQueryObservability({ env: {}, logger: output });
  observability.onQuery({ duration: 5000, query: "SELECT segredo", target: "db" });
  assert.equal(observability.enabled, false);
  assert.deepEqual(observability.snapshot().fingerprints, []);
  assert.deepEqual(output.lines, []);
});

test("observabilidade registra fingerprint bounded sem SQL ou parametros", () => {
  const output = logger();
  let clock = 1000;
  const observability = createPrismaQueryObservability({
    env: {
      CRM_PRISMA_QUERY_OBSERVABILITY: "true",
      CRM_PRISMA_SLOW_QUERY_MS: "25",
    },
    logger: output,
    now: () => clock,
  });
  observability.onQuery({
    duration: 40,
    query: "SELECT * FROM Cliente WHERE email='secret@example.com' AND id=42",
    params: '["secret@example.com",42]',
    target: "postgresql",
  });
  clock += 1;
  const snapshot = observability.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.fingerprints.length, 1);
  assert.equal(snapshot.fingerprints[0].slowCount, 1);
  assert.equal(snapshot.fingerprints[0].averageMs, 40);
  assert.match(output.lines[0], /prisma_slow_query/);
  assert.doesNotMatch(output.lines[0], /secret@example|SELECT|params/i);
});

test("erros timeout/P2028/P2034 sao classificados sem expor mensagem", () => {
  assert.equal(classifyPrismaError({ code: "P2028", message: "token=abc" }), "P2028");
  assert.equal(classifyPrismaError(new Error("Prisma error P2034")), "P2034");
  assert.equal(classifyPrismaError(new Error("transaction timed out")), "TIMEOUT");
  assert.equal(classifyPrismaError(new Error("validation")), null);
});

test("observe mede operacao e reemite o erro sem quebrar o fluxo", async () => {
  const output = logger();
  let clock = 10;
  const observability = createPrismaQueryObservability({
    env: { CRM_PRISMA_QUERY_OBSERVABILITY: "true", CRM_PRISMA_SLOW_QUERY_MS: "1" },
    logger: output,
    now: () => clock,
  });
  const result = await observability.observe("stock.sync", async () => {
    clock += 3;
    return "ok";
  });
  assert.equal(result, "ok");
  await assert.rejects(
    observability.observe("stock.tx", async () => {
      clock += 4;
      throw Object.assign(new Error("P2028 internal"), { code: "P2028" });
    }),
    /P2028/,
  );
  assert.ok(observability.snapshot().fingerprints.length >= 2);
  assert.equal(output.lines.filter((line) => line.includes("prisma_database_error")).length, 1);
});

test("attach registra somente listeners quando explicitamente habilitado", () => {
  const listeners = [];
  const prisma = { $on: (event, handler) => listeners.push({ event, handler }) };
  const off = attachPrismaQueryObservability(prisma, { env: {} });
  assert.equal(off.enabled, false);
  assert.deepEqual(listeners, []);
  const on = attachPrismaQueryObservability(prisma, {
    env: { CRM_PRISMA_QUERY_OBSERVABILITY: "true" },
  });
  assert.equal(on.enabled, true);
  assert.deepEqual(listeners.map((item) => item.event), ["query", "error"]);
});

test("createPrismaClient conecta a observabilidade sem abrir o banco no teste", () => {
  class FakePrismaClient {
    constructor(options) { this.options = options; this.listeners = []; }
    $on(event, handler) { this.listeners.push({ event, handler }); }
  }
  const client = createPrismaClient({
    PrismaClientClass: FakePrismaClient,
    logger: logger(),
    env: {
      NODE_ENV: "test",
      CRM_TEST_DATABASE_URL: `file:${path.join(os.tmpdir(), "crm-prisma-tests", "query-observability.db")}`,
      CRM_PRISMA_QUERY_OBSERVABILITY: "true",
    },
  });
  assert.equal(client.options.datasourceUrl.endsWith("query-observability.db"), true);
  assert.deepEqual(client.listeners.map((item) => item.event), ["query", "error"]);
});
