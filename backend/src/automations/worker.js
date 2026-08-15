const crypto = require("node:crypto");
const { maintenanceReadOnlyEnabled } = require("../database/maintenance-read-only");
const { WORKER_ACTION_TYPES } = require("./actions");
const { createAutomationWorkerLogger } = require("./worker-observability");

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

function shouldStartAutomationWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const flag = String(env.AUTOMATION_WORKER_ENABLED || "").trim().toLowerCase();
  return env.NODE_ENV !== "test" && (flag === "true" || flag === "1");
}

function shouldStartNotificationWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const flag = String(env.NOTIFICATIONS_WORKER_ENABLED || "").trim().toLowerCase();
  return env.NODE_ENV !== "test" && (flag === "true" || flag === "1");
}

function readAutomationWorkerConfig(env = process.env) {
  return {
    batchSize: boundedInteger(env.AUTOMATION_WORKER_BATCH_SIZE, WORKER_DEFAULTS.batchSize, ...WORKER_LIMITS.batchSize),
    pollIntervalMs: boundedInteger(
      env.AUTOMATION_WORKER_POLL_INTERVAL_MS || env.AUTOMATION_WORKER_INTERVAL_MS,
      WORKER_DEFAULTS.pollIntervalMs,
      ...WORKER_LIMITS.pollIntervalMs,
    ),
    leaseMs: boundedInteger(env.AUTOMATION_WORKER_LEASE_MS, WORKER_DEFAULTS.leaseMs, ...WORKER_LIMITS.leaseMs),
    executionTimeoutMs: boundedInteger(
      env.AUTOMATION_WORKER_EXECUTION_TIMEOUT_MS,
      WORKER_DEFAULTS.executionTimeoutMs,
      ...WORKER_LIMITS.executionTimeoutMs,
    ),
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
  if ((!service && !notificationService) || (!automationEnabled && !notificationsEnabled)) {
    eventLogger.info("worker_disabled", { status: "disabled" });
    return { started: false, async stop() {} };
  }

  const config = readAutomationWorkerConfig(env);
  let running = false;
  let stopping = false;
  let timer = null;
  let activeCycle = Promise.resolve();

  eventLogger.info("worker_started", {
    status: "started",
    automationEnabled,
    notificationsEnabled,
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
    try {
      const now = new Date();
      if (automationEnabled && service) {
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
      }
      if (notificationsEnabled && notificationService?.processDue) {
        await notificationService.processDue({ now, limit: config.batchSize });
      }
    } catch (error) {
      eventLogger.error("worker_poll_error", error, { durationMs: elapsedMs(startedAt) });
    } finally {
      running = false;
      if (!stopping) timer = setTimeoutImpl(() => {
        activeCycle = cycle();
      }, config.pollIntervalMs);
    }
  }

  timer = setTimeoutImpl(() => {
    activeCycle = cycle();
  }, config.pollIntervalMs);

  return {
    started: true,
    workerId,
    config,
    async stop() {
      if (stopping) return activeCycle;
      stopping = true;
      eventLogger.info("worker_stopping", { status: "stopping" });
      if (timer) clearTimeoutImpl(timer);
      timer = null;
      await activeCycle;
      eventLogger.info("worker_stopped", { status: "stopped" });
    },
  };
}

async function runAutomationWorkerProcess({ env = process.env, logger = console } = {}) {
  require("dotenv").config();
  const { createPrismaClient } = require("../database/prisma-client");
  const { createAutomationService } = require("./service");
  const { createNotificationService } = require("../notifications/service");
  const prisma = createPrismaClient({ env });
  const service = createAutomationService({ prisma, env });
  const notificationService = createNotificationService({ prisma, env });
  const worker = startAutomationWorker({ service, notificationService, env, logger });
  if (!worker.started) {
    await prisma.$disconnect();
    return 0;
  }
  await waitForShutdown(worker, prisma);
  return 0;
}

function waitForShutdown(worker, prisma) {
  return new Promise((resolve) => {
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await worker.stop();
      await prisma.$disconnect();
      resolve();
    };
    process.once("SIGTERM", close);
    process.once("SIGINT", close);
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
  startAutomationWorker,
};
