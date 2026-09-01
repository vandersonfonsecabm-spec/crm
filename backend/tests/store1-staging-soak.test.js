"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { SOURCE_MANIFEST_VERSION } = require("../src/runtime-fingerprint");

const {
  DEFAULT_PHASES,
  MAX_INFLIGHT,
  TARGET_CONFIRMATION,
  assertSameOriginRequest,
  assertStagingTarget,
  createRoleAuthLifecycle,
  numericJobSnapshot,
  resolveConfig,
  resolvePhases,
  runStore1StagingSoak,
  sanitizeLedger,
} = require("../scripts/run-store1-staging-soak.cjs");

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    STORE1_SOAK_BASE_URL: "https://store1-staging.example.test",
    STORE1_SOAK_ALLOWED_HOST: "store1-staging.example.test",
    STORE1_SOAK_TARGET_CONFIRM: TARGET_CONFIRMATION,
    STORE1_SOAK_SOURCE_SHA: "synthetic-sha",
    STORE1_SOAK_JOBS_PATH: "/api/test/jobs",
    STORE1_SOAK_RESTART_PATH: "/api/test/restart",
    STORE1_SOAK_ADMIN_AUTHORIZATION: "Bearer admin-secret",
    STORE1_SOAK_GERENTE_AUTHORIZATION: "Bearer manager-secret",
    STORE1_SOAK_VENDEDOR_AUTHORIZATION: "Bearer seller-secret",
    STORE1_SOAK_ADMIN_PATHS: "/api/auth/me,/api/clientes",
    STORE1_SOAK_GERENTE_PATHS: "/api/auth/me,/api/negocios",
    STORE1_SOAK_VENDEDOR_PATHS: "/api/auth/me,/api/agenda",
    ...overrides,
  };
}

function shortPhases() {
  return DEFAULT_PHASES.map((phase) => ({ ...phase, durationMs: 1, intervalMs: 1 }));
}

function headers(values = {}, setCookies = []) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    get(name) { return normalized.get(String(name).toLowerCase()) || null; },
    getSetCookie() { return [...setCookies]; },
  };
}

function response(status = 200, payload = null, responseHeaders = {}, setCookies = []) {
  return {
    status,
    headers: headers(responseHeaders, setCookies),
    async json() { return payload; },
  };
}

test("guard permite apenas target explicitamente confirmado e recusa producao/providers", () => {
  const allowed = assertStagingTarget({
    baseUrl: "https://crm-ga3-bundle-staging.vercel.app",
    allowedHost: "crm-ga3-bundle-staging.vercel.app",
    confirmation: TARGET_CONFIRMATION,
  });
  assert.equal(allowed.hostname, "crm-ga3-bundle-staging.vercel.app");

  assert.throws(() => assertStagingTarget({
    baseUrl: "https://crm-murex-six-83.vercel.app",
    allowedHost: "crm-murex-six-83.vercel.app",
    confirmation: TARGET_CONFIRMATION,
  }), (error) => error.code === "SOAK_PRODUCTION_TARGET_BLOCKED");
  assert.throws(() => assertStagingTarget({
    baseUrl: "https://graph.facebook.com",
    allowedHost: "graph.facebook.com",
    confirmation: TARGET_CONFIRMATION,
  }), (error) => error.code === "SOAK_PROVIDER_TARGET_BLOCKED");
  assert.throws(() => assertStagingTarget({
    baseUrl: "https://crm-ga3-bundle-staging.vercel.app",
    allowedHost: "api-production-875f9.up.railway.app",
    confirmation: TARGET_CONFIRMATION,
  }), (error) => error.code === "SOAK_TARGET_IDENTITY_MISMATCH");
  assert.throws(() => assertStagingTarget({
    baseUrl: "https://crm-ga3-bundle-staging.vercel.app",
    allowedHost: "crm-ga3-bundle-staging.vercel.app",
    confirmation: "yes",
  }), (error) => error.code === "SOAK_TARGET_CONFIRMATION_REQUIRED");
  assert.throws(() => assertSameOriginRequest(allowed, "https://graph.facebook.com/me"), (error) => error.code === "SOAK_REQUEST_PATH_INVALID");
});

