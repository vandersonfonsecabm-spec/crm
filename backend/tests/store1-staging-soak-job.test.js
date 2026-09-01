"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { SOURCE_MANIFEST_VERSION } = require("../src/runtime-fingerprint");
const { createDistributedOperationLease } = require("../src/shared/distributedOperationLease");

const {
  EXPECTED,
  assertLocalLauncherTarget,
  assertSoakJobTarget,
  cleanupSyntheticUsers,
  createLocalRailwayRestartHook,
  createTenantJobMetricsProvider,
  loadApiStagingMetadata,
  loadPublicStagingDatabaseUrl,
  provisionSyntheticUsers,
  recoverAbandonedSyntheticUsers,
  resolveRailwayCliScript,
  runStagingSoakJob,
} = require("../scripts/run-store1-staging-soak-job.cjs");

function jobEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: "11111111-2222-4333-8444-555555555555",
    STORE1_SOAK_RUNNER_SERVICE_ID: "11111111-2222-4333-8444-555555555555",
    STORE1_SOAK_API_SERVICE_ID: EXPECTED.apiServiceId,
    STORE1_SOAK_DATABASE_SERVICE_ID: EXPECTED.databaseServiceId,
    POSTGRES_DATABASE_URL: `postgresql://user:pass@${EXPECTED.databaseHost}:5432/railway`,
    DATABASE_URL: `postgresql://user:pass@${EXPECTED.databaseHost}:5432/railway`,
    STORE1_SOAK_TARGET_CONFIRM: "store1-staging-only",
    STORE1_SOAK_TENANT_ID: "3",
    STORE1_SOAK_TENANT_SLUG: "store-1",
    STORE1_SOAK_BASE_URL: "https://crm-ga3-bundle-staging.vercel.app",
    STORE1_SOAK_ALLOWED_HOST: "crm-ga3-bundle-staging.vercel.app",
    STORE1_SOAK_SOURCE_SHA: "a".repeat(40),
    STORE1_SOAK_SOURCE_MANIFEST_VERSION: SOURCE_MANIFEST_VERSION,
    STORE1_SOAK_SOURCE_MANIFEST_SHA256: "b".repeat(64),
    STORE1_SOAK_PROBE_TOKEN: "p".repeat(32),
    STORE1_SOAK_JOBS_PATH: "/api/test/jobs",
    STORE1_SOAK_RESTART_PATH: "/api/test/restart",
    ...overrides,
  };
}

function localEnv(overrides = {}) {
  const env = jobEnv();
  delete env.RAILWAY_PROJECT_ID;
  delete env.RAILWAY_ENVIRONMENT_ID;
  delete env.RAILWAY_SERVICE_ID;
  delete env.STORE1_SOAK_RUNNER_SERVICE_ID;
  delete env.POSTGRES_DATABASE_URL;
  delete env.DATABASE_URL;
  return {
    ...env,
    STORE1_SOAK_EXECUTION_MODE: "local-launcher",
    STORE1_SOAK_PROJECT_ID: EXPECTED.projectId,
    STORE1_SOAK_ENVIRONMENT_ID: EXPECTED.environmentId,
    ...overrides,
  };
}

