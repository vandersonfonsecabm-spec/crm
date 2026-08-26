"use strict";

const { Client } = require("pg");

const fixedTables = ["Empresa", "PropostaComercial", "ItemPropostaComercial", "ProductOffer", "CommercialCatalogProduct"];
const v1Migration = "20260825170000_add_commercial_proposal_catalog_items";

async function main() {
  const connectionString = String(process.env.DATABASE_PUBLIC_URL || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  const proxyHost = String(process.env.RAILWAY_TCP_PROXY_DOMAIN || "").trim();
  const proxyPort = Number(process.env.RAILWAY_TCP_PROXY_PORT || 0);
  const clientConfig = proxyHost && Number.isInteger(proxyPort) && proxyPort > 0
    ? { host: proxyHost, port: proxyPort, user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE }
    : { connectionString };
  if (!clientConfig.host && !/^postgres(?:ql)?:\/\//i.test(connectionString)) throw new Error("PRODUCTION_POSTGRES_URL_NOT_FOUND");
  const client = new Client({ ...clientConfig, statement_timeout: 5000, query_timeout: 7000, connectionTimeoutMillis: 7000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const scalar = (sql, params = []) => client.query(sql, params).then((result) => result.rows[0] || {});
    const version = await scalar("SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name, current_setting('server_version') AS server_version, current_setting('server_version_num') AS server_version_num, current_setting('TimeZone') AS timezone, pg_database_size(current_database())::bigint AS database_bytes");
    const extensions = (await client.query("SELECT extname FROM pg_extension WHERE extname IN ('pg_stat_statements') ORDER BY extname")).rows.map((row) => row.extname);
    const migrationTable = (await scalar("SELECT to_regclass('public._prisma_migrations') AS table_name")).table_name;
    let migrations = { tablePresent: Boolean(migrationTable), appliedCount: null, failedCount: null, latest: [], v1Applied: null };
    if (migrationTable) {
      migrations.appliedCount = Number((await scalar('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).count || 0);
      migrations.failedCount = Number((await scalar('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE rolled_back_at IS NOT NULL OR (finished_at IS NULL AND started_at IS NOT NULL)')).count || 0);
      migrations.latest = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5')).rows;
      migrations.v1Applied = Boolean((await scalar('SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS present', [v1Migration])).present);
    }
    const tableState = {};
    for (const table of fixedTables) {
      const reg = (await client.query("SELECT to_regclass($1) AS table_name", [`public."${table}"`])).rows[0]?.table_name;
      if (!reg) {
        tableState[table] = { present: false };
        continue;
      }
      tableState[table] = { present: true, rows: Number((await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`)).rows[0].count) };
      if (table === "ItemPropostaComercial") {
        const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table])).rows.map((row) => row.column_name);
        tableState[table].hasEmpresaId = columns.includes("empresaId");
        tableState[table].hasItemType = columns.includes("itemType");
        if (columns.includes("empresaId")) tableState[table].nullEmpresaId = Number((await scalar('SELECT COUNT(*)::int AS count FROM "ItemPropostaComercial" WHERE "empresaId" IS NULL')).count || 0);
        if (columns.includes("itemType")) tableState[table].legacyCount = Number((await scalar('SELECT COUNT(*)::int AS count FROM "ItemPropostaComercial" WHERE "itemType" = \'LEGACY_ITEM\'')).count || 0);
      }
    }
    const activeMigrationRunners = Number((await scalar("SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND (query ILIKE '%migrate deploy%' OR query ILIKE '%_prisma_migrations%') AND pid <> pg_backend_pid()")).count || 0);
    const expectedConstraintNames = [
      "ItemPropostaComercial_empresaId_fkey",
      "ItemPropostaComercial_empresaId_propostaId_fkey",
      "ItemPropostaComercial_empresaId_productOfferId_fkey",
      "ItemPropostaComercial_empresaId_catalogProductId_fkey",
      "ItemPropostaComercial_empresaId_stockProductId_fkey",
      "ItemPropostaComercial_currencySnapshot_ck",
      "ItemPropostaComercial_priceStatusSnapshot_ck",
      "ItemPropostaComercial_catalog_contract_ck",
    ];
    const constraints = (await client.query("SELECT conname, contype, confdeltype, convalidated FROM pg_constraint WHERE conname = ANY($1) ORDER BY conname", [expectedConstraintNames])).rows;
    const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1) ORDER BY indexname", [[
      "ItemPropostaComercial_empresaId_id_key",
      "ItemPropostaComercial_empresaId_propostaId_ordem_idx",
      "ItemPropostaComercial_empresaId_productOfferId_idx",
      "ItemPropostaComercial_empresaId_catalogProductId_idx",
      "ItemPropostaComercial_empresaId_stockProductId_idx",
    ]])).rows.map((row) => row.indexname);
    await client.query("ROLLBACK");
    console.log(JSON.stringify({
      status: "passed",
      provider: "postgresql",
      version,
      extensions,
      migrations,
      tableState,
      constraints,
      indexes,
      activeMigrationRunners,
      maintenanceReadOnly: String(process.env.CRM_MAINTENANCE_READ_ONLY || ""),
      workerFlag: String(process.env.AUTOMATION_WORKER_ENABLED || "absent"),
    }, null, 2));
  } finally {
    await client.end();
  }
}

function runSafely() {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "failed", code: error.code || "PRODUCTION_PREFLIGHT_FAILED", message: error.message }));
    process.exitCode = 1;
  });
}

if (process.argv.includes("--stdin-url")) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    process.env.DATABASE_PUBLIC_URL = input.trim();
    runSafely();
  });
} else {
  runSafely();
}