test("auth lifecycle faz login e refresh rotativo sem expor passwords/cookies", async () => {
  let clock = Date.parse("2026-08-27T12:00:00.000Z");
  const calls = [];
  const identities = ["ADMIN", "GERENTE", "VENDEDOR"].map((role) => ({
    role,
    empresaId: 3,
    email: `${role.toLowerCase()}@example.test`,
    password: `strong-${role.toLowerCase()}-password-123`,
  }));
  const lifecycle = createRoleAuthLifecycle({
    target: new URL("https://crm-ga3-bundle-staging.vercel.app"),
    identities,
    now: () => clock,
    fetchImpl: async (url, init) => {
      calls.push({ path: url.pathname, origin: init.headers.Origin, cookie: init.headers.Cookie, body: init.body });
      if (url.pathname.endsWith("/auth/me")) {
        const role = String(init.headers.Authorization).includes("admin") ? "ADMIN" : "ADMIN";
        return response(200, { status: "ATIVO", papel: role, usuario: { empresaId: 3, papel: role, ativo: true }, empresa: { id: 3 } });
      }
      if (url.pathname.endsWith("/auth/login")) {
        const body = JSON.parse(init.body);
        return response(200, { access_token: `login-${body.email}`, expires_at: new Date(clock + 60_000).toISOString(), papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true }, empresa: { id: 3 } }, {}, ["crm_refresh_token=refresh-one; Path=/; HttpOnly; Secure"]);
      }
      assert.equal(init.headers.Cookie, "crm_refresh_token=refresh-one");
      return response(200, { access_token: "refreshed-token", expires_at: new Date(clock + 600_000).toISOString(), papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true }, empresa: { id: 3 } }, {}, ["crm_refresh_token=refresh-two; Path=/; HttpOnly; Secure"]);
    },
  });

  assert.equal((await lifecycle.headersFor("ADMIN")).Authorization, "Bearer login-admin@example.test");
  assert.equal((await lifecycle.headersFor("ADMIN")).Authorization, "Bearer refreshed-token");
  assert.equal(calls[0].origin, "https://crm-ga3-bundle-staging.vercel.app");
  assert.match(calls[0].body, /strong-admin-password-123/);
  assert.equal(calls[2].body, undefined);
  assert.deepEqual(lifecycle.stats(), { logins: 1, refreshes: 1, relogins: 0, validations: 2, failures: 0, roles: 3 });
  assert.doesNotMatch(JSON.stringify(lifecycle.stats()), /password|refresh-one|refreshed-token/);
  lifecycle.destroy();
  await assert.rejects(lifecycle.headersFor("ADMIN"), (error) => error.code === "SOAK_AUTH_IDENTITY_DISABLED");
});

test("auth lifecycle rejeita payload de outra role ou tenant antes do soak", async () => {
  const identities = ["ADMIN", "GERENTE", "VENDEDOR"].map((role) => ({ role, empresaId: 3, email: `${role.toLowerCase()}@example.test`, password: `strong-${role.toLowerCase()}-password-123` }));
  const lifecycle = createRoleAuthLifecycle({
    target: new URL("https://crm-ga3-bundle-staging.vercel.app"),
    identities,
    fetchImpl: async () => response(200, { access_token: "wrong-token", expires_at: new Date(Date.now() + 600_000).toISOString(), papel: "VENDEDOR", usuario: { empresaId: 99, papel: "VENDEDOR", ativo: true }, empresa: { id: 99 } }, {}, ["crm_refresh_token=wrong; Path=/; HttpOnly"]),
  });
  await assert.rejects(lifecycle.headersFor("ADMIN"), (error) => error.code === "SOAK_AUTH_RESPONSE_INVALID");
  assert.equal(lifecycle.stats().failures, 1);
  await assert.rejects(lifecycle.headersFor("ADMIN"), (error) => error.code === "SOAK_AUTH_IDENTITY_DISABLED");
});

