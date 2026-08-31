"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const { assertCredentialPath, defaultCredentialsPath } = require("../scripts/qa-prod-bootstrap.cjs");
const { listCredentialBundles, parseArgs: parseRevokeArgs, validateCredentialBundle } = require("../scripts/qa-prod-revoke.cjs");
const {
  APPLY_CONFIRMATION,
  EMERGENCY_REVOKE_CONFIRMATION,
  REVOKE_CONFIRMATION,
  QA_PRODUCTION_TARGET,
  QA_TENANTS,
  assertCredentials,
  assertPrewriteSafety,
  assertTarget,
  acquireQaDatabaseLease,
  canonicalAttestationPayload,
  computeLocalGitIdentity,
  computeQaHarnessSourceManifest,
  generateTemporaryCredentials,
  inspectQaState,
  provisionSyntheticQa,
  releaseQaDatabaseLease,
  revokeSyntheticQa,
} = require("../src/security/qa-provisioning.cjs");

const RELEASE = QA_PRODUCTION_TARGET.baseProductionReleaseHead;
const BASE_ENV = Object.freeze({
  NODE_ENV: "production",
  CRM_DATABASE_PROVIDER: "postgresql",
  POSTGRES_DATABASE_URL: "postgresql://fixture.invalid/db",
  RAILWAY_PROJECT_ID: QA_PRODUCTION_TARGET.projectId,
  RAILWAY_ENVIRONMENT_ID: QA_PRODUCTION_TARGET.environmentId,
  RAILWAY_SERVICE_ID: QA_PRODUCTION_TARGET.apiServiceId,
  QA_PROD_WORKER_SERVICE_ID: QA_PRODUCTION_TARGET.workerServiceId,
  QA_PROD_DB_SERVICE_ID: QA_PRODUCTION_TARGET.databaseServiceId,
  QA_PROD_BASE_PRODUCTION_RELEASE_HEAD: RELEASE,
  QA_PROD_RELEASE_HEAD: RELEASE,
  QA_PROD_EXPECTED_RELEASE_HEAD: RELEASE,
  NEGOCIOS_KANBAN_ENABLED: "true",
  PLATFORM_ADMIN_EMAILS: "operator@platform.invalid",
});

const TEST_OPTIONS = Object.freeze({
  allowTestAttestation: true,
  operatorUsuarioId: 900,
  runId: "qa-test-run-0001",
});

class FakePrisma {
  constructor(state = {}) {
    this.state = {
      empresa: state.empresa || [],
      usuario: state.usuario || [],
      sessaoUsuario: state.sessaoUsuario || [],
      sessaoRefreshToken: state.sessaoRefreshToken || [],
      metaCredential: state.metaCredential || [],
      integracao: state.integracao || [],
      canalIntegracao: state.canalIntegracao || [],
      empresaFuncionalidade: state.empresaFuncionalidade || [],
      auditoriaSeguranca: state.auditoriaSeguranca || [],
      auditoriaFuncionalidade: state.auditoriaFuncionalidade || [],
      platformTenantAudit: state.platformTenantAudit || [],
      conviteUsuario: state.conviteUsuario || [],
      tokenRecuperacaoSenha: state.tokenRecuperacaoSenha || [],
      emailDeliveryOutbox: state.emailDeliveryOutbox || [],
      eventoWebhook: state.eventoWebhook || [],
      integracaoOAuthState: state.integracaoOAuthState || [],
      emailMailboxAddress: state.emailMailboxAddress || [],
      automacaoRegra: state.automacaoRegra || [],
      automacaoExecucao: state.automacaoExecucao || [],
      automacaoAcaoJob: state.automacaoAcaoJob || [],
      operacaoDistribuidaLease: state.operacaoDistribuidaLease || [],
      workerCheckpoint: state.workerCheckpoint || [],
      aICommerceSettings: state.aICommerceSettings || [],
      configuracaoNotificacaoEmpresa: state.configuracaoNotificacaoEmpresa || [],
      vendaCanonica: state.vendaCanonica || [],
      _userCreateCalls: state._userCreateCalls || 0,
      _failOnUserCreateAt: state._failOnUserCreateAt || 0,
    };
    this.nextIds = { empresa: 1, usuario: 1, sessaoUsuario: 1, sessaoRefreshToken: 1, auditoriaSeguranca: 1, auditoriaFuncionalidade: 1, platformTenantAudit: 1, empresaFuncionalidade: 1, workerCheckpoint: 1 };
    for (const key of Object.keys(this.nextIds)) this.nextIds[key] = Math.max(0, ...this.state[key].map((row) => Number(row.id) || 0)) + 1;
    for (const key of Object.keys(this.state)) this[key] = new FakeModel(this, key);
  }

