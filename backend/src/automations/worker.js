const crypto = require("node:crypto");
const { maintenanceReadOnlyEnabled } = require("../database/maintenance-read-only");
const { queryDatabaseWithServerTimeout } = require("../database/readiness-probe");
const { WORKER_ACTION_TYPES } = require("./actions");
const { createAutomationWorkerLogger } = require("./worker-observability");
const { databaseProviderFromEnv } = require("../../scripts/prisma-runtime.cjs");
const { runGate } = require("../../scripts/tenant-isolation-gate.cjs");
const { assertStockFlagsOffForProduction, stockFlags } = require("../stock/flags");

const WORKER_DEFAULTS = Object.freeze({
  batchSize: 5,
  pollIntervalMs: 5000,
  leaseMs: 60000,
  executionTimeoutMs: 30000,
  maxAttempts: 3,
});

const WORKER_LIMITS = Object.freeze({
  batchSize: [1, 50],
  pollIntervalMs: [1000, 5 * 60 * 1000],
  leaseMs: [5000, 10 * 60 * 1000],
  executionTimeoutMs: [1000, 2 * 60 * 1000],
  maxAttempts: [1, 10],
});
const MAX_CONSECUTIVE_FULL_FAILURES = 5;
const OFFICIAL_WORKER_SERVICE_ID = "4eef3b96-e33f-42ea-9fb8-86c17b077ab8";
const OFFICIAL_RAILWAY_PROJECT_ID = "ddfbf66c-e274-47b1-9493-286232d2f426";
const OFFICIAL_RAILWAY_ENVIRONMENT_ID = "e18f76b1-e38f-468e-91fe-1eff6db9a5f8";

function shouldStartAutomationWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const flag = String(env.AUTOMATION_WORKER_ENABLED || "").trim().toLowerCase();
  return env.NODE_ENV === "production" && (flag === "true" || flag === "1");
}

function shouldStartNotificationWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const flag = String(env.NOTIFICATIONS_WORKER_ENABLED || "").trim().toLowerCase();
  return env.NODE_ENV === "production" && (flag === "true" || flag === "1");
}

function shouldStartTemporalScanWorker(env = process.env) {
  if (!shouldStartAutomationWorker(env)) return false;
  const flag = String(env.AUTOMATION_TEMPORAL_SCAN_ENABLED || "").trim().toLowerCase();
  return flag === "true" || flag === "1";
}

function shouldStartStockWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const enabled = String(env.STOCK_DOMAIN_ENABLED || "").trim().toLowerCase();
  const worker = String(env.STOCK_SYNC_WORKER_ENABLED || "").trim().toLowerCase();
  const allowlist = String(env.STOCK_TENANT_ALLOWLIST || "").trim();
  const runtimeAllowed = env.NODE_ENV === "production"
    || (env.NODE_ENV === "test" && ["true", "1"].includes(String(env.CRM_TEST_STOCK_WORKER || "").trim().toLowerCase()));
  return runtimeAllowed
    && ["true", "1"].includes(enabled)
    && ["true", "1"].includes(worker)
    && allowlist.length > 0;
}

function readAutomationWorkerConfig(env = process.env) {
  const executionTimeoutMs = boundedInteger(
    env.AUTOMATION_WORKER_EXECUTION_TIMEOUT_MS,
    WORKER_DEFAULTS.executionTimeoutMs,
    ...WORKER_LIMITS.executionTimeoutMs,
  );
  const requestedLeaseMs = boundedInteger(env.AUTOMATION_WORKER_LEASE_MS, WORKER_DEFAULTS.leaseMs, ...WORKER_LIMITS.leaseMs);
  return {
    batchSize: boundedInteger(env.AUTOMATION_WORKER_BATCH_SIZE, WORKER_DEFAULTS.batchSize, ...WORKER_LIMITS.batchSize),
    pollIntervalMs: boundedInteger(
      env.AUTOMATION_WORKER_POLL_INTERVAL_MS || env.AUTOMATION_WORKER_INTERVAL_MS,
      WORKER_DEFAULTS.pollIntervalMs,
      ...WORKER_LIMITS.pollIntervalMs,
    ),
    leaseMs: Math.min(WORKER_LIMITS.leaseMs[1], Math.max(requestedLeaseMs, executionTimeoutMs + 10000)),
    executionTimeoutMs,
    maxAttempts: boundedInteger(env.AUTOMATION_WORKER_MAX_ATTEMPTS, WORKER_DEFAULTS.maxAttempts, ...WORKER_LIMITS.maxAttempts),
  };
}

