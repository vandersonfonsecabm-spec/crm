const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { resolvePrismaCli, sanitize } = require("./postgres-prisma.cjs");

const backendDir = path.resolve(__dirname, "..");

function main(options = {}) {
  const runCommand = options.runCommand || run;
  const restoreCommand = options.restoreCommand || restoreSqlitePrismaClient;
  const envSource = options.env || process.env;
  const databaseUrl = String(envSource.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    console.error("[postgres-tests] POSTGRES_TEST_DATABASE_URL ausente; testes PostgreSQL reais nao foram executados.");
    process.exitCode = 2;
    return;
  }
  const env = {
    ...envSource,
    NODE_ENV: "test",
    CRM_TEST_DATABASE_PROVIDER: "postgresql",
    CRM_TEST_POSTGRES_ALLOW: "true",
    CRM_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    AUTOMATION_WORKER_ENABLED: "false",
  };
  let originalError = null;
  try {
    runCommand("node", ["scripts/postgres-prisma.cjs", "validate"], env);
    runCommand("node", ["scripts/postgres-prisma.cjs", "generate"], env);
    runCommand("node", ["scripts/postgres-prisma.cjs", "migrate-empty"], {
      ...env,
      CRM_POSTGRES_MIGRATE_CONFIRM: "apply-empty-postgres",
    });
    for (const file of [
      "tests/postgres-migration-prep.test.js",
      "tests/internal-automations-h7.test.js",
      "tests/next-follow-up-projection.test.js",
    ]) {
      runCommand("node", ["--test", file], env);
    }
  } catch (error) {
    originalError = error;
  } finally {
    try {
      restoreCommand({ env: envSource, runCommand });
    } catch (restoreError) {
      const message = sanitize(restoreError.stack || restoreError.message);
      if (!originalError) {
        throw restoreError;
      }
      console.error(`[postgres-tests] Falha ao restaurar Prisma Client SQLite apos erro original: ${message}`);
    }
  }
  if (originalError) {
    throw originalError;
  }
}

function restoreSqlitePrismaClient({ env = process.env, runCommand = run } = {}) {
  runCommand(process.execPath, [resolvePrismaCli(), "generate", "--schema", "prisma/schema.prisma"], {
    ...env,
    DATABASE_URL: "file:./prisma/dev.db",
    CRM_TEST_DATABASE_PROVIDER: "",
    CRM_TEST_DATABASE_URL: "",
    CRM_TEST_POSTGRES_ALLOW: "",
  });
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

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[postgres-tests] ${sanitize(error.stack || error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = { main, restoreSqlitePrismaClient };