  clone() {
    const copy = new FakePrisma(JSON.parse(JSON.stringify(this.state)));
    copy.nextIds = { ...this.nextIds };
    return copy;
  }

  commitFrom(copy) {
    this.state = copy.state;
    this.nextIds = copy.nextIds;
    for (const key of Object.keys(this.state)) this[key].owner = this;
  }

  async $transaction(callback) {
    const copy = this.clone();
    const result = await callback(copy);
    this.commitFrom(copy);
    return result;
  }
}

class FakeModel {
  constructor(owner, key) {
    this.owner = owner;
    this.key = key;
  }

  rows() {
    return this.owner.state[this.key];
  }

  async findUnique(options = {}) {
    return this.findOne(options);
  }

  async findFirst(options = {}) {
    return this.findOne(options);
  }

  async findOne(options = {}) {
    const row = this.rows().find((item) => matches(item, options.where || {}));
    return row ? project(row, options.select) : null;
  }

  async findMany(options = {}) {
    return this.rows().filter((item) => matches(item, options.where || {})).map((row) => project(row, options.select));
  }

  async count(options = {}) {
    return this.rows().filter((item) => matches(item, options.where || {})).length;
  }

  async create(options = {}) {
    if (this.key === "usuario") {
      this.owner.state._userCreateCalls += 1;
      if (this.owner.state._failOnUserCreateAt && this.owner.state._userCreateCalls === this.owner.state._failOnUserCreateAt) throw new Error("INJECTED_QA_USER_FAILURE");
    }
    const data = { ...(options.data || {}) };
    if (this.key !== "metaCredential" && this.key !== "integracao" && this.key !== "canalIntegracao") {
      if (data.id === undefined && Object.hasOwn(this.owner.nextIds, this.key)) data.id = this.owner.nextIds[this.key]++;
    }
    if (this.key === "empresa") data.createdAt ||= new Date().toISOString();
    this.rows().push(data);
    return project(data, options.select);
  }

  async update(options = {}) {
    const row = this.rows().find((item) => matches(item, options.where || {}));
    if (!row) throw new Error("FAKE_NOT_FOUND");
    Object.assign(row, options.data || {});
    return project(row, options.select);
  }

  async updateMany(options = {}) {
    const matching = this.rows().filter((item) => matches(item, options.where || {}));
    for (const row of matching) Object.assign(row, options.data || {});
    return { count: matching.length };
  }

  async deleteMany(options = {}) {
    const before = this.rows().length;
    this.owner.state[this.key] = this.rows().filter((item) => !matches(item, options.where || {}));
    return { count: before - this.owner.state[this.key].length };
  }
}

function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((key) => select[key] && Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

function matches(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return expected.every((item) => matches(row, item));
    if (key === "OR") return expected.some((item) => matches(row, item));
    const value = row[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.hasOwn(expected, "not")) return value !== expected.not;
      if (Object.hasOwn(expected, "in")) return expected.in.includes(value);
      if (Object.hasOwn(expected, "equals")) return value === expected.equals;
      return matches(value || {}, expected);
    }
    return value === expected;
  });
}

async function hashedFixtureCredentials() {
  const credentials = generateTemporaryCredentials();
  const hashes = Object.fromEntries(await Promise.all(credentials.map(async (item) => [item.email, await bcrypt.hash(item.password, 4)])));
  return { credentials, hashes };
}