test("refresh transitorio pode recuperar e 401 permite um unico re-login", async () => {
  const identities = ["ADMIN", "GERENTE", "VENDEDOR"].map((role) => ({ role, empresaId: 3, email: `${role.toLowerCase()}@example.test`, password: `strong-${role.toLowerCase()}-password-123` }));
  let clock = Date.now();
  let refreshCalls = 0;
  const transient = createRoleAuthLifecycle({
    target: new URL("https://crm-ga3-bundle-staging.vercel.app"), identities, now: () => clock,
    fetchImpl: async (url, init) => {
      if (url.pathname.endsWith("/auth/me")) return response(200, { status: "ATIVO", papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true } });
      if (url.pathname.endsWith("/auth/login")) return response(200, { access_token: "login", expires_at: new Date(clock + 60_000).toISOString(), papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true } }, {}, ["crm_refresh_token=one; Path=/"]);
      refreshCalls += 1;
      if (refreshCalls === 1) return response(503, { erro: "temporary" });
      return response(200, { access_token: "refreshed", expires_at: new Date(clock + 600_000).toISOString(), papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true } }, {}, ["crm_refresh_token=two; Path=/"]);
    },
  });
  await transient.headersFor("ADMIN");
  await assert.rejects(transient.headersFor("ADMIN"), (error) => error.code === "SOAK_AUTH_REFRESH_FAILED");
  assert.equal((await transient.headersFor("ADMIN")).Authorization, "Bearer refreshed");
  assert.equal(transient.stats().refreshes, 1);
  assert.equal(transient.stats().failures, 1);

  let logins = 0;
  const rejected = createRoleAuthLifecycle({
    target: new URL("https://crm-ga3-bundle-staging.vercel.app"), identities: ["ADMIN", "GERENTE", "VENDEDOR"].map((role) => ({ role, empresaId: 3, email: `${role.toLowerCase()}-relogin@example.test`, password: `strong-${role.toLowerCase()}-password-456` })), now: () => clock,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/auth/me")) return response(200, { status: "ATIVO", papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true } });
      if (url.pathname.endsWith("/auth/login")) {
        logins += 1;
        return response(200, { access_token: `login-${logins}`, expires_at: new Date(clock + (logins === 1 ? 60_000 : 600_000)).toISOString(), papel: "ADMIN", usuario: { empresaId: 3, papel: "ADMIN", ativo: true } }, {}, [`crm_refresh_token=login-${logins}; Path=/`]);
      }
      return response(401, { erro: "expired" });
    },
  });
  await rejected.headersFor("ADMIN");
  assert.equal((await rejected.headersFor("ADMIN")).Authorization, "Bearer login-2");
  assert.equal(rejected.stats().relogins, 1);
  assert.equal(rejected.stats().failures, 1);
});

test("agenda canonica preserva as cinco fases e overrides existem somente em teste", () => {
  assert.deepEqual(DEFAULT_PHASES.map((phase) => [phase.name, phase.durationMs / 60000]), [
    ["baseline", 15],
    ["active", 120],
    ["restart", 15],
    ["post_restart", 60],
    ["cooldown", 45],
  ]);
  assert.equal(DEFAULT_PHASES.reduce((sum, phase) => sum + phase.durationMs, 0) / 60000, 255);
  assert.equal(resolvePhases({ env: { NODE_ENV: "test" }, testOverrides: shortPhases(), allowTestOverrides: true })[0].durationMs, 1);
  assert.throws(
    () => resolvePhases({ env: { NODE_ENV: "production" }, testOverrides: shortPhases(), allowTestOverrides: true }),
    (error) => error.code === "SOAK_TEST_OVERRIDE_FORBIDDEN",
  );
  assert.throws(
    () => resolvePhases({ env: { NODE_ENV: "test" }, testOverrides: shortPhases() }),
    (error) => error.code === "SOAK_TEST_OVERRIDE_FORBIDDEN",
  );
  assert.throws(
    () => resolveConfig({ env: baseEnv({ STORE1_SOAK_SOURCE_MANIFEST_VERSION: "backend-runtime-v1" }), testOverrides: shortPhases(), allowTestOverrides: true, testAllowedHosts: ["store1-staging.example.test"] }),
    (error) => error.code === "SOAK_SOURCE_MANIFEST_VERSION_MISMATCH",
  );
});