function fakePrisma() {
  const state = {
    users: [{ id: 99, empresaId: 3, email: "permanent@example.test", ativo: true, papel: "ADMIN" }],
    sessions: [],
    refreshTokens: [],
    audits: [],
    nextUserId: 100,
  };
  const matchesIn = (value, condition) => !condition?.in || condition.in.includes(value);
  const tx = {
    empresa: { async findFirst({ where }) { return where.id === 3 && where.slug === "store-1" && where.ativo ? { id: 3, slug: "store-1", ativo: true } : null; } },
    usuario: {
      async create({ data }) {
        const row = { id: state.nextUserId++, ...data };
        state.users.push(row);
        return { id: row.id, empresaId: row.empresaId, email: row.email, papel: row.papel };
      },
      async findMany({ where }) {
        return state.users.filter((row) => row.empresaId === where.empresaId
          && matchesIn(row.id, where.id)
          && (!where.email?.startsWith || row.email.startsWith(where.email.startsWith))
          && (!where.email?.endsWith || row.email.endsWith(where.email.endsWith)))
          .map((row) => ({ id: row.id, empresaId: row.empresaId, email: row.email, nome: row.nome, papel: row.papel, ativo: row.ativo }));
      },
      async count({ where }) { return state.users.filter((row) => row.empresaId === where.empresaId && matchesIn(row.id, where.id) && (where.ativo === undefined || row.ativo === where.ativo)).length; },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of state.users) if (row.empresaId === where.empresaId && matchesIn(row.id, where.id) && (where.ativo === undefined || row.ativo === where.ativo)) { Object.assign(row, data); count += 1; }
        return { count };
      },
    },
    auditoriaSeguranca: { async create({ data }) { state.audits.push(data); return data; } },
    sessaoUsuario: {
      async findMany({ where }) { return state.sessions.filter((row) => row.empresaId === where.empresaId && matchesIn(row.usuarioId, where.usuarioId) && row.revogadoEm === null).map(({ id }) => ({ id })); },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of state.sessions) if (row.empresaId === where.empresaId && matchesIn(row.id, where.id) && row.revogadoEm === null) { Object.assign(row, data); count += 1; }
        return { count };
      },
      async count({ where }) { return state.sessions.filter((row) => row.empresaId === where.empresaId && matchesIn(row.usuarioId, where.usuarioId) && matchesIn(row.id, where.id) && (where.revogadoEm === undefined || row.revogadoEm === where.revogadoEm)).length; },
    },
    sessaoRefreshToken: {
      async findMany({ where }) { return state.refreshTokens.filter((row) => row.empresaId === where.empresaId && matchesIn(row.sessaoId, where.sessaoId) && row.revogadoEm === null).map(({ id }) => ({ id })); },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of state.refreshTokens) if (row.empresaId === where.empresaId && matchesIn(row.sessaoId, where.sessaoId) && row.revogadoEm === null) { Object.assign(row, data); count += 1; }
        return { count };
      },
      async count({ where }) { return state.refreshTokens.filter((row) => row.empresaId === where.empresaId && matchesIn(row.sessaoId, where.sessaoId) && (where.revogadoEm === undefined || row.revogadoEm === where.revogadoEm)).length; },
    },
  };
  const prisma = { ...tx, async $transaction(callback) { return callback(tx); }, async $disconnect() {} };
  return { prisma, state };
}

function passLeaseManager() {
  return { async withLease(_key, handler) { return handler({ assertOwned() {} }); } };
}

test("job exige IDs exatos, banco de staging e servico separado da API", () => {
  const target = assertSoakJobTarget(jobEnv());
  assert.equal(target.tenantId, 3);
  assert.throws(() => assertSoakJobTarget(jobEnv({ RAILWAY_ENVIRONMENT_ID: "production" })), (error) => error.code === "SOAK_JOB_TARGET_MISMATCH");
  assert.throws(() => assertSoakJobTarget(jobEnv({ RAILWAY_SERVICE_ID: EXPECTED.apiServiceId, STORE1_SOAK_RUNNER_SERVICE_ID: EXPECTED.apiServiceId })), (error) => error.code === "SOAK_JOB_SEPARATION_REQUIRED");
  assert.throws(() => assertSoakJobTarget(jobEnv({ POSTGRES_DATABASE_URL: "postgresql://x:y@production-db.railway.internal/db" })), (error) => error.code === "SOAK_JOB_DATABASE_DIVERGENCE");
  assert.throws(() => assertSoakJobTarget(jobEnv({ POSTGRES_DATABASE_URL: "postgresql://x:y@production-db.railway.internal/db", DATABASE_URL: "postgresql://x:y@production-db.railway.internal/db" })), (error) => error.code === "SOAK_JOB_DATABASE_MISMATCH");
});

test("launcher local usa IDs explícitos sem fingir RAILWAY_SERVICE_ID", () => {
  assert.deepEqual(assertLocalLauncherTarget(localEnv()), { tenantId: 3, tenantSlug: "store-1" });
  assert.throws(() => assertLocalLauncherTarget(localEnv({ RAILWAY_SERVICE_ID: "fake" })), (error) => error.code === "SOAK_LOCAL_CONTEXT_INVALID");
  assert.throws(() => assertLocalLauncherTarget(localEnv({ STORE1_SOAK_API_SERVICE_ID: "wrong" })), (error) => error.code === "SOAK_LOCAL_TARGET_MISMATCH");
});

