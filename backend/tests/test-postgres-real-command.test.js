"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  defaultImage,
  externalDatabaseUrlFromEnv,
  imageFromEnv,
  main,
  parseArguments,
  safeRunId,
  sanitizeLogText,
  verifyRailwayDisposableAuthority,
} = require("../scripts/test-postgres-real.cjs");

function cleanupEvidence(result) {
  const evidenceDir = path.resolve(os.tmpdir(), "crm-postgres-real");
  for (const key of ["logPath", "manifestPath"]) {
    const target = result?.evidence?.[key];
    if (target && path.resolve(target).startsWith(`${evidenceDir}${path.sep}`)) fs.rmSync(target, { force: true });
  }
}

test("runner PostgreSQL real oferece dry-run sem consultar Docker", async () => {
  let dockerCalls = 0;
  const result = await main({
    args: ["--dry-run"],
    env: {},
    runDocker: () => {
      dockerCalls += 1;
      throw new Error("Docker nao deveria ser consultado em dry-run.");
    },
  });
  assert.equal(result.status, "dry-run");
  assert.equal(result.image, defaultImage);
  assert.equal(result.mode, "container");
  assert.equal(dockerCalls, 0);
  assert.equal(result.harnessTests, 24);
  assert.match(result.sourceManifestSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.suite.length >= 7);
  for (const required of [
    "tests/v54-lifecycle-lock.test.js",
    "tests/email-inbound-lifecycle.test.js",
    "tests/email-inbound-processing.test.js",
    "tests/canonical-sale-v1-postgres.test.js",
  ]) assert.equal(result.suite.includes(required), true, `${required} deve permanecer no runner real`);
});

test("runner PostgreSQL real sobe, aguarda healthcheck e remove container e volume", async () => {
  const calls = [];
  let seenUrl = null;
  const result = await main({
    runId: "command-test-success",
    env: {},
    runDocker(args) {
      calls.push(args);
      if (args[0] === "version") return { status: 0, stdout: "26.1\n", stderr: "" };
      if (args[0] === "run") return { status: 0, stdout: "container-id\n", stderr: "" };
      if (args[0] === "inspect") return { status: 0, stdout: "healthy\n", stderr: "" };
      if (args[0] === "port") return { status: 0, stdout: "127.0.0.1:55432\n", stderr: "" };
      if (args[0] === "logs") return { status: 0, stdout: "server ready\n", stderr: "" };
      if (args[0] === "rm" || args[0] === "volume") return { status: 0, stdout: "removed\n", stderr: "" };
      throw new Error(`Comando inesperado: ${args[0]}`);
    },
    runSuite(url) {
      seenUrl = url;
      return { status: 0, stdout: "suite ok\n", stderr: "" };
    },
    sleep: async () => {},
  });
  try {
    assert.equal(result.status, "passed");
    assert.match(seenUrl, /^postgresql:\/\/crm_test:[^@]+@127\.0\.0\.1:55432\/crm_test$/);
    assert.ok(calls.some((args) => args[0] === "run" && args.includes("--publish") && args.includes("127.0.0.1::5432")));
    assert.ok(calls.some((args) => args[0] === "rm" && args.includes("--volumes")));
    assert.ok(calls.some((args) => args[0] === "volume" && args.includes("--force")));
    assert.equal(result.cleanup, "attempted");
    assert.match(result.evidence.logsSha256, /^[a-f0-9]{64}$/);
  } finally {
    cleanupEvidence(result);
  }
});

test("runner PostgreSQL real falha fechado sem Docker e ainda gera evidencia sanitizada", async () => {
  let suiteCalls = 0;
  await assert.rejects(
    main({
      runId: "command-test-no-docker",
      env: {},
      runDocker: () => ({ status: 1, stdout: "", stderr: "permission denied" }),
      runSuite: () => {
        suiteCalls += 1;
        return { status: 0 };
      },
    }),
    (error) => {
      assert.equal(error.safeDetails.code, "POSTGRES_REAL_TEST_FAILED");
      assert.ok(error.safeDetails.evidence.logPath);
      cleanupEvidence(error.safeDetails);
      return true;
    },
  );
  assert.equal(suiteCalls, 0);
});

test("runner PostgreSQL real remove recursos quando a suite falha", async () => {
  const cleanup = [];
  await assert.rejects(
    main({
      runId: "command-test-suite-failure",
      env: {},
      runDocker(args) {
        if (args[0] === "version") return { status: 0, stdout: "26.1\n", stderr: "" };
        if (args[0] === "run") return { status: 0, stdout: "container-id\n", stderr: "" };
        if (args[0] === "inspect") return { status: 0, stdout: "healthy\n", stderr: "" };
        if (args[0] === "port") return { status: 0, stdout: "127.0.0.1:55433\n", stderr: "" };
        if (args[0] === "logs") return { status: 0, stdout: "password=secret-value\n", stderr: "" };
        if (args[0] === "rm" || args[0] === "volume") {
          cleanup.push(args[0]);
          return { status: 0, stdout: "removed\n", stderr: "" };
        }
        throw new Error(`Comando inesperado: ${args[0]}`);
      },
      runSuite: () => ({ status: 1, stdout: "suite failed\n", stderr: "" }),
      sleep: async () => {},
    }),
    (error) => {
      cleanupEvidence(error.safeDetails);
      return true;
    },
  );
  assert.deepEqual(cleanup, ["rm", "volume"]);
});