test("target gate rejects wrong DB/release before any write", () => {
  assert.throws(() => assertTarget({ ...BASE_ENV, QA_PROD_DB_SERVICE_ID: "wrong" }, { expectedReleaseHead: RELEASE }), (error) => error.code === "QA_PROD_TARGET_MISMATCH");
  assert.throws(() => assertTarget({ ...BASE_ENV, QA_PROD_RELEASE_HEAD: "0".repeat(40) }, { expectedReleaseHead: RELEASE }), (error) => error.code === "QA_PROD_TARGET_MISMATCH");
  assert.equal(assertTarget({ ...BASE_ENV, QA_PROD_TARGET_ENV: "production" }, { expectedReleaseHead: RELEASE, target: "production" }).target, QA_PRODUCTION_TARGET);
  assert.throws(() => assertTarget(BASE_ENV, { expectedReleaseHead: RELEASE, target: { ...QA_PRODUCTION_TARGET } }), (error) => error.code === "QA_PROD_TARGET_INVALID");
  assert.throws(() => assertTarget({ ...BASE_ENV, DATABASE_URL: "postgresql://one.invalid/db", POSTGRES_DATABASE_URL: "postgresql://two.invalid/db" }, { expectedReleaseHead: RELEASE }), (error) => error.code === "QA_PROD_DATABASE_URL_DIVERGENCE");
});

test("production apply requires external control-plane/database attestation and source parity", async () => {
  const prisma = new FakePrisma();
  const { hashes } = await hashedFixtureCredentials();
  const env = { ...BASE_ENV, QA_PROD_TARGET_ENV: "production" };
  await assert.rejects(() => provisionSyntheticQa({ prisma, env, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, target: QA_PRODUCTION_TARGET, operatorUsuarioId: 900, runId: "qa-test-run-0001" }), (error) => error.code === "QA_PROD_ATTESTATION_REQUIRED");
  assert.equal(prisma.state.empresa.length, 0);
});

