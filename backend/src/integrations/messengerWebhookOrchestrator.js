const { createMessengerWebhookIntake } = require("./messengerWebhookIntake");
const { processMessengerWebhookEvent } = require("./messengerWebhookProcessor");
const {
  FAILURE_STATE,
  calculateBackoffWithJitter,
  claimMetaInboundWebhook,
  normalizeRetryPolicy,
  recordMetaInboundFailure,
  wait,
} = require("./metaInboundRetry");

const PROVIDER = "MESSENGER";
const CHANNEL = Object.freeze({
  type: "MESSENGER_META",
  key: "messenger-meta-inbound-real",
  failureFallback: "MESSENGER_EVENT_PROCESSING_UNAVAILABLE",
});
const PROCESSING_CONFLICT_CODES = new Set([
  "MESSENGER_EVENT_UNSUPPORTED",
  "MESSENGER_EVENT_INTEGRATION_INVALID",
  "MESSENGER_EVENT_STATE_INVALID",
  "MESSENGER_EVENT_PAYLOAD_INVALID",
  "MESSENGER_EVENT_PAYLOAD_INTEGRITY_FAILED",
  "MESSENGER_EVENT_TIMESTAMP_INVALID",
  "MESSENGER_CONTACT_INTEGRITY_CONFLICT",
  "MESSENGER_CLIENT_INTEGRITY_CONFLICT",
  "MESSENGER_CONTACT_CLIENT_CONFLICT",
  "MESSENGER_LEAD_INTEGRITY_CONFLICT",
  "MESSENGER_LEAD_AMBIGUOUS",
  "MESSENGER_CONVERSATION_AMBIGUOUS",
  "MESSENGER_CONVERSATION_INTEGRITY_CONFLICT",
  "MESSENGER_MESSAGE_IDEMPOTENCY_CONFLICT",
  "MESSENGER_PROCESSED_EVENT_INCONSISTENT",
]);

function createMessengerWebhookOrchestrator({
  prisma,
  intake = createMessengerWebhookIntake({ prisma }),
  processEvent = processMessengerWebhookEvent,
  clock = () => new Date(),
  retryPolicy,
  waitForRetry = wait,
  random = Math.random,
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function"
    || typeof clock !== "function" || typeof waitForRetry !== "function" || typeof random !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao Messenger.");
  }
  const policy = normalizeRetryPolicy(retryPolicy);

  return async function orchestrateMessengerWebhook(payload, { env = process.env } = {}) {
    const intakeResult = await intake(payload, { env });
    const events = readAcceptedEvents(intakeResult);
    for (const event of events) {
      await processAcceptedEvent({
        prisma,
        eventoWebhookId: event.eventoWebhookId,
        processEvent,
        clock,
        policy,
        waitForRetry,
        random,
      });
    }
    return { accepted: true };
  };
}

function createMessengerStoredWebhookProcessor({
  prisma,
  processEvent = processMessengerWebhookEvent,
  clock = () => new Date(),
  retryPolicy,
  random = Math.random,
} = {}) {
  if (!prisma || typeof processEvent !== "function" || typeof clock !== "function" || typeof random !== "function") {
    throw new Error("Dependencias invalidas para o worker Messenger.");
  }
  const policy = normalizeRetryPolicy(retryPolicy);
  return ({ eventoWebhookId, leaseOwner }) => processAcceptedEvent({
    prisma,
    eventoWebhookId,
    processEvent,
    clock,
    policy,
    waitForRetry: wait,
    random,
    durableRetry: true,
    leaseOwner,
  });
}