test("Railway CLI resolve o JS oficial para execução direta pelo Node", () => {
  const expected = "C:\\Users\\qa\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.js";
  const fsImpl = { existsSync(value) { return value === expected; }, statSync() { return { isFile() { return true; } }; } };
  assert.equal(resolveRailwayCliScript({ env: { APPDATA: "C:\\Users\\qa\\AppData\\Roaming" }, fsImpl }), expected);
  assert.throws(() => resolveRailwayCliScript({ env: {}, fsImpl }), (error) => error.code === "SOAK_RAILWAY_CLI_NOT_FOUND");
});

test("URL pública do banco só é aceita após identidade Railway exata", () => {
  const url = loadPublicStagingDatabaseUrl({ runRailway: () => ({
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: EXPECTED.databaseServiceId,
    DATABASE_URL: `postgresql://user:secret@${EXPECTED.databaseHost}:5432/railway?schema=public`,
    RAILWAY_TCP_PROXY_DOMAIN: "roundhouse.proxy.rlwy.net",
    RAILWAY_TCP_PROXY_PORT: "12345",
    RAILWAY_TCP_APPLICATION_PORT: "5432",
  }) });
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "roundhouse.proxy.rlwy.net");
  assert.equal(parsed.port, "12345");
  assert.equal(parsed.username, "user");
  assert.equal(parsed.password, "secret");
  assert.equal(parsed.pathname, "/railway");
  assert.equal(parsed.searchParams.get("schema"), "public");
  assert.throws(() => loadPublicStagingDatabaseUrl({ runRailway: () => ({
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: "wrong",
    DATABASE_URL: `postgresql://user:secret@${EXPECTED.databaseHost}:5432/railway`,
    RAILWAY_TCP_PROXY_DOMAIN: "roundhouse.proxy.rlwy.net",
    RAILWAY_TCP_PROXY_PORT: "12345",
    RAILWAY_TCP_APPLICATION_PORT: "5432",
  }) }), (error) => error.code === "SOAK_DATABASE_IDENTITY_MISMATCH");
  assert.throws(() => loadPublicStagingDatabaseUrl({ runRailway: () => ({
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: EXPECTED.databaseServiceId,
    DATABASE_URL: `postgresql://user:secret@${EXPECTED.databaseHost}:5432/railway`,
    RAILWAY_TCP_PROXY_DOMAIN: "evil.example.com",
    RAILWAY_TCP_PROXY_PORT: "12345",
    RAILWAY_TCP_APPLICATION_PORT: "5432",
  }) }), (error) => error.code === "SOAK_DATABASE_PUBLIC_URL_INVALID");
  assert.throws(() => loadPublicStagingDatabaseUrl({ runRailway: () => ({
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: EXPECTED.databaseServiceId,
    DATABASE_URL: `postgresql://user:secret@${EXPECTED.databaseHost}:5432/railway`,
    RAILWAY_TCP_PROXY_DOMAIN: "roundhouse.proxy.rlwy.net",
    RAILWAY_TCP_APPLICATION_PORT: "5432",
  }) }), (error) => error.code === "SOAK_DATABASE_PUBLIC_URL_INVALID");
  assert.throws(() => loadPublicStagingDatabaseUrl({ runRailway: () => ({
    RAILWAY_PROJECT_ID: EXPECTED.projectId,
    RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId,
    RAILWAY_SERVICE_ID: EXPECTED.databaseServiceId,
    DATABASE_URL: `postgresql://user:secret@${EXPECTED.databaseHost}:5432/railway`,
    RAILWAY_TCP_PROXY_DOMAIN: "roundhouse.proxy.rlwy.net",
    RAILWAY_TCP_PROXY_PORT: "12345",
    RAILWAY_TCP_APPLICATION_PORT: "6432",
  }) }), (error) => error.code === "SOAK_DATABASE_PUBLIC_URL_INVALID");
});

