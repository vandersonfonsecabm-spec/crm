"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const { main: runDisposablePostgres } = require("./test-postgres-real.cjs");
const {
  preparePostgresWorkspace,
  resolvePrismaCli,
} = require("./postgres-prisma.cjs");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260825170000_add_commercial_proposal_catalog_items";
const sourceMigrationDir = path.join(backendDir, "prisma-postgres", "migrations");

async function runRollbackRehearsal(databaseUrl) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-pg-v1-rollback-"));
  const workspace = preparePostgresWorkspace({ root });
  const latestDir = path.join(workspace.migrationsDir, migrationName);
  let client;
  try {
    fs.rmSync(latestDir, { recursive: true, force: true });
    runPrisma(workspace.schemaPath, databaseUrl, ["migrate", "deploy"]);

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query(`
      INSERT INTO "ItemPropostaComercial" (
        "id", "propostaId", "descricao", "quantidade", "valorUnitarioCentavos",
        "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt"
      ) VALUES (910001, 999999, 'Orphan rollback probe', 1, 100, 0, 100, 100, 0, NOW(), NOW())
    `);
    await client.query("COMMIT");
    await client.end();
    client = null;

    fs.cpSync(path.join(sourceMigrationDir, migrationName), latestDir, { recursive: true });
    const failed = runPrismaResult(workspace.schemaPath, databaseUrl, ["migrate", "deploy"]);
    if (failed.status === 0) throw new Error("A migration deveria falhar diante do item legado orfao.");

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'ItemPropostaComercial'
    `);
    const orphan = await client.query('SELECT COUNT(*)::int AS count FROM "ItemPropostaComercial" WHERE "id" = 910001');
    const latestMigration = await client.query(
      'SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" WHERE migration_name = $1 ORDER BY started_at DESC LIMIT 1',
      [migrationName],
    );
    if (columns.rows.some((row) => row.column_name === "empresaId")) throw new Error("DDL parcial: empresaId permaneceu apos rollback.");
    if (columns.rows.some((row) => row.column_name === "itemType")) throw new Error("DDL parcial: itemType permaneceu apos rollback.");
    if (Number(orphan.rows[0].count) !== 1) throw new Error("O item orfao nao foi preservado para recuperacao.");
    if (latestMigration.rows[0]?.finished) {
      throw new Error("Historico Prisma marcou a migration como concluida apos falha.");
    }
    return {
      status: "passed",
      migration: migrationName,
      failedMigrationRecordedAsRolledBack: Boolean(latestMigration.rows[0]?.rolledBack),
      migrationHistoryRowPresent: Boolean(latestMigration.rows[0]),
      migrationNotFinished: !latestMigration.rows[0]?.finished,
      ddlReverted: true,
      orphanPreserved: true,
    };
  } finally {
    if (client) await client.end().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runPrisma(schemaPath, databaseUrl, args) {
  const result = runPrismaResult(schemaPath, databaseUrl, args);
  if (result.status !== 0) throw new Error(`Prisma ${args.join(" ")} falhou durante o preparo da rollback rehearsal.`);
}

function runPrismaResult(schemaPath, databaseUrl, args) {
  return spawnSync(process.execPath, [resolvePrismaCli(), ...args, "--schema", schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
}

runDisposablePostgres({
  runId: "v1-rollback",
  runSuite: async (databaseUrl) => ({
    status: 0,
    stdout: JSON.stringify(await runRollbackRehearsal(databaseUrl)),
    stderr: "",
  }),
})
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(JSON.stringify({ event: "postgres_v1_rollback", safe: false, message: error.message }));
    process.exitCode = 1;
  });
