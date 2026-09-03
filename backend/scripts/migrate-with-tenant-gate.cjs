const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  preparePostgresWorkspace,
  resolvePrismaCli,
  latestMigrationName,
} = require("./postgres-prisma.cjs");
const { runGate, sanitizeFailure } = require("./tenant-isolation-gate.cjs");
const { createPrismaFailure } = require("./tenant-isolation-log-utils.cjs");
const {
  OFFICIAL_DATABASE_SERVICE_ID,
  assertPinnedPostgresTarget,
  assertPostgresAliasTargetConsistency,
  assertPostgresTargetFingerprint,
  assertProviderMatchesDatabaseUrl,
} = require("./prisma-runtime.cjs");

const backendDir = path.resolve(__dirname, "..");
const sqliteSchemaPath = path.join(backendDir, "prisma", "schema.prisma");
const sqliteMigrationDir = path.join(backendDir, "prisma", "migrations");
const TEST_SQLITE_ROOT = path.resolve(os.tmpdir(), "crm-prisma-tests");
const REPOSITORY_ROOT = path.resolve(backendDir, "..");
const PROTECTED_SQLITE_DATABASES = [
  path.join(backendDir, "prisma", "dev.db"),
  path.join(backendDir, "dev.db"),
];
const OFFICIAL_API_SERVICE_ID = "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92";
const OFFICIAL_PROJECT_ID = "ddfbf66c-e274-47b1-9493-286232d2f426";
const OFFICIAL_ENVIRONMENT_ID = "e18f76b1-e38f-468e-91fe-1eff6db9a5f8";
const MANUAL_MIGRATION_CONFIRMATION = "apply-tenant-migration";

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function providerFromEnv(env) {
  const explicit = String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "sqlite" || explicit === "postgresql") return explicit;
  if (/^postgres(ql)?:\/\//i.test(String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || ""))) return "postgresql";
  return "sqlite";
}

function databaseUrlForProvider(env, provider) {
  const value = provider === "postgresql" ? env.POSTGRES_DATABASE_URL || env.DATABASE_URL : env.DATABASE_URL;
  if (!value) throw new Error("TENANT_MIGRATION_DATABASE_URL_MISSING");
  return String(value).trim();
}

function isRailwayEnvironment(env) {
  return Boolean(env.RAILWAY_SERVICE_ID || env.RAILWAY_DEPLOYMENT_ID || env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID);
}

function expectedRailwayTarget(env) {
  const homolog = String(env.CRM_RAILWAY_ENVIRONMENT || "").trim().toLowerCase() === "homolog";
  const expected = homolog
    ? {
      databaseServiceId: String(env.CRM_RAILWAY_HOMOLOG_DATABASE_SERVICE_ID || "").trim(),
      environmentId: String(env.CRM_RAILWAY_HOMOLOG_ENVIRONMENT_ID || "").trim(),
      serviceId: String(env.CRM_RAILWAY_HOMOLOG_SERVICE_ID || "").trim(),
      target: "homolog",
      projectId: String(env.CRM_RAILWAY_HOMOLOG_PROJECT_ID || "").trim(),
    }
    : {
      databaseServiceId: OFFICIAL_DATABASE_SERVICE_ID,
      environmentId: OFFICIAL_ENVIRONMENT_ID,
      serviceId: OFFICIAL_API_SERVICE_ID,
      target: "production",
      projectId: OFFICIAL_PROJECT_ID,
    };
  if (!expected.databaseServiceId || !expected.environmentId || !expected.serviceId || !expected.projectId) {
    throw migrationError("MANUAL_MIGRATION_TARGET_CONFIG_MISSING");
  }
  return expected;
}

