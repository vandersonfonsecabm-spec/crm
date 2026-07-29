const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createPrismaClient, validateTestPostgresUrl } = require("../src/database/prisma-client");
const { dashboardScoreQuery } = require("../src/dashboard-score");
const { postgresUrlFromEnv } = require("../scripts/check-postgres-connection.cjs");
const { resolveSqliteDatabasePath } = require("../scripts/start-production.cjs");
const { convertValue, orderedTables, sanitizeError } = require("../scripts/migrate-sqlite-to-postgres.cjs");
const {
  postgresSchemaText,
  postgresSchemaWithClientOutput,
  preparePostgresWorkspace,
  sanitize,
} = require("../scripts/postgres-prisma.cjs");
const {
  databaseEngineFromUrl,
  databaseUrlForProvider,
  databaseProviderFromEnv,
  runPrismaForProvider,
  runtimePrismaConfig,
} = require("../scripts/prisma-runtime.cjs");
const { main: runPostgresTests, restoreSqlitePrismaClient } = require("../scripts/run-postgres-tests.cjs");

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

test("preparacao PostgreSQL direciona client temporario para output explicito", () => {
  const schema = [
    "generator client {",
    '  provider = "prisma-client-js"',
    "}",
  ].join("\n");
  const pgSchema = postgresSchemaWithClientOutput(schema, "C:/repo/backend/node_modules/.prisma/client");
  assert.match(pgSchema, /output\s*=\s*"C:\/repo\/backend\/node_modules\/\.prisma\/client"/);
});

test("workspace PostgreSQL padrao permanece sob o package root do backend", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const backendDirectory = path.resolve(__dirname, "..");
  const workspace = preparePostgresWorkspace({
    migrationSql: "-- baseline test\n",
  });
  const relativeWorkspace = path.relative(backendDirectory, workspace.root);

  assert.equal(relativeWorkspace.startsWith(".."), false);
  assert.match(
    relativeWorkspace,
    /^node_modules[\\/]\.cache[\\/]crm-postgres-prisma[\\/]/,
  );

  let packageRoot = path.dirname(workspace.schemaPath);
  while (
    packageRoot !== path.dirname(packageRoot) &&
    !fs.existsSync(path.join(packageRoot, "package.json"))
  ) {
    packageRoot = path.dirname(packageRoot);
  }
  assert.equal(packageRoot, backendDirectory);
});

