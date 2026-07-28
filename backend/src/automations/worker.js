const crypto = require("node:crypto");
const { maintenanceReadOnlyEnabled } = require("../database/maintenance-read-only");

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
  env = process.env,
  logger = console,
  workerId = `automation-worker-${process.pid}-${crypto.randomUUID()}`,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (!service || !shouldStartAutomationWorker(env)) {
    logInfo(logger, "worker_disabled", { workerId });
    return { started: false, async stop() {} };
  }

  const config = readAutomationWorkerConfig(env);
  let running = false;
  let stopping = false;
  let timer = null;
  let activeCycle = Promise.resolve();

  logInfo(logger, "worker_started", { workerId, status: "started" });

  async function cycle() {
    if (running || stopping) return;
    running = true;
    const startedAt = Date.now();
    logInfo(logger, "polling_started", { workerId });
    try {
      await service.processDueJobs({
        now: new Date(),
        limit: config.batchSize,
        leaseOwner: workerId,
        leaseMs: config.leaseMs,
        executionTimeoutMs: config.executionTimeoutMs,
        maxAttempts: config.maxAttempts,
        supportedActions: ["CREATE_INTERNAL_EVENT"],
      });
    } catch (error) {
      logError(logger, "job_failed", error, { workerId });
    } finally {
      running = false;
      logInfo(logger, "polling_finished", { workerId, durationMs: Date.now() - startedAt });
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
      logInfo(logger, "worker_stopping", { workerId });
      if (timer) clearTimeoutImpl(timer);
      timer = null;
      await activeCycle;
      logInfo(logger, "worker_stopped", { workerId });
    },
  };
}

async function runAutomationWorkerProcess({ env = process.env, logger = console } = {}) {
  require("dotenv").config();
  const { createPrismaClient } = require("../database/prisma-client");
  const { createAutomationService } = require("./service");
  const prisma = createPrismaClient({ env });
  const service = createAutomationService({ prisma, env });
  const worker = startAutomationWorker({ service, env, logger });
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

function logInfo(logger, event, fields = {}) {
  logger.log(JSON.stringify({ event, ...sanitizeLogFields(fields) }));
}

function logError(logger, event, error, fields = {}) {
  logger.error(JSON.stringify({
    event,
    ...sanitizeLogFields(fields),
    errorCode: String(error?.codigo || error?.code || "AUTOMATION_WORKER_ERROR").slice(0, 80),
  }));
}

function sanitizeLogFields(fields) {
  const allowed = {};
  for (const key of ["workerId", "tenantId", "ruleId", "jobId", "executionId", "attempt", "durationMs", "status", "errorCode"]) {
    if (fields[key] !== undefined && fields[key] !== null) allowed[key] = fields[key];
  }
  return allowed;
}

if (require.main === module) {
  runAutomationWorkerProcess()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(JSON.stringify({ event: "worker_failed", errorCode: String(error?.code || "WORKER_START_FAILED").slice(0, 80) }));
      process.exitCode = 1;
    });
}

module.exports = {
  WORKER_DEFAULTS,
  readAutomationWorkerConfig,
  runAutomationWorkerProcess,
  shouldStartAutomationWorker,
  startAutomationWorker,
};
