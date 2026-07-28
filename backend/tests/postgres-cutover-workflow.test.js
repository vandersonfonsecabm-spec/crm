const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  PRODUCTION_CONFIRMATION,
  assertExplicitSelectors,
  executeCutoverWorkflow,
  sanitize,
} = require("../scripts/postgres-cutover-workflow.cjs");

const selectors = {
  apiServiceId: "api-service-id",
  environment: "production",
  projectId: "project-id",
};

test("workflow preserva DATABASE_URL SQLite e aplica PostgreSQL por variavel separada", async () => {
  const sqliteUrl = "file:/app/data/dev.db?secret=sqlite-secret";
  const postgresUrl = "postgresql://user:pg-secret@host:5432/crm";
  const client = mockRailwayClient({ DATABASE_URL: sqliteUrl, CRM_DATABASE_PROVIDER: "sqlite" });
  const logs = capturedLogger();

  const result = await executeCutoverWorkflow({
    confirmation: PRODUCTION_CONFIRMATION,
    postgresDatabaseUrl: postgresUrl,
    selectors,
    skipDeploys: true,
  }, {
    logger: logs.logger,
    railwayClient: client,
    smoke: async () => ({ ok: true, routes: [{ method: "GET", path: "/health", status: 200 }] }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.finalProvider, "postgresql");
  assert.equal(client.variables.DATABASE_URL, sqliteUrl);
  assert.equal(client.variables.POSTGRES_DATABASE_URL, postgresUrl);
  assert.equal(client.variables.CRM_DATABASE_PROVIDER, "postgresql");
  assert.equal(client.calls.filter((call) => call.type === "set" && call.key === "DATABASE_URL").length, 0);
  assertNoSecrets(logs.entries.join("\n"), [sqliteUrl, postgresUrl, "sqlite-secret", "pg-secret"]);
});

test("falha depois da troca aciona rollback sem regravar o segredo SQLite", async () => {
  const sqliteUrl = "file:/app/data/dev.db?secret=sqlite-rollback-secret";
  const postgresUrl = "postgresql://user:pg-rollback-secret@host:5432/crm";
  const client = mockRailwayClient({ DATABASE_URL: sqliteUrl, CRM_DATABASE_PROVIDER: "sqlite" });

  await assert.rejects(executeCutoverWorkflow({
    confirmation: PRODUCTION_CONFIRMATION,
    postgresDatabaseUrl: postgresUrl,
    selectors,
    simulateFailure: true,
    skipDeploys: true,
  }, {
    railwayClient: client,
  }), (error) => {
    assert.equal(error.code, "CUTOVER_SIMULATED_FAILURE");
    assert.equal(error.rollbackApplied, true);
    assert.equal(error.events.some((entry) => entry.event === "cutover_rollback_ok"), true);
    assert.equal(error.events.some((entry) => entry.event === "cutover_secrets_cleared"), true);
    return true;
  });

  assert.equal(client.variables.DATABASE_URL, sqliteUrl);
  assert.equal(client.variables.CRM_DATABASE_PROVIDER, "sqlite");
  assert.equal(Object.prototype.hasOwnProperty.call(client.variables, "POSTGRES_DATABASE_URL"), false);
  assert.equal(client.calls.filter((call) => call.type === "set" && call.key === "DATABASE_URL").length, 0);
});

test("falha de rollback e critica e explicita", async () => {
  const client = mockRailwayClient(
    { DATABASE_URL: "file:/app/data/dev.db", CRM_DATABASE_PROVIDER: "sqlite" },
    { failDelete: true },
  );

  await assert.rejects(executeCutoverWorkflow({
    confirmation: PRODUCTION_CONFIRMATION,
    postgresDatabaseUrl: "postgresql://user:pass@host:5432/crm",
    selectors,
    simulateFailure: true,
    skipDeploys: true,
  }, {
    railwayClient: client,
  }), { code: "CUTOVER_ROLLBACK_FAILED" });
});

test("dry-run exige seletores explicitos e nao chama mutacoes Railway", async () => {
  assert.throws(() => assertExplicitSelectors({
    environment: "production",
    projectId: "project-id",
  }, { confirmation: PRODUCTION_CONFIRMATION }), { code: "CUTOVER_SELECTOR_REQUIRED" });
  assert.throws(() => assertExplicitSelectors(selectors, { confirmation: "" }), { code: "CUTOVER_PRODUCTION_CONFIRMATION_REQUIRED" });

  const client = mockRailwayClient({ DATABASE_URL: "file:/app/data/dev.db", CRM_DATABASE_PROVIDER: "sqlite" });
  const result = await executeCutoverWorkflow({
    confirmation: PRODUCTION_CONFIRMATION,
    dryRun: true,
    postgresDatabaseUrl: "postgresql://user:pass@host:5432/crm",
    selectors,
  }, {
    railwayClient: client,
  });

  assert.equal(result.ok, true);
  assert.equal(client.calls.filter((call) => call.type !== "get").length, 0);
  assert.equal(result.events.some((entry) => entry.event === "cutover_secrets_cleared"), true);
});

test("sanitizacao remove URLs e segredos conhecidos", () => {
  const text = sanitize(
    "DATABASE_URL=file:/app/data/dev.db?token=abc POSTGRES=postgresql://user:password@host:5432/db Authorization: Bearer token123",
    ["abc", "password"],
  );
  assert.doesNotMatch(text, /abc|password|token123|user:password/);
  assert.match(text, /file:\[secret\]/);
  assert.match(text, /postgresql:\/\/\[secret\]/);
});

function mockRailwayClient(initialVariables, options = {}) {
  const client = {
    calls: [],
    variables: { ...initialVariables },
    async getVariables() {
      client.calls.push({ type: "get" });
      return { ...client.variables };
    },
    async setVariable(selectorsArg, key, value) {
      client.calls.push({ type: "set", key });
      client.variables[key] = value;
    },
    async deleteVariable(selectorsArg, key) {
      client.calls.push({ type: "delete", key });
      if (options.failDelete) {
        const error = new Error("delete failed");
        error.code = "DELETE_FAILED";
        throw error;
      }
      delete client.variables[key];
    },
  };
  return client;
}

function capturedLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      log: (message) => entries.push(String(message)),
      error: (message) => entries.push(String(message)),
    },
  };
}

function assertNoSecrets(text, secrets) {
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false, `secret leaked: ${secret}`);
  }
}
