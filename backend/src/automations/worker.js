const MIN_INTERVAL_MS = 30000;
const MAX_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60000;

function shouldStartAutomationWorker(env = process.env) {
  return env.NODE_ENV !== "test" && env.AUTOMATION_WORKER_ENABLED === "true";
}

function startAutomationWorker({ service, env = process.env, logger = console } = {}) {
  if (!service || !shouldStartAutomationWorker(env)) return { started: false, stop() {} };
  const intervalMs = boundedInteger(env.AUTOMATION_WORKER_INTERVAL_MS, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS);
  let running = false;
  let stopped = false;
  let timer = null;

  async function cycle() {
    if (running || stopped) return;
    running = true;
    try {
      await service.scanTemporalTriggers({ limit: 50 });
      await service.processDueJobs({ limit: 25 });
    } catch (error) {
      logger.error("Falha no ciclo de automacoes.", { code: String(error?.codigo || error?.code || "AUTOMATION_WORKER_ERROR") });
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(cycle, intervalMs);
    }
  }

  timer = setTimeout(cycle, intervalMs);
  return {
    started: true,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

module.exports = { startAutomationWorker, shouldStartAutomationWorker };
