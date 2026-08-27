process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { Client } = require("pg");
const { validateTestPostgresUrl } = require("../src/database/prisma-client");
const { runGate } = require("../scripts/tenant-isolation-gate.cjs");
const {
  latestMigrationName,
  preparePostgresWorkspace,
  resolvePrismaCli,
} = require("../scripts/postgres-prisma.cjs");

const backendDir = path.resolve(__dirname, "..");
const sourceMigrations = path.join(backendDir, "prisma-postgres", "migrations");
const testRoot = path.join(os.tmpdir(), "crm-prisma-tests");
const databaseUrl = validateTestPostgresUrl(
  process.env.CRM_TEST_DATABASE_URL || process.env.POSTGRES_TEST_DATABASE_URL,
  process.env,
);

test("PostgreSQL migration boundary preserva prefixes historicos e o conjunto final", async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(testRoot, "v46-pg-boundary-"));
  const workspace = preparePostgresWorkspace({ root: path.join(runDir, "workspace") });
  const migrationNames = migrationDirectories(sourceMigrations);
  const client = new Client({ connectionString: databaseUrl, statement_timeout: 30000 });
  let ownsEmptyTarget = false;

  await client.connect();
  try {
    const initialCount = await publicTableCount(client);
    assert.equal(initialCount, 0, "O alvo PostgreSQL TEST_ONLY deve estar vazio antes da regressao 6+2.");
    ownsEmptyTarget = true;

    keepMigrations(workspace.migrationsDir, migrationNames.slice(0, 6));
    runPrismaDeploy(workspace.schemaPath);
    const sixApplied = await migrationStatus(client);
    assert.equal(sixApplied.length, 6);
    assert.equal(sixApplied.every((row) => row.finished && !row.rolledBack), true);
    assert.equal(await columnExists(client, "IntegracaoOAuthState", "canalIntegracaoId"), false);

    restoreMigrations(workspace.migrationsDir);
    const gateOptions = {
      env: testEnvironment(),
      schemaPath: workspace.schemaPath,
      postgresMigrationDir: workspace.migrationsDir,
      migrationName: latestMigrationName(workspace.migrationsDir),
    };
    const preSix = await runGate({ mode: "pre-migration", ...gateOptions });
    assert.equal(preSix.safe, true);
    assert.equal(preSix.checkedRelationCount, 87);
    await assert.rejects(
      runGate({ mode: "post-migration", ...gateOptions }),
      { code: "TENANT_GATE_MIGRATION_PENDING" },
    );

    const finalMigrations = migrationNames.slice(-2);
    for (const migrationName of finalMigrations) {
      fs.rmSync(path.join(workspace.migrationsDir, migrationName), { recursive: true, force: true });
    }
    runPrismaDeploy(workspace.schemaPath);
    for (const migrationName of finalMigrations) {
      fs.cpSync(
        path.join(sourceMigrations, migrationName),
        path.join(workspace.migrationsDir, migrationName),
        { recursive: true },
      );
    }
    const preSeven = await runGate({ mode: "pre-migration", ...gateOptions });
    assert.equal(preSeven.safe, true);
    // The proposal catalog migration and readiness migration are pending;
    // four proposal-item relations plus delivery-outbox are unavailable.
    assert.equal(preSeven.checkedRelationCount, 157);

    await seedLegacyProposalItem(client);

    runPrismaDeploy(workspace.schemaPath);
    const post = await runGate({ mode: "post-migration", ...gateOptions });
    const finalStatus = await migrationStatus(client);
    assert.equal(finalStatus.length, migrationNames.length);
    assert.equal(finalStatus.every((row) => row.finished && !row.rolledBack), true);
    assert.equal(post.safe, true);
    assert.equal(post.checkedRelationCount, 162);
    assert.deepEqual(post.totals, { orphaned: 0, crossed: 0 });
    assert.equal(post.constraints.checkedForeignKeys, 247);
    assert.equal(post.constraints.checkedUniqueParents, 31);
    const backfilled = (await client.query(
      'SELECT "empresaId", "itemType", "descricao", "productOfferId", "catalogProductId", "stockProductId" FROM "ItemPropostaComercial" WHERE "id" = $1',
      [9001],
    )).rows[0];
    assert.deepEqual(backfilled, {
      empresaId: 9001,
      itemType: "LEGACY_ITEM",
      descricao: "Legacy PostgreSQL rehearsal",
      productOfferId: null,
      catalogProductId: null,
      stockProductId: null,
    });
  } finally {
    try {
      if (ownsEmptyTarget) {
        await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;");
        assert.equal(await publicTableCount(client), 0);
      }
    } finally {
      await client.end();
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
});

async function seedLegacyProposalItem(client) {
  const now = "2026-08-25T17:00:00.000Z";
  for (const statement of [
    `
    INSERT INTO "Empresa" ("id", "nome", "slug", "ativo", "createdAt", "updatedAt")
    VALUES (9001, 'PostgreSQL rehearsal', 'postgresql-rehearsal-v1', TRUE, $1, $1)
    `,
    `
    INSERT INTO "Usuario" ("id", "empresaId", "nome", "email", "senhaHash", "papel", "ativo", "createdAt", "updatedAt")
    VALUES (9001, 9001, 'Rehearsal Admin', 'rehearsal-9001@example.test', 'hash', 'ADMIN', TRUE, $1, $1)
    `,
    `
    INSERT INTO "Cliente" ("id", "empresaId", "nome", "createdAt")
    VALUES (9001, 9001, 'Rehearsal Customer', $1)
    `,
    `
    INSERT INTO "Negocio" ("id", "empresaId", "clienteId", "etapa", "createdAt", "updatedAt")
    VALUES (9001, 9001, 9001, 'NOVO', $1, $1)
    `,
    `
    INSERT INTO "PropostaComercial" ("id", "empresaId", "clienteId", "negocioId", "autorId", "codigo", "titulo", "validade", "updatedAt")
    VALUES (9001, 9001, 9001, 9001, 9001, 'PG-REHEARSAL-9001', 'Legacy PostgreSQL rehearsal', '2026-09-01T00:00:00.000Z', $1)
    `,
    `
    INSERT INTO "ItemPropostaComercial" ("id", "propostaId", "descricao", "quantidade", "valorUnitarioCentavos", "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt")
    VALUES (9001, 9001, 'Legacy PostgreSQL rehearsal', 1, 1250, 0, 1250, 1250, 0, $1, $1)
    `,
  ]) await client.query(statement, [now]);
}

function migrationDirectories(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function keepMigrations(root, allowedNames) {
  const allowed = new Set(allowedNames);
  for (const name of migrationDirectories(root)) {
    if (!allowed.has(name)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
}

function restoreMigrations(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(sourceMigrations, target, { recursive: true });
}

function testEnvironment() {
  return {
    ...process.env,
    NODE_ENV: "test",
    CRM_TEST_DATABASE_PROVIDER: "postgresql",
    CRM_TEST_POSTGRES_ALLOW: "true",
    CRM_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    POSTGRES_DATABASE_URL: "",
  };
}

function runPrismaDeploy(schemaPath) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), "migrate", "deploy", "--schema", schemaPath], {
    cwd: backendDir,
    env: testEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, "Prisma migrate deploy deve concluir no alvo PostgreSQL TEST_ONLY.");
}

async function publicTableCount(client) {
  return Number((await client.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname = current_schema()")).rows[0].count);
}

async function migrationStatus(client) {
  return (await client.query('SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY started_at, id')).rows;
}

async function columnExists(client, table, column) {
  return (await client.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2) AS present",
    [table, column],
  )).rows[0].present;
}