function assertManualMigrationAuthorization(env, { provider = providerFromEnv(env) } = {}) {
  const railway = isRailwayEnvironment(env);
  const hasPostgresTarget = Boolean(String(env.POSTGRES_TARGET_URL || env.POSTGRES_TEST_DATABASE_URL || "").trim());
  const testSqlite = String(env.NODE_ENV || "").trim().toLowerCase() === "test" && !railway && provider === "sqlite";
  const testDatabaseUrl = testSqlite ? assertIsolatedTestSqliteMigrationTarget(env) : null;
  if (testSqlite && !hasPostgresTarget) {
    return { bypassedForTest: true, target: "test", testDatabaseUrl };
  }

  const expected = railway ? expectedRailwayTarget(env) : { target: "local" };
  const target = String(env.CRM_MANUAL_MIGRATION_TARGET || "").trim().toLowerCase();
  if (target !== expected.target) throw migrationError("MANUAL_MIGRATION_TARGET_CONFIRMATION_REQUIRED");
  if (String(env.CRM_MANUAL_MIGRATION_CONFIRM || "") !== MANUAL_MIGRATION_CONFIRMATION) {
    throw migrationError("MANUAL_MIGRATION_CONFIRMATION_REQUIRED");
  }
  if (provider === "postgresql" && !railway) assertLocalPostgresMigrationTarget(env, { provider });
  assertOperationEvidence(env, "CRM_MANUAL_MIGRATION", { provider, target: expected.target });

  if (!railway) return { target: expected.target, testDatabaseUrl };
  if (String(env.NODE_ENV || "").trim() !== "production") throw migrationError("NODE_ENV_PRODUCTION_REQUIRED");
  if (env.RAILWAY_PROJECT_ID !== expected.projectId) throw migrationError("RAILWAY_PROJECT_MISMATCH");
  if (env.RAILWAY_ENVIRONMENT_ID !== expected.environmentId) throw migrationError("RAILWAY_ENVIRONMENT_MISMATCH");
  if (env.RAILWAY_SERVICE_ID !== expected.serviceId) throw migrationError("RAILWAY_SERVICE_MISMATCH");
  if (provider !== "postgresql") throw migrationError("RAILWAY_PRODUCTION_POSTGRES_REQUIRED");

  const databaseUrl = databaseUrlForProvider(env, provider);
  try {
    assertProviderMatchesDatabaseUrl(provider, databaseUrl);
    assertPinnedPostgresTarget({ env, expectedDatabaseServiceId: expected.databaseServiceId, provider });
  } catch (error) {
    throw migrationError(error?.code || "MANUAL_MIGRATION_DATABASE_TARGET_INVALID");
  }
  return { target: expected.target, testDatabaseUrl };
}

function assertIsolatedTestSqliteMigrationTarget(env) {
  const testDatabaseUrl = canonicalTestSqliteDatabaseUrl(env.CRM_TEST_DATABASE_URL);
  const selectedDatabaseUrl = String(env.DATABASE_URL || "").trim();
  if (!selectedDatabaseUrl) throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_MISMATCH");

  const canonicalSelectedDatabaseUrl = canonicalTestSqliteDatabaseUrl(selectedDatabaseUrl);
  if (canonicalSelectedDatabaseUrl !== testDatabaseUrl) {
    throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_MISMATCH");
  }
  return testDatabaseUrl;
}

function canonicalTestSqliteDatabaseUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_REQUIRED");
  if (!value.startsWith("file:")) throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");

  const encodedPath = value.slice("file:".length);
  if (!encodedPath || encodedPath.includes("?") || encodedPath.includes("#")) {
    throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
  }

  let databasePath;
  try {
    databasePath = decodeURIComponent(encodedPath);
  } catch {
    throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
  }
  if (databasePath.startsWith("///") && /^[A-Za-z]:/.test(databasePath.slice(3))) databasePath = databasePath.slice(3);
  if (databasePath.startsWith("/") && /^[A-Za-z]:/.test(databasePath.slice(1))) databasePath = databasePath.slice(1);
  if (!databasePath || databasePath.includes("\u0000") || !path.isAbsolute(databasePath)) {
    throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
  }

  const resolvedPath = path.resolve(databasePath);
  if (
    !isPathInside(resolvedPath, TEST_SQLITE_ROOT)
      || isPathInside(resolvedPath, REPOSITORY_ROOT)
  ) {
    throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
  }
  assertCanonicalTestSqlitePath(resolvedPath);
  return `file:${resolvedPath.replace(/\\/g, "/")}`;
}