test("external attestation binds effective database, worker and harness source", () => {
  const url = BASE_ENV.POSTGRES_DATABASE_URL;
  const databaseUrlSha256 = crypto.createHash("sha256").update(url, "utf8").digest("hex");
  const manifest = computeQaHarnessSourceManifest();
  const gitIdentity = computeLocalGitIdentity();
  assert.ok(gitIdentity);
  const env = {
    ...BASE_ENV,
    DATABASE_URL: url,
    POSTGRES_DATABASE_URL: "",
    QA_PROD_TARGET_ENV: "production",
    QA_PROD_BASE_PRODUCTION_RELEASE_HEAD: RELEASE,
    QA_PROD_RELEASE_HEAD: gitIdentity.releaseHead,
    QA_HARNESS_RELEASE_HEAD: gitIdentity.releaseHead,
    QA_HARNESS_GIT_TREE: gitIdentity.gitTree,
    QA_HARNESS_SOURCE_MANIFEST_SHA256: manifest,
    QA_PROD_WORKER_SERVICE_ID: QA_PRODUCTION_TARGET.workerServiceId,
    QA_PROD_ATTESTATION_HMAC_KEY: "test-attestation-key-with-sufficient-entropy",
  };
  const targetOptions = {
    expectedReleaseHead: gitIdentity.releaseHead,
    target: QA_PRODUCTION_TARGET,
    requireExplicitTarget: true,
    requireOperationalAttestation: true,
    requireHarnessParity: true,
    attestation: {
      version: "qa-prod-control-plane-attestation.v1",
      attestationType: "RAILWAY_CONTROL_PLANE_AND_DATABASE_READONLY",
      issuedBy: "external-control-plane-verifier",
      signature: "",
      controlPlaneEvidenceRef: "railway-readonly-run-0001",
      attestedAt: new Date().toISOString(),
      runId: "qa-test-run-0001",
      environment: "production",
      projectId: QA_PRODUCTION_TARGET.projectId,
      environmentId: QA_PRODUCTION_TARGET.environmentId,
      apiServiceId: QA_PRODUCTION_TARGET.apiServiceId,
      workerServiceId: QA_PRODUCTION_TARGET.workerServiceId,
      databaseServiceId: QA_PRODUCTION_TARGET.databaseServiceId,
      releaseHead: gitIdentity.releaseHead,
      baseProductionReleaseHead: RELEASE,
      databaseUrlSha256,
      databaseIdentityServiceId: QA_PRODUCTION_TARGET.databaseServiceId,
      databaseIdentityDatabaseName: "db",
      sourceManifestSha256: manifest,
      harnessReleaseHead: gitIdentity.releaseHead,
      harnessGitTree: gitIdentity.gitTree,
      apiStatus: "SUCCESS",
      workerStatus: "RUNNING",
      databaseStatus: "HEALTHY",
    },
  };
  targetOptions.attestation.signature = crypto.createHmac("sha256", env.QA_PROD_ATTESTATION_HMAC_KEY).update(canonicalAttestationPayload(targetOptions.attestation), "utf8").digest("hex");
  assert.doesNotThrow(() => assertTarget(env, targetOptions));
  const mismatchedDatabaseName = { ...targetOptions, attestation: { ...targetOptions.attestation, databaseIdentityDatabaseName: "other_db" } };
  mismatchedDatabaseName.attestation.signature = crypto.createHmac("sha256", env.QA_PROD_ATTESTATION_HMAC_KEY).update(canonicalAttestationPayload(mismatchedDatabaseName.attestation), "utf8").digest("hex");
  assert.throws(() => assertTarget(env, mismatchedDatabaseName), (error) => error.code === "QA_PROD_DATABASE_NAME_ATTESTATION_MISMATCH");
  assert.throws(() => assertTarget({ ...env, QA_PROD_RUN_ID: "qa-other-run-0001" }, targetOptions), (error) => error.code === "QA_PROD_ATTESTATION_RUN_MISMATCH");
  const alteredSource = { ...targetOptions, attestation: { ...targetOptions.attestation, sourceManifestSha256: "0".repeat(64) } };
  alteredSource.attestation.signature = crypto.createHmac("sha256", env.QA_PROD_ATTESTATION_HMAC_KEY).update(canonicalAttestationPayload(alteredSource.attestation), "utf8").digest("hex");
  assert.throws(() => assertTarget({ ...env, QA_HARNESS_SOURCE_MANIFEST_SHA256: "0".repeat(64) }, alteredSource), (error) => error.code === "QA_PROD_HARNESS_SOURCE_MANIFEST_MISMATCH");
});

test("status distinguishes absent, ready and mixed states instead of claiming passed", async () => {
  const prisma = new FakePrisma();
  const absent = await inspectQaState({ prisma, env: BASE_ENV, expectedReleaseHead: RELEASE, target: QA_PRODUCTION_TARGET, ...TEST_OPTIONS });
  assert.equal(absent.status, "ABSENT_SAFE");
  const { hashes } = await hashedFixtureCredentials();
  await provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  const ready = await inspectQaState({ prisma, env: BASE_ENV, expectedReleaseHead: RELEASE, target: QA_PRODUCTION_TARGET, ...TEST_OPTIONS });
  assert.equal(ready.status, "READY");
  prisma.state.empresa[0].ativo = false;
  prisma.state.usuario.filter((user) => user.empresaId === prisma.state.empresa[0].id).forEach((user) => { user.ativo = false; });
  prisma.state.empresaFuncionalidade.filter((feature) => feature.empresaId === prisma.state.empresa[0].id).forEach((feature) => { feature.habilitada = false; });
  const mixed = await inspectQaState({ prisma, env: BASE_ENV, expectedReleaseHead: RELEASE, target: QA_PRODUCTION_TARGET, ...TEST_OPTIONS });
  assert.equal(mixed.status, "MIXED");
});

