const { createWhatsAppWebhookIntake } = require("./whatsappWebhookIntake");
const { processWhatsAppWebhookEvent } = require("./whatsappWebhookProcessor");

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
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao WhatsApp.");
  }

  return async function orchestrateWhatsAppWebhook(payload, { env = process.env } = {}) {
    const intakeResult = await intake(payload, { env });
    const events = readAcceptedEvents(intakeResult);

    for (const event of events) {
      try {
        await processEvent({ prisma, eventoWebhookId: event.eventoWebhookId });
      } catch (error) {
        throw mapProcessingError(error);
      }
    }

    return { accepted: true };
  };
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

function mapProcessingError(error) {
  if (error?.name === "WhatsAppWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code)) {
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
};
