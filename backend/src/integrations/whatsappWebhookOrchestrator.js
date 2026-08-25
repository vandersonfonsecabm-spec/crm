const { createWhatsAppWebhookIntake } = require("./whatsappWebhookIntake");
const { processWhatsAppWebhookEvent } = require("./whatsappWebhookProcessor");
const {
  FAILURE_STATE,
  calculateBackoffWithJitter,
  claimMetaInboundWebhook,
  normalizeRetryPolicy,
  recordMetaInboundFailure,
  wait,
} = require("./metaInboundRetry");

const PROVIDER = "WHATSAPP";
const CHANNEL = Object.freeze({
  type: "WHATSAPP_META",
  key: "whatsapp-meta-inbound-real",
  failureFallback: "WHATSAPP_EVENT_PROCESSING_UNAVAILABLE",
});
const PROCESSING_CONFLICT_CODES = new Set([
  "WHATSAPP_EVENT_UNSUPPORTED",
  "WHATSAPP_EVENT_INTEGRATION_INVALID",
  "WHATSAPP_EVENT_STATE_INVALID",
  "WHATSAPP_EVENT_PAYLOAD_INVALID",
  "WHATSAPP_EVENT_PAYLOAD_INTEGRITY_FAILED",
  "WHATSAPP_EVENT_CONTACT_CONFLICT",
  "WHATSAPP_EVENT_CONTACT_INVALID",
  "WHATSAPP_EVENT_TIMESTAMP_INVALID",
  "WHATSAPP_CONTACT_INTEGRITY_CONFLICT",
  "WHATSAPP_CLIENT_INTEGRITY_CONFLICT",
  "WHATSAPP_CONTACT_CLIENT_CONFLICT",
  "WHATSAPP_CLIENT_AMBIGUOUS",
  "WHATSAPP_LEAD_INTEGRITY_CONFLICT",
  "WHATSAPP_LEAD_AMBIGUOUS",
  "WHATSAPP_CONVERSATION_AMBIGUOUS",
  "WHATSAPP_CONVERSATION_INTEGRITY_CONFLICT",
  "WHATSAPP_MESSAGE_IDEMPOTENCY_CONFLICT",
  "WHATSAPP_PROCESSED_EVENT_INCONSISTENT",
]);

function createWhatsAppWebhookOrchestrator({
  prisma,
  intake = createWhatsAppWebhookIntake({ prisma }),
  processEvent = processWhatsAppWebhookEvent,
  clock = () => new Date(),
  retryPolicy,
  waitForRetry = wait,
  random = Math.random,
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function"
    || typeof clock !== "function" || typeof waitForRetry !== "function" || typeof random !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao WhatsApp.");
  }
  const policy = normalizeRetryPolicy(retryPolicy);

  return async function orchestrateWhatsAppWebhook(payload, { env = process.env } = {}) {
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
        const error = new Error("WHATSAPP_EVENT_PROCESSOR_INVALID_RESULT");
        error.code = "WHATSAPP_EVENT_PROCESSOR_INVALID_RESULT";
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
  const events = result.events.map((event) => {
    if (!Number.isInteger(event?.eventoWebhookId) || event.eventoWebhookId < 1 || typeof event.created !== "boolean") {
      throw orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
    }
    return { eventoWebhookId: event.eventoWebhookId, created: event.created };
  });
  events.sort((left, right) => left.eventoWebhookId - right.eventoWebhookId);
  return events;
}

function mapProcessingError(error, state) {
  if (state === FAILURE_STATE.PERMANENT
    || (error?.name === "WhatsAppWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code))) {
    return orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
  }
  return orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
}

function orchestrationError(status, code) {
  const error = new Error(code);
  error.name = "WhatsAppWebhookOrchestrationError";
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  createWhatsAppWebhookOrchestrator,
  recordProcessingFailure,
};