async function processAcceptedEvent({
  prisma,
  eventoWebhookId,
  processEvent,
  clock,
  policy,
  waitForRetry,
  random,
  durableRetry = false,
  leaseOwner,
}) {
  let contentionAttempts = 0;
  while (true) {
    let claim;
    try {
      claim = await claimMetaInboundWebhook({
        prisma,
        eventoWebhookId,
        provider: PROVIDER,
        clock,
        policy,
        leaseOwner,
      });
    } catch {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }

    if (claim.state === "PROCESSED") return { state: "PROCESSED" };
    if (claim.state === "NOT_DUE") return { state: "NOT_DUE" };
    if (claim.state === FAILURE_STATE.PERMANENT) {
      throw orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
    }
    if (claim.state === FAILURE_STATE.EXHAUSTED) {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }
    if (claim.state === "LEASE_ACTIVE" || claim.state === "CAS_CONFLICT") {
      if (durableRetry) return { state: claim.state };
      if (contentionAttempts >= policy.maxContentionAttempts - 1) {
        throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
      }
      contentionAttempts += 1;
      await waitForRetry(calculateBackoffWithJitter({
        attempt: contentionAttempts,
        policy,
        random,
      }));
      continue;
    }
    if (claim.state !== "CLAIMED") {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }

    try {
      const processed = await processEvent({
        prisma,
        eventoWebhookId,
        lease: claim.lease,
      });
      if (processed?.processed !== true) {
        const error = new Error("MESSENGER_EVENT_PROCESSOR_INVALID_RESULT");
        error.code = "MESSENGER_EVENT_PROCESSOR_INVALID_RESULT";
        throw error;
      }
      return { state: "PROCESSED" };
    } catch (error) {
      let failure;
      try {
        failure = await recordMetaInboundFailure({
          prisma,
          eventoWebhookId,
          provider: PROVIDER,
          lease: claim.lease,
          error,
          channel: CHANNEL,
          permanentCodes: PROCESSING_CONFLICT_CODES,
          clock,
          policy,
          scheduleRetry: durableRetry,
          random,
        });
      } catch {
        throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
      }

      if (failure.state === FAILURE_STATE.RETRYABLE) {
        if (durableRetry) return { state: FAILURE_STATE.RETRYABLE };
        await waitForRetry(calculateBackoffWithJitter({
          attempt: claim.lease.attempt,
          policy,
          random,
        }));
        continue;
      }
      if (failure.state === "PROCESSED") return { state: "PROCESSED" };
      if (failure.state === "LEASE_LOST" || failure.state === "CAS_CONFLICT") {
        if (durableRetry) return { state: failure.state };
        if (contentionAttempts >= policy.maxContentionAttempts - 1) {
          throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
        }
        contentionAttempts += 1;
        await waitForRetry(calculateBackoffWithJitter({
          attempt: contentionAttempts,
          policy,
          random,
        }));
        continue;
      }
      throw mapProcessingError(error, failure.state);
    }
  }
}

async function recordProcessingFailure(prisma, eventoWebhookId, error, clock, { lease, retryPolicy } = {}) {
  return recordMetaInboundFailure({
    prisma,
    eventoWebhookId,
    provider: PROVIDER,
    lease,
    error,
    channel: CHANNEL,
    permanentCodes: PROCESSING_CONFLICT_CODES,
    clock,
    policy: retryPolicy,
  });
}

function readAcceptedEvents(result) {
  if (!result || result.accepted !== true || !Array.isArray(result.events) || result.events.length === 0) {
    throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
  }
  return result.events.map((event) => {
    if (
      !Number.isInteger(event?.eventoWebhookId)
      || event.eventoWebhookId < 1
      || typeof event.created !== "boolean"
    ) {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }
    return { eventoWebhookId: event.eventoWebhookId, created: event.created };
  }).sort((left, right) => left.eventoWebhookId - right.eventoWebhookId);
}

function mapProcessingError(error, state) {
  if (state === FAILURE_STATE.PERMANENT
    || (error?.name === "MessengerWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code))) {
    return orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
  }
  return orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
}

function orchestrationError(status, code) {
  const error = new Error(code);
  error.name = "MessengerWebhookOrchestrationError";
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  createMessengerStoredWebhookProcessor,
  createMessengerWebhookOrchestrator,
  recordProcessingFailure,
};