test("database lease serializes bootstrap/revoke and expires only by TTL", async () => {
  const prisma = new FakePrisma();
  const first = await acquireQaDatabaseLease(prisma, { runId: "qa-lease-run-0001", ownerToken: "owner-a", ttlMs: 60_000 });
  assert.equal(first.owner, "qa-lease-run-0001");
  await assert.rejects(() => acquireQaDatabaseLease(prisma, { runId: "qa-lease-run-0001", ownerToken: "owner-b", ttlMs: 60_000 }), (error) => error.code === "QA_PROD_DATABASE_LOCK_HELD");
  await assert.rejects(() => acquireQaDatabaseLease(prisma, { runId: "qa-lease-run-0002", ttlMs: 60_000 }), (error) => error.code === "QA_PROD_DATABASE_LOCK_HELD");
  assert.equal(await releaseQaDatabaseLease(prisma, { runId: "qa-lease-run-0002", ownerToken: "owner-b" }), false);
  assert.equal(await releaseQaDatabaseLease(prisma, { runId: "qa-lease-run-0001", ownerToken: "owner-a" }), true);
  const second = await acquireQaDatabaseLease(prisma, { runId: "qa-lease-run-0002", ownerToken: "owner-b", ttlMs: 60_000 });
  assert.equal(second.owner, "qa-lease-run-0002");
  assert.equal(await releaseQaDatabaseLease(prisma, { runId: "qa-lease-run-0002", ownerToken: "owner-b" }), true);
});

test("production prewrite gate rejects unbound backup variables", () => {
  const env = { ...BASE_ENV, QA_PROD_PREWRITE_BACKUP_SHA256: "a".repeat(64), QA_PROD_PREWRITE_BACKUP_RUN_ID: "qa-test-run-0001", QA_PROD_PREWRITE_BACKUP_TARGET_DB_SERVICE_ID: QA_PRODUCTION_TARGET.databaseServiceId, QA_PROD_PREWRITE_RESTORE_VERIFIED: "true" };
  assert.throws(() => assertPrewriteSafety({ env, target: QA_PRODUCTION_TARGET, runId: "qa-test-run-0001" }), (error) => error.code === "QA_PROD_PREWRITE_ATTESTATION_INVALID");
});

test("dry-run is read-only and apply creates exactly the allowlisted identities", async () => {
  const prisma = new FakePrisma();
  const dry = await provisionSyntheticQa({ prisma, env: BASE_ENV, apply: false, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  assert.equal(dry.mode, "read-only");
  assert.equal(prisma.state.empresa.length, 0);
  const { hashes } = await hashedFixtureCredentials();
  const applied = await provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  assert.equal(applied.tenants.length, 2);
  assert.equal(prisma.state.empresa.length, 2);
  assert.equal(prisma.state.usuario.length, 5);
  assert.equal(prisma.state.auditoriaSeguranca.length, 7);
  assert.equal(prisma.state.auditoriaFuncionalidade.length, 2);
  assert.equal(prisma.state.platformTenantAudit.length, 2);
  const hashesBeforeRetry = prisma.state.usuario.map((user) => user.senhaHash);
  const second = await provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  assert.deepEqual(second.tenants.map((item) => item.tenant.id), applied.tenants.map((item) => item.tenant.id));
  assert.equal(prisma.state.empresa.length, 2);
  assert.equal(prisma.state.usuario.length, 5);
  assert.equal(second.mode, "noop");
  assert.deepEqual(prisma.state.usuario.map((user) => user.senhaHash), hashesBeforeRetry);
  assert.equal(prisma.state.auditoriaSeguranca.length, 7);
});

test("unexpected reserved tenant and provider state fail closed without commit", async () => {
  const occupied = new FakePrisma({ empresa: [{ id: 1, nome: "Real", slug: QA_TENANTS[0].slug, ativo: true }] });
  const { hashes } = await hashedFixtureCredentials();
  await assert.rejects(() => provisionSyntheticQa({ prisma: occupied, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS }), (error) => error.code === "QA_PROD_TENANT_IDENTITY_MISMATCH");
  assert.equal(occupied.state.empresa.length, 1);

  const provider = new FakePrisma({
    empresa: [{ id: 1, nome: QA_TENANTS[0].name, slug: QA_TENANTS[0].slug, ativo: false }],
    usuario: QA_TENANTS[0].users.map((user, index) => ({ id: index + 1, empresaId: 1, nome: user.name, email: user.email, papel: user.role, ativo: false })),
    empresaFuncionalidade: [{ id: 1, empresaId: 1, chave: "NEGOCIOS_KANBAN", habilitada: false }],
    metaCredential: [{ empresaId: 1, status: "ATIVA", removedAt: null }],
  });
  let observedProviderError;
  await assert.rejects(() => provisionSyntheticQa({ prisma: provider, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS }), (error) => { observedProviderError = error; return true; });
  assert.equal(observedProviderError.code, "QA_PROD_PROVIDER_STATE_NOT_ISOLATED", "UNEXPECTED_CODE_" + String(observedProviderError.code));
  assert.equal(provider.state.usuario.length, 3);
});

test("transaction rollback leaves no partial tenant when a later identity fails", async () => {
  const prisma = new FakePrisma({ _failOnUserCreateAt: 4 });
  const { hashes } = await hashedFixtureCredentials();
  await assert.rejects(() => provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS }), /INJECTED_QA_USER_FAILURE/);
  assert.equal(prisma.state.empresa.length, 0);
  assert.equal(prisma.state.usuario.length, 0);
});

