"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  DEFAULT_PHASES,
  MAX_INFLIGHT,
  TARGET_CONFIRMATION,
  assertSameOriginRequest,
  assertStagingTarget,
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

function headers(values = {}) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get(name) { return normalized.get(String(name).toLowerCase()) || null; } };
}

function response(status = 200, payload = null, responseHeaders = {}) {
  return {
    status,
    headers: headers(responseHeaders),
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
      if (init.headers.Authorization) seenAuthorization.push(init.headers.Authorization);
      if (url.pathname === "/api/test/jobs") return response(200, { total: 9, pending: 1, failed: 0, secret: "must-not-enter-ledger" });
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
  assert.deepEqual(ledger.metrics.jobs.last, { total: 9, pending: 1, failed: 0 });
  assert.equal(ledger.roles.ADMIN.requests, 5);
  assert.equal(ledger.roles.GERENTE.requests, 5);
  assert.equal(ledger.roles.VENDEDOR.requests, 5);
  assert.ok(seenAuthorization.includes("Bearer admin-secret"));
  const serialized = JSON.stringify(ledger);
  assert.doesNotMatch(serialized, /admin-secret|manager-secret|seller-secret|must-not-enter-ledger/);
  assert.match(ledger.runId, /^[a-f0-9]{20}$/);
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
      if (url.pathname === "/api/clientes") return response(503);
      if (url.pathname === "/api/negocios") return response(302, null, { location: "https://graph.facebook.com/me" });
      if (url.pathname === "/api/test/jobs") return response(200, { total: 0 });
      return response(200);
    },
  });
  assert.equal(ledger.status, "BLOCKED");
  assert.ok(ledger.metrics.http5xx > 0);
  assert.ok(ledger.metrics.providerEgress > 0);
  assert.ok(ledger.blockers.includes("HTTP_5XX"));
  assert.ok(ledger.blockers.includes("PROVIDER_EGRESS"));
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