test("runner PostgreSQL restaura Prisma Client SQLite apos sucesso", () => {
  const calls = [];
  runPostgresTests({
    env: { POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test" },
    runCommand: (command, args, env) => calls.push({ command, args, env }),
  });
  const last = calls.at(-1);
  assert.match(last.args.join(" "), /generate --schema prisma[\\/]schema\.prisma/);
  assert.equal(last.env.DATABASE_URL, "file:./prisma/dev.db");
  assert.equal(last.env.CRM_TEST_DATABASE_PROVIDER, "");
  assert.equal(calls.filter((call) => call.args.includes("generate")).length, 2);
});

test("runner PostgreSQL restaura Prisma Client SQLite apos falha sem esconder o erro original", () => {
  const calls = [];
  const original = new Error("falha controlada do teste PostgreSQL");
  assert.throws(() => runPostgresTests({
    env: { POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test" },
    runCommand: (command, args, env) => {
      calls.push({ command, args, env });
      if (args.includes("migrate-empty")) throw original;
    },
  }), /falha controlada/);
  const last = calls.at(-1);
  assert.match(last.args.join(" "), /generate --schema prisma[\\/]schema\.prisma/);
  assert.equal(last.env.DATABASE_URL, "file:./prisma/dev.db");
});

test("restauracao do Prisma Client SQLite limpa variaveis temporarias PostgreSQL", () => {
  const calls = [];
  restoreSqlitePrismaClient({
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
      CRM_TEST_DATABASE_PROVIDER: "postgresql",
      CRM_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
      CRM_TEST_POSTGRES_ALLOW: "true",
    },
    runCommand: (command, args, env) => calls.push({ command, args, env }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].env.DATABASE_URL, "file:./prisma/dev.db");
  assert.equal(calls[0].env.CRM_TEST_DATABASE_PROVIDER, "");
  assert.equal(calls[0].env.CRM_TEST_DATABASE_URL, "");
  assert.equal(calls[0].env.CRM_TEST_POSTGRES_ALLOW, "");
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
  assert.equal(databaseEngineFromUrl("file:/tmp/crm.db"), "sqlite");
  assert.equal(databaseEngineFromUrl("postgresql://user:pass@host:5432/db"), "postgresql");
  assert.equal(databaseEngineFromUrl("postgres://user:pass@host:5432/db"), "postgresql");
  assert.equal(databaseEngineFromUrl("mysql://host/db"), null);
  assert.equal(databaseUrlForProvider({
    CRM_DATABASE_PROVIDER: "postgresql",
    DATABASE_URL: "file:/app/data/dev.db",
    POSTGRES_DATABASE_URL: "postgresql://user:pass@host:5432/db",
  }, "postgresql"), "postgresql://user:pass@host:5432/db");
  assert.ok(resolveSqliteDatabasePath("file:./runtime.db", "C:\\app\\prisma").endsWith("runtime.db"));
});

test("provider de banco usa SQLite por padrao e rejeita valor invalido", () => {
  assert.equal(databaseProviderFromEnv({}), "sqlite");
  assert.equal(databaseProviderFromEnv({ CRM_DATABASE_PROVIDER: " PostgreSQL " }), "postgresql");
  assert.throws(() => databaseProviderFromEnv({ CRM_DATABASE_PROVIDER: "mysql" }), /CRM_DATABASE_PROVIDER/);
});

test("runtime Prisma seleciona schema SQLite somente para provider SQLite", () => {
  const config = runtimePrismaConfig({
    env: { DATABASE_URL: "file:./prisma/dev.db" },
    provider: "sqlite",
  });
  assert.match(config.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
  assert.equal(config.env.DATABASE_URL, "file:./prisma/dev.db");
});

test("runtime Prisma seleciona schema PostgreSQL derivado para provider PostgreSQL", () => {
  const config = runtimePrismaConfig({
    env: {
      CRM_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:/app/data/dev.db",
      POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
    },
    provider: "postgresql",
    postgresWorkspaceOptions: {
      root: require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "crm-pg-runtime-test-")),
      migrationSql: "-- baseline test\n",
    },
  });
  assert.doesNotMatch(config.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
  assert.match(require("node:fs").readFileSync(config.schemaPath, "utf8"), /provider = "postgresql"/);
  assert.equal(config.env.DATABASE_URL, "postgresql://user:pass@localhost:5432/crm_migration_test");
});

test("runtime Prisma falha quando provider e DATABASE_URL divergem", () => {
  assert.throws(() => runtimePrismaConfig({
    env: {
      CRM_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:./prisma/dev.db",
    },
  }), /inconsistente/);
  assert.throws(() => runtimePrismaConfig({
    env: {
      CRM_DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    },
  }), /inconsistente/);
});

test("script de build runtime executa Prisma com schema do provider escolhido", () => {
  const calls = [];
  const sqlite = runPrismaForProvider("generate", {
    env: { CRM_DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:./prisma/dev.db" },
    runCommand: (command, args, env) => calls.push({ command, args, env }),
  });
  assert.match(sqlite.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
  assert.match(calls.at(-1).args.join(" "), /generate .*--schema .*backend[\\/]prisma[\\/]schema\.prisma/);

  const postgres = runPrismaForProvider("generate", {
    env: {
      CRM_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: "file:/app/data/dev.db",
      POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
    },
    postgresWorkspaceOptions: {
      root: require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "crm-pg-build-test-")),
      migrationSql: "-- baseline test\n",
    },
    runCommand: (command, args, env) => calls.push({ command, args, env }),
  });
  assert.doesNotMatch(postgres.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
  assert.match(calls.at(-1).args.join(" "), /generate .*--schema/);
  assert.equal(calls.at(-1).env.DATABASE_URL, "postgresql://user:pass@localhost:5432/crm_migration_test");
});

test("check de conexao PostgreSQL aceita somente URL PostgreSQL explicita", () => {
  assert.throws(() => postgresUrlFromEnv({ DATABASE_URL: "file:./dev.db" }), /PostgreSQL/);
  assert.equal(
    postgresUrlFromEnv({ POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/db" }),
    "postgresql://user:pass@localhost:5432/db",
  );
  assert.equal(
    postgresUrlFromEnv({ DATABASE_URL: "file:/app/data/dev.db", POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/db" }),
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

test("score do dashboard usa SQL equivalente em SQLite e PostgreSQL", async () => {
  const prisma = createPrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  let empresa = null;
  try {
    empresa = await prisma.empresa.create({
      data: { nome: `Dashboard score ${suffix}`, slug: `dashboard-score-${suffix}` },
    });
    await prisma.cliente.createMany({
      data: [
        { empresaId: empresa.id, nome: "Base" },
        {
          empresaId: empresa.id,
          nome: "Quente",
          quente: true,
          favorito: true,
          valor: 12000,
          status: "Proposta",
        },
        {
          empresaId: empresa.id,
          nome: "Perdido",
          status: "Perdido",
          ultimoContato: 7,
        },
      ],
    });

    const rows = await prisma.$queryRaw(dashboardScoreQuery(empresa.id));
    assert.equal(Math.round(Number(rows[0]?.averageScore)), 52);
  } finally {
    if (empresa) {
      await prisma.cliente.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
    await prisma.$disconnect();
  }
});