test("revoke deactivates QA identities/tenants and revokes sessions without touching sales", async () => {
  const prisma = new FakePrisma();
  const { hashes } = await hashedFixtureCredentials();
  const applied = await provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  const firstUser = prisma.state.usuario[0];
  prisma.state.sessaoUsuario.push({ id: 1, empresaId: firstUser.empresaId, usuarioId: firstUser.id, revogadoEm: null });
  prisma.state.sessaoRefreshToken.push({ id: 1, empresaId: firstUser.empresaId, sessaoId: 1, revogadoEm: null });
  prisma.state.vendaCanonica = [{ id: 99, empresaId: firstUser.empresaId, status: "ACTIVE" }];
  prisma.state.conviteUsuario.push({ id: "invite-1", empresaId: firstUser.empresaId, revogadoEm: null, aceitoEm: null });
  prisma.state.tokenRecuperacaoSenha.push({ id: "reset-1", empresaId: firstUser.empresaId, revogadoEm: null, usadoEm: null });
  prisma.state.emailDeliveryOutbox.push({ id: "outbox-1", empresaId: firstUser.empresaId, status: "PENDING", payloadCiphertext: "encrypted-email", leaseOwner: "worker", leaseToken: "lease-token", leaseExpiresAt: new Date().toISOString() });
  prisma.state.eventoWebhook.push({ id: 1, empresaId: firstUser.empresaId, statusProcessamento: "PROCESSANDO", payloadJson: "{secret}", leaseOwner: "worker", leaseExpiresAt: new Date().toISOString(), nextAttemptAt: new Date().toISOString() });
  prisma.state.metaCredential.push({ id: 1, empresaId: firstUser.empresaId, status: "ATIVA", removedAt: null, ciphertext: "encrypted-qa-secret" });
  prisma.state.integracao.push({ id: 1, empresaId: firstUser.empresaId, ativo: true, status: "ATIVA", credenciaisCriptografadas: "cipher" });
  prisma.state.canalIntegracao.push({ id: 1, empresaId: firstUser.empresaId, ativo: true, status: "ATIVO", accessTokenRef: "ref" });
  prisma.state.integracaoOAuthState.push({ id: 1, empresaId: firstUser.empresaId, usedAt: null });
  prisma.state.automacaoRegra.push({ id: 1, empresaId: firstUser.empresaId, ativa: true });
  prisma.state.automacaoExecucao.push({ id: 1, empresaId: firstUser.empresaId, status: "PENDENTE" });
  prisma.state.automacaoAcaoJob.push({ id: 1, empresaId: firstUser.empresaId, status: "PENDENTE", nextAttemptAt: new Date().toISOString(), leaseOwner: "worker", leaseExpiresAt: new Date().toISOString(), resultadoJson: "{secret}" });
  const revoked = await revokeSyntheticQa({ prisma, env: BASE_ENV, confirmation: REVOKE_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  assert.equal(revoked.tenants.length, 2);
  assert.equal(prisma.state.empresa.every((tenant) => tenant.ativo === false), true);
  assert.equal(prisma.state.usuario.every((user) => user.ativo === false), true);
  assert.equal(prisma.state.sessaoUsuario.every((session) => session.revogadoEm !== null), true);
  assert.equal(prisma.state.sessaoRefreshToken.every((token) => token.revogadoEm !== null), true);
  assert.equal(prisma.state.vendaCanonica.length, 1);
  assert.equal(prisma.state.empresaFuncionalidade.every((feature) => feature.habilitada === false), true);
  assert.equal(prisma.state.conviteUsuario.every((invite) => invite.revogadoEm !== null), true);
  assert.equal(prisma.state.tokenRecuperacaoSenha.every((token) => token.revogadoEm !== null), true);
  assert.equal(prisma.state.emailDeliveryOutbox.every((outbox) => outbox.status === "CANCELLED"), true);
  assert.equal(prisma.state.emailDeliveryOutbox.every((outbox) => outbox.payloadCiphertext === null && outbox.leaseOwner === null && outbox.leaseToken === null && outbox.leaseExpiresAt === null), true);
  assert.equal(prisma.state.eventoWebhook.every((event) => event.payloadJson === null && event.leaseOwner === null && event.leaseExpiresAt === null && event.nextAttemptAt === null), true);
  assert.equal(prisma.state.metaCredential.every((credential) => credential.status === "REMOVIDA" && credential.ciphertext === ""), true);
  assert.equal(prisma.state.integracao.every((integration) => integration.ativo === false && integration.credenciaisCriptografadas === null), true);
  assert.equal(prisma.state.canalIntegracao.every((channel) => channel.ativo === false && channel.accessTokenRef === null), true);
  assert.equal(prisma.state.integracaoOAuthState.every((state) => state.usedAt !== null), true);
  assert.equal(prisma.state.automacaoAcaoJob.every((job) => job.leaseOwner === null && job.leaseExpiresAt === null && job.nextAttemptAt === null && job.resultadoJson === null), true);
  assert.equal(applied.tenants.length, 2);
});

test("revoke rejects an incomplete allowlist before any quarantine write", async () => {
  const prisma = new FakePrisma({ empresa: [{ id: 1, nome: QA_TENANTS[0].name, slug: QA_TENANTS[0].slug, ativo: true }] });
  await assert.rejects(() => revokeSyntheticQa({ prisma, env: BASE_ENV, confirmation: REVOKE_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS }), (error) => error.code === "QA_PROD_STATE_INVALID");
  assert.equal(prisma.state.empresa[0].ativo, true);
  assert.equal(prisma.state.sessaoUsuario.length, 0);
});

test("credential gate accepts only bcrypt hashes and no generated credential is serialized by result", async () => {
  const { hashes } = await hashedFixtureCredentials();
  assert.doesNotThrow(() => assertCredentials(hashes));
  const invalid = { ...hashes, [Object.keys(hashes)[0]]: "plaintext" };
  assert.throws(() => assertCredentials(invalid), (error) => error.code === "QA_PROD_CREDENTIAL_HASH_INVALID");
});

test("credential bundle path produced by bootstrap is accepted by revoke", () => {
  const generated = defaultCredentialsPath("qa-path-test-0001");
  assert.equal(assertCredentialPath(generated), generated);
  assert.throws(() => assertCredentialPath(path.join(os.tmpdir(), "nested", "qa-path-test-0001-credentials", "credentials.json")), /DIRECT_TEMP_CHILD/);
  const parsed = parseRevokeArgs(["--confirm=" + REVOKE_CONFIRMATION, "--target=production", "--credentials-file=" + generated, "--run-id=qa-path-test-0001"]);
  assert.equal(parsed.credentialsFile, generated);
});

test("revoke validates the complete credential bundle allowlist before deleting it", () => {
  const runId = "qa-bundle-test-0001";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-bundle-"));
  const credentialsFile = path.join(dir, "credentials.json");
  const manifestFile = path.join(dir, "manifest.json");
  const payload = {
    runId,
    target: "production",
    tenants: QA_TENANTS.map((tenant) => ({
      key: tenant.key,
      slug: tenant.slug,
      users: tenant.users.map((user) => ({ email: user.email, papel: user.role, password: "p".repeat(32) })),
    })),
  };
  fs.writeFileSync(credentialsFile, JSON.stringify(payload));
  fs.writeFileSync(manifestFile, JSON.stringify({ runId, target: "production", credentialsFileName: "credentials.json", status: "READY" }));
  try {
    assert.doesNotThrow(() => validateCredentialBundle(credentialsFile, runId, "production"));
    const tampered = { ...payload, tenants: payload.tenants.map((tenant, index) => index === 0 ? { ...tenant, slug: "qa-prod-canonical-wrong" } : tenant) };
    fs.writeFileSync(credentialsFile, JSON.stringify(tampered));
    assert.throws(() => validateCredentialBundle(credentialsFile, runId, "production"), /QA_CREDENTIAL_BUNDLE_MISMATCH/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("emergency cleanup discovers an older run bundle and rejects orphaned artifacts", () => {
  const runId = "qa-old-run-test-0001";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-old-run-"));
  const credentialsFile = path.join(dir, "credentials.json");
  const manifestFile = path.join(dir, "manifest.json");
  const payload = {
    runId,
    target: "production",
    tenants: QA_TENANTS.map((tenant) => ({ key: tenant.key, slug: tenant.slug, users: tenant.users.map((user) => ({ email: user.email, papel: user.role, password: "q".repeat(32) })) })),
  };
  fs.writeFileSync(credentialsFile, JSON.stringify(payload));
  fs.writeFileSync(manifestFile, JSON.stringify({ runId, target: "production", credentialsFileName: "credentials.json", status: "READY" }));
  let orphanDir;
  try {
    assert.equal(listCredentialBundles("production").some((bundle) => bundle.runId === runId), true);
    orphanDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-orphan-"));
    fs.writeFileSync(path.join(orphanDir, "credentials.json"), "orphan");
    assert.throws(() => listCredentialBundles("production"), /QA_CREDENTIAL_BUNDLE_ORPHANED/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (orphanDir) fs.rmSync(orphanDir, { recursive: true, force: true });
  }
});

test("emergency revoke requires a distinct confirmation and does not require credentials", () => {
  const parsed = parseRevokeArgs(["--emergency", "--confirm=" + EMERGENCY_REVOKE_CONFIRMATION, "--target=production", "--run-id=qa-emergency-test-0001"]);
  assert.equal(parsed.emergency, true);
  assert.equal(parsed.credentialsFile, "");
  assert.throws(() => parseRevokeArgs(["--emergency", "--confirm=" + REVOKE_CONFIRMATION, "--target=production", "--run-id=qa-emergency-test-0001"]), /QA_PROD_REVOKE_CONFIRMATION_REQUIRED/);
});

test("emergency revoke uses the same transactional quarantine without a credential bundle", async () => {
  const prisma = new FakePrisma();
  const { hashes } = await hashedFixtureCredentials();
  await provisionSyntheticQa({ prisma, env: BASE_ENV, passwordHashes: hashes, apply: true, confirmation: APPLY_CONFIRMATION, expectedReleaseHead: RELEASE, ...TEST_OPTIONS });
  const revoked = await revokeSyntheticQa({ prisma, env: BASE_ENV, confirmation: EMERGENCY_REVOKE_CONFIRMATION, expectedReleaseHead: RELEASE, emergency: true, ...TEST_OPTIONS });
  assert.equal(revoked.mode, "revoke");
  assert.equal(revoked.status, "REVOKED");
  assert.equal(prisma.state.usuario.every((user) => user.ativo === false), true);
});
