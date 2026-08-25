const PROCESSING_STATUS = Object.freeze({
  RECEIVED: "RECEBIDO",
  PROCESSING: "PROCESSANDO",
  PROCESSED: "PROCESSADO",
  FAILED: "FALHOU",
});

const FAILURE_STATE = Object.freeze({
  RETRYABLE: "RETRYABLE",
  PERMANENT: "PERMANENT",
  EXHAUSTED: "EXHAUSTED",
});

const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  leaseMs: 30_000,
  baseDelayMs: 25,
  maxDelayMs: 250,
});

const RETRY_POLICY_LIMITS = Object.freeze({
  maxAttempts: [1, 5],
  leaseMs: [1_000, 5 * 60_000],
  baseDelayMs: [0, 5_000],
  maxDelayMs: [0, 30_000],
});

function normalizeRetryPolicy(input = {}) {
  const baseDelayMs = boundedInteger(
    input?.baseDelayMs,
    DEFAULT_RETRY_POLICY.baseDelayMs,
    ...RETRY_POLICY_LIMITS.baseDelayMs,
  );
  const maxDelayMs = Math.max(baseDelayMs, boundedInteger(
    input?.maxDelayMs,
    DEFAULT_RETRY_POLICY.maxDelayMs,
    ...RETRY_POLICY_LIMITS.maxDelayMs,
  ));
  return {
    maxAttempts: boundedInteger(
      input?.maxAttempts,
      DEFAULT_RETRY_POLICY.maxAttempts,
      ...RETRY_POLICY_LIMITS.maxAttempts,
    ),
    leaseMs: boundedInteger(
      input?.leaseMs,
      DEFAULT_RETRY_POLICY.leaseMs,
      ...RETRY_POLICY_LIMITS.leaseMs,
    ),
    baseDelayMs,
    maxDelayMs,
  };
}

