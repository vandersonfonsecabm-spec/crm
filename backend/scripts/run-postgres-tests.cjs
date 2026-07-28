const { spawnSync } = require("node:child_process");
const path = require("node:path");

const backendDir = path.resolve(__dirname, "..");

function main() {
  const databaseUrl = String(process.env.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    console.error("[postgres-tests] POSTGRES_TEST_DATABASE_URL ausente; testes PostgreSQL reais nao foram executados.");
    process.exitCode = 2;
    return;
  }
  const env = {
    ...process.env,
    NODE_ENV: "test",
    CRM_TEST_DATABASE_PROVIDER: "postgresql",
    CRM_TEST_POSTGRES_ALLOW: "true",
    CRM_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    AUTOMATION_WORKER_ENABLED: "false",
  };
  run("node", ["scripts/postgres-prisma.cjs", "validate"], env);
  run("node", ["scripts/postgres-prisma.cjs", "generate"], env);
  run("node", ["scripts/postgres-prisma.cjs", "migrate-empty"], {
    ...env,
    CRM_POSTGRES_MIGRATE_CONFIRM: "apply-empty-postgres",
  });
  for (const file of [
    "tests/postgres-migration-prep.test.js",
    "tests/internal-automations-h7.test.js",
    "tests/automation-pilot-endpoint-h8-2.test.js",
  ]) {
    run("node", ["--test", file], env);
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} falhou com codigo ${result.status}.`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[postgres-tests] ${String(error.stack || error.message).replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")}`);
  process.exitCode = 1;
}