test("probe token vem somente de metadata da API staging exata", () => {
  const token = "z".repeat(32);
  assert.deepEqual(loadApiStagingMetadata({ runRailway: () => ({ RAILWAY_PROJECT_ID: EXPECTED.projectId, RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId, RAILWAY_SERVICE_ID: EXPECTED.apiServiceId, STORE1_SOAK_PROBE_TOKEN: token }) }), { probeToken: token });
  assert.throws(() => loadApiStagingMetadata({ runRailway: () => ({ RAILWAY_PROJECT_ID: EXPECTED.projectId, RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId, RAILWAY_SERVICE_ID: EXPECTED.apiServiceId }) }), (error) => error.code === "SOAK_API_METADATA_MISMATCH");
  assert.throws(() => loadApiStagingMetadata({ runRailway: () => ({ RAILWAY_PROJECT_ID: EXPECTED.projectId, RAILWAY_ENVIRONMENT_ID: EXPECTED.environmentId, RAILWAY_SERVICE_ID: "wrong", STORE1_SOAK_PROBE_TOKEN: token }) }), (error) => error.code === "SOAK_API_METADATA_MISMATCH");
});

test("provider Prisma de jobs é tenant-scoped e calcula stuck/retries/duplicates", async () => {
  let whereSeen;
  const now = new Date("2026-08-27T18:00:00.000Z");
  const provider = createTenantJobMetricsProvider({
    tenantId: 3,
    now: () => now,
    prisma: { automacaoAcaoJob: { async findMany({ where }) {
      whereSeen = where;
      return [
        { status: "PENDENTE", tentativas: 0, actionKey: "a", leaseExpiresAt: null },
        { status: "PROCESSANDO", tentativas: 2, actionKey: "b", leaseExpiresAt: new Date(now.getTime() - 1) },
        { status: "CONCLUIDO", tentativas: 1, actionKey: "c", leaseExpiresAt: null },
        { status: "FALHOU", tentativas: 3, actionKey: "d", leaseExpiresAt: null },
        { status: "CANCELADO", tentativas: 1, actionKey: "d", leaseExpiresAt: null },
      ];
    } } },
  });
  assert.deepEqual(await provider(), { total: 5, pending: 1, running: 1, succeeded: 1, failed: 1, cancelled: 1, stuck: 1, retries: 3, duplicates: 1 });
  assert.deepEqual(whereSeen, { empresaId: 3 });
  const invalid = createTenantJobMetricsProvider({ tenantId: 3, prisma: { automacaoAcaoJob: { async findMany() { return [{ status: "PENDENTE", tentativas: "1", actionKey: "x", leaseExpiresAt: null }]; } } } });
  await assert.rejects(invalid(), (error) => error.code === "SOAK_JOB_METRICS_ROW_INVALID");
});

test("restart hook usa somente API staging exata, espera SUCCESS e revalida probes", async () => {
  const calls = [];
  let deploymentPolls = 0;
  const config = {
    target: new URL("https://crm-ga3-bundle-staging.vercel.app"),
    healthPath: "/api/health",
    readyPath: "/api/ready",
    fingerprintPath: "/api/runtime-fingerprint",
    probeToken: "p".repeat(32),
    sourceManifestVersion: SOURCE_MANIFEST_VERSION,
    sourceManifestSha256: "b".repeat(64),
    timeoutMs: 1000,
  };
  const hook = createLocalRailwayRestartHook({
    config,
    sleep: async () => {},
    runRailway(args) {
      calls.push(args);
      if (args[0] === "redeploy") return { id: "new-deployment" };
      deploymentPolls += 1;
      if (deploymentPolls === 1) return [{ id: "old-deployment", status: "SUCCESS" }];
      return [{ id: "new-deployment", status: deploymentPolls >= 3 ? "SUCCESS" : "DEPLOYING" }];
    },
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("runtime-fingerprint")) return { status: 200, async json() { return { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, trackedProviderConnections: false, outboundEnabled: false, sourceManifestSha256: "b".repeat(64) }; } };
      return { status: 200 };
    },
  });
  const result = await hook();
  assert.equal(result.status, "SUCCESS");
  const redeploy = calls.find((args) => args[0] === "redeploy");
  assert.ok(redeploy.includes(EXPECTED.projectId));
  assert.ok(redeploy.includes(EXPECTED.environmentId));
  assert.ok(redeploy.includes(EXPECTED.apiServiceId));
  assert.equal(calls.some((args) => args.includes("production")), false);
  assert.throws(() => createLocalRailwayRestartHook({}), (error) => error.code === "SOAK_RESTART_CONFIG_INVALID");
});

