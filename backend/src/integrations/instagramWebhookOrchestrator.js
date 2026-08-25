const { createInstagramWebhookIntake } = require("./instagramWebhookIntake");
const { processInstagramWebhookEvent } = require("./instagramWebhookProcessor");
const {
  FAILURE_STATE,
  calculateBackoffWithJitter,
  claimMetaInboundWebhook,
  normalizeRetryPolicy,
  recordMetaInboundFailure,
  wait,
} = require("./metaInboundRetry");

const PROVIDER = "INSTAGRAM";
const CHANNEL = Object.freeze({
  type: "INSTAGRAM_META",
  key: "instagram-meta-inbound-real",
  failureFallback: "INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE",
});
const PROCESSING_CONFLICT_CODES = new Set([
  "INSTAGRAM_EVENT_UNSUPPORTED",
  "INSTAGRAM_EVENT_INTEGRATION_INVALID",
  "INSTAGRAM_EVENT_STATE_INVALID",
  "INSTAGRAM_EVENT_PAYLOAD_INVALID",
  "INSTAGRAM_EVENT_PAYLOAD_INTEGRITY_FAILED",
  "INSTAGRAM_EVENT_TIMESTAMP_INVALID",
  "INSTAGRAM_CONTACT_INTEGRITY_CONFLICT",
  "INSTAGRAM_CLIENT_INTEGRITY_CONFLICT",
  "INSTAGRAM_CONTACT_CLIENT_CONFLICT",
  "INSTAGRAM_LEAD_INTEGRITY_CONFLICT",
  "INSTAGRAM_LEAD_AMBIGUOUS",
  "INSTAGRAM_CONVERSATION_AMBIGUOUS",
  "INSTAGRAM_CONVERSATION_INTEGRITY_CONFLICT",
  "INSTAGRAM_MESSAGE_IDEMPOTENCY_CONFLICT",
  "INSTAGRAM_PROCESSED_EVENT_INCONSISTENT",
]);

function createInstagramWebhookOrchestrator({
  prisma,
  intake = createInstagramWebhookIntake({ prisma }),
  processEvent = processInstagramWebhookEvent,
  clock = () => new Date(),
  retryPolicy,
  waitForRetry = wait,
  random = Math.random,
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function"
    || typeof clock !== "function" || typeof waitForRetry !== "function" || typeof random !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao Instagram.");
  }
  const policy = normalizeRetryPolicy(retryPolicy);

  return async function orchestrateInstagramWebhook(payload, { env = process.env } = {}) {
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

async function processAcceptedEvent({
  prisma,
  eventoWebhookId,
  processEvent,
  clock,
  policy,
  waitForRetry,
  random,
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
      });
    } catch {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }

    if (claim.state === "PROCESSED") return;
    if (claim.state === FAILURE_STATE.PERMANENT) {
      throw orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
    }
    if (claim.state === FAILURE_STATE.EXHAUSTED) {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }
    if (claim.state === "LEASE_ACTIVE" || claim.state === "CAS_CONFLICT") {
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
        const error = new Error("INSTAGRAM_EVENT_PROCESSOR_INVALID_RESULT");
        error.code = "INSTAGRAM_EVENT_PROCESSOR_INVALID_RESULT";
        throw error;
      }
      return;
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
        });
      } catch {
        throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
      }

      if (failure.state === FAILURE_STATE.RETRYABLE) {
        await waitForRetry(calculateBackoffWithJitter({
          attempt: claim.lease.attempt,
          policy,
          random,
        }));
        continue;
      }
      if (failure.state === "PROCESSED") return;
      if (failure.state === "LEASE_LOST" || failure.state === "CAS_CONFLICT") {
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
    || (error?.name === "InstagramWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code))) {
    return orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
  }
  return orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
}

function orchestrationError(status, code) {
  const error = new Error(code);
  error.name = "InstagramWebhookOrchestrationError";
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  createInstagramWebhookOrchestrator,
  recordProcessingFailure,
};
