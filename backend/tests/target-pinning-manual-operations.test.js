const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  assertPostgresTargetFingerprint,
  databaseTargetFingerprint,
} = require("../scripts/prisma-runtime.cjs");
const {
  MANUAL_MIGRATION_CONFIRMATION,
  assertManualMigrationAuthorization,
  canonicalManualMigrationAttestationPayload,
  main: runManualMigration,
  signManualMigrationAttestation,
} = require("../scripts/migrate-with-tenant-gate.cjs");
const {
  assertImportApplyAuthorization,
  canonicalPostgresImportAttestationPayload,
  signPostgresImportAttestation,
} = require("../scripts/migrate-sqlite-to-postgres.cjs");
const { validateWorkerRuntimeTarget } = require("../src/automations/worker");

const PRODUCTION_POSTGRES_URL = "postgresql://pin-test:pin-test@postgres.internal:5432/crm_target_pin";
const OFFICIAL_API_SERVICE_ID = "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92";
const OFFICIAL_DATABASE_SERVICE_ID = "e9d8a6b8-507b-45fb-92a8-3ab016f865a2";
const OFFICIAL_WORKER_SERVICE_ID = "4eef3b96-e33f-42ea-9fb8-86c17b077ab8";
const TEST_ATTESTATION_KEY = "test-only-attestation-key-at-least-thirty-two-bytes";
const TEST_SQLITE_ROOT = path.join(os.tmpdir(), "crm-prisma-tests");
const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const LEGACY_PUBLIC_TARGET_FINGERPRINT = crypto.createHash("sha256").update(JSON.stringify({
  database: "crm_target_pin",
  host: "postgres.internal",
  port: "5432",
  protocol: "postgresql",
})).digest("hex");

test("fingerprint do target PostgreSQL nao depende de senha, normaliza schema e preserva parametros seguros", () => {
  assert.equal(
    databaseTargetFingerprint(PRODUCTION_POSTGRES_URL),
    databaseTargetFingerprint("postgresql://different-user:rotated-password@postgres.internal:5432/crm_target_pin"),
  );
  assert.notEqual(
    databaseTargetFingerprint(PRODUCTION_POSTGRES_URL),
    databaseTargetFingerprint("postgresql://pin-test:pin-test@postgres.internal:5432/other_database"),
  );
  assert.equal(
    databaseTargetFingerprint(`${PRODUCTION_POSTGRES_URL}?schema=%70ublic&sslmode=REQUIRE&connect_timeout=5`),
    databaseTargetFingerprint("postgresql://different-user:rotated-password@postgres.internal:5432/crm_target_pin?connect_timeout=5&sslmode=require&schema=public"),
  );
  assert.notEqual(
    databaseTargetFingerprint(`${PRODUCTION_POSTGRES_URL}?schema=public`),
    databaseTargetFingerprint(`${PRODUCTION_POSTGRES_URL}?schema=other_schema`),
  );
  assert.equal(
    databaseTargetFingerprint(`${PRODUCTION_POSTGRES_URL}?schema=public&password=rotated-query-secret`),
    databaseTargetFingerprint(`${PRODUCTION_POSTGRES_URL}?schema=public&password=another-query-secret`),
  );
});

