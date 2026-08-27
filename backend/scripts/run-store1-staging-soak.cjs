"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TARGET_CONFIRMATION = "store1-staging-only";
const MAX_INFLIGHT = 6;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PHASES = Object.freeze([
  Object.freeze({ name: "baseline", durationMs: 15 * 60 * 1000, intervalMs: 30000 }),
  Object.freeze({ name: "active", durationMs: 120 * 60 * 1000, intervalMs: 10000 }),
  Object.freeze({ name: "restart", durationMs: 15 * 60 * 1000, intervalMs: 10000, restart: true }),
  Object.freeze({ name: "post_restart", durationMs: 60 * 60 * 1000, intervalMs: 15000 }),
  Object.freeze({ name: "cooldown", durationMs: 45 * 60 * 1000, intervalMs: 30000 }),
]);
const ROLE_NAMES = Object.freeze(["ADMIN", "GERENTE", "VENDEDOR"]);
const KNOWN_STAGING_HOSTS = new Set([
  "crm-ga3-bundle-staging.vercel.app",
  "ga3-bundle-api-ga3-bundle-staging.up.railway.app",
]);
const BLOCKED_PRODUCTION_HOSTS = new Set([
  "crm-murex-six-83.vercel.app",
  "api-production-875f9.up.railway.app",
]);
const BLOCKED_PROVIDER_SUFFIXES = Object.freeze([
  "facebook.com",
  "facebook.net",
  "fbcdn.net",
  "instagram.com",
  "whatsapp.com",
  "messenger.com",
  "openai.com",
  "anthropic.com",
  "bling.com.br",
  "resend.com",
  "sendgrid.net",
  "mailgun.org",
]);
const SECRET_KEY_PATTERN = /authorization|cookie|password|passwd|secret|token|api[_-]?key|client[_-]?secret|credential/i;

class SoakError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SoakError";
    this.code = code;
  }
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isProviderHost(hostname) {
  const host = normalizeHost(hostname);
  return BLOCKED_PROVIDER_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function assertStagingTarget({ baseUrl, allowedHost, confirmation, env = process.env, testAllowedHosts = [] }) {
  let target;
  try {
    target = new URL(String(baseUrl || ""));
  } catch {
    throw new SoakError("SOAK_TARGET_INVALID", "Target de staging invalido.");
  }
  if (confirmation !== TARGET_CONFIRMATION) {
    throw new SoakError("SOAK_TARGET_CONFIRMATION_REQUIRED", "Confirmacao explicita do staging obrigatoria.");
  }
  if (target.username || target.password || target.search || target.hash || !["", "/"].includes(target.pathname)) {
    throw new SoakError("SOAK_TARGET_INVALID", "Target deve conter somente a origem, sem credencial, query, fragmento ou caminho.");
  }
  const host = normalizeHost(target.hostname);
  const explicitHost = normalizeHost(allowedHost);
  if (!explicitHost || explicitHost !== host) {
    throw new SoakError("SOAK_TARGET_IDENTITY_MISMATCH", "Host permitido nao corresponde ao target.");
  }
  if (BLOCKED_PRODUCTION_HOSTS.has(host) || /(?:^|[.-])(prod|production|official)(?:[.-]|$)/i.test(host)) {
    throw new SoakError("SOAK_PRODUCTION_TARGET_BLOCKED", "Target de producao recusado.");
  }
  if (isProviderHost(host)) {
    throw new SoakError("SOAK_PROVIDER_TARGET_BLOCKED", "Host de provider externo recusado.");
  }
  const testHostAllowed = env.NODE_ENV === "test" && testAllowedHosts.map(normalizeHost).includes(host);
  if (!KNOWN_STAGING_HOSTS.has(host) && !testHostAllowed) {
    throw new SoakError("SOAK_UNKNOWN_STAGING_TARGET", "Target nao pertence ao staging conhecido.");
  }
  if (target.protocol !== "https:" && !(env.NODE_ENV === "test" && ["localhost", "127.0.0.1"].includes(host))) {
    throw new SoakError("SOAK_HTTPS_REQUIRED", "Staging exige HTTPS.");
  }
  return new URL(target.origin);
}

function assertSameOriginRequest(targetOrigin, requestPath) {
  const rawPath = String(requestPath || "").trim();
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || /[\r\n]/.test(rawPath)) {
    throw new SoakError("SOAK_REQUEST_PATH_INVALID", "Caminho de request invalido.");
  }
  const resolved = new URL(rawPath, targetOrigin);
  if (resolved.origin !== targetOrigin.origin) {
    throw new SoakError("SOAK_EGRESS_BLOCKED", "Request fora da origem de staging recusado.");
  }
  if (isProviderHost(resolved.hostname) || BLOCKED_PRODUCTION_HOSTS.has(normalizeHost(resolved.hostname))) {
    throw new SoakError("SOAK_EGRESS_BLOCKED", "Request para provider ou producao recusado.");
  }
  return resolved;
}