function assertCanonicalTestSqlitePath(resolvedPath) {
  let current = resolvedPath;
  while (true) {
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !samePath(path.resolve(fs.realpathSync.native(current)), current)) {
        throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
      }
      if (samePath(current, resolvedPath) && stat.isFile()) {
        assertNotProtectedSqliteDatabaseAlias(stat);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (samePath(current, TEST_SQLITE_ROOT)) return;
    const parent = path.dirname(current);
    if (samePath(parent, current)) throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
    current = parent;
  }
}

function assertNotProtectedSqliteDatabaseAlias(candidateStat) {
  for (const protectedPath of PROTECTED_SQLITE_DATABASES) {
    let protectedStat;
    try {
      protectedStat = fs.statSync(protectedPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
    }
    if (sameExistingFile(candidateStat, protectedStat)) {
      throw migrationError("MANUAL_MIGRATION_TEST_DATABASE_URL_INVALID");
    }
  }
}

function sameExistingFile(left, right) {
  return left.isFile()
    && right.isFile()
    && Number.isInteger(left.ino)
    && Number.isInteger(right.ino)
    && left.ino > 0
    && left.ino === right.ino
    && left.dev === right.dev;
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function assertLocalPostgresMigrationTarget(env, { provider }) {
  const databaseUrl = databaseUrlForProvider(env, provider);
  try {
    assertProviderMatchesDatabaseUrl(provider, databaseUrl);
    assertPostgresAliasTargetConsistency(env, databaseUrl);
    // A local/test PostgreSQL migration is still a write operation.  Bind its
    // signed attestation to the *actual* selected URL before Prisma can run;
    // POSTGRES_TARGET_URL / POSTGRES_TEST_DATABASE_URL may only be aliases of
    // that same normalized host/database/schema target.
    assertPostgresTargetFingerprint({
      env,
      databaseUrl,
      missingCode: "MANUAL_MIGRATION_DATABASE_TARGET_FINGERPRINT_REQUIRED",
      mismatchCode: "MANUAL_MIGRATION_DATABASE_TARGET_MISMATCH",
    });
    for (const key of ["POSTGRES_TARGET_URL", "POSTGRES_TEST_DATABASE_URL"]) {
      const alias = String(env[key] || "").trim();
      if (!alias) continue;
      assertProviderMatchesDatabaseUrl(provider, alias);
      assertPostgresTargetFingerprint({
        env,
        databaseUrl: alias,
        missingCode: "MANUAL_MIGRATION_DATABASE_TARGET_FINGERPRINT_REQUIRED",
        mismatchCode: "MANUAL_MIGRATION_DATABASE_TARGET_ALIAS_MISMATCH",
      });
    }
  } catch (error) {
    throw migrationError(error?.code || "MANUAL_MIGRATION_DATABASE_TARGET_INVALID");
  }
}

function assertOperationEvidence(env, prefix, { provider, target } = {}) {
  const runId = String(env[`${prefix}_RUN_ID`] || "").trim();
  const backupRef = String(env[`${prefix}_BACKUP_REF`] || "").trim();
  const attestation = String(env[`${prefix}_ATTESTATION`] || "").trim().toLowerCase();
  const hmacKey = String(env[`${prefix}_ATTESTATION_HMAC_KEY`] || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(runId)) throw migrationError("MANUAL_MIGRATION_RUN_ID_REQUIRED");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/=-]{7,255}$/.test(backupRef)) throw migrationError("MANUAL_MIGRATION_BACKUP_REQUIRED");
  if (!/^[a-f0-9]{64}$/.test(attestation)) throw migrationError("MANUAL_MIGRATION_ATTESTATION_REQUIRED");
  if (Buffer.byteLength(hmacKey, "utf8") < 32) throw migrationError("MANUAL_MIGRATION_ATTESTATION_KEY_REQUIRED");
  const expectedAttestation = signManualMigrationAttestation(hmacKey, canonicalManualMigrationAttestationPayload({
    backupRef,
    databaseServiceId: String(env.CRM_DATABASE_SERVICE_ID || "").trim(),
    databaseTargetFingerprint: String(env.CRM_DATABASE_TARGET_FINGERPRINT || "").trim().toLowerCase(),
    provider,
    runId,
    target,
  }));
  if (!crypto.timingSafeEqual(Buffer.from(attestation, "hex"), Buffer.from(expectedAttestation, "hex"))) {
    throw migrationError("MANUAL_MIGRATION_ATTESTATION_INVALID");
  }
}