function startAutomationWorker({
  service,
  notificationService = null,
  stockWorker = null,
  env = process.env,
  logger = console,
  workerId = `automation-worker-${process.pid}-${crypto.randomUUID()}`,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const eventLogger = createAutomationWorkerLogger({
    logger,
    workerInstanceId: workerId,
    provider: automationProvider(env),
  });
  const automationEnabled = shouldStartAutomationWorker(env);
  const notificationsEnabled = shouldStartNotificationWorker(env);
  const stockEnabled = shouldStartStockWorker(env) && typeof stockWorker?.processDue === "function";
  const temporalScanEnabled = shouldStartTemporalScanWorker(env);
  if ((!service && !notificationService && !stockWorker) || (!automationEnabled && !notificationsEnabled && !stockEnabled)) {
    eventLogger.info("worker_disabled", { status: "disabled" });
    return { started: false, async stop() {} };
  }

  const config = readAutomationWorkerConfig(env);
  let running = false;
  let stopping = false;
  let timer = null;
  let activeCycle = Promise.resolve();
  let stopped = false;
  let fatal = false;
  let resolveStopped;
  const stoppedPromise = new Promise((resolve) => { resolveStopped = resolve; });
  let consecutiveAutomationFailures = 0;
  let consecutiveNotificationFailures = 0;
  let consecutiveStockFailures = 0;

  function markStopped() {
    if (stopped) return;
    stopped = true;
    resolveStopped();
  }

  eventLogger.info("worker_started", {
    status: "started",
    automationEnabled,
    notificationsEnabled,
    stockEnabled,
    temporalScanEnabled,
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
    leaseMs: config.leaseMs,
    executionTimeoutMs: config.executionTimeoutMs,
    maxAttempts: config.maxAttempts,
  });

  async function cycle() {
    if (running || stopping) return;
    running = true;
    const startedAt = Date.now();
    const now = new Date();
    let automationFailed = false;
    let notificationsFailed = false;
    let stockFailed = false;
    if (automationEnabled && service) {
      try {
        if (temporalScanEnabled && typeof service.scanTemporalTriggers === "function") {
          const temporalResult = await service.scanTemporalTriggers({ now, limit: config.batchSize });
          if (Number(temporalResult?.scanErrors || 0) > 0) {
            eventLogger.error("worker_poll_error", new Error("TEMPORAL_SCAN_PARTIAL_FAILURE"), {
              durationMs: elapsedMs(startedAt),
              subsystem: "automation_temporal",
            });
          }
        }
      } catch (error) {
        automationFailed = true;
        eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt), subsystem: "automation_temporal" });
      }
      try {
        await service.processDueJobs({
          now,
          limit: config.batchSize,
          leaseOwner: workerId,
          leaseMs: config.leaseMs,
          executionTimeoutMs: config.executionTimeoutMs,
          maxAttempts: config.maxAttempts,
          supportedActions: WORKER_ACTION_TYPES,
          onEvent: eventLogger.event,
        });
      } catch (error) {
        automationFailed = true;
        eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt), subsystem: "automation_jobs" });
      }
    }
    if (notificationsEnabled && notificationService?.processDue) {
      try {
        const notificationResult = await notificationService.processDue({ now, limit: config.batchSize });
        if (Number(notificationResult?.failed || 0) > 0) {
          const failedTenantCount = Number(notificationResult.failed || 0);
          const activeTenants = Number(notificationResult.tenants || 0);
          eventLogger.error("worker_poll_error", new Error("NOTIFICATION_TENANT_CYCLE_PARTIAL_FAILURE"), {
            durationMs: elapsedMs(startedAt),
            subsystem: "notifications",
            failedTenantCount,
          });
          notificationsFailed = activeTenants > 0 && failedTenantCount >= activeTenants;
        }
      } catch (error) {
        notificationsFailed = true;
        eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt), subsystem: "notifications" });
      }
    }
    if (stockEnabled) {
      try {
        const stockResult = await stockWorker.processDue({ now, limit: config.batchSize, leaseOwner: workerId, leaseMs: config.leaseMs });
        if (Array.isArray(stockResult?.failedTenants) && stockResult.failedTenants.length) {
          eventLogger.error("worker_poll_error", new Error("STOCK_TENANT_CYCLE_PARTIAL_FAILURE"), { durationMs: elapsedMs(startedAt), subsystem: "stock_core", failedTenantCount: stockResult.failedTenants.length });
          const activeTenants = Number(stockResult.tenants || 0);
          stockFailed = activeTenants > 0 && stockResult.failedTenants.length >= activeTenants;
        }
      } catch (error) {
        stockFailed = true;
        eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt), subsystem: "stock_core" });
      }
    }
    const automationActive = automationEnabled && Boolean(service);
    const notificationsActive = notificationsEnabled && Boolean(notificationService?.processDue);
    if (automationActive) consecutiveAutomationFailures = automationFailed ? consecutiveAutomationFailures + 1 : 0;
    if (notificationsActive) consecutiveNotificationFailures = notificationsFailed ? consecutiveNotificationFailures + 1 : 0;
    const stockActive = stockEnabled && Boolean(stockWorker?.processDue);
    if (stockActive) consecutiveStockFailures = stockFailed ? consecutiveStockFailures + 1 : 0;
    const unhealthySubsystem = consecutiveAutomationFailures >= MAX_CONSECUTIVE_FULL_FAILURES
      ? "automation"
      : consecutiveNotificationFailures >= MAX_CONSECUTIVE_FULL_FAILURES ? "notifications"
        : consecutiveStockFailures >= MAX_CONSECUTIVE_FULL_FAILURES ? "stock_core" : null;
    if (unhealthySubsystem) {
      stopping = true;
      fatal = true;
      eventLogger.error("worker_unhealthy", new Error("Falhas consecutivas no subsistema ativo."), {
        durationMs: elapsedMs(startedAt),
        subsystem: unhealthySubsystem,
        consecutiveFailures: unhealthySubsystem === "automation" ? consecutiveAutomationFailures : unhealthySubsystem === "notifications" ? consecutiveNotificationFailures : consecutiveStockFailures,
      });
    }
    running = false;
    if (!stopping) timer = setTimeoutImpl(() => {
      activeCycle = cycle();
    }, config.pollIntervalMs);
    else markStopped();
  }

  timer = setTimeoutImpl(() => {
    activeCycle = cycle();
  }, config.pollIntervalMs);

  return {
    started: true,
    workerId,
    config,
    async stop() {
      if (stopping) {
        await activeCycle;
        if (!running) markStopped();
        return;
      }
      stopping = true;
      eventLogger.info("worker_stopping", { status: "stopping" });
      if (timer) clearTimeoutImpl(timer);
      timer = null;
      await activeCycle;
      markStopped();
      eventLogger.info("worker_stopped", { status: "stopped" });
    },
    waitForStop() {
      return stoppedPromise;
    },
    isFatal() {
      return fatal;
    },
  };
}

