const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createPrismaClient, validateTestPostgresUrl } = require("../src/database/prisma-client");
const { postgresUrlFromEnv } = require("../scripts/check-postgres-connection.cjs");
const { databaseEngine, resolveSqliteDatabasePath } = require("../scripts/start-production.cjs");
const { convertValue, orderedTables, sanitizeError } = require("../scripts/migrate-sqlite-to-postgres.cjs");
const { postgresSchemaText, sanitize } = require("../scripts/postgres-prisma.cjs");

test("preparacao PostgreSQL deriva provider sem alterar o schema canonico SQLite", () => {
  const sqliteSchema = [
    "datasource db {",
    '  provider = "sqlite"',
    '  url      = env("DATABASE_URL")',
    "}",
  ].join("\n");
  const pgSchema = postgresSchemaText(sqliteSchema);
  assert.match(pgSchema, /provider = "postgresql"/);
  assert.match(sqliteSchema, /provider = "sqlite"/);
});

test("guard de teste PostgreSQL exige URL e confirmacao explicita", () => {
  assert.throws(() => validateTestPostgresUrl("file:./test.db", { CRM_TEST_POSTGRES_ALLOW: "true" }), /postgresql/);
  assert.throws(() => validateTestPostgresUrl("postgresql://user:pass@localhost:5432/db", {}), /CRM_TEST_POSTGRES_ALLOW/);
  assert.equal(
    validateTestPostgresUrl("postgresql://user:pass@localhost:5432/db", { CRM_TEST_POSTGRES_ALLOW: "true" }),
    "postgresql://user:pass@localhost:5432/db",
  );
});

test("createPrismaClient seleciona datasource PostgreSQL somente no modo de teste explicito", () => {
  class FakeClient {
    constructor(options) {
      this.options = options;
    }
  }
  const client = createPrismaClient({
    PrismaClientClass: FakeClient,
    env: {
      NODE_ENV: "test",
      CRM_TEST_DATABASE_PROVIDER: "postgresql",
      CRM_TEST_POSTGRES_ALLOW: "true",
      CRM_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    },
  });
  assert.deepEqual(client.options, { datasourceUrl: "postgresql://user:pass@localhost:5432/db" });
});

test("startup reconhece SQLite e PostgreSQL sem expor URL", () => {
  assert.equal(databaseEngine("file:/tmp/crm.db"), "sqlite");
  assert.equal(databaseEngine("postgresql://user:pass@host:5432/db"), "postgresql");
  assert.equal(databaseEngine("postgres://user:pass@host:5432/db"), "postgresql");
  assert.equal(databaseEngine("mysql://host/db"), null);
  assert.ok(resolveSqliteDatabasePath("file:./runtime.db", "C:\\app\\prisma").endsWith("runtime.db"));
});

test("check de conexao PostgreSQL aceita somente URL PostgreSQL explicita", () => {
  assert.throws(() => postgresUrlFromEnv({ DATABASE_URL: "file:./dev.db" }), /PostgreSQL/);
  assert.equal(
    postgresUrlFromEnv({ POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/db" }),
    "postgresql://user:pass@localhost:5432/db",
  );
});

test("importador ordena tabelas por dependencias de foreign key", () => {
  const sqlite = {
    prepare(sql) {
      if (sql.includes("sqlite_master")) return { all: () => [{ name: "Filho" }, { name: "Pai" }, { name: "Neto" }] };
      if (sql.includes('PRAGMA foreign_key_list("Filho")')) return { all: () => [{ table: "Pai" }] };
      if (sql.includes('PRAGMA foreign_key_list("Neto")')) return { all: () => [{ table: "Filho" }] };
      return { all: () => [] };
    },
  };
  assert.deepEqual(orderedTables(sqlite), ["Pai", "Filho", "Neto"]);
});

test("importador converte booleanos e timestamps para PostgreSQL", () => {
  assert.equal(convertValue(1, { data_type: "boolean" }), true);
  assert.equal(convertValue(0, { udt_name: "bool" }), false);
  assert.ok(convertValue("2026-07-28T10:00:00.000Z", { data_type: "timestamp without time zone" }) instanceof Date);
  assert.equal(convertValue("texto", { data_type: "text" }), "texto");
});

test("logs de migracao sanitizam URLs e termos sensiveis", () => {
  assert.doesNotMatch(sanitize("postgresql://user:password@host:5432/db"), /password/);
  assert.doesNotMatch(sanitizeError(new Error("token postgresql://user:password@host/db")), /password|token/);
});