function canonicalManualMigrationAttestationPayload({ backupRef, databaseServiceId, databaseTargetFingerprint, provider, runId, target }) {
  return JSON.stringify({
    backupRef: String(backupRef || ""),
    databaseServiceId: String(databaseServiceId || ""),
    databaseTargetFingerprint: String(databaseTargetFingerprint || ""),
    provider: String(provider || ""),
    runId: String(runId || ""),
    target: String(target || ""),
  });
}

function signManualMigrationAttestation(hmacKey, payload) {
  return crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");
}

function runPrisma(args, env) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...args], {
    cwd: backendDir,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw createPrismaFailure(`tenant-migration-${args[0] || "command"}`, result.error.message);
  if (result.status !== 0) throw createPrismaFailure(`tenant-migration-${args[0] || "command"}`, `${result.stderr || ""}\n${result.stdout || ""}`);
}

async function main({ env: suppliedEnv = process.env } = {}) {
  const env = { ...suppliedEnv };
  const provider = providerFromEnv(env);
  const authorization = assertManualMigrationAuthorization(env, { provider });
  if (authorization.testDatabaseUrl) {
    env.DATABASE_URL = authorization.testDatabaseUrl;
    env.CRM_TEST_DATABASE_URL = authorization.testDatabaseUrl;
  }
  let schemaPath = sqliteSchemaPath;
  let migrationDir = sqliteMigrationDir;
  let migrationName = latestMigrationName(migrationDir);
  let gateOptions = { env, schemaPath, migrationDir, migrationName };

  if (provider === "postgresql") {
    const workspace = preparePostgresWorkspace();
    schemaPath = workspace.schemaPath;
    migrationDir = workspace.migrationsDir;
    migrationName = latestMigrationName(migrationDir);
    const databaseUrl = databaseUrlForProvider(env, provider);
    const prismaEnv = { ...env, DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" };
    runPrisma(["validate", "--schema", schemaPath], prismaEnv);
    runPrisma(["generate", "--schema", schemaPath], prismaEnv);
    gateOptions = { env: { ...env, DATABASE_URL: databaseUrl }, schemaPath, postgresMigrationDir: migrationDir, migrationName };
  } else {
    const databaseUrl = databaseUrlForProvider(env, provider);
    const sqliteEnv = { ...env, DATABASE_URL: databaseUrl };
    runPrisma(["validate", "--schema", schemaPath], sqliteEnv);
    runPrisma(["generate", "--schema", schemaPath], sqliteEnv);
    gateOptions = { env: sqliteEnv, schemaPath, migrationDir, migrationName };
  }

  await runGate({ mode: "architecture", ...gateOptions });
  await runGate({ mode: "pre-migration", ...gateOptions });
  runPrisma(["migrate", "deploy", "--schema", schemaPath], gateOptions.env);
  await runGate({ mode: "post-migration", ...gateOptions });
  console.log(JSON.stringify({ event: "tenant_migration", safe: true, provider, migrationName }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "tenant_migration", safe: false, error: sanitizeFailure(error) }));
    process.exitCode = 1;
  });
}

module.exports = {
  MANUAL_MIGRATION_CONFIRMATION,
  assertManualMigrationAuthorization,
  assertIsolatedTestSqliteMigrationTarget,
  assertLocalPostgresMigrationTarget,
  canonicalManualMigrationAttestationPayload,
  expectedRailwayTarget,
  main,
  providerFromEnv,
  signManualMigrationAttestation,
};
