"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const {
  APPLY_CONFIRMATION,
  QA_PRODUCTION_TARGET,
  QA_TENANTS,
  REVOKE_CONFIRMATION,
  generateTemporaryCredentials,
  acquireQaDatabaseLease,
  inspectQaState,
  provisionSyntheticQa,
  releaseQaDatabaseLease,
  revokeSyntheticQa,
} = require("../src/security/qa-provisioning.cjs");

const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const release = QA_PRODUCTION_TARGET.baseProductionReleaseHead;
let prismaA;
let prismaB;
let env;
let operatorId;

before(async () => {
  const url = requiredPostgresUrl();
  prismaA = new PrismaClient({ datasourceUrl: url });
  prismaB = new PrismaClient({ datasourceUrl: url });
  await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  env = {
    NODE_ENV: "production",
    CRM_DATABASE_PROVIDER: "postgresql",
    DATABASE_URL: url,
    POSTGRES_DATABASE_URL: "",
    RAILWAY_PROJECT_ID: QA_PRODUCTION_TARGET.projectId,
    RAILWAY_ENVIRONMENT_ID: QA_PRODUCTION_TARGET.environmentId,
    RAILWAY_SERVICE_ID: QA_PRODUCTION_TARGET.apiServiceId,
    QA_PROD_WORKER_SERVICE_ID: QA_PRODUCTION_TARGET.workerServiceId,
    QA_PROD_DB_SERVICE_ID: QA_PRODUCTION_TARGET.databaseServiceId,
    QA_PROD_BASE_PRODUCTION_RELEASE_HEAD: release,
    QA_PROD_RELEASE_HEAD: release,
    QA_PROD_EXPECTED_RELEASE_HEAD: release,
    NEGOCIOS_KANBAN_ENABLED: "true",
    PLATFORM_ADMIN_EMAILS: "qa-pg-operator@example.invalid",
  };
  const existing = await prismaA.usuario.findFirst({ select: { id: true } });
  if (existing) {
    operatorId = existing.id;
  } else {
    const operatorTenant = await prismaA.empresa.create({ data: { nome: `QA PG Operator ${suffix}`, slug: `qa-pg-operator-${suffix}` } });
    const operator = await prismaA.usuario.create({ data: { empresaId: operatorTenant.id, nome: "QA PG Operator", email: `qa-pg-operator-${suffix}@example.invalid`, senhaHash: "fixture", papel: "ADMIN" } });
    operatorId = operator.id;
  }
});

after(async () => {
  await Promise.allSettled([prismaA?.$disconnect(), prismaB?.$disconnect()]);
});

test("bootstrap QA PostgreSQL e concorrente, no-op e revoke completo", async () => {
  const databaseLease = await acquireQaDatabaseLease(prismaA, { runId: "qa-pg-lock-run-0001", ownerToken: "pg-owner-a", ttlMs: 60_000 });
  await assert.rejects(() => acquireQaDatabaseLease(prismaB, { runId: "qa-pg-lock-run-0002", ownerToken: "pg-owner-b", ttlMs: 60_000 }), (error) => error.code === "QA_PROD_DATABASE_LOCK_HELD");
  assert.equal(await releaseQaDatabaseLease(prismaA, { runId: "qa-pg-lock-run-0001", ownerToken: databaseLease.ownerToken }), true);
  const credentials = generateTemporaryCredentials();
  const passwordHashes = Object.fromEntries(await Promise.all(credentials.map(async (item) => [item.email, await bcrypt.hash(item.password, 4)])));
  const options = { env, expectedReleaseHead: release, target: QA_PRODUCTION_TARGET, operatorUsuarioId: operatorId, allowTestAttestation: true };
  const concurrent = await Promise.allSettled([
    provisionSyntheticQa({ ...options, prisma: prismaA, passwordHashes, apply: true, confirmation: APPLY_CONFIRMATION, runId: "qa-pg-run-a-0001" }),
    provisionSyntheticQa({ ...options, prisma: prismaB, passwordHashes, apply: true, confirmation: APPLY_CONFIRMATION, runId: "qa-pg-run-b-0001" }),
  ]);
  assert.equal(concurrent.some((result) => result.status === "fulfilled"), true, JSON.stringify(concurrent));
  const ready = await inspectQaState({ ...options, prisma: prismaA });
  assert.equal(ready.status, "READY");
  assert.equal(await prismaA.empresa.count({ where: { slug: { in: QA_TENANTS.map((tenant) => tenant.slug) } } }), 2);
  assert.equal(await prismaA.usuario.count({ where: { email: { in: QA_TENANTS.flatMap((tenant) => tenant.users.map((user) => user.email)) } } }), 5);
  assert.equal(await prismaA.empresaFuncionalidade.count({ where: { empresaId: { in: ready.tenants.map((tenant) => tenant.id) }, chave: "NEGOCIOS_KANBAN", habilitada: true } }), 2);

  const hashesBeforeRetry = await prismaA.usuario.findMany({ where: { email: { in: credentials.map((item) => item.email) } }, select: { email: true, senhaHash: true }, orderBy: { email: "asc" } });
  const retry = await provisionSyntheticQa({ ...options, prisma: prismaA, passwordHashes, apply: true, confirmation: APPLY_CONFIRMATION, runId: "qa-pg-run-retry-0001" });
  assert.equal(retry.mode, "noop");
  const hashesAfterRetry = await prismaA.usuario.findMany({ where: { email: { in: credentials.map((item) => item.email) } }, select: { email: true, senhaHash: true }, orderBy: { email: "asc" } });
  assert.deepEqual(hashesAfterRetry, hashesBeforeRetry);

  const revoked = await revokeSyntheticQa({ ...options, prisma: prismaA, confirmation: REVOKE_CONFIRMATION, runId: "qa-pg-run-revoke-0001" });
  assert.equal(revoked.status, "REVOKED");
  const finalState = await inspectQaState({ ...options, prisma: prismaA });
  assert.equal(finalState.status, "REVOKED");
  assert.equal(await prismaA.empresaFuncionalidade.count({ where: { empresaId: { in: finalState.tenants.map((tenant) => tenant.id) }, chave: "NEGOCIOS_KANBAN", habilitada: true } }), 0);
  assert.equal(await prismaA.usuario.count({ where: { email: { in: credentials.map((item) => item.email) }, ativo: true } }), 0);
});

function requiredPostgresUrl() {
  const value = String(process.env.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (process.env.NODE_ENV !== "test"
    || process.env.CRM_TEST_DATABASE_PROVIDER !== "postgresql"
    || process.env.CRM_TEST_POSTGRES_ALLOW !== "true"
    || process.env.CRM_POSTGRES_SUITE_VERIFIED !== "true"
    || !/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error("PostgreSQL descartavel verificado obrigatorio.");
  }
  return value;
}
