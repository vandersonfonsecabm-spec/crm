const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_BATCH_SIZE = 500;
const SENSITIVE_COLUMN_PATTERN = /(senha|password|token|secret|authorization|cookie|hash)/i;

function sqlitePathFromEnv(env = process.env) {
  const direct = String(env.SQLITE_SOURCE_PATH || "").trim();
  if (direct) return path.resolve(direct);
  const url = String(env.SQLITE_SOURCE_URL || "").trim();
  if (!url.startsWith("file:")) throw new Error("Informe SQLITE_SOURCE_PATH ou SQLITE_SOURCE_URL=file:.");
  return path.resolve(decodeURIComponent(url.slice("file:".length).split("?")[0]));
}

function postgresUrlFromEnv(env = process.env) {
  const value = String(env.POSTGRES_TARGET_URL || env.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("Informe POSTGRES_TARGET_URL ou POSTGRES_TEST_DATABASE_URL.");
  return value;
}

function assertApplyConfirmation(env = process.env) {
  if (env.CRM_POSTGRES_IMPORT_CONFIRM !== "copy-sqlite-to-postgres") {
    throw new Error("CRM_POSTGRES_IMPORT_CONFIRM=copy-sqlite-to-postgres e obrigatorio para gravar no PostgreSQL.");
  }
}

function openSqliteReadOnly(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error("Arquivo SQLite de origem nao encontrado.");
  return new DatabaseSync(filePath, { readOnly: true });
}

function listSqliteTables(sqlite) {
  return sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != '_prisma_migrations'
    ORDER BY name
  `).all().map((row) => row.name);
}

function tableColumns(sqlite, table) {
  return sqlite.prepare(`PRAGMA table_info("${escapeIdentifier(table)}")`).all().map((row) => row.name);
}

function foreignKeyParents(sqlite, table) {
  return sqlite.prepare(`PRAGMA foreign_key_list("${escapeIdentifier(table)}")`).all().map((row) => row.table);
}

function orderedTables(sqlite) {
  const tables = listSqliteTables(sqlite);
  const tableSet = new Set(tables);
  const parents = new Map(tables.map((table) => [table, foreignKeyParents(sqlite, table).filter((parent) => tableSet.has(parent))]));
  const output = [];
  const temporary = new Set();
  const permanent = new Set();
  for (const table of tables) visit(table);
  return output;

  function visit(table) {
    if (permanent.has(table)) return;
    if (temporary.has(table)) return;
    temporary.add(table);
    for (const parent of parents.get(table) || []) visit(parent);
    temporary.delete(table);
    permanent.add(table);
    output.push(table);
  }
}

async function readPostgresColumnTypes(pgClient, table) {
  const result = await pgClient.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

function convertValue(value, columnType) {
  if (value === null || value === undefined) return null;
  const type = String(columnType?.data_type || "").toLowerCase();
  const udt = String(columnType?.udt_name || "").toLowerCase();
  if (type === "boolean" || udt === "bool") return value === true || value === 1 || value === "1";
  if (type.includes("timestamp") || type === "date") {
    if (value instanceof Date) return value;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() !== "") return new Date(numeric);
    return new Date(String(value));
  }
  return value;
}

async function copyTable({ sqlite, pgClient, table, batchSize = DEFAULT_BATCH_SIZE, dryRun = false }) {
  const columns = tableColumns(sqlite, table);
  const count = Number(sqlite.prepare(`SELECT COUNT(*) AS total FROM "${escapeIdentifier(table)}"`).get().total || 0);
  if (dryRun || count === 0) return { table, source: count, inserted: 0, dryRun };

  const pgTypes = await readPostgresColumnTypes(pgClient, table);
  const missing = columns.filter((column) => !pgTypes.has(column));
  if (missing.length) throw new Error(`Colunas ausentes no destino para ${table}: ${missing.join(", ")}`);

  let inserted = 0;
  const select = sqlite.prepare(`SELECT ${columns.map((column) => `"${escapeIdentifier(column)}"`).join(", ")} FROM "${escapeIdentifier(table)}" ORDER BY rowid LIMIT ? OFFSET ?`);
  for (let offset = 0; offset < count; offset += batchSize) {
    const rows = select.all(batchSize, offset);
    if (!rows.length) break;
    const values = [];
    const placeholders = rows.map((row, rowIndex) => {
      const rowValues = columns.map((column) => convertValue(row[column], pgTypes.get(column)));
      values.push(...rowValues);
      const start = rowIndex * columns.length;
      return `(${columns.map((_, index) => `$${start + index + 1}`).join(", ")})`;
    });
    const sql = [
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")})`,
      `VALUES ${placeholders.join(", ")}`,
      "ON CONFLICT DO NOTHING",
    ].join(" ");
    const result = await pgClient.query(sql, values);
    inserted += result.rowCount || 0;
  }
  return { table, source: count, inserted, dryRun };
}