function resolvePhases({ env = process.env, testOverrides, allowTestOverrides = false } = {}) {
  if (testOverrides !== undefined && !(env.NODE_ENV === "test" && allowTestOverrides === true)) {
    throw new SoakError("SOAK_TEST_OVERRIDE_FORBIDDEN", "Duracoes do soak so podem ser alteradas por testes.");
  }
  const source = testOverrides === undefined ? DEFAULT_PHASES : testOverrides;
  if (!Array.isArray(source) || source.length !== DEFAULT_PHASES.length) {
    throw new SoakError("SOAK_PHASES_INVALID", "O soak exige exatamente cinco fases.");
  }
  return source.map((phase, index) => {
    const expectedName = DEFAULT_PHASES[index].name;
    const durationMs = Number(phase.durationMs);
    const intervalMs = Number(phase.intervalMs);
    if (phase.name !== expectedName || !Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(intervalMs) || intervalMs < 0) {
      throw new SoakError("SOAK_PHASES_INVALID", "Fase de soak invalida.");
    }
    return Object.freeze({ name: expectedName, durationMs, intervalMs, restart: expectedName === "restart" });
  });
}

function parseRolePaths(value) {
  const paths = String(value || "/api/auth/me")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paths.length) throw new SoakError("SOAK_ROLE_PATHS_REQUIRED", "Cada role exige ao menos um caminho.");
  for (const item of paths) {
    if (!item.startsWith("/") || item.startsWith("//") || /^https?:/i.test(item)) {
      throw new SoakError("SOAK_REQUEST_PATH_INVALID", "Paths das roles devem ser same-origin.");
    }
  }
  return paths;
}