test("snapshot de jobs mapeia o contrato real e rejeita shape incompleto", () => {
  assert.deepEqual(numericJobSnapshot({ jobs: 10, pendingJobs: 2, processingJobs: 1, succeededJobs: 6, failedJobs: 1 }), { total: 10, pending: 2, running: 1, succeeded: 6, failed: 1 });
  assert.equal(numericJobSnapshot({ jobs: 10, pendingJobs: 2 }), null);
  assert.equal(numericJobSnapshot({ jobs: "10", pendingJobs: 2, processingJobs: 1, succeededJobs: 6, failedJobs: 1 }), null);
  assert.equal(numericJobSnapshot({ jobs: 10, pendingJobs: null, processingJobs: 1, succeededJobs: 8, failedJobs: 1 }), null);
  assert.equal(numericJobSnapshot({ jobs: 10, pendingJobs: 0.5, processingJobs: 1, succeededJobs: 8, failedJobs: 0 }), null);
  assert.equal(numericJobSnapshot({ erro: "unauthorized" }), null);
});

test("config pre-resolvida nao permite contornar a agenda fora de teste", async () => {
  const config = resolveConfig({
    env: baseEnv(),
    testOverrides: shortPhases(),
    allowTestOverrides: true,
    testAllowedHosts: ["store1-staging.example.test"],
  });
  await assert.rejects(
    runStore1StagingSoak({ config, env: { NODE_ENV: "production" }, writeLedger: false }),
    (error) => error.code === "SOAK_CONFIG_INJECTION_FORBIDDEN",
  );
});

test("orquestrador exercita tres roles, limita concorrencia e gera ledger sem egress", async () => {
  let clock = Date.parse("2026-08-27T12:00:00.000Z");
  let restartCalls = 0;
  let cleanupCalls = 0;
  let requestCounter = 0;
  const seenAuthorization = [];
  const config = resolveConfig({
    env: baseEnv(),
    testOverrides: shortPhases(),
    allowTestOverrides: true,
    testAllowedHosts: ["store1-staging.example.test"],
  });
  const ledger = await runStore1StagingSoak({
    config,
    env: baseEnv(),
    allowInjectedConfig: true,
    writeLedger: false,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    randomUUID: () => `request-${++requestCounter}`,
    fetchImpl: async (url, init) => {
      assert.equal(url.hostname, "store1-staging.example.test");
      if (url.pathname.endsWith("/runtime-fingerprint")) return response(200, { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, providersConnected: false, outboundEnabled: false });
      if (init.headers?.Authorization) seenAuthorization.push(init.headers.Authorization);
      if (url.pathname === "/api/test/jobs") {
        assert.equal(init.headers.Authorization, "Bearer admin-secret");
        return response(200, { jobs: 9, pendingJobs: 0, processingJobs: 0, succeededJobs: 9, failedJobs: 0, secret: "must-not-enter-ledger" });
      }
      return response(200);
    },
    restartHook: async ({ targetHost }) => {
      restartCalls += 1;
      assert.equal(targetHost, "store1-staging.example.test");
    },
    cleanupHook: async () => {
      cleanupCalls += 1;
      return { removedSyntheticRows: 0 };
    },
  });

  assert.equal(ledger.status, "PASS");
  assert.equal(ledger.phases.length, 5);
  assert.equal(ledger.maxInflightAllowed, MAX_INFLIGHT);
  assert.ok(ledger.maxInflightObserved <= MAX_INFLIGHT);
  assert.equal(restartCalls, 1);
  assert.equal(cleanupCalls, 1);
  assert.equal(ledger.restart.status, "PASS");
  assert.equal(ledger.cleanup.status, "PASS");
  assert.equal(ledger.metrics.health.failures, 0);
  assert.equal(ledger.metrics.ready.failures, 0);
  assert.equal(ledger.metrics.http5xx, 0);
  assert.equal(ledger.metrics.providerEgress, 0);
  assert.equal(ledger.metrics.productionRequests, 0);
  assert.equal(ledger.metrics.jobs.observations, 5);
  assert.deepEqual(ledger.metrics.jobs.last, { total: 9, pending: 0, running: 0, succeeded: 9, failed: 0 });
  assert.equal(ledger.roles.ADMIN.requests, 5);
  assert.equal(ledger.roles.GERENTE.requests, 5);
  assert.equal(ledger.roles.VENDEDOR.requests, 5);
  assert.ok(seenAuthorization.includes("Bearer admin-secret"));
  const serialized = JSON.stringify(ledger);
  assert.doesNotMatch(serialized, /admin-secret|manager-secret|seller-secret|must-not-enter-ledger/);
  assert.match(ledger.runId, /^[a-f0-9]{20}$/);
});