async function runAutomationWorkerProcess({ env = process.env, logger = console, queryDatabase = queryDatabaseWithServerTimeout } = {}) {
  require("dotenv").config();
  assertStockFlagsOffForProduction(env);
  const { createPrismaClient } = require("../database/prisma-client");
  const { createAutomationService } = require("./service");
  const { createNotificationService } = require("../notifications/service");
  const provider = validateWorkerRuntimeTarget(env);
  const prisma = createPrismaClient({ env });
  const stockRuntimeDisabled = !stockFlags(env).domainEnabled && !stockFlags(env).syncWorkerEnabled && !stockFlags(env).sourceEnabled;
  try {
    await preflightWorkerDatabase({ prisma, env, queryDatabase });
    try {
      await runGate({ mode: provider === "postgresql" ? "production-readonly" : "post-migration", env });
    } catch (error) {
      // Test/isolated old-schema runs may intentionally lack the additive E2
      // migration while every stock flag is OFF. Production still fails closed
      // and must migrate before this artifact is deployed.
      if (!(env.NODE_ENV === "test" && stockRuntimeDisabled && error?.code === "TENANT_GATE_MIGRATION_PENDING")) throw error;
      logger.warn?.("stock_schema_pending_flags_off", { status: "disabled" });
    }
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
  const service = createAutomationService({ prisma, env });
  const notificationService = createNotificationService({ prisma, env });
  let stockWorker = null;
  if (shouldStartStockWorker(env)) {
    const { createStockServices } = require("../stock");
    const stockServices = createStockServices({ prisma, env, logger });
    stockWorker = { processDue: (options) => stockServices.worker(options) };
  }
  const worker = startAutomationWorker({ service, notificationService, stockWorker, env, logger });
  if (!worker.started) {
    await prisma.$disconnect();
    return 0;
  }
  return waitForShutdown(worker, prisma);
}

async function preflightWorkerDatabase({ prisma, env = process.env, queryDatabase = queryDatabaseWithServerTimeout } = {}) {
  return queryDatabase({ prisma, env, timeoutMs: 5000 });
}

function isRailwayEnvironment(env = process.env) {
  return Boolean(env.RAILWAY_SERVICE_ID || env.RAILWAY_DEPLOYMENT_ID || env.RAILWAY_PROJECT_ID || env.RAILWAY_VOLUME_MOUNT_PATH);
}

function resolveExpectedWorkerServiceId(env = process.env) {
  const environment = String(env.CRM_RAILWAY_ENVIRONMENT || "").trim().toLowerCase();
  if (environment !== "homolog") return OFFICIAL_WORKER_SERVICE_ID;
  const homologServiceId = String(env.CRM_RAILWAY_HOMOLOG_WORKER_SERVICE_ID || "").trim();
  if (!homologServiceId || !/^[A-Za-z0-9_-]+$/.test(homologServiceId)) throw new Error("RAILWAY_HOMOLOG_WORKER_SERVICE_ID_MISSING");
  return homologServiceId;
}

function assertWorkerTargetIdentity(env = process.env) {
  const homolog = String(env.CRM_RAILWAY_ENVIRONMENT || "").trim().toLowerCase() === "homolog";
  const expectedProjectId = homolog ? String(env.CRM_RAILWAY_HOMOLOG_PROJECT_ID || "").trim() : OFFICIAL_RAILWAY_PROJECT_ID;
  const expectedEnvironmentId = homolog ? String(env.CRM_RAILWAY_HOMOLOG_ENVIRONMENT_ID || "").trim() : OFFICIAL_RAILWAY_ENVIRONMENT_ID;
  if (!expectedProjectId || env.RAILWAY_PROJECT_ID !== expectedProjectId) throw new Error("RAILWAY_PROJECT_MISMATCH");
  if (!expectedEnvironmentId || env.RAILWAY_ENVIRONMENT_ID !== expectedEnvironmentId) throw new Error("RAILWAY_ENVIRONMENT_MISMATCH");
}

function validateWorkerRuntimeTarget(env = process.env) {
  if (!isRailwayEnvironment(env)) throw new Error("RAILWAY_WORKER_REQUIRED");
  if (env.NODE_ENV !== "production") throw new Error("NODE_ENV_PRODUCTION_REQUIRED");
  if (env.RAILWAY_SERVICE_ID !== resolveExpectedWorkerServiceId(env)) throw new Error("RAILWAY_WORKER_SERVICE_MISMATCH");
  assertWorkerTargetIdentity(env);
  const provider = databaseProviderFromEnv(env);
  if (provider !== "postgresql") throw new Error("RAILWAY_WORKER_POSTGRES_REQUIRED");
  return provider;
}

function waitForShutdown(worker, prisma) {
  return new Promise((resolve) => {
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      process.removeListener("SIGTERM", close);
      process.removeListener("SIGINT", close);
      await worker.stop();
      await prisma.$disconnect();
      resolve(worker.isFatal?.() ? 1 : 0);
    };
    process.once("SIGTERM", close);
    process.once("SIGINT", close);
    worker.waitForStop?.().then(close).catch(close);
  });
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function automationProvider(env = process.env) {
  const explicit = String(env.CRM_TEST_DATABASE_PROVIDER || env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "postgres" || explicit === "postgresql") return "postgresql";
  return "sqlite";
}

function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

if (require.main === module) {
  runAutomationWorkerProcess()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      createAutomationWorkerLogger({
        logger: console,
        workerInstanceId: `automation-worker-${process.pid}`,
        provider: automationProvider(process.env),
      }).error("worker_failed", error);
      process.exitCode = 1;
    });
}

module.exports = {
  WORKER_DEFAULTS,
  automationProvider,
  preflightWorkerDatabase,
  readAutomationWorkerConfig,
  runAutomationWorkerProcess,
  shouldStartAutomationWorker,
  shouldStartNotificationWorker,
  shouldStartStockWorker,
  shouldStartTemporalScanWorker,
  validateWorkerRuntimeTarget,
  startAutomationWorker,
};