function roleConfigsFromEnv(env = process.env, { requireCredentials = true } = {}) {
  return ROLE_NAMES.map((name) => {
    const authorization = String(env[`STORE1_SOAK_${name}_AUTHORIZATION`] || "").trim();
    const cookie = String(env[`STORE1_SOAK_${name}_COOKIE`] || "").trim();
    if (requireCredentials && !authorization && !cookie) {
      throw new SoakError("SOAK_ROLE_CREDENTIAL_REQUIRED", `Credencial sintetica ausente para ${name}.`);
    }
    return {
      name,
      paths: parseRolePaths(env[`STORE1_SOAK_${name}_PATHS`]),
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
  });
}

function defaultProbePath(target, kind) {
  const throughVercel = normalizeHost(target.hostname) === "crm-ga3-bundle-staging.vercel.app";
  return `${throughVercel ? "/api" : ""}/${kind}`;
}

function resolveConfig({ env = process.env, testOverrides, allowTestOverrides = false, requireCredentials = true, testAllowedHosts = [] } = {}) {
  const target = assertStagingTarget({
    baseUrl: env.STORE1_SOAK_BASE_URL,
    allowedHost: env.STORE1_SOAK_ALLOWED_HOST,
    confirmation: env.STORE1_SOAK_TARGET_CONFIRM,
    env,
    testAllowedHosts,
  });
  const phases = resolvePhases({ env, testOverrides, allowTestOverrides });
  const jobsPath = String(env.STORE1_SOAK_JOBS_PATH || "").trim();
  const restartPath = String(env.STORE1_SOAK_RESTART_PATH || "").trim();
  if (!jobsPath) throw new SoakError("SOAK_JOBS_PATH_REQUIRED", "Endpoint read-only de jobs obrigatorio.");
  if (!restartPath && requireCredentials) throw new SoakError("SOAK_RESTART_PATH_REQUIRED", "Endpoint staging-only de restart obrigatorio.");
  for (const requestPath of [jobsPath, restartPath].filter(Boolean)) assertSameOriginRequest(target, requestPath);
  const sourceSha = String(env.STORE1_SOAK_SOURCE_SHA || "").trim();
  const sourceManifestSha256 = String(env.STORE1_SOAK_SOURCE_MANIFEST_SHA256 || "").trim().toLowerCase();
  const probeToken = String(env.STORE1_SOAK_PROBE_TOKEN || "");
  if (!/^[a-f0-9]{40}$/i.test(sourceSha) && !(env.NODE_ENV === "test" && /^[A-Za-z0-9._-]{7,80}$/.test(sourceSha))) {
    throw new SoakError("SOAK_SOURCE_SHA_REQUIRED", "SHA funcional exato obrigatorio.");
  }
  if (!/^[a-f0-9]{64}$/.test(sourceManifestSha256) && env.NODE_ENV !== "test") throw new SoakError("SOAK_SOURCE_MANIFEST_REQUIRED", "Manifesto calculado do runtime obrigatorio.");
  if (probeToken.length < 32 && env.NODE_ENV !== "test") throw new SoakError("SOAK_PROBE_TOKEN_REQUIRED", "Token tecnico do probe obrigatorio.");
  return {
    target,
    phases,
    roles: roleConfigsFromEnv(env, { requireCredentials }),
    healthPath: String(env.STORE1_SOAK_HEALTH_PATH || defaultProbePath(target, "health")),
    readyPath: String(env.STORE1_SOAK_READY_PATH || defaultProbePath(target, "ready")),
    fingerprintPath: String(env.STORE1_SOAK_FINGERPRINT_PATH || defaultProbePath(target, "runtime-fingerprint")),
    jobsPath,
    restartPath,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    sourceSha,
    sourceManifestSha256,
    probeToken,
  };
}

function percentile(values, percentage) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function hashIdentifier(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
}

function safeError(error) {
  if (error?.name === "AbortError") return { code: "REQUEST_TIMEOUT" };
  const code = String(error?.code || "REQUEST_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
  return { code };
}

function sanitizeLedger(value, key = "") {
  if (SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeLedger(item));
  if (value && typeof value === "object") {
    const clean = {};
    for (const [childKey, childValue] of Object.entries(value)) clean[childKey] = sanitizeLedger(childValue, childKey);
    return clean;
  }
  if (typeof value === "string") {
    return value
      .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[REDACTED]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/((?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
      .slice(0, 500);
  }
  return value;
}

function createLimiter(maxInflight, onInflight) {
  let active = 0;
  const waiting = [];
  const drain = () => {
    while (active < maxInflight && waiting.length) {
      const item = waiting.shift();
      active += 1;
      onInflight(active);
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          onInflight(active);
          drain();
        });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    waiting.push({ task, resolve, reject });
    drain();
  });
}

function createLedger(config, runId, startedAt) {
  return {
    event: "store1_staging_soak",
    runId: hashIdentifier(runId),
    sourceSha: config.sourceSha,
    targetHost: config.target.hostname,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    scheduleMinutes: config.phases.reduce((sum, phase) => sum + phase.durationMs, 0) / 60000,
    maxInflightAllowed: MAX_INFLIGHT,
    maxInflightObserved: 0,
    phases: [],
    roles: Object.fromEntries(config.roles.map((role) => [role.name, { requests: 0, failures: 0, p95Ms: null, p99Ms: null, latencies: [] }])),
    metrics: {
      requests: 0,
      success: 0,
      failures: 0,
      http5xx: 0,
      health: { checks: 0, failures: 0 },
      ready: { checks: 0, failures: 0 },
      duplicates: 0,
      jobs: { observations: 0, last: null, maxima: {} },
      providerEgress: 0,
      productionRequests: 0,
    },
    restart: { executed: false, status: "NOT_STARTED" },
    cleanup: { inflightDrained: false, hook: "NOT_REQUIRED", status: "PENDING" },
    requestLedger: [],
    errors: [],
    status: "RUNNING",
    blockers: [],
  };
}

function numericJobSnapshot(payload) {
  if (!payload || typeof payload !== "object") return null;
  const allowed = ["total", "pending", "running", "succeeded", "failed", "stuck", "retries", "duplicates"];
  const result = {};
  for (const key of allowed) {
    const value = Number(payload[key]);
    if (Number.isFinite(value) && value >= 0) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

async function runStore1StagingSoak(options = {}) {
  const env = options.env || process.env;
  if (options.config && !(env.NODE_ENV === "test" && options.allowInjectedConfig === true)) {
    throw new SoakError("SOAK_CONFIG_INJECTION_FORBIDDEN", "Config injetada so e permitida em testes.");
  }
  const config = options.config || resolveConfig({
    env,
    testOverrides: options.testOverrides,
    allowTestOverrides: options.allowTestOverrides,
    requireCredentials: true,
    testAllowedHosts: options.testAllowedHosts,
  });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new SoakError("SOAK_FETCH_UNAVAILABLE", "Fetch indisponivel.");
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const randomUUID = options.randomUUID || crypto.randomUUID;
  const runId = randomUUID();
  const ledger = createLedger(config, runId, now());
  const latencies = [];
  const requestIds = new Set();
  const limit = createLimiter(MAX_INFLIGHT, (active) => {
    ledger.maxInflightObserved = Math.max(ledger.maxInflightObserved, active);
  });

  const fingerprintUrl = assertSameOriginRequest(config.target, config.fingerprintPath);
  const fingerprintResponse = await fetchImpl(fingerprintUrl, { method: "GET", redirect: "manual", headers: { "x-store1-soak-probe": config.probeToken }, signal: AbortSignal.timeout(config.timeoutMs) });
  const fingerprint = fingerprintResponse.status === 200 && typeof fingerprintResponse.json === "function"
    ? await fingerprintResponse.json().catch(() => null)
    : null;
  if (!fingerprint || fingerprint.environment !== "staging" || fingerprint.targetVerified !== true || fingerprint.databaseVerified !== true
    || (config.sourceManifestSha256 && String(fingerprint.sourceManifestSha256 || "").toLowerCase() !== config.sourceManifestSha256)
    || fingerprint.providersConnected !== false || fingerprint.outboundEnabled !== false) {
    throw new SoakError("SOAK_RUNTIME_FINGERPRINT_MISMATCH", "Runtime staging nao corresponde ao candidato seguro.");
  }

  const executeRequest = async ({ kind, requestPath, role, method = "GET", headers = {} }) => {
    const requestId = `${runId}:${kind}:${randomUUID()}`;
    const requestIdHash = hashIdentifier(requestId);
    if (requestIds.has(requestIdHash)) ledger.metrics.duplicates += 1;
    requestIds.add(requestIdHash);
    const url = assertSameOriginRequest(config.target, requestPath);
    const started = now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let status = null;
    try {
      const response = await fetchImpl(url, {
        method,
        redirect: "manual",
        credentials: "include",
        headers: { ...headers, "x-correlation-id": requestId },
        signal: controller.signal,
      });
      status = Number(response.status);
      const location = response.headers?.get?.("location");
      if (location) {
        const redirectTarget = new URL(location, config.target);
        if (redirectTarget.origin !== config.target.origin) {
          ledger.metrics.providerEgress += 1;
          throw new SoakError("SOAK_EXTERNAL_REDIRECT_BLOCKED", "Redirect externo bloqueado.");
        }
      }
      const latency = Math.max(0, now() - started);
      latencies.push(latency);
      ledger.metrics.requests += 1;
      if (status >= 500) ledger.metrics.http5xx += 1;
      if (status >= 200 && status < 400) ledger.metrics.success += 1;
      else ledger.metrics.failures += 1;
      if (kind === "health") {
        ledger.metrics.health.checks += 1;
        if (status !== 200) ledger.metrics.health.failures += 1;
      }
      if (kind === "ready") {
        ledger.metrics.ready.checks += 1;
        if (status !== 200) ledger.metrics.ready.failures += 1;
      }
      if (role) {
        const roleMetric = ledger.roles[role];
        roleMetric.requests += 1;
        roleMetric.latencies.push(latency);
        if (!(status >= 200 && status < 400)) roleMetric.failures += 1;
      }
      if (response.headers?.get?.("x-idempotent-replay") === "true" || response.headers?.get?.("x-duplicate") === "true") {
        ledger.metrics.duplicates += 1;
      }
      if (kind === "jobs") {
        const payload = typeof response.json === "function" ? await response.json().catch(() => null) : null;
        const snapshot = numericJobSnapshot(payload);
        ledger.metrics.jobs.observations += 1;
        ledger.metrics.jobs.last = snapshot;
        if (snapshot) {
          for (const [key, value] of Object.entries(snapshot)) {
            ledger.metrics.jobs.maxima[key] = Math.max(ledger.metrics.jobs.maxima[key] || 0, value);
          }
        }
      }
      ledger.requestLedger.push({ id: requestIdHash, kind, role: role || null, status, latencyMs: latency });
      return { status, latency };
    } catch (error) {
      const latency = Math.max(0, now() - started);
      latencies.push(latency);
      ledger.metrics.requests += 1;
      ledger.metrics.failures += 1;
      if (role) {
        ledger.roles[role].requests += 1;
        ledger.roles[role].failures += 1;
        ledger.roles[role].latencies.push(latency);
      }
      if (kind === "health") {
        ledger.metrics.health.checks += 1;
        ledger.metrics.health.failures += 1;
      }
      if (kind === "ready") {
        ledger.metrics.ready.checks += 1;
        ledger.metrics.ready.failures += 1;
      }
      ledger.errors.push({ id: requestIdHash, kind, role: role || null, ...safeError(error) });
      return { status, latency, error: true };
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const roleIndexes = Object.fromEntries(config.roles.map((role) => [role.name, 0]));
    for (const phase of config.phases) {
      const phaseStarted = now();
      const phaseRecord = { name: phase.name, startedAt: new Date(phaseStarted).toISOString(), iterations: 0, finishedAt: null };
      ledger.phases.push(phaseRecord);
      if (phase.restart) {
        ledger.restart.executed = true;
        try {
          if (typeof options.restartHook === "function") {
            await options.restartHook({ targetHost: config.target.hostname, runId: ledger.runId });
          } else {
            const result = await executeRequest({
              kind: "restart",
              requestPath: config.restartPath,
              role: "ADMIN",
              method: "POST",
              headers: config.roles.find((role) => role.name === "ADMIN").headers,
            });
            if (result.error || result.status < 200 || result.status >= 300) {
              throw new SoakError("SOAK_RESTART_FAILED", "Restart staging-only nao foi confirmado.");
            }
          }
          ledger.restart.status = "PASS";
        } catch (error) {
          ledger.restart.status = "FAIL";
          ledger.errors.push({ kind: "restart", ...safeError(error) });
        }
      }
      const phaseEnd = phaseStarted + phase.durationMs;
      do {
        phaseRecord.iterations += 1;
        const tasks = [
          { kind: "health", requestPath: config.healthPath },
          { kind: "ready", requestPath: config.readyPath },
          { kind: "jobs", requestPath: config.jobsPath },
        ];
        for (const role of config.roles) {
          const index = roleIndexes[role.name] % role.paths.length;
          roleIndexes[role.name] += 1;
          tasks.push({ kind: "role", requestPath: role.paths[index], role: role.name, headers: role.headers });
        }
        await Promise.all(tasks.map((task) => limit(() => executeRequest(task))));
        const remaining = phaseEnd - now();
        if (remaining > 0) await sleep(Math.min(phase.intervalMs, remaining));
      } while (now() < phaseEnd);
      phaseRecord.finishedAt = new Date(now()).toISOString();
    }
  } finally {
    ledger.cleanup.inflightDrained = true;
    if (typeof options.cleanupHook === "function") {
      try {
        const result = await options.cleanupHook({ runId: ledger.runId, targetHost: config.target.hostname });
        ledger.cleanup.hook = "EXECUTED";
        ledger.cleanup.result = sanitizeLedger(result);
        ledger.cleanup.status = "PASS";
      } catch (error) {
        ledger.cleanup.hook = "EXECUTED";
        ledger.cleanup.status = "FAIL";
        ledger.errors.push({ kind: "cleanup", ...safeError(error) });
      }
    } else {
      ledger.cleanup.status = "PASS";
    }
  }

  for (const role of Object.values(ledger.roles)) {
    role.p95Ms = percentile(role.latencies, 95);
    role.p99Ms = percentile(role.latencies, 99);
    delete role.latencies;
  }
  ledger.metrics.p95Ms = percentile(latencies, 95);
  ledger.metrics.p99Ms = percentile(latencies, 99);
  ledger.finishedAt = new Date(now()).toISOString();
  if (ledger.metrics.http5xx > 0) ledger.blockers.push("HTTP_5XX");
  if (ledger.metrics.health.failures > 0) ledger.blockers.push("HEALTH_FAILURE");
  if (ledger.metrics.ready.failures > 0) ledger.blockers.push("READY_FAILURE");
  if (ledger.metrics.providerEgress > 0) ledger.blockers.push("PROVIDER_EGRESS");
  if (ledger.metrics.productionRequests > 0) ledger.blockers.push("PRODUCTION_REQUEST");
  if (ledger.maxInflightObserved > MAX_INFLIGHT) ledger.blockers.push("INFLIGHT_LIMIT");
  if (ledger.restart.status !== "PASS") ledger.blockers.push("RESTART_NOT_PROVEN");
  if (ledger.metrics.jobs.observations === 0) ledger.blockers.push("JOBS_NOT_OBSERVED");
  if (Object.values(ledger.roles).some((role) => role.requests === 0)) ledger.blockers.push("ROLE_NOT_EXERCISED");
  if (ledger.cleanup.status !== "PASS") ledger.blockers.push("CLEANUP_FAILED");
  ledger.status = ledger.blockers.length ? "BLOCKED" : "PASS";
  const sanitized = sanitizeLedger(ledger);
  if (options.writeLedger !== false) {
    const outputRoot = path.resolve(options.outputRoot || path.join(os.tmpdir(), "crm-store1-staging-soak"));
    fs.mkdirSync(outputRoot, { recursive: true });
    const outputPath = path.join(outputRoot, `store1-soak-${sanitized.runId}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
    sanitized.ledgerPath = outputPath;
  }
  return sanitized;
}

function dryRunSummary(config) {
  return sanitizeLedger({
    event: "store1_staging_soak_dry_run",
    targetHost: config.target.hostname,
    sourceSha: config.sourceSha,
    roles: config.roles.map((role) => ({ name: role.name, paths: role.paths })),
    phases: config.phases,
    scheduleMinutes: config.phases.reduce((sum, phase) => sum + phase.durationMs, 0) / 60000,
    maxInflight: MAX_INFLIGHT,
    providerEgress: 0,
    productionRequests: 0,
  });
}

async function main({ args = process.argv.slice(2), env = process.env } = {}) {
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length) throw new SoakError("SOAK_ARGUMENT_INVALID", "Argumento nao suportado.");
  const config = resolveConfig({ env, requireCredentials: !dryRun });
  if (dryRun) return dryRunSummary(config);
  return runStore1StagingSoak({ env });
}

if (require.main === module) {
  main()
    .then((result) => {
      const summary = {
        event: result.event,
        status: result.status || "DRY_RUN",
        targetHost: result.targetHost,
        sourceSha: result.sourceSha,
        metrics: result.metrics,
        blockers: result.blockers,
        ledgerPath: result.ledgerPath,
      };
      console.log(JSON.stringify(sanitizeLedger(summary), null, 2));
      if (result.status === "BLOCKED") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({ event: "store1_staging_soak", safe: false, error: safeError(error) }));
      process.exitCode = 1;
    });
}

module.exports = {
  BLOCKED_PRODUCTION_HOSTS,
  DEFAULT_PHASES,
  KNOWN_STAGING_HOSTS,
  MAX_INFLIGHT,
  ROLE_NAMES,
  SoakError,
  TARGET_CONFIRMATION,
  assertSameOriginRequest,
  assertStagingTarget,
  dryRunSummary,
  main,
  numericJobSnapshot,
  percentile,
  resolveConfig,
  resolvePhases,
  roleConfigsFromEnv,
  runStore1StagingSoak,
  sanitizeLedger,
};
