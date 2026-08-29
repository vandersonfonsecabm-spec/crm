"use strict";

const { isVerifiedRailwayDisposable, main } = require("./test-postgres-real.cjs");

async function run() {
  const publicUrl = resolveDisposableUrl(process.env);
  const runnerEnv = {
    ...process.env,
    POSTGRES_TEST_DATABASE_URL: publicUrl,
    CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    CRM_DISPOSABLE_URL_CONSTRUCTED: process.env.DATABASE_PUBLIC_URL ? "false" : "true",
  };
  if (!isVerifiedRailwayDisposable(publicUrl, runnerEnv)) {
    throw new Error(`Recurso Railway descartavel nao conferiu: ${JSON.stringify({
      marker: runnerEnv.CRM_DISPOSABLE_TEST_DATABASE === "true",
      run: runnerEnv.CRM_DISPOSABLE_TEST_RUN_ID === runnerEnv.CRM_EXPECTED_DISPOSABLE_RUN_ID,
      project: runnerEnv.RAILWAY_PROJECT_ID === runnerEnv.CRM_EXPECTED_RAILWAY_PROJECT_ID,
      environment: runnerEnv.RAILWAY_ENVIRONMENT_ID === runnerEnv.CRM_EXPECTED_RAILWAY_ENVIRONMENT_ID,
      service: runnerEnv.RAILWAY_SERVICE_ID === runnerEnv.CRM_EXPECTED_RAILWAY_SERVICE_ID,
      proxy: Boolean(runnerEnv.CRM_EXPECTED_TCP_PROXY_HOST && runnerEnv.CRM_EXPECTED_TCP_PROXY_PORT),
    })}`);
  }
  const result = await main({ env: runnerEnv });
  console.log(JSON.stringify({
    event: "railway_disposable_postgres_test",
    status: result.status,
    mode: result.mode,
    suite: result.suite,
    harnessTests: result.harnessTests,
    sourceManifestSha256: result.sourceManifestSha256,
    cleanup: result.cleanup,
    evidence: result.evidence,
  }, null, 2));
}

function resolveDisposableUrl(env) {
  const published = String(env.DATABASE_PUBLIC_URL || "").trim();
  if (/^postgres(?:ql)?:\/\//i.test(published)) return published;
  const host = String(env.CRM_EXPECTED_TCP_PROXY_HOST || "").trim();
  const port = String(env.CRM_EXPECTED_TCP_PROXY_PORT || "").trim();
  const user = String(env.PGUSER || "").trim();
  const password = String(env.PGPASSWORD || "");
  const database = String(env.PGDATABASE || "").trim();
  if (!/^[A-Za-z0-9.-]+$/.test(host) || !/^\d{1,5}$/.test(port) || !user || !password || !database) {
    throw new Error("Variaveis do PostgreSQL descartavel ou proxy exato nao estao disponiveis.");
  }
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(JSON.stringify({ event: "railway_disposable_postgres_test", safe: false, code: "RAILWAY_DISPOSABLE_POSTGRES_TEST_FAILED", message: String(error?.message || "Falha no PostgreSQL descartavel.") }));
    process.exitCode = 1;
  });
}

module.exports = { resolveDisposableUrl, run };