test("restart hook falha fechado quando novo deploy falha", async () => {
  let lists = 0;
  const config = { target: new URL("https://crm-ga3-bundle-staging.vercel.app"), healthPath: "/api/health", readyPath: "/api/ready", fingerprintPath: "/api/runtime-fingerprint", probeToken: "p".repeat(32), timeoutMs: 1000 };
  const hook = createLocalRailwayRestartHook({
    config,
    sleep: async () => {},
    runRailway(args) {
      if (args[0] === "redeploy") return { id: "failed-deployment" };
      lists += 1;
      return lists === 1 ? [{ id: "old", status: "SUCCESS" }] : [{ id: "failed-deployment", status: "FAILED" }];
    },
    fetchImpl: async () => ({ status: 200 }),
  });
  await assert.rejects(hook(), (error) => error.code === "SOAK_RESTART_DEPLOY_FAILED");
});

test("provisiona exatamente tres roles example.test e cleanup preserva conta permanente", async () => {
  const { prisma, state } = fakePrisma();
  const identities = await provisionSyntheticUsers({
    prisma,
    bcrypt: { async hash(value) { return `hash:${value.length}`; } },
    tenant: { id: 3 },
    runId: "run-fixture",
    randomBytes: () => Buffer.from("01234567890123456789012345678901"),
  });
  assert.deepEqual(identities.map((item) => item.role), ["ADMIN", "GERENTE", "VENDEDOR"]);
  assert.equal(identities.every((item) => item.email.endsWith("@example.test") && item.password.length >= 16), true);
  for (const identity of identities) {
    const sessionId = `session-${identity.userId}`;
    state.sessions.push({ id: sessionId, empresaId: 3, usuarioId: identity.userId, revogadoEm: null });
    state.refreshTokens.push({ id: `refresh-${identity.userId}`, empresaId: 3, sessaoId: sessionId, revogadoEm: null });
  }
  const cleanup = await cleanupSyntheticUsers({ prisma, tenantId: 3, identities, now: new Date("2026-08-27T18:00:00.000Z") });
  assert.deepEqual(cleanup, { usersDeactivated: 3, sessionsRevoked: 3, refreshTokensRevoked: 3, finalStateVerified: true, idempotent: false });
  assert.equal(state.users.find((item) => item.id === 99).ativo, true);
  assert.equal(state.users.filter((item) => item.id >= 100).every((item) => item.ativo === false), true);
  assert.deepEqual(await cleanupSyntheticUsers({ prisma, tenantId: 3, identities }), { usersDeactivated: 0, sessionsRevoked: 0, refreshTokensRevoked: 0, finalStateVerified: true, idempotent: true });
});

test("cleanup parcial nunca pode ser classificado como sucesso", async () => {
  const { prisma, state } = fakePrisma();
  const identities = await provisionSyntheticUsers({
    prisma,
    bcrypt: { async hash(value) { return `hash:${value.length}`; } },
    tenant: { id: 3 },
    runId: "partial-cleanup",
    randomBytes: () => Buffer.from("01234567890123456789012345678901"),
  });
  state.users.find((item) => item.id === identities[0].userId).ativo = false;
  await assert.rejects(
    cleanupSyntheticUsers({ prisma, tenantId: 3, identities }),
    (error) => error.code === "SOAK_JOB_CLEANUP_RECOVERED_PARTIAL",
  );
  assert.equal(state.users.find((item) => item.id === 99).ativo, true);
  assert.equal(state.users.filter((item) => item.id >= 100).every((item) => item.ativo === false), true);
});