function calculateBackoffWithJitter({ attempt, policy = DEFAULT_RETRY_POLICY, random = Math.random } = {}) {
  const normalized = normalizeRetryPolicy(policy);
  const ordinal = Math.max(1, Number.isInteger(attempt) ? attempt : 1);
  const ceiling = Math.min(
    normalized.maxDelayMs,
    normalized.baseDelayMs * (2 ** Math.max(0, ordinal - 1)),
  );
  if (ceiling === 0) return 0;
  const sample = Number(random());
  const boundedSample = Number.isFinite(sample)
    ? Math.min(0.999999999, Math.max(0, sample))
    : 0.5;
  return Math.floor((ceiling + 1) * boundedSample);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimMetaInboundWebhook({
  prisma,
  eventoWebhookId,
  provider,
  clock = () => new Date(),
  policy = DEFAULT_RETRY_POLICY,
} = {}) {
  if (!prisma || !Number.isInteger(eventoWebhookId) || eventoWebhookId < 1 || !safeProvider(provider)) {
    return { state: "INVALID" };
  }
  const normalizedPolicy = normalizeRetryPolicy(policy);
  const event = await prisma.eventoWebhook.findUnique({
    where: { id: eventoWebhookId },
    select: claimSelection(),
  });
  if (!event || event.provedor !== provider) return { state: "NOT_FOUND" };
  if (event.statusProcessamento === PROCESSING_STATUS.PROCESSED && event.processadoEm) {
    return { state: "PROCESSED" };
  }
  if (event.statusProcessamento === PROCESSING_STATUS.FAILED) {
    return { state: terminalState(event.erroResumo) };
  }
  if (event.processadoEm !== null || !isValidDate(event.updatedAt)) return { state: "INVALID" };

  const claimedAt = validClock(clock);
  const recoveringLease = event.statusProcessamento === PROCESSING_STATUS.PROCESSING;
  if (recoveringLease && !leaseExpired(event.updatedAt, claimedAt, normalizedPolicy.leaseMs)) {
    return { state: "LEASE_ACTIVE" };
  }
  if (!recoveringLease && event.statusProcessamento !== PROCESSING_STATUS.RECEIVED) {
    return { state: "INVALID" };
  }
  if (!Number.isInteger(event.tentativas) || event.tentativas < 0) return { state: "INVALID" };

  if (event.tentativas >= normalizedPolicy.maxAttempts) {
    return exhaustClaim({ prisma, event, provider });
  }

  const leaseStartedAt = nextLeaseTimestamp(event.updatedAt, claimedAt);
  const claimed = await prisma.eventoWebhook.updateMany({
    where: claimWhere(event, provider),
    data: {
      statusProcessamento: PROCESSING_STATUS.PROCESSING,
      tentativas: { increment: 1 },
      erroCodigo: null,
      erroResumo: null,
      updatedAt: leaseStartedAt,
    },
  });
  if (claimed.count !== 1) return { state: "CAS_CONFLICT" };
  return {
    state: "CLAIMED",
    recoveredLease: recoveringLease,
    lease: {
      eventoWebhookId: event.id,
      provider,
      attempt: event.tentativas + 1,
      updatedAt: leaseStartedAt,
    },
  };
}

async function recordMetaInboundFailure({
  prisma,
  eventoWebhookId,
  provider,
  lease,
  error,
  channel,
  permanentCodes = new Set(),
  clock = () => new Date(),
  policy = DEFAULT_RETRY_POLICY,
} = {}) {
  if (!prisma || !Number.isInteger(eventoWebhookId) || eventoWebhookId < 1 || !safeProvider(provider)) {
    return { state: "INVALID", recorded: false };
  }
  const normalizedPolicy = normalizeRetryPolicy(policy);
  const failureCode = sanitizeFailureCode(error?.code, channel?.failureFallback);
  const permanent = error?.retryable === false || permanentCodes.has(error?.code);
  const failedAt = validClock(clock);

  return prisma.$transaction(async (tx) => {
    const event = await tx.eventoWebhook.findUnique({
      where: { id: eventoWebhookId },
      select: claimSelection(),
    });
    if (!event || event.provedor !== provider) return { state: "NOT_FOUND", recorded: false };
    if (event.statusProcessamento === PROCESSING_STATUS.PROCESSED && event.processadoEm) {
      return { state: "PROCESSED", recorded: false };
    }
    if (!isMatchingLease(event, lease)) return { state: "LEASE_LOST", recorded: false };

    const state = permanent
      ? FAILURE_STATE.PERMANENT
      : event.tentativas >= normalizedPolicy.maxAttempts
        ? FAILURE_STATE.EXHAUSTED
        : FAILURE_STATE.RETRYABLE;
    const updated = await tx.eventoWebhook.updateMany({
      where: {
        ...claimWhere(event, provider),
        statusProcessamento: PROCESSING_STATUS.PROCESSING,
      },
      data: {
        statusProcessamento: state === FAILURE_STATE.RETRYABLE
          ? PROCESSING_STATUS.RECEIVED
          : PROCESSING_STATUS.FAILED,
        erroCodigo: failureCode,
        erroResumo: state,
      },
    });
    if (updated.count !== 1) return { state: "LEASE_LOST", recorded: false };

    if (validChannel(channel)) {
      await tx.canalIntegracao.updateMany({
        where: {
          id: event.canalIntegracaoId,
          empresaId: event.empresaId,
          tipo: channel.type,
          chaveInterna: channel.key,
          modoTeste: false,
          ativo: true,
          status: "ATIVO",
        },
        data: {
          lastFailureAt: failedAt,
          lastFailureCode: failureCode,
        },
      });
    }
    return { state, recorded: true, attempt: event.tentativas };
  });
}

function isMatchingLease(event, lease) {
  return Boolean(
    event
    && lease
    && lease.eventoWebhookId === event.id
    && lease.provider === event.provedor
    && Number.isInteger(lease.attempt)
    && lease.attempt === event.tentativas
    && sameDate(lease.updatedAt, event.updatedAt)
    && event.statusProcessamento === PROCESSING_STATUS.PROCESSING
    && event.processadoEm === null,
  );
}

function sameDate(left, right) {
  return isValidDate(left) && isValidDate(right) && left.getTime() === right.getTime();
}

async function exhaustClaim({ prisma, event, provider }) {
  const exhausted = await prisma.eventoWebhook.updateMany({
    where: claimWhere(event, provider),
    data: {
      statusProcessamento: PROCESSING_STATUS.FAILED,
      erroCodigo: `${provider}_EVENT_ATTEMPTS_EXHAUSTED`,
      erroResumo: FAILURE_STATE.EXHAUSTED,
    },
  });
  return exhausted.count === 1
    ? { state: FAILURE_STATE.EXHAUSTED, recorded: true, attempt: event.tentativas }
    : { state: "CAS_CONFLICT" };
}

function claimWhere(event, provider) {
  return {
    id: event.id,
    empresaId: event.empresaId,
    canalIntegracaoId: event.canalIntegracaoId,
    provedor: provider,
    statusProcessamento: event.statusProcessamento,
    processadoEm: null,
    updatedAt: event.updatedAt,
  };
}

function claimSelection() {
  return {
    id: true,
    empresaId: true,
    canalIntegracaoId: true,
    provedor: true,
    statusProcessamento: true,
    tentativas: true,
    processadoEm: true,
    erroResumo: true,
    updatedAt: true,
  };
}

function terminalState(value) {
  return value === FAILURE_STATE.EXHAUSTED
    ? FAILURE_STATE.EXHAUSTED
    : FAILURE_STATE.PERMANENT;
}

function leaseExpired(updatedAt, now, leaseMs) {
  return updatedAt.getTime() <= now.getTime() - leaseMs;
}

function nextLeaseTimestamp(previous, now) {
  return new Date(Math.max(now.getTime(), previous.getTime() + 1));
}

function sanitizeFailureCode(value, fallback) {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)
    ? value
    : safeProvider(fallback) ? fallback : "META_EVENT_PROCESSING_UNAVAILABLE";
}

function validChannel(value) {
  return Boolean(value)
    && typeof value.type === "string"
    && typeof value.key === "string";
}

function validClock(clock) {
  const value = typeof clock === "function" ? clock() : null;
  return isValidDate(value) ? value : new Date();
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function safeProvider(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(value);
}

function boundedInteger(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

module.exports = {
  DEFAULT_RETRY_POLICY,
  FAILURE_STATE,
  PROCESSING_STATUS,
  calculateBackoffWithJitter,
  claimMetaInboundWebhook,
  isMatchingLease,
  normalizeRetryPolicy,
  recordMetaInboundFailure,
  sameDate,
  wait,
};