test("runner PostgreSQL real nao reporta sucesso quando a limpeza falha", async () => {
  await assert.rejects(
    main({
      runId: "command-test-cleanup-failure",
      env: {},
      runDocker(args) {
        if (args[0] === "version") return { status: 0, stdout: "26.1\n", stderr: "" };
        if (args[0] === "run") return { status: 0, stdout: "container-id\n", stderr: "" };
        if (args[0] === "inspect") return { status: 0, stdout: "healthy\n", stderr: "" };
        if (args[0] === "port") return { status: 0, stdout: "127.0.0.1:55435\n", stderr: "" };
        if (args[0] === "logs") return { status: 0, stdout: "", stderr: "" };
        if (args[0] === "rm") return { status: 1, stdout: "", stderr: "cannot remove" };
        if (args[0] === "volume") return { status: 1, stdout: "", stderr: "cannot remove" };
        throw new Error(`Comando inesperado: ${args[0]}`);
      },
      runSuite: () => ({ status: 0, stdout: "suite ok\n", stderr: "" }),
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /limpeza/i);
      cleanupEvidence(error.safeDetails);
      return true;
    },
  );
});

test("runner PostgreSQL real exige confirmacao para URL externa e rejeita oficial", () => {
  assert.throws(
    () => externalDatabaseUrlFromEnv({ POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/crm_test" }),
    /disposable-external/,
  );
  assert.throws(
    () => externalDatabaseUrlFromEnv({
      POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@db.railway.app:5432/crm_test",
      CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    }),
    /oficial|producao/i,
  );
  assert.throws(
    () => externalDatabaseUrlFromEnv({
      POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@db-production.internal:5432/crm_test",
      CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    }),
    /oficial|producao/i,
  );
});

test("runner PostgreSQL real usa URL externa somente com confirmacao e sem Docker", async () => {
  let dockerCalls = 0;
  let suiteUrl = null;
  const result = await main({
    runId: "command-test-external",
    env: {
      POSTGRES_TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55434/crm_test",
      CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    },
    runDocker: () => {
      dockerCalls += 1;
      throw new Error("Docker nao deveria ser usado para URL externa confirmada.");
    },
    runSuite: (url) => {
      suiteUrl = url;
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  try {
    assert.equal(result.status, "passed");
    assert.equal(result.mode, "external");
    assert.equal(suiteUrl, "postgresql://user:pass@127.0.0.1:55434/crm_test");
    assert.equal(dockerCalls, 0);
    assert.equal(result.cleanup, "not-required");
  } finally {
    cleanupEvidence(result);
  }
});

test("runner aceita Railway somente com recurso descartavel e IDs exatos", () => {
  const url = "postgresql://user:pass@roundhouse.proxy.rlwy.net:5432/railway";
  const env = {
    POSTGRES_TEST_DATABASE_URL: url,
    DATABASE_PUBLIC_URL: url,
    CRM_POSTGRES_REAL_CONFIRM: "disposable-external",
    CRM_DISPOSABLE_TEST_DATABASE: "true",
    CRM_DISPOSABLE_TEST_RUN_ID: "canonical-sale-test-run",
    CRM_EXPECTED_DISPOSABLE_RUN_ID: "canonical-sale-test-run",
    CRM_EXPECTED_RAILWAY_PROJECT_ID: "project-test",
    CRM_EXPECTED_RAILWAY_ENVIRONMENT_ID: "environment-test",
    CRM_EXPECTED_RAILWAY_SERVICE_ID: "service-test",
    RAILWAY_PROJECT_ID: "project-test",
    RAILWAY_ENVIRONMENT_ID: "environment-test",
    RAILWAY_ENVIRONMENT_NAME: "canonical-staging",
    RAILWAY_SERVICE_ID: "service-test",
  };
  assert.equal(externalDatabaseUrlFromEnv(env), url);
  assert.throws(() => externalDatabaseUrlFromEnv({ ...env, DATABASE_URL: url }), /oficial|producao/i);
  assert.throws(() => externalDatabaseUrlFromEnv({ ...env, RAILWAY_SERVICE_ID: "outro-servico" }), /oficial|producao/i);
  assert.throws(() => externalDatabaseUrlFromEnv({ ...env, RAILWAY_ENVIRONMENT_NAME: "production" }), /oficial|producao/i);
  assert.equal(verifyRailwayDisposableAuthority(env, () => ({
    status: 0,
    stdout: JSON.stringify({
      CRM_DISPOSABLE_TEST_DATABASE: "true",
      CRM_DISPOSABLE_TEST_RUN_ID: "canonical-sale-test-run",
      RAILWAY_ENVIRONMENT_NAME: "canonical-staging",
      RAILWAY_SERVICE_NAME: "Postgres-Test1",
    }),
  })), true);
  assert.equal(verifyRailwayDisposableAuthority(env, () => ({ status: 0, stdout: "{}" })), false);
});

test("runner PostgreSQL real sanitiza URL, password, token e bearer", () => {
  const text = sanitizeLogText(
    "postgresql://user:secret@host/db password=secret token=abc Authorization: Bearer abc123",
    ["secret"],
  );
  assert.doesNotMatch(text, /secret|abc123|user:/i);
  assert.match(text, /postgresql:\/\/\[REDACTED\]/);
  assert.match(text, /Bearer \[REDACTED\]/);
});

test("runner PostgreSQL real rejeita imagem mutable e argumentos desconhecidos", () => {
  assert.throws(() => imageFromEnv({ POSTGRES_TEST_IMAGE: "postgres:latest" }), /pinada/);
  assert.throws(() => parseArguments(["--unsafe"]), /nao suportado/);
  assert.doesNotMatch(safeRunId("..\\outside/secret"), /[\\/]/);
});
