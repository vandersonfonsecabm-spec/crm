const { createWhatsAppStoredWebhookProcessor } = require("./whatsappWebhookOrchestrator");
const { createInstagramStoredWebhookProcessor } = require("./instagramWebhookOrchestrator");
const { createMessengerStoredWebhookProcessor } = require("./messengerWebhookOrchestrator");
const { maintenanceReadOnlyEnabled } = require("../database/maintenance-read-only");

const PROVIDERS = Object.freeze(["WHATSAPP", "INSTAGRAM", "MESSENGER"]);
const DEFAULTS = Object.freeze({
  batchSize: 10,
  leaseMs: 30_000,
  maxAttempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 30_000,
});

function shouldStartMetaInboundWebhookWorker(env = process.env) {
  if (maintenanceReadOnlyEnabled(env)) return false;
  const flag = String(env.META_INBOUND_WORKER_ENABLED || "").trim().toLowerCase();
  return env.NODE_ENV === "production" && (flag === "true" || flag === "1");
}

function readMetaInboundWebhookWorkerConfig(env = process.env) {
  return {
    batchSize: boundedInteger(env.META_INBOUND_WORKER_BATCH_SIZE, DEFAULTS.batchSize, 1, 50),
    leaseMs: boundedInteger(env.META_INBOUND_WORKER_LEASE_MS, DEFAULTS.leaseMs, 10_000, 5 * 60_000),
    maxAttempts: boundedInteger(env.META_INBOUND_WORKER_MAX_ATTEMPTS, DEFAULTS.maxAttempts, 1, 5),
    baseDelayMs: boundedInteger(env.META_INBOUND_WORKER_RETRY_BASE_MS, DEFAULTS.baseDelayMs, 0, 5_000),
    maxDelayMs: boundedInteger(env.META_INBOUND_WORKER_RETRY_MAX_MS, DEFAULTS.maxDelayMs, 0, 30_000),
  };
}

function createMetaInboundWebhookWorker({
  prisma,
  env = process.env,
  clock = () => new Date(),
  random = Math.random,
  storedProcessors = null,
} = {}) {
  if (!prisma || typeof clock !== "function" || typeof random !== "function") {
    throw new Error("Dependencias invalidas para o worker Meta inbound.");
  }
  const config = readMetaInboundWebhookWorkerConfig(env);
  const retryPolicy = {
    maxAttempts: config.maxAttempts,
    leaseMs: config.leaseMs,
    baseDelayMs: config.baseDelayMs,
    maxDelayMs: config.maxDelayMs,
  };
  const processors = storedProcessors || Object.freeze({
      WHATSAPP: createWhatsAppStoredWebhookProcessor({ prisma, clock, retryPolicy, random }),
      INSTAGRAM: createInstagramStoredWebhookProcessor({ prisma, clock, retryPolicy, random }),
      MESSENGER: createMessengerStoredWebhookProcessor({ prisma, clock, retryPolicy, random }),
    });
  if (PROVIDERS.some((provider) => typeof processors[provider] !== "function")) {
    throw new Error("Processadores invalidos para o worker Meta inbound.");
  }

  async function processDue({ now = clock(), limit = config.batchSize, leaseOwner } = {}) {
    const effectiveNow = validDate(now) ? now : clock();
    if (!validDate(effectiveNow)) throw new Error("Relogio invalido para o worker Meta inbound.");
    if (!safeLeaseOwner(leaseOwner)) throw new Error("Owner invalido para o worker Meta inbound.");
    const boundedLimit = boundedInteger(limit, config.batchSize, 1, 50);
    const legacyLeaseCutoff = new Date(effectiveNow.getTime() - config.leaseMs);
    const events = await prisma.eventoWebhook.findMany({
      where: {
        provedor: { in: PROVIDERS },
        processadoEm: null,
        OR: [
          {
            statusProcessamento: "RECEBIDO",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: effectiveNow } }],
          },
          {
            statusProcessamento: "PROCESSANDO",
            OR: [
              { leaseExpiresAt: { lte: effectiveNow } },
              { leaseExpiresAt: null, updatedAt: { lte: legacyLeaseCutoff } },
            ],
          },
        ],
      },
      select: { id: true, provedor: true },
      orderBy: [{ recebidoEm: "asc" }, { id: "asc" }],
      take: boundedLimit,
    });

    const result = { found: events.length, processed: 0, deferred: 0, failed: 0 };
    for (const event of events) {
      const processor = processors[event.provedor];
      if (!processor) {
        result.failed += 1;
        continue;
      }
      try {
        const outcome = await processor({ eventoWebhookId: event.id, leaseOwner });
        if (outcome?.state === "PROCESSED") result.processed += 1;
        else if (["RETRYABLE", "NOT_DUE", "LEASE_ACTIVE", "CAS_CONFLICT", "LEASE_LOST"].includes(outcome?.state)) {
          result.deferred += 1;
        } else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  return { config, processDue };
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function validDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function safeLeaseOwner(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value);
}

module.exports = {
  DEFAULTS,
  PROVIDERS,
  createMetaInboundWebhookWorker,
  readMetaInboundWebhookWorkerConfig,
  shouldStartMetaInboundWebhookWorker,
};