test("fingerprint aceita somente o baseline legado do schema public", () => {
  assert.notEqual(LEGACY_PUBLIC_TARGET_FINGERPRINT, databaseTargetFingerprint(PRODUCTION_POSTGRES_URL));
  assert.doesNotThrow(() => assertPostgresTargetFingerprint({
    env: { CRM_DATABASE_TARGET_FINGERPRINT: LEGACY_PUBLIC_TARGET_FINGERPRINT },
    databaseUrl: PRODUCTION_POSTGRES_URL,
  }));
  assert.equal(validateWorkerRuntimeTarget({
    ...productionTargetEnv(),
    RAILWAY_SERVICE_ID: OFFICIAL_WORKER_SERVICE_ID,
    CRM_DATABASE_TARGET_FINGERPRINT: LEGACY_PUBLIC_TARGET_FINGERPRINT,
  }), "postgresql");
  assert.doesNotThrow(() => assertPostgresTargetFingerprint({
    env: { CRM_DATABASE_TARGET_FINGERPRINT: LEGACY_PUBLIC_TARGET_FINGERPRINT },
    databaseUrl: `${PRODUCTION_POSTGRES_URL}?schema=public`,
  }));
  assert.throws(
    () => assertPostgresTargetFingerprint({
      env: { CRM_DATABASE_TARGET_FINGERPRINT: LEGACY_PUBLIC_TARGET_FINGERPRINT },
      databaseUrl: `${PRODUCTION_POSTGRES_URL}?schema=other_schema`,
    }),
    { code: "POSTGRES_TARGET_MISMATCH" },
  );
  assert.doesNotThrow(() => assertPostgresTargetFingerprint({
    env: { CRM_DATABASE_TARGET_FINGERPRINT: LEGACY_PUBLIC_TARGET_FINGERPRINT },
    databaseUrl: `${PRODUCTION_POSTGRES_URL}?schema=public&sslmode=require`,
  }));
});

function testSqliteDatabaseUrl(name) {
  return `file:${path.join(TEST_SQLITE_ROOT, "manual-migration-authorization", name).replace(/\\/g, "/")}`;
}

function testSqliteMigrationEnv(databaseUrl = testSqliteDatabaseUrl("isolated.db")) {
  return {
    NODE_ENV: "test",
    CRM_DATABASE_PROVIDER: "sqlite",
    CRM_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
  };
}

