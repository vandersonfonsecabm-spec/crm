"use strict";

const { Client } = require("pg");
const { resolveDisposableUrl } = require("./run-railway-disposable-postgres-test.cjs");
const {
  externalDatabaseUrlFromEnv,
  isVerifiedRailwayDisposable,
  verifyRailwayDisposableAuthority,
} = require("./test-postgres-real.cjs");

async function main(env = process.env) {
  const expectedRun = String(env.CRM_EXPECTED_DISPOSABLE_RUN_ID || "").trim();
  if (!expectedRun || env.CRM_DISPOSABLE_RESET_CONFIRM !== expectedRun) {
    throw new Error("Confirmacao exata do reset descartavel ausente.");
  }
  const value = resolveDisposableUrl(env);
  const runnerEnv = {
    ...env,
    POSTGRES_TEST_DATABASE_URL: value,
    CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    CRM_DISPOSABLE_URL_CONSTRUCTED: env.DATABASE_PUBLIC_URL ? "false" : "true",
  };
  externalDatabaseUrlFromEnv(runnerEnv);
  if (!isVerifiedRailwayDisposable(value, runnerEnv) || !verifyRailwayDisposableAuthority(runnerEnv)) {
    throw new Error("A autoridade externa nao confirmou o PostgreSQL descartavel.");
  }
  const client = new Client({ connectionString: value, statement_timeout: 30000 });
  await client.connect();
  try {
    const before = Number((await client.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname = current_schema()" )).rows[0].count);
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;");
    const after = Number((await client.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname = current_schema()" )).rows[0].count);
    if (after !== 0) throw new Error("O schema descartavel nao ficou vazio.");
    return { event: "railway_disposable_postgres_reset", safe: true, previousTableCount: before, tableCount: after };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(JSON.stringify({ event: "railway_disposable_postgres_reset", safe: false, message: String(error?.message || "Reset descartavel falhou.") }));
      process.exitCode = 1;
    });
}

module.exports = { main };
