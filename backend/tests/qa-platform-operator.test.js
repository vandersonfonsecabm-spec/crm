"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { PrismaClient } = require("@prisma/client");
const {
  QA_PLATFORM_OPERATOR,
  QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
  QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION,
  QA_PLATFORM_OPERATOR_TENANT,
  inspectStagingPlatformOperator,
  provisionStagingPlatformOperator,
  revokeStagingPlatformOperator,
} = require("../src/security/qa-platform-operator.cjs");
const {
  cleanupOperatorCredentialBundle,
  writeOperatorCredentialBundle,
} = require("../scripts/qa-staging-platform-operator.cjs");
const { defaultCredentialsPath } = require("../scripts/qa-prod-bootstrap.cjs");

const RELEASE = "a".repeat(40);
const prisma = new PrismaClient();
const env = {
  NODE_ENV: "production",
  CRM_DATABASE_PROVIDER: "postgresql",
  POSTGRES_DATABASE_URL: "postgresql://fixture.invalid/db",
  QA_PROD_TARGET_ENV: "staging",
  RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
  RAILWAY_ENVIRONMENT_ID: "d6b6f137-cffd-4647-a102-3619fc54133a",
  RAILWAY_SERVICE_ID: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
  QA_PROD_WORKER_SERVICE_ID: "25dab463-52c0-4425-825e-c7dcf6a65332",
  QA_PROD_DB_SERVICE_ID: "f3a2862b-2371-4ab3-b4db-1e91680ee3b7",
  QA_PROD_RELEASE_HEAD: RELEASE,
  QA_PROD_EXPECTED_RELEASE_HEAD: RELEASE,
  QA_PROD_BASE_PRODUCTION_RELEASE_HEAD: RELEASE,
  PLATFORM_ADMIN_EMAILS: QA_PLATFORM_OPERATOR.email,
};

const options = { allowTestAttestation: true, requireAttestation: false };

async function cleanupOperatorFixture() {
  const tenant = await prisma.empresa.findUnique({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug }, select: { id: true } });
  if (tenant) {
    await prisma.platformTenantAudit.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditoriaSeguranca.deleteMany({ where: { empresaId: tenant.id } });
    await prisma.usuario.deleteMany({ where: { empresaId: tenant.id } });
    await prisma.empresa.delete({ where: { id: tenant.id } });
  }
}

test.afterEach(async () => {
  await cleanupOperatorFixture();
});

test.after(async () => {
  await prisma.$disconnect();
});

test("staging platform operator is isolated, idempotent and revocable", async () => {
  const absent = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead: RELEASE, runId: "qa-platform-status-0001", ...options });
  assert.equal(absent.status, "ABSENT_SAFE");
  assert.equal(absent.allowlist.containsOperator, true);
  assert.equal(absent.allowlist.size, 1);

  const passwordHash = await bcrypt.hash("synthetic-password-never-reported", 4);
  const applied = await provisionStagingPlatformOperator({
    prisma,
    env,
    passwordHash,
    confirmation: QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
    expectedReleaseHead: RELEASE,
    runId: "qa-platform-apply-0001",
    ...options,
  });
  assert.equal(applied.status, "READY");
  assert.equal(applied.mode, "apply");
  assert.equal(applied.operator.email, QA_PLATFORM_OPERATOR.email);
  assert.equal(applied.allowlist.exact, true);
  assert.equal(Object.values(applied.providerIsolation).every((value) => value === 0), true);

  const userBeforeRetry = await prisma.usuario.findFirst({ where: { email: QA_PLATFORM_OPERATOR.email }, select: { id: true, senhaHash: true } });
  const retry = await provisionStagingPlatformOperator({
    prisma,
    env,
    passwordHash: await bcrypt.hash("another-password-never-reported", 4),
    confirmation: QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
    expectedReleaseHead: RELEASE,
    runId: "qa-platform-apply-0002",
    ...options,
  });
  assert.equal(retry.status, "READY");
  assert.equal(retry.mode, "noop");
  const userAfterRetry = await prisma.usuario.findFirst({ where: { id: userBeforeRetry.id }, select: { id: true, senhaHash: true } });
  assert.deepEqual(userAfterRetry, userBeforeRetry);

  const session = await prisma.sessaoUsuario.create({
    data: {
      empresaId: applied.tenant.id,
      usuarioId: applied.operator.id,
      familyId: "qa-platform-family-0001",
      expiraEm: new Date(Date.now() + 60_000),
    },
    select: { id: true },
  });
  await prisma.sessaoRefreshToken.create({
    data: {
      empresaId: applied.tenant.id,
      sessaoId: session.id,
      tokenHash: "qa-platform-token-hash-0001",
      expiraEm: new Date(Date.now() + 60_000),
    },
  });

  const revoked = await revokeStagingPlatformOperator({
    prisma,
    env,
    confirmation: QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION,
    expectedReleaseHead: RELEASE,
    runId: "qa-platform-revoke-0001",
    ...options,
  });
  assert.equal(revoked.status, "REVOKED");
  assert.equal(revoked.tenant.ativo, false);
  assert.equal(revoked.operator.ativo, false);
  assert.equal(revoked.sessions.activeSessions, 0);
  assert.equal(revoked.sessions.activeRefreshTokens, 0);
  const releasedLease = await prisma.workerCheckpoint.findUnique({ where: { chave: "qa-prod-bootstrap-v1-lock" }, select: { cursorJson: true } });
  assert.equal(releasedLease?.cursorJson, null);
});

