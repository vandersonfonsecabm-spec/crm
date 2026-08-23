const { Client } = require("pg");

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_SUCCESS_CACHE_MS = 1_000;
const DEFAULT_ERROR_CACHE_MS = 250;

function createDatabaseProbe({
  prisma,
  env = process.env,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  successCacheMs = DEFAULT_SUCCESS_CACHE_MS,
  errorCacheMs = DEFAULT_ERROR_CACHE_MS,
  queryDatabase = queryDatabaseWithServerTimeout,
} = {}) {
  let inFlight = null;
  let cache = null;

  async function probe() {
    const current = now();
    if (cache && cache.expiresAt > current) {
      if (cache.ok) return true;
      throw new Error("READINESS_DATABASE_UNAVAILABLE");
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await queryDatabase({ prisma, env, timeoutMs });
        cache = { ok: true, expiresAt: now() + successCacheMs };
        return true;
      } catch (error) {
        cache = { ok: false, expiresAt: now() + errorCacheMs };
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    probe,
    reset() {
      cache = null;
      inFlight = null;
    },
  };
}

async function queryDatabaseWithServerTimeout({ prisma, env, timeoutMs }) {
  const provider = String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  const connectionString = String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (provider !== "postgresql" || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    await prisma.$queryRaw`SELECT 1`;
    return;
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    query_timeout: timeoutMs,
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query({ text: "SELECT 1", query_timeout: timeoutMs });
  } finally {
    if (connected) {
      await client.end().catch(() => undefined);
    }
  }
}

module.exports = {
  createDatabaseProbe,
  queryDatabaseWithServerTimeout,
};
