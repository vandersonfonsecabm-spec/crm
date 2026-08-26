const { execFileSync } = require("node:child_process");
const { Client } = require("pg");

const cliArgs = process.argv.slice(2);
const summaryMode = cliArgs.includes("--summary");
const credentialServiceFlag = cliArgs.indexOf("--credential-service");
const credentialServiceId = credentialServiceFlag >= 0 ? cliArgs[credentialServiceFlag + 1] : null;
const positionalArgs = cliArgs.filter((arg, index) => arg !== "--summary" && !(credentialServiceFlag >= 0 && (index === credentialServiceFlag || index === credentialServiceFlag + 1)));
const [projectId, environmentId, serviceId, serviceName = serviceId] = positionalArgs;
if (!projectId || !environmentId || !serviceId) {
  console.error(JSON.stringify({ status: "failed", code: "PROJECT_ENVIRONMENT_SERVICE_REQUIRED" }));
  process.exit(1);
}

function readVariables(targetServiceId) {
  const raw = execFileSync("cmd.exe", ["/c", `railway variable list --project ${projectId} --environment ${environmentId} --service ${targetServiceId} --json`], { encoding: "utf8", windowsHide: true });
  const data = JSON.parse(raw);
  const values = Array.isArray(data) ? data : (data.variables || data);
  const entries = Array.isArray(values)
    ? values.map((item) => [item.name || item.key, String(item.value ?? "")])
    : Object.entries(values).map(([name, value]) => [name, String(value ?? "")]);
  return Object.fromEntries(entries);
}

function pickConnectionString(variables, credentialVariables = null) {
  const targetValue = variables.DATABASE_PUBLIC_URL || variables.DATABASE_URL || variables.POSTGRES_DATABASE_URL || "";
  if (!credentialVariables || !variables.DATABASE_PUBLIC_URL) return { value: targetValue, source: variables.DATABASE_PUBLIC_URL ? "DATABASE_PUBLIC_URL" : variables.DATABASE_URL ? "DATABASE_URL" : "POSTGRES_DATABASE_URL" };
  const credentialValue = credentialVariables.POSTGRES_DATABASE_URL || credentialVariables.DATABASE_URL || "";
  try {
    const target = new URL(targetValue);
    const credential = new URL(credentialValue);
    target.username = credential.username;
    target.password = credential.password;
    return { value: target.toString(), source: "DATABASE_PUBLIC_URL+credential_service" };
  } catch {
    return { value: targetValue, source: "DATABASE_PUBLIC_URL" };
  }
}

function sanitizedApplicationNames(rows) {
  return [...new Set(rows.map((row) => String(row.application_name || "").trim() || "[empty]").map((value) => value.slice(0, 64)))].sort();
}

async function main() {
  const variables = readVariables(serviceId);
  const credentialVariables = credentialServiceId ? readVariables(credentialServiceId) : null;
  const connection = pickConnectionString(variables, credentialVariables);
  const connectionString = connection.value;
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) throw new Error("POSTGRES_CONNECTION_NOT_FOUND");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 7000,
    statement_timeout: 5000,
    query_timeout: 7000,
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const scalar = async (text, values = []) => (await client.query(text, values)).rows[0] || {};
    const version = await scalar("SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name, current_setting('server_version') AS server_version, current_setting('TimeZone') AS timezone, pg_database_size(current_database())::bigint AS database_bytes, pg_postmaster_start_time() AS server_started_at");
    const schemas = (await client.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname")).rows.map((row) => row.nspname);
    const tables = (await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name")).rows;
    const migrationTable = (await scalar("SELECT to_regclass('public._prisma_migrations') AS table_name")).table_name;
    let migrations = { tablePresent: Boolean(migrationTable), appliedCount: null, failedCount: null, names: [] };
    if (migrationTable) {
      migrations.appliedCount = Number((await scalar('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).count || 0);
      migrations.failedCount = Number((await scalar('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE rolled_back_at IS NOT NULL OR (finished_at IS NULL AND started_at IS NOT NULL)')).count || 0);
      migrations.names = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')).rows;
    }
    const activityRows = (await client.query("SELECT application_name, state FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")).rows;
    const tableStats = await scalar("SELECT MAX(last_analyze) AS last_analyze, MAX(last_autoanalyze) AS last_autoanalyze FROM pg_stat_all_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')");
    const tableRowEstimates = (await client.query("SELECT relname AS table_name, n_live_tup::bigint AS estimated_rows, pg_total_relation_size(relid)::bigint AS relation_bytes, last_analyze, last_autoanalyze FROM pg_stat_user_tables ORDER BY relname")).rows;
    const keyTableNames = ["Empresa", "Usuario", "Cliente", "Lead", "Negocio", "PropostaComercial", "ItemPropostaComercial", "ProductOffer", "CommercialCatalogProduct", "MensagemCanal", "ConversaCanal", "Integracao", "MetaCredential", "Acompanhamento", "MovimentacaoEstoque", "Produto", "ProdutoEstoque", "LoteEstoque"];
    const existingTables = new Set(tables.filter((table) => table.table_schema === "public").map((table) => table.table_name));
    const keyTableCounts = {};
    const recentTimestamps = {};
    for (const table of keyTableNames.filter((name) => existingTables.has(name))) {
      keyTableCounts[table] = Number((await scalar(`SELECT COUNT(*)::bigint AS count FROM "${table}"`)).count || 0);
      const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table])).rows.map((row) => row.column_name);
      const temporalColumns = ["createdAt", "updatedAt", "created_at", "updated_at", "startedAt", "finishedAt"].filter((column) => columns.includes(column));
      if (temporalColumns.length) {
        recentTimestamps[table] = {};
        for (const column of temporalColumns) recentTimestamps[table][column] = (await scalar(`SELECT MAX("${column}") AS value FROM "${table}"`)).value || null;
      }
    }
    const extensionRows = (await client.query("SELECT extname FROM pg_extension WHERE extname IN ('pg_stat_statements') ORDER BY extname")).rows.map((row) => row.extname);
    await client.query("ROLLBACK");
    const payload = {
      status: "passed",
      projectId,
      environmentId,
      serviceId,
      serviceName,
      provider: "postgresql",
      version,
      schemas,
      tableCount: tables.length,
      tables,
      migrations,
      activity: {
        connections: activityRows.length,
        nonIdle: activityRows.filter((row) => row.state && row.state !== "idle").length,
        applicationNames: sanitizedApplicationNames(activityRows),
        states: Object.fromEntries([...new Set(activityRows.map((row) => row.state || "unknown"))].sort().map((state) => [state, activityRows.filter((row) => (row.state || "unknown") === state).length])),
      },
      tableStats,
      tableRowEstimates,
      keyTableCounts,
      recentTimestamps,
      extensions: extensionRows,
      connectionSource: connection.source,
    };
    if (summaryMode) {
      delete payload.tables;
      delete payload.tableRowEstimates;
    }
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", code: error.code || "POSTGRES_READONLY_INSPECTION_FAILED", message: error.message }));
  process.exitCode = 1;
});