test("recuperacao duravel desativa somente grupos abandonados completos", async () => {
  const { prisma, state } = fakePrisma();
  await provisionSyntheticUsers({ prisma, bcrypt: { async hash(value) { return `hash:${value.length}`; } }, tenant: { id: 3 }, runId: "abandoned-run", randomBytes: () => Buffer.from("01234567890123456789012345678901") });
  const recovered = await recoverAbandonedSyntheticUsers({ prisma, tenantId: 3 });
  assert.equal(recovered.groupsRecovered, 1);
  assert.equal(recovered.usersDeactivated, 3);
  assert.equal(state.users.find((item) => item.id === 99).ativo, true);
  assert.equal(state.users.filter((item) => item.id >= 100).every((item) => item.ativo === false), true);
});

test("harness limpa usuarios mesmo quando soak falha e nunca devolve passwords", async () => {
  const { prisma, state } = fakePrisma();
  let capturedIdentities;
  await assert.rejects(runStagingSoakJob({
    env: jobEnv(),
    prisma,
    bcrypt: { async hash(value) { return `hash:${value.length}`; } },
    randomBytes: () => Buffer.from("abcdefghijklmnopqrstuvwxzy123456"),
    randomUUID: () => "soak-job-failure",
    verifyFingerprint: async () => ({ targetVerified: true }),
    leaseManager: passLeaseManager(),
    jobMetricsProvider: async () => ({ total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, stuck: 0, retries: 0, duplicates: 0 }),
    runSoak: async ({ authLifecycle }) => {
      capturedIdentities = authLifecycle;
      throw Object.assign(new Error("synthetic failure"), { code: "SOAK_SYNTHETIC_FAILURE" });
    },
  }), (error) => error.code === "SOAK_SYNTHETIC_FAILURE");
  assert.equal(state.users.find((item) => item.id === 99).ativo, true);
  assert.equal(state.users.filter((item) => item.id >= 100).every((item) => item.ativo === false), true);
  assert.deepEqual(capturedIdentities.stats(), { logins: 0, refreshes: 0, relogins: 0, validations: 0, failures: 0, roles: 3 });
  await assert.rejects(capturedIdentities.headersFor("ADMIN"), (error) => error.code === "SOAK_AUTH_IDENTITY_DISABLED");
  assert.doesNotMatch(JSON.stringify(state.audits), /abcdefghijklmnopqrstuvwxzy123456/);
});

test("segunda missão é recusada antes de recovery ou provisionamento", async () => {
  const { prisma, state } = fakePrisma();
  await assert.rejects(runStagingSoakJob({
    env: jobEnv(), prisma,
    verifyFingerprint: async () => ({ targetVerified: true }),
    leaseManager: { async withLease() { throw Object.assign(new Error("busy"), { code: "INTEGRATION_OPERATION_IN_PROGRESS" }); } },
  }), (error) => error.code === "INTEGRATION_OPERATION_IN_PROGRESS");
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].id, 99);
});

test("lease distribuído tenant-scoped recusa segunda missão concorrente e libera ao final", async () => {
  let row = null;
  const leaseStore = {
    async create({ data }) { if (row) throw Object.assign(new Error("duplicate"), { code: "P2002" }); row = { ...data }; return row; },
    async updateMany({ where, data }) {
      if (!row || row.empresaId !== where.empresaId || row.namespace !== where.namespace || row.resourceKey !== where.resourceKey) return { count: 0 };
      if (where.ownerToken && row.ownerToken !== where.ownerToken) return { count: 0 };
      if (where.expiresAt?.lte && row.expiresAt > where.expiresAt.lte) return { count: 0 };
      if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
    async deleteMany({ where }) { if (row && row.ownerToken === where.ownerToken) { row = null; return { count: 1 }; } return { count: 0 }; },
  };
  const prisma = { operacaoDistribuidaLease: leaseStore, async $transaction(callback) { return callback({ operacaoDistribuidaLease: leaseStore }); } };
  const manager = createDistributedOperationLease({ prisma, ttlMs: 60_000, heartbeatMs: 60_000 });
  let release;
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const key = { empresaId: 3, namespace: "STORE1_SOAK", resourceKey: "MISSION" };
  const first = manager.withLease(key, async () => { entered(); await hold; });
  await ready;
  await assert.rejects(manager.withLease(key, async () => {}), (error) => error.code === "INTEGRATION_OPERATION_IN_PROGRESS");
  release();
  await first;
  await manager.withLease(key, async (lease) => lease.assertOwned());
  assert.equal(row, null);
});
