const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  canonicalPostgresMigrateAttestationPayload,
  cleanupPostgresTestWorkspace,
  createPostgresTestWorkspace,
  sanitize,
  signPostgresMigrateAttestation,
} = require("./postgres-prisma.cjs");
const { databaseTargetFingerprint } = require("./prisma-runtime.cjs");
const { createPrismaFailure, sanitizeFailure: sanitizeVerifierFailure } = require("./tenant-isolation-log-utils.cjs");

const backendDir = path.resolve(__dirname, "..");

function main(options = {}) {
  const runCommand = options.runCommand || run;
  const createWorkspace = options.createWorkspace || createPostgresTestWorkspace;
  const cleanupWorkspace = options.cleanupWorkspace || cleanupPostgresTestWorkspace;
  const envSource = options.env || process.env;
  const databaseUrl = String(envSource.POSTGRES_TEST_DATABASE_URL || "").trim();
  const focus = String(envSource.CRM_POSTGRES_FOCUS || "").trim();
  const boundaryFocus = focus === "tenant-isolation-pending-migrations-postgres";
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
  let workspace = null;
  let originalError = null;
  let cleanupError = null;
  try {
    workspace = createWorkspace();
    const prismaArgs = (command) => ["scripts/postgres-prisma.cjs", command, "--test-workspace", workspace.root];
    const testEnv = { ...env, NODE_OPTIONS: appendNodeRequire(env.NODE_OPTIONS, workspace.clientLoaderPath) };
    runCommand("node", prismaArgs("validate"), env);
    runCommand("node", prismaArgs("generate"), env);
    if (!focus || boundaryFocus) {
      runCommand("node", ["--test", "tests/tenant-isolation-pending-migrations-postgres.test.js"], testEnv);
    }
    if (boundaryFocus) return;
    runCommand("node", prismaArgs("migrate-empty"), postgresMigrateEmptyAuthorityEnv(testEnv, databaseUrl));
    const testFiles = [
      "tests/postgres-migration-prep.test.js",
      "tests/auth-admin-concurrency-postgres.test.js",
      "tests/internal-automations-h7.test.js",
      "tests/next-follow-up-projection.test.js",
      "tests/v54-lifecycle-lock.test.js",
      "tests/email-inbound-lifecycle.test.js",
      "tests/email-inbound-processing.test.js",
      "tests/bling-distributed-coordination-postgres.test.js",
      "tests/commercial-proposal-catalog-v1-postgres.test.js",
      "tests/canonical-sale-v1-postgres.test.js",
      "tests/qa-prod-bootstrap-postgres.test.js",
    ];
    const focusedFile = focus
      ? testFiles.find((file) => file === `tests/${focus}.test.js`)
      : null;
    if (focus && !focusedFile) throw new Error("CRM_POSTGRES_FOCUS nao pertence a suite PostgreSQL canonica.");
    for (const file of focusedFile ? [focusedFile] : testFiles) {
      runCommand("node", ["--test", file], testEnv);
    }
  } catch (error) {
    originalError = error;
  } finally {
    if (workspace) {
      try {
        cleanupWorkspace(workspace.root);
      } catch (error) {
        cleanupError = error;
      }
    }
  }
  if (cleanupError) {
    if (!originalError) throw cleanupError;
    const message = sanitize(cleanupError.stack || cleanupError.message);
    console.error(`[postgres-tests] Falha ao limpar workspace PostgreSQL apos erro original: ${message}`);
  }
  if (originalError) {
    throw originalError;
  }
}

function postgresMigrateEmptyAuthorityEnv(env, databaseUrl) {
  const targetFingerprint = databaseTargetFingerprint(databaseUrl);
  const hmacKey = crypto.randomBytes(32).toString("hex");
  const runId = `postgres-test-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const signed = {
    ...env,
    CRM_POSTGRES_MIGRATE_ATTESTATION_HMAC_KEY: hmacKey,
    CRM_POSTGRES_MIGRATE_CONFIRM: "apply-empty-postgres",
    CRM_POSTGRES_MIGRATE_RUN_ID: runId,
    CRM_POSTGRES_MIGRATE_TARGET: "isolated",
    CRM_POSTGRES_MIGRATE_TARGET_FINGERPRINT: targetFingerprint,
  };
  return {
    ...signed,
    CRM_POSTGRES_MIGRATE_ATTESTATION: signPostgresMigrateAttestation(
      hmacKey,
      canonicalPostgresMigrateAttestationPayload({
        runId,
        target: signed.CRM_POSTGRES_MIGRATE_TARGET,
        targetFingerprint,
      }),
    ),
  };
}

function appendNodeRequire(nodeOptions, loaderPath) {
  const normalizedPath = path.resolve(loaderPath).replace(/\\/g, "/");
  const escapedPath = /\s/.test(normalizedPath) ? `"${normalizedPath.replace(/"/g, '\\"')}"` : normalizedPath;
  return [String(nodeOptions || "").trim(), `--require=${escapedPath}`].filter(Boolean).join(" ");
}

function run(command, args, env) {
  const capturePrisma = args.some((arg) => /[\\/]prisma[\\/]/i.test(String(arg)));
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env,
    stdio: capturePrisma ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: capturePrisma ? "utf8" : undefined,
    shell: false,
    windowsHide: true,
  });
  if (result.error) {
    if (capturePrisma) throw createPrismaFailure("postgres-tests", result.error.message);
    throw result.error;
  }
  if (result.status !== 0) {
    if (capturePrisma) throw createPrismaFailure("postgres-tests", `${result.stderr || ""}\n${result.stdout || ""}`);
    throw new Error(`${command} ${args.join(" ")} falhou com codigo ${result.status}.`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ event: "postgres_tests", safe: false, error: sanitizeVerifierFailure(error, "postgres-tests") }));
    process.exitCode = 1;
  }
}

module.exports = { appendNodeRequire, main, postgresMigrateEmptyAuthorityEnv };