test("invariantes de jobs aceitam baseline failed estável e bloqueiam deltas/debt operacional", async () => {
  async function execute(baseline, final) {
    let clock = Date.parse("2026-08-27T12:00:00.000Z");
    let counter = 0;
    let samples = 0;
    const env = baseEnv();
    const config = resolveConfig({ env, testOverrides: shortPhases(), allowTestOverrides: true, testAllowedHosts: ["store1-staging.example.test"] });
    return runStore1StagingSoak({
      config, env, allowInjectedConfig: true, writeLedger: false, now: () => clock, sleep: async (ms) => { clock += ms; }, randomUUID: () => `ops-${++counter}`, restartHook: async () => {},
      jobMetricsProvider: async () => (++samples === 1 ? baseline : final),
      fetchImpl: async (url) => {
        if (url.pathname.endsWith("runtime-fingerprint")) return response(200, { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, trackedProviderConnections: false, outboundEnabled: false });
        return response(200);
      },
    });
  }
  const stableFailed = { total: 1, pending: 0, running: 0, succeeded: 0, failed: 1, cancelled: 0, stuck: 0, retries: 0, duplicates: 0 };
  assert.equal((await execute(stableFailed, stableFailed)).status, "PASS");

  const clean = { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, stuck: 0, retries: 0, duplicates: 0 };
  const cases = [
    ["JOBS_FAILED_INCREASED", { ...clean, total: 1, failed: 1 }],
    ["JOBS_STUCK_INCREASED", { ...clean, total: 1, succeeded: 1, stuck: 1 }],
    ["JOBS_RETRIES_INCREASED", { ...clean, total: 1, succeeded: 1, retries: 1 }],
    ["JOBS_DUPLICATES_INCREASED", { ...clean, total: 1, succeeded: 1, duplicates: 1 }],
    ["JOBS_NOT_DRAINED", { ...clean, total: 1, pending: 1 }],
    ["JOBS_STATUS_INCOHERENT", { ...clean, total: 2, succeeded: 1 }],
  ];
  for (const [blocker, final] of cases) {
    const ledger = await execute(clean, final);
    assert.equal(ledger.status, "BLOCKED", blocker);
    assert.ok(ledger.blockers.includes(blocker), JSON.stringify(ledger.blockers));
    assert.deepEqual(ledger.metrics.jobs.baseline, clean);
    assert.deepEqual(ledger.metrics.jobs.final, final);
  }
});

test("5xx e redirect externo impedem PASS sem seguir o provider", async () => {
  let clock = Date.parse("2026-08-27T12:00:00.000Z");
  let requestCounter = 0;
  const config = resolveConfig({
    env: baseEnv(),
    testOverrides: shortPhases(),
    allowTestOverrides: true,
    testAllowedHosts: ["store1-staging.example.test"],
  });
  const ledger = await runStore1StagingSoak({
    config,
    env: baseEnv(),
    allowInjectedConfig: true,
    writeLedger: false,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    randomUUID: () => `blocked-${++requestCounter}`,
    restartHook: async () => {},
    fetchImpl: async (url) => {
        if (url.pathname.endsWith("/runtime-fingerprint")) return response(200, { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, trackedProviderConnections: false, outboundEnabled: false });
      if (url.pathname === "/api/clientes") return response(503);
      if (url.pathname === "/api/negocios") return response(302, null, { location: "https://graph.facebook.com/me" });
      if (url.pathname === "/api/test/jobs") return response(401, { erro: "unauthorized" });
      return response(200);
    },
  });
  assert.equal(ledger.status, "BLOCKED");
  assert.ok(ledger.metrics.http5xx > 0);
  assert.ok(ledger.metrics.providerEgress > 0);
  assert.ok(ledger.blockers.includes("HTTP_5XX"));
  assert.ok(ledger.blockers.includes("PROVIDER_EGRESS"));
  assert.equal(ledger.metrics.jobs.observations, 0);
  assert.ok(ledger.blockers.includes("JOBS_SNAPSHOT_INVALID"));
});