test("operator preflight fails closed for an unexpected staging allowlist", async () => {
  const unsafeEnv = { ...env, PLATFORM_ADMIN_EMAILS: "unexpected@example.invalid" };
  await assert.rejects(
    () => inspectStagingPlatformOperator({ prisma, env: unsafeEnv, expectedReleaseHead: RELEASE, runId: "qa-platform-status-0002", ...options }),
    (error) => error?.code === "QA_PLATFORM_OPERATOR_ALLOWLIST_UNEXPECTED",
  );
  assert.equal(await prisma.empresa.count({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug } }), 0);
});

test("operator apply rejects a non-bcrypt hash before any write", async () => {
  await assert.rejects(
    () => provisionStagingPlatformOperator({
      prisma,
      env,
      passwordHash: "not-a-password-hash",
      confirmation: QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
      expectedReleaseHead: RELEASE,
      runId: "qa-platform-apply-0003",
      ...options,
    }),
    (error) => error?.code === "QA_PLATFORM_OPERATOR_PASSWORD_HASH_INVALID",
  );
  assert.equal(await prisma.empresa.count({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug } }), 0);
});

test("operator credential bundle is temporary, restricted and removable", () => {
  const runId = "qa-platform-credential-0001";
  const credentialsFile = defaultCredentialsPath(runId);
  const password = "synthetic-operator-password-".padEnd(40, "x");
  let bundle;
  try {
    bundle = writeOperatorCredentialBundle(credentialsFile, { runId, password });
    assert.equal(bundle.filePath, credentialsFile);
    assert.equal(fs.existsSync(bundle.filePath), true);
    assert.equal(fs.existsSync(bundle.manifestPath), true);
    const stored = JSON.parse(fs.readFileSync(bundle.filePath, "utf8"));
    assert.deepEqual(stored, {
      runId,
      target: "staging",
      operator: { email: QA_PLATFORM_OPERATOR.email, papel: QA_PLATFORM_OPERATOR.role, password },
    });
    const manifest = JSON.parse(fs.readFileSync(bundle.manifestPath, "utf8"));
    assert.deepEqual(manifest, { runId, target: "staging", credentialsFileName: "credentials.json", status: "READY" });
    assert.equal(path.resolve(bundle.filePath).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
  } finally {
    cleanupOperatorCredentialBundle(bundle || { filePath: credentialsFile, manifestPath: path.join(path.dirname(credentialsFile), "manifest.json"), directoryPath: path.dirname(credentialsFile) });
  }
  assert.equal(fs.existsSync(credentialsFile), false);
});