async function validateCounts({ sqlite, pgClient, tables }) {
  const mismatches = [];
  for (const table of tables) {
    const source = Number(sqlite.prepare(`SELECT COUNT(*) AS total FROM "${escapeIdentifier(table)}"`).get().total || 0);
    const target = Number((await pgClient.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)}`)).rows[0]?.total || 0);
    if (source !== target) mismatches.push({ table, source, target });
  }
  return mismatches;
}

async function resetSequences(pgClient, tables) {
  for (const table of tables) {
    const columns = await pgClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = 'id'
    `, [table]);
    if (columns.rowCount !== 1) continue;
    const sequence = await pgClient.query("SELECT pg_get_serial_sequence($1, 'id') AS seq", [quoteIdentifier(table)]);
    const seq = sequence.rows[0]?.seq;
    if (!seq) continue;
    await pgClient.query(`SELECT setval($1::regclass, GREATEST((SELECT COALESCE(MAX("id"), 0) FROM ${quoteIdentifier(table)}), 1), true)`, [seq]);
  }
}

function safeSummary(rows) {
  return rows.map((row) => ({
    table: row.table,
    source: row.source,
    inserted: row.inserted,
    dryRun: row.dryRun,
  }));
}

function escapeIdentifier(value) {
  return String(value).replace(/"/g, '""');
}

function quoteIdentifier(value) {
  return `"${escapeIdentifier(value)}"`;
}

function sanitizeError(error) {
  return String(error?.stack || error?.message || error)
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")
    .replace(/file:[^\s"'`]+/gi, "file:***")
    .replace(SENSITIVE_COLUMN_PATTERN, "[redacted]")
    .slice(0, 2000);
}

async function runMigration(env = process.env) {
  const mode = String(env.POSTGRES_IMPORT_MODE || "dry-run").trim().toLowerCase();
  if (!["dry-run", "apply", "validate"].includes(mode)) throw new Error("POSTGRES_IMPORT_MODE deve ser dry-run, apply ou validate.");
  if (mode === "apply") assertApplyConfirmation(env);
  const sqlitePath = sqlitePathFromEnv(env);
  const sqlite = openSqliteReadOnly(sqlitePath);
  let Client;
  try {
    ({ Client } = require("pg"));
  } catch (error) {
    sqlite.close();
    throw new Error("Dependencia pg nao encontrada. Execute npm install no backend antes do import.");
  }
  const pgClient = new Client({ connectionString: postgresUrlFromEnv(env) });
  await pgClient.connect();
  try {
    const tables = orderedTables(sqlite);
    if (mode === "validate") {
      const mismatches = await validateCounts({ sqlite, pgClient, tables });
      return { mode, tables: tables.length, mismatches };
    }
    const dryRun = mode === "dry-run";
    const batchSize = boundedInteger(env.POSTGRES_IMPORT_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 5000);
    const copied = [];
    await pgClient.query("BEGIN");
    try {
      for (const table of tables) copied.push(await copyTable({ sqlite, pgClient, table, batchSize, dryRun }));
      if (!dryRun) await resetSequences(pgClient, tables);
      if (dryRun) await pgClient.query("ROLLBACK");
      else await pgClient.query("COMMIT");
    } catch (error) {
      await pgClient.query("ROLLBACK");
      throw error;
    }
    const mismatches = dryRun ? [] : await validateCounts({ sqlite, pgClient, tables });
    if (mismatches.length) throw new Error(`Divergencia de contagem: ${JSON.stringify(mismatches)}`);
    return { mode, tables: tables.length, copied: safeSummary(copied), mismatches };
  } finally {
    sqlite.close();
    await pgClient.end();
  }
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

if (require.main === module) {
  runMigration()
    .then((result) => {
      console.log(JSON.stringify({ event: "postgres_import_finished", ...result }, null, 2));
    })
    .catch((error) => {
      console.error(`[postgres-import] ${sanitizeError(error)}`);
      process.exitCode = 1;
    });
}

module.exports = {
  convertValue,
  orderedTables,
  sanitizeError,
  sqlitePathFromEnv,
  validateCounts,
};
