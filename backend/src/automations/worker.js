const crypto = require("node:crypto");
const { maintenanceReadOnlyEnabled } = require("../database/maintenance-read-only");
const { WORKER_ACTION_TYPES } = require("./actions");
const { createAutomationWorkerLogger } = require("./worker-observability");
const { databaseProviderFromEnv } = require("../../scripts/prisma-runtime.cjs");
const { runGate } = require("../../scripts/tenant-isolation-gate.cjs");

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
  const temporalScanEnabled = shouldStartTemporalScanWorker(env);
  if ((!service && !notificationService) || (!automationEnabled && !notificationsEnabled)) {
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

  function markStopped() {
    if (stopped) return;
    stopped = true;
    resolveStopped();
  }

  eventLogger.info("worker_started", {
    status: "started",
    automationEnabled,
    notificationsEnabled,
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
        await notificationService.processDue({ now, limit: config.batchSize });
      } catch (error) {
        notificationsFailed = true;
        eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt), subsystem: "notifications" });
      }
    }
    const automationActive = automationEnabled && Boolean(service);
    const notificationsActive = notificationsEnabled && Boolean(notificationService?.processDue);
    if (automationActive) consecutiveAutomationFailures = automationFailed ? consecutiveAutomationFailures + 1 : 0;
    if (notificationsActive) consecutiveNotificationFailures = notificationsFailed ? consecutiveNotificationFailures + 1 : 0;
    const unhealthySubsystem = consecutiveAutomationFailures >= MAX_CONSECUTIVE_FULL_FAILURES
      ? "automation"
      : consecutiveNotificationFailures >= MAX_CONSECUTIVE_FULL_FAILURES ? "notifications" : null;
    if (unhealthySubsystem) {
      stopping = true;
      fatal = true;
      eventLogger.error("worker_unhealthy", new Error("Falhas consecutivas no subsistema ativo."), {
        durationMs: elapsedMs(startedAt),
        subsystem: unhealthySubsystem,
        consecutiveFailures: unhealthySubsystem === "automation" ? consecutiveAutomationFailures : consecutiveNotificationFailures,
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

async function runAutomationWorkerProcess({ env = process.env, logger = console } = {}) {
  require("dotenv").config();
  const { createPrismaClient } = require("../database/prisma-client");
  const { createAutomationService } = require("./service");
  const { createNotificationService } = require("../notifications/service");
  if (isRailwayEnvironment(env) && env.NODE_ENV !== "production") {
    throw new Error("NODE_ENV_PRODUCTION_REQUIRED");
  }
  if (!isRailwayEnvironment(env)) {
    throw new Error("RAILWAY_WORKER_REQUIRED");
  }
  if (isRailwayEnvironment(env) && env.RAILWAY_SERVICE_ID !== resolveExpectedWorkerServiceId(env)) {
    throw new Error("RAILWAY_WORKER_SERVICE_MISMATCH");
  }
  assertWorkerTargetIdentity(env);
  const provider = databaseProviderFromEnv(env);
  if (isRailwayEnvironment(env) && provider !== "postgresql") {
    throw new Error("RAILWAY_WORKER_POSTGRES_REQUIRED");
  }
  const prisma = createPrismaClient({ env });
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("WORKER_DATABASE_PREFLIGHT_TIMEOUT")), 5000)),
    ]);
    await runGate({ mode: provider === "postgresql" ? "production-readonly" : "post-migration", env });
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
  const service = createAutomationService({ prisma, env });
  const notificationService = createNotificationService({ prisma, env });
  const worker = startAutomationWorker({ service, notificationService, env, logger });
  if (!worker.started) {
    await prisma.$disconnect();
    return 0;
  }
  return waitForShutdown(worker, prisma);
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
  readAutomationWorkerConfig,
  runAutomationWorkerProcess,
  shouldStartAutomationWorker,
  shouldStartNotificationWorker,
  shouldStartTemporalScanWorker,
  startAutomationWorker,
};
