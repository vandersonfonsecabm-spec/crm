"use strict";

const { Pool } = require("pg");

const TOP_LIMIT = 20;

const READ_ONLY_SQL = Object.freeze({
  extension: `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed;`,
  top: `SELECT queryid, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT ${TOP_LIMIT};`,
});

function databaseUrlFromEnv(env = process.env) {
  const value = String(env.CRM_PG_STATS_DATABASE_URL || "").trim();
  if (!value) throw new Error("CRM_PG_STATS_DATABASE_URL e obrigatoria para --check.");
  if (!/^postgres(?:ql)?:\/\/[^\s]+$/i.test(value)) throw new Error("CRM_PG_STATS_DATABASE_URL deve usar uma URL PostgreSQL.");
  if (env.CRM_PG_STATS_CONFIRM !== "read-only") {
    throw new Error("CRM_PG_STATS_CONFIRM=read-only e obrigatorio.");
  }
  if (isOfficialDatabaseUrl(value, env)) throw new Error("URL oficial/producao rejeitada pelo check read-only.");
  return value;
}

function isOfficialDatabaseUrl(value, env = process.env) {
  const normalized = String(value || "").trim().toLowerCase();
  for (const key of ["DATABASE_URL", "POSTGRES_DATABASE_URL", "POSTGRES_TARGET_URL", "POSTGRES_URL"]) {
    const candidate = String(env[key] || "").trim().toLowerCase();
    if (candidate && candidate === normalized) return true;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\/+/, "").toLowerCase();
  return ["railway", "railway.internal", "crm-agro", "production", "official"].some((fragment) => host.includes(fragment))
    || /(?:^|[-_])(prod|production|official)(?:$|[-_])/.test(database);
}

function sqlReport() {
  return `${READ_ONLY_SQL.extension}\n\n${READ_ONLY_SQL.top}\n`;
}

function sanitizeError(error) {
  return String(error?.message || error || "unknown")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[REDACTED]")
    .replace(/((?:password|secret|token|authorization|cookie)[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

async function checkDatabase(env = process.env, PoolClass = Pool) {
  const connectionString = databaseUrlFromEnv(env);
  const pool = new PoolClass({ connectionString, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000 });
  try {
    const extension = await pool.query(READ_ONLY_SQL.extension);
    const installed = extension.rows?.[0]?.installed === true;
    if (!installed) return { installed: false, topQueries: [] };
    const result = await pool.query(READ_ONLY_SQL.top);
    return {
      installed: true,
      topQueries: (result.rows || []).map((row) => ({
        queryid: String(row.queryid ?? ""),
        calls: Number(row.calls || 0),
        totalExecMs: Number(row.total_exec_time || 0),
        meanExecMs: Number(row.mean_exec_time || 0),
        rows: Number(row.rows || 0),
      })),
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.includes("--sql")) {
    console.log(sqlReport());
    return { mode: "sql", sql: sqlReport() };
  }
  if (!args.includes("--check") || args.some((arg) => !["--check"].includes(arg))) {
    throw new Error("Uso: node scripts/pg-stat-statements.cjs --sql | --check");
  }
  try {
    const result = await checkDatabase(env);
    console.log(JSON.stringify({ event: "pg_stat_statements_read_only", ...result }));
    return result;
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "pg_stat_statements_read_only", status: "blocked", error: sanitizeError(error) }));
    process.exitCode = 1;
  });
}

module.exports = {
  READ_ONLY_SQL,
  TOP_LIMIT,
  checkDatabase,
  databaseUrlFromEnv,
  isOfficialDatabaseUrl,
  main,
  sanitizeError,
  sqlReport,
};
