process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { createPrismaClient, validateTestPostgresUrl } = require("../src/database/prisma-client");
const { dashboardScoreQuery } = require("../src/dashboard-score");
const { postgresUrlFromEnv } = require("../scripts/check-postgres-connection.cjs");
const { resolveSqliteDatabasePath } = require("../scripts/start-production.cjs");
const { copyWithinTransaction, convertValue, orderedTables, sanitizeError } = require("../scripts/migrate-sqlite-to-postgres.cjs");
const {
  cleanupPostgresTestWorkspace,
  createPostgresTestWorkspace,
  latestMigrationSqlPath,
  postgresSchemaText,
  postgresSchemaWithClientOutput,
  preparePostgresWorkspace,
  parsePostgresCliArguments,
  sanitize,
} = require("../scripts/postgres-prisma.cjs");
const {
  databaseEngineFromUrl,
  databaseUrlForProvider,
  databaseProviderFromEnv,
  runPrismaForProvider,
  runtimePrismaConfig,
} = require("../scripts/prisma-runtime.cjs");
const { main: runPostgresTests } = require("../scripts/run-postgres-tests.cjs");

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

test("workspace PostgreSQL preserva baseline congelada e inclui migrations incrementais atuais", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-pg-versioned-migrations-"));
  try {
    const workspace = preparePostgresWorkspace({ root });
    const migrationNames = fs.readdirSync(workspace.migrationsDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    assert.deepEqual(migrationNames, [
      "20260728090000_postgres_baseline",
      "20260730160000_add_instagram_direct_schema_foundation",
      "20260731120000_add_messenger_direct_schema_foundation",
      "20260731190000_add_email_inbound_foundation",
      "20260801123000_enforce_tenant_safe_relations",
      "20260801150000_add_user_security_foundation",
      "20260811120000_add_meta_credential_store",
      "20260811130000_add_meta_oauth_state_binding",
      "20260813150000_add_customer_archive",
      "20260815120000_add_h8_notifications",
      "20260823152000_add_distributed_rate_limit",
      "20260823180000_add_stock_core_e2",
      "20260823200000_add_stock_rules_h8_projection",
      "20260824120000_fix_stock_postgres_enum_types",
      "20260824150000_add_ai_commerce_catalog_foundation",
      "20260824160000_add_ai_commerce_persistent_audit_effects",
      "20260825170000_add_commercial_proposal_catalog_items",
    ]);
    assert.equal(
      latestMigrationSqlPath(workspace.migrationsDir),
      path.join(
      workspace.migrationsDir,
        "20260825170000_add_commercial_proposal_catalog_items",
        "migration.sql",
      ),
    );
    const baseline = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260728090000_postgres_baseline",
      "migration.sql",
    ));
    assert.equal(
      crypto.createHash("sha256").update(Buffer.from(baseline.toString("utf8").replace(/\r\n/g, "\n"))).digest("hex"),
      "e07a9fd6240acec419d0d2994ffed69897bdc2b87cd7d4cc15e28cb104ce8975",
    );
    const incremental = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260730160000_add_instagram_direct_schema_foundation",
      "migration.sql",
    ), "utf8");
    assert.match(incremental, /INSTAGRAM_META/);
    assert.match(incremental, /instagramBusinessAccountId/);
    assert.doesNotMatch(incremental, /\b(?:DROP|DELETE|UPDATE|TRUNCATE)\b/i);
    const messengerIncremental = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260731120000_add_messenger_direct_schema_foundation",
      "migration.sql",
    ), "utf8");
    assert.match(messengerIncremental, /MESSENGER_META/);
    assert.match(messengerIncremental, /messengerPageId/);
    assert.doesNotMatch(messengerIncremental, /\b(?:DROP|DELETE|UPDATE|TRUNCATE)\b/i);
    const emailIncremental = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260731190000_add_email_inbound_foundation",
      "migration.sql",
    ), "utf8");
    assert.match(emailIncremental, /EMAIL/);
    assert.match(emailIncremental, /EmailMailboxAddress/);
    assert.match(emailIncremental, /EmailMessageMetadata/);
    assert.doesNotMatch(emailIncremental, /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    const tenantIsolationIncremental = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260801123000_enforce_tenant_safe_relations",
      "migration.sql",
    ), "utf8");
    assert.match(tenantIsolationIncremental, /__tenant_relation_preflight/);
    assert.match(tenantIsolationIncremental, /FOREIGN KEY \("empresaId", "clienteId"\)/);
    assert.match(tenantIsolationIncremental, /REFERENCES "Cliente"\("empresaId", "id"\)/);
    const metaCredentialMigration = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260811120000_add_meta_credential_store",
      "migration.sql",
    ), "utf8");
    assert.match(metaCredentialMigration, /^BEGIN;\s*$/m);
    assert.match(metaCredentialMigration, /COMMIT;\s*$/m);
    assert.match(metaCredentialMigration, /CREATE TYPE "StatusCredencialMeta"/);
    assert.match(metaCredentialMigration, /META_PERSISTENCE_PRECHECK_FAILED/);
    assert.match(metaCredentialMigration, /CanalIntegracao_empresaId_id_accessTokenRef_fkey/);
    assert.doesNotMatch(metaCredentialMigration, /\b(?:PRAGMA|AUTOINCREMENT)\b/i);
    assert.doesNotMatch(metaCredentialMigration, /^\s*(?:INSERT|UPDATE|DELETE|DROP)\b/im);
    const metaOAuthStateMigration = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260811130000_add_meta_oauth_state_binding",
      "migration.sql",
    ), "utf8");
    assert.match(metaOAuthStateMigration, /ADD COLUMN "canalIntegracaoId" INTEGER/);
    assert.match(metaOAuthStateMigration, /ADD COLUMN "fluxo" TEXT/);
    assert.match(metaOAuthStateMigration, /IntegracaoOAuthState_empresaId_canalIntegracaoId_fkey/);
    assert.match(metaOAuthStateMigration, /IntegracaoOAuthState_empresaId_canalIntegracaoId_fluxo_idx/);
    assert.doesNotMatch(metaOAuthStateMigration, /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    const h8Migration = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260815120000_add_h8_notifications",
      "migration.sql",
    ), "utf8");
    assert.match(h8Migration, /^BEGIN;\s*$/m);
    assert.match(h8Migration, /COMMIT;\s*$/m);
    assert.match(h8Migration, /ConfiguracaoNotificacaoEmpresa/);
    assert.doesNotMatch(h8Migration, /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    const stockRulesMigration = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260823200000_add_stock_rules_h8_projection",
      "migration.sql",
    ), "utf8");
    assert.match(stockRulesMigration, /^BEGIN;\s*$/m);
    assert.match(stockRulesMigration, /ALTER TABLE "Notificacao" ADD COLUMN "stockTargetType"/);
    assert.match(stockRulesMigration, /ConfiguracaoRegraEstoque/);
    assert.match(stockRulesMigration, /OverrideEstoque/);
    assert.match(stockRulesMigration, /AvaliacaoRegraEstoque/);
    assert.doesNotMatch(stockRulesMigration, /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    const commercialProposalCatalogMigration = fs.readFileSync(path.join(
      workspace.migrationsDir,
      "20260825170000_add_commercial_proposal_catalog_items",
      "migration.sql",
    ), "utf8");
    assert.match(commercialProposalCatalogMigration, /^BEGIN;\s*$/m);
    assert.match(commercialProposalCatalogMigration, /ITEM_PROPOSTA_COMERCIAL_PARENT_MISSING/);
    assert.match(commercialProposalCatalogMigration, /CREATE TYPE "TipoItemPropostaComercial"/);
    assert.match(commercialProposalCatalogMigration, /ADD VALUE IF NOT EXISTS 'REVALIDACAO_RECUSADA'/);
    assert.match(commercialProposalCatalogMigration, /UPDATE "ItemPropostaComercial" AS "item"/);
    assert.match(commercialProposalCatalogMigration, /DROP CONSTRAINT "ItemPropostaComercial_propostaId_fkey"/);
    assert.match(commercialProposalCatalogMigration, /FOREIGN KEY \("empresaId", "productOfferId"\) REFERENCES "ProductOffer"\("empresaId", "id"\) ON DELETE RESTRICT/);
    assert.match(commercialProposalCatalogMigration, /ItemPropostaComercial_catalog_contract_ck/);
    assert.doesNotMatch(commercialProposalCatalogMigration, /^\s*(?:DELETE|TRUNCATE|DROP TABLE)\b/im);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runner PostgreSQL usa workspace e client isolados sem regenerar SQLite", () => {
  const calls = [];
  const cleaned = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-prisma-tests-runner-"));
  runPostgresTests({
    env: { POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test" },
    createWorkspace: () => ({ root, clientLoaderPath: path.join(root, "loader.cjs") }),
    cleanupWorkspace: (workspaceRoot) => cleaned.push(workspaceRoot),
    runCommand: (command, args, env) => calls.push({ command, args, env }),
  });
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0], root);
  assert.equal(calls.filter((call) => call.args.includes("generate")).length, 1);
  assert.equal(calls.filter((call) => call.args.includes("migrate-empty")).length, 1);
  assert.ok(calls.filter((call) => call.args.includes("--test-workspace") && call.args.includes(root)).length >= 2);
  const pgTestCall = calls.find((call) => call.args.some((arg) => String(arg).includes("tenant-isolation-pending-migrations-postgres.test.js")));
  assert.ok(pgTestCall);
  assert.match(pgTestCall.env.NODE_OPTIONS, /loader\.cjs/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("runner PostgreSQL limpa workspace isolado apos falha sem esconder o erro original", () => {
  const calls = [];
  const cleaned = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-prisma-tests-runner-fail-"));
  const original = new Error("falha controlada do teste PostgreSQL");
  assert.throws(() => runPostgresTests({
    env: { POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test" },
    createWorkspace: () => ({ root, clientLoaderPath: path.join(root, "loader.cjs") }),
    cleanupWorkspace: (workspaceRoot) => cleaned.push(workspaceRoot),
    runCommand: (command, args, env) => {
      calls.push({ command, args, env });
      if (args.includes("migrate-empty")) throw original;
    },
  }), /falha controlada/);
  assert.deepEqual(cleaned, [root]);
  assert.equal(calls.filter((call) => call.args.includes("generate")).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("argumentos do runner aceitam somente workspace temporario explicito", () => {
  const parsed = parsePostgresCliArguments(["--test-workspace", path.join(os.tmpdir(), "crm-prisma-tests", "probe")]);
  assert.equal(parsed.positional.length, 0);
  assert.match(parsed.workspaceOptions.root, /crm-prisma-tests/);
  assert.throws(() => parsePostgresCliArguments(["--test-workspace"]), /exige/);
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-pg-runtime-test-"));
  try {
    const config = runtimePrismaConfig({
      env: {
        CRM_DATABASE_PROVIDER: "postgresql",
        DATABASE_URL: "file:/app/data/dev.db",
        POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
      },
      provider: "postgresql",
      postgresWorkspaceOptions: { root, migrationSql: "-- baseline test\n" },
    });
    assert.doesNotMatch(config.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
    assert.match(fs.readFileSync(config.schemaPath, "utf8"), /provider = "postgresql"/);
    assert.equal(config.env.DATABASE_URL, "postgresql://user:pass@localhost:5432/crm_migration_test");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-pg-build-test-"));
  try {
    const postgres = runPrismaForProvider("generate", {
      env: {
        CRM_DATABASE_PROVIDER: "postgresql",
        DATABASE_URL: "file:/app/data/dev.db",
        POSTGRES_DATABASE_URL: "postgresql://user:pass@localhost:5432/crm_migration_test",
      },
      postgresWorkspaceOptions: { root, migrationSql: "-- baseline test\n" },
      runCommand: (command, args, env) => calls.push({ command, args, env }),
    });
    assert.doesNotMatch(postgres.schemaPath, /backend[\\/]prisma[\\/]schema\.prisma$/);
    assert.match(calls.at(-1).args.join(" "), /generate .*--schema/);
    assert.equal(calls.at(-1).env.DATABASE_URL, "postgresql://user:pass@localhost:5432/crm_migration_test");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test("importador valida contagens antes do commit e reverte divergencias", async () => {
  const statements = [];
  const pgClient = { query: async (sql) => statements.push(sql) };
  await assert.rejects(
    copyWithinTransaction({
      sqlite: {},
      pgClient,
      tables: ["Cliente"],
      batchSize: 100,
      dryRun: false,
      copyTableFn: async () => ({ table: "Cliente", source: 1, inserted: 1, dryRun: false }),
      resetSequencesFn: async () => statements.push("RESET_SEQUENCES"),
      validateCountsFn: async () => {
        statements.push("VALIDATE_COUNTS");
        return [{ table: "Cliente", source: 1, target: 0 }];
      },
    }),
    /Divergencia de contagem/,
  );
  assert.deepEqual(statements, ["BEGIN", "RESET_SEQUENCES", "VALIDATE_COUNTS", "ROLLBACK"]);
});

test("importador confirma somente depois da validacao sem divergencias", async () => {
  const statements = [];
  const pgClient = { query: async (sql) => statements.push(sql) };
  const result = await copyWithinTransaction({
    sqlite: {},
    pgClient,
    tables: ["Cliente"],
    batchSize: 100,
    dryRun: false,
    copyTableFn: async () => ({ table: "Cliente", source: 1, inserted: 1, dryRun: false }),
    resetSequencesFn: async () => statements.push("RESET_SEQUENCES"),
    validateCountsFn: async () => {
      statements.push("VALIDATE_COUNTS");
      return [];
    },
  });
  assert.deepEqual(statements, ["BEGIN", "RESET_SEQUENCES", "VALIDATE_COUNTS", "COMMIT"]);
  assert.deepEqual(result.mismatches, []);
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