test("um unico 401 de role bloqueia o soak mesmo sem 5xx", async () => {
  let clock = Date.parse("2026-08-27T12:00:00.000Z");
  let counter = 0;
  const env = baseEnv({ STORE1_SOAK_ADMIN_PATHS: "/api/forbidden", STORE1_SOAK_GERENTE_PATHS: "/api/ok-manager", STORE1_SOAK_VENDEDOR_PATHS: "/api/ok-seller" });
  const config = resolveConfig({ env, testOverrides: shortPhases(), allowTestOverrides: true, testAllowedHosts: ["store1-staging.example.test"] });
  const ledger = await runStore1StagingSoak({
    config, env, allowInjectedConfig: true, writeLedger: false, now: () => clock, sleep: async (ms) => { clock += ms; }, randomUUID: () => `role401-${++counter}`, restartHook: async () => {},
    fetchImpl: async (url) => {
        if (url.pathname.endsWith("runtime-fingerprint")) return response(200, { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, trackedProviderConnections: false, outboundEnabled: false });
      if (url.pathname === "/api/forbidden") return response(401, { erro: "unauthorized" });
      if (url.pathname === "/api/test/jobs") return response(200, { jobs: 0, pendingJobs: 0, processingJobs: 0, succeededJobs: 0, failedJobs: 0 });
      return response(200);
    },
  });
  assert.equal(ledger.status, "BLOCKED");
  assert.equal(ledger.metrics.http5xx, 0);
  assert.ok(ledger.roles.ADMIN.failures > 0);
  assert.ok(ledger.blockers.includes("REQUEST_FAILURES"));
  assert.ok(ledger.blockers.includes("ROLE_FAILURES"));
});

test("perda do lease interrompe o soak e ainda executa cleanup", async () => {
  let clock = Date.parse("2026-08-27T12:00:00.000Z");
  let counter = 0;
  let ownershipChecks = 0;
  let cleanupCalls = 0;
  const env = baseEnv();
  const config = resolveConfig({ env, testOverrides: shortPhases(), allowTestOverrides: true, testAllowedHosts: ["store1-staging.example.test"] });
  await assert.rejects(runStore1StagingSoak({
    config, env, allowInjectedConfig: true, writeLedger: false, now: () => clock, sleep: async (ms) => { clock += ms; }, randomUUID: () => `lease-${++counter}`, restartHook: async () => {},
    leaseContext: { assertOwned() { ownershipChecks += 1; if (ownershipChecks >= 3) throw Object.assign(new Error("lost"), { code: "DISTRIBUTED_LEASE_LOST" }); } },
    cleanupHook: async () => { cleanupCalls += 1; return { finalStateVerified: true }; },
    fetchImpl: async (url) => {
        if (url.pathname.endsWith("runtime-fingerprint")) return response(200, { environment: "staging", targetVerified: true, databaseVerified: true, sourceManifestVersion: SOURCE_MANIFEST_VERSION, trackedProviderConnections: false, outboundEnabled: false });
      if (url.pathname === "/api/test/jobs") return response(200, { jobs: 0, pendingJobs: 0, processingJobs: 0, succeededJobs: 0, failedJobs: 0 });
      return response(200);
    },
  }), (error) => error.code === "DISTRIBUTED_LEASE_LOST");
  assert.equal(cleanupCalls, 1);
});

test("sanitizacao recursiva remove credenciais e connection strings", () => {
  const sanitized = sanitizeLedger({
    Authorization: "Bearer super-secret",
    nested: {
      clientSecret: "client-value",
      message: "postgresql://user:pass@host/db token=abc",
    },
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /super-secret|client-value|user:pass|token=abc/);
  assert.match(serialized, /REDACTED/);
});
