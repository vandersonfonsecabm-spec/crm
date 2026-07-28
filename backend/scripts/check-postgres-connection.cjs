function postgresUrlFromEnv(env = process.env) {
  const value = String(env.POSTGRES_TARGET_URL || env.POSTGRES_TEST_DATABASE_URL || env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("Informe uma URL PostgreSQL por POSTGRES_TARGET_URL, POSTGRES_TEST_DATABASE_URL, POSTGRES_DATABASE_URL ou DATABASE_URL.");
  return value;
}

async function checkPostgresConnection(env = process.env) {
  let Client;
  try {
    ({ Client } = require("pg"));
  } catch (error) {
    throw new Error("Dependencia pg nao encontrada.");
  }
  const client = new Client({ connectionString: postgresUrlFromEnv(env) });
  await client.connect();
  try {
    const result = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name, 1 AS ok");
    return {
      ok: result.rows[0]?.ok === 1,
      database: result.rows[0]?.database_name,
      schema: result.rows[0]?.schema_name,
    };
  } finally {
    await client.end();
  }
}

function sanitize(error) {
  return String(error?.stack || error?.message || error)
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")
    .slice(0, 2000);
}

if (require.main === module) {
  checkPostgresConnection()
    .then((result) => console.log(JSON.stringify({ event: "postgres_connection_ok", ...result })))
    .catch((error) => {
      console.error(`[postgres-check] ${sanitize(error)}`);
      process.exitCode = 1;
    });
}

module.exports = { checkPostgresConnection, postgresUrlFromEnv, sanitize };