test("bypass SQLite de teste exige CRM_TEST_DATABASE_URL isolada e ligada ao alvo real", () => {
  const isolatedUrl = testSqliteDatabaseUrl("isolated.db");
  const authorization = assertManualMigrationAuthorization(testSqliteMigrationEnv(isolatedUrl));
  assert.equal(authorization.bypassedForTest, true);
  assert.equal(authorization.target, "test");
  assert.equal(authorization.testDatabaseUrl, isolatedUrl);

  assert.throws(
    () => assertManualMigrationAuthorization({
      NODE_ENV: "test",
      CRM_DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: isolatedUrl,
    }),
    { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_REQUIRED" },
  );

  const protectedDatabaseUrl = `file:${path.join(REPOSITORY_ROOT, "backend", "prisma", "dev.db").replace(/\\/g, "/")}`;
  assert.throws(
    () => assertManualMigrationAuthorization(testSqliteMigrationEnv(protectedDatabaseUrl)),
    { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(testSqliteMigrationEnv(`file:${path.join(REPOSITORY_ROOT, "qa.db").replace(/\\/g, "/")}`)),
    { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization({
      ...testSqliteMigrationEnv(isolatedUrl),
      DATABASE_URL: protectedDatabaseUrl,
    }),
    { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID" },
  );
});

test("execucao manual SQLite em teste aborta antes do Prisma para dev.db protegido", async () => {
  const protectedDatabaseUrl = `file:${path.join(REPOSITORY_ROOT, "backend", "prisma", "dev.db").replace(/\\/g, "/")}`;
  await assert.rejects(
    runManualMigration({ env: testSqliteMigrationEnv(protectedDatabaseUrl) }),
    { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID" },
  );
});

test("bypass SQLite de teste rejeita junction que resolve para o repositorio", () => {
  fs.mkdirSync(TEST_SQLITE_ROOT, { recursive: true });
  const alias = path.join(TEST_SQLITE_ROOT, `manual-migration-alias-${process.pid}-${Date.now()}`);
  try {
    fs.symlinkSync(REPOSITORY_ROOT, alias, "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return;
    throw error;
  }

  try {
    const aliasUrl = `file:${path.join(alias, "backend", "prisma", "dev.db").replace(/\\/g, "/")}`;
    assert.throws(
      () => assertManualMigrationAuthorization(testSqliteMigrationEnv(aliasUrl)),
      { code: "MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID" },
    );
  } finally {
    try {
      fs.unlinkSync(alias);
    } catch (error) {
      if (error.code !== "ENOENT") fs.rmdirSync(alias);
    }
  }
});

function productionTargetEnv() {
  return {
    NODE_ENV: "production",
    RAILWAY_SERVICE_ID: OFFICIAL_API_SERVICE_ID,
    RAILWAY_DEPLOYMENT_ID: "target-pin-test-deployment",
    RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
    RAILWAY_ENVIRONMENT_ID: "e18f76b1-e38f-468e-91fe-1eff6db9a5f8",
    CRM_DATABASE_PROVIDER: "postgresql",
    CRM_DATABASE_SERVICE_ID: OFFICIAL_DATABASE_SERVICE_ID,
    CRM_DATABASE_TARGET_FINGERPRINT: databaseTargetFingerprint(PRODUCTION_POSTGRES_URL),
    POSTGRES_DATABASE_URL: PRODUCTION_POSTGRES_URL,
  };
}

function withManualMigrationAttestation(env, { provider = "sqlite", target = "local" } = {}) {
  const signed = {
    ...env,
    CRM_MANUAL_MIGRATION_ATTESTATION_HMAC_KEY: TEST_ATTESTATION_KEY,
  };
  return {
    ...signed,
    CRM_MANUAL_MIGRATION_ATTESTATION: signManualMigrationAttestation(
      TEST_ATTESTATION_KEY,
      canonicalManualMigrationAttestationPayload({
        backupRef: signed.CRM_MANUAL_MIGRATION_BACKUP_REF,
        databaseServiceId: signed.CRM_DATABASE_SERVICE_ID || "",
        databaseTargetFingerprint: signed.CRM_DATABASE_TARGET_FINGERPRINT || "",
        provider,
        runId: signed.CRM_MANUAL_MIGRATION_RUN_ID,
        target,
      }),
    ),
  };
}

function withPostgresImportAttestation(env) {
  const signed = {
    ...env,
    CRM_POSTGRES_IMPORT_ATTESTATION_HMAC_KEY: TEST_ATTESTATION_KEY,
  };
  return {
    ...signed,
    CRM_POSTGRES_IMPORT_ATTESTATION: signPostgresImportAttestation(
      TEST_ATTESTATION_KEY,
      canonicalPostgresImportAttestationPayload({
        backupRef: signed.CRM_POSTGRES_IMPORT_BACKUP_REF,
        runId: signed.CRM_POSTGRES_IMPORT_RUN_ID,
        target: signed.CRM_POSTGRES_IMPORT_TARGET,
        targetFingerprint: signed.CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT,
      }),
    ),
  };
}

function localPostgresMigrationEnv() {
  const targetUrl = "postgresql://local-test:rotated@qa-target.invalid:5432/qa_target?schema=qa_schema";
  return withManualMigrationAttestation({
    NODE_ENV: "test",
    CRM_DATABASE_PROVIDER: "postgresql",
    POSTGRES_DATABASE_URL: targetUrl,
    CRM_DATABASE_TARGET_FINGERPRINT: databaseTargetFingerprint(targetUrl),
    CRM_MANUAL_MIGRATION_TARGET: "local",
    CRM_MANUAL_MIGRATION_CONFIRM: MANUAL_MIGRATION_CONFIRMATION,
    CRM_MANUAL_MIGRATION_RUN_ID: "manual-local-postgres-20260903",
    CRM_MANUAL_MIGRATION_BACKUP_REF: "backup:local-postgres-20260903",
  }, { provider: "postgresql", target: "local" });
}

test("migration manual exige confirmacao, backup e atestacao fora de testes", () => {
  assert.throws(
    () => assertManualMigrationAuthorization({ NODE_ENV: "development" }),
    { code: "MANUAL_MIGRATION_TARGET_CONFIRMATION_REQUIRED" },
  );
  const localEnv = withManualMigrationAttestation({
    NODE_ENV: "development",
    CRM_MANUAL_MIGRATION_TARGET: "local",
    CRM_MANUAL_MIGRATION_CONFIRM: MANUAL_MIGRATION_CONFIRMATION,
    CRM_MANUAL_MIGRATION_RUN_ID: "manual-local-20260903",
    CRM_MANUAL_MIGRATION_BACKUP_REF: "backup:local-20260903",
  });
  assert.doesNotThrow(() => assertManualMigrationAuthorization(localEnv));
  assert.throws(
    () => assertManualMigrationAuthorization({ ...localEnv, CRM_MANUAL_MIGRATION_ATTESTATION: "0".repeat(64) }),
    { code: "MANUAL_MIGRATION_ATTESTATION_INVALID" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization({ NODE_ENV: "test", RAILWAY_SERVICE_ID: OFFICIAL_API_SERVICE_ID }),
    { code: "MANUAL_MIGRATION_TARGET_CONFIRMATION_REQUIRED" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization({ NODE_ENV: "test", CRM_DATABASE_PROVIDER: "postgresql", POSTGRES_TARGET_URL: PRODUCTION_POSTGRES_URL }),
    { code: "MANUAL_MIGRATION_TARGET_CONFIRMATION_REQUIRED" },
  );
});

test("migration manual local/test PostgreSQL exige fingerprint ligado a URL e schema efetivos", () => {
  const env = localPostgresMigrationEnv();
  assert.doesNotThrow(() => assertManualMigrationAuthorization(env));
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({
      ...env,
      CRM_DATABASE_TARGET_FINGERPRINT: "",
    }, { provider: "postgresql", target: "local" })),
    { code: "MANUAL_MIGRATION_DATABASE_TARGET_FINGERPRINT_REQUIRED" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({
      ...env,
      CRM_DATABASE_TARGET_FINGERPRINT: "0".repeat(64),
    }, { provider: "postgresql", target: "local" })),
    { code: "MANUAL_MIGRATION_DATABASE_TARGET_MISMATCH" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({
      ...env,
      POSTGRES_DATABASE_URL: "postgresql://local-test:rotated@qa-target.invalid:5432/qa_target?schema=other_schema",
    }, { provider: "postgresql", target: "local" })),
    { code: "MANUAL_MIGRATION_DATABASE_TARGET_MISMATCH" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({
      ...env,
      POSTGRES_TEST_DATABASE_URL: "postgresql://local-test:rotated@qa-target.invalid:5432/qa_target?schema=other_schema",
    }, { provider: "postgresql", target: "local" })),
    { code: "MANUAL_MIGRATION_DATABASE_TARGET_ALIAS_MISMATCH" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization({ ...env, CRM_MANUAL_MIGRATION_ATTESTATION: "" }),
    { code: "MANUAL_MIGRATION_ATTESTATION_REQUIRED" },
  );
});

test("worker de producao rejeita servico e URL PostgreSQL divergentes", () => {
  const env = {
    ...productionTargetEnv(),
    RAILWAY_SERVICE_ID: OFFICIAL_WORKER_SERVICE_ID,
  };
  assert.equal(validateWorkerRuntimeTarget(env), "postgresql");
  assert.throws(
    () => validateWorkerRuntimeTarget({ ...env, CRM_DATABASE_SERVICE_ID: "wrong" }),
    /RAILWAY_DATABASE_SERVICE_MISMATCH/,
  );
  assert.throws(
    () => validateWorkerRuntimeTarget({ ...env, POSTGRES_DATABASE_URL: "postgresql://pin-test:pin-test@postgres.internal:5432/other_database" }),
    /RAILWAY_DATABASE_TARGET_MISMATCH/,
  );
  assert.throws(
    () => validateWorkerRuntimeTarget({ ...env, POSTGRES_DATABASE_URL: `${PRODUCTION_POSTGRES_URL}?schema=other_schema` }),
    /RAILWAY_DATABASE_TARGET_MISMATCH/,
  );
});

test("migration manual de producao rejeita servico ou banco divergentes", () => {
  const env = withManualMigrationAttestation({
    ...productionTargetEnv(),
    CRM_MANUAL_MIGRATION_TARGET: "production",
    CRM_MANUAL_MIGRATION_CONFIRM: MANUAL_MIGRATION_CONFIRMATION,
    CRM_MANUAL_MIGRATION_RUN_ID: "manual-prod-20260903",
    CRM_MANUAL_MIGRATION_BACKUP_REF: "backup:prod-20260903",
  }, { provider: "postgresql", target: "production" });
  assert.doesNotThrow(() => assertManualMigrationAuthorization(env));
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({ ...env, CRM_DATABASE_SERVICE_ID: "wrong" }, { provider: "postgresql", target: "production" })),
    { code: "RAILWAY_DATABASE_SERVICE_MISMATCH" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({ ...env, POSTGRES_DATABASE_URL: "postgresql://pin-test:pin-test@postgres.internal:5432/other_database" }, { provider: "postgresql", target: "production" })),
    { code: "RAILWAY_DATABASE_TARGET_MISMATCH" },
  );
  assert.throws(
    () => assertManualMigrationAuthorization(withManualMigrationAttestation({ ...env, POSTGRES_DATABASE_URL: `${PRODUCTION_POSTGRES_URL}?schema=other_schema` }, { provider: "postgresql", target: "production" })),
    { code: "RAILWAY_DATABASE_TARGET_MISMATCH" },
  );
});

test("import SQLite para PostgreSQL exige evidencia e pin de URL de destino", () => {
  const isolatedEnv = withPostgresImportAttestation({
    NODE_ENV: "development",
    POSTGRES_TARGET_URL: PRODUCTION_POSTGRES_URL,
    CRM_POSTGRES_IMPORT_TARGET: "isolated",
    CRM_POSTGRES_IMPORT_CONFIRM: "copy-sqlite-to-postgres",
    CRM_POSTGRES_IMPORT_RUN_ID: "import-local-20260903",
    CRM_POSTGRES_IMPORT_BACKUP_REF: "backup:isolated-20260903",
    CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT: databaseTargetFingerprint(PRODUCTION_POSTGRES_URL),
  });
  assert.doesNotThrow(() => assertImportApplyAuthorization(isolatedEnv));
  assert.throws(
    () => assertImportApplyAuthorization({ ...isolatedEnv, CRM_POSTGRES_IMPORT_ATTESTATION: "0".repeat(64) }),
    { code: "POSTGRES_IMPORT_ATTESTATION_INVALID" },
  );
  assert.throws(
    () => assertImportApplyAuthorization(withPostgresImportAttestation({ ...isolatedEnv, CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT: "0".repeat(64) })),
    { code: "POSTGRES_IMPORT_TARGET_MISMATCH" },
  );
});

test("import de producao exige que URL de import e URL runtime apontem ao mesmo banco pinado", () => {
  const env = withPostgresImportAttestation({
    ...productionTargetEnv(),
    POSTGRES_TARGET_URL: PRODUCTION_POSTGRES_URL,
    CRM_POSTGRES_IMPORT_TARGET: "production",
    CRM_POSTGRES_IMPORT_CONFIRM: "copy-sqlite-to-postgres",
    CRM_POSTGRES_IMPORT_RUN_ID: "import-prod-20260903",
    CRM_POSTGRES_IMPORT_BACKUP_REF: "backup:prod-20260903",
    CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT: databaseTargetFingerprint(PRODUCTION_POSTGRES_URL),
  });
  assert.doesNotThrow(() => assertImportApplyAuthorization(env));
  const divergentTarget = "postgresql://pin-test:pin-test@postgres.internal:5432/other_database";
  assert.throws(
    () => assertImportApplyAuthorization(withPostgresImportAttestation({
      ...env,
      POSTGRES_TARGET_URL: divergentTarget,
      CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT: databaseTargetFingerprint(divergentTarget),
    })),
    { code: "POSTGRES_IMPORT_DATABASE_URL_TARGET_MISMATCH" },
  );
  const divergentSchema = `${PRODUCTION_POSTGRES_URL}?schema=other_schema`;
  assert.throws(
    () => assertImportApplyAuthorization(withPostgresImportAttestation({
      ...env,
      POSTGRES_TARGET_URL: divergentSchema,
      CRM_POSTGRES_IMPORT_TARGET_FINGERPRINT: databaseTargetFingerprint(divergentSchema),
    })),
    { code: "POSTGRES_IMPORT_DATABASE_URL_TARGET_MISMATCH" },
  );
});
