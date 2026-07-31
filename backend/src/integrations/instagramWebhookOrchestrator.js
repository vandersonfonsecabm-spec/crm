const { createInstagramWebhookIntake } = require("./instagramWebhookIntake");
const { processInstagramWebhookEvent } = require("./instagramWebhookProcessor");

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
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao Instagram.");
  }
  return async function orchestrateInstagramWebhook(payload, { env = process.env } = {}) {
    const intakeResult = await intake(payload, { env });
    const events = readAcceptedEvents(intakeResult);
    for (const event of events) {
      try {
        await processEvent({ prisma, eventoWebhookId: event.eventoWebhookId });
      } catch (error) {
        await recordProcessingFailure(prisma, event.eventoWebhookId, error, clock).catch(() => {});
        throw mapProcessingError(error);
      }
    }
    return { accepted: true };
  };
}

async function recordProcessingFailure(prisma, eventoWebhookId, error, clock) {
  const event = await prisma.eventoWebhook.findUnique({
    where: { id: eventoWebhookId },
    select: { id: true, empresaId: true, canalIntegracaoId: true, provedor: true },
  });
  if (!event || event.provedor !== "INSTAGRAM") return;
  const occurredAt = clock();
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) return;
  await prisma.canalIntegracao.updateMany({
    where: {
      id: event.canalIntegracaoId,
      empresaId: event.empresaId,
      tipo: "INSTAGRAM_META",
      chaveInterna: "instagram-meta-inbound-real",
      modoTeste: false,
      ativo: true,
      status: "ATIVO",
    },
    data: {
      lastFailureAt: occurredAt,
      lastFailureCode: safeFailureCode(error?.code),
    },
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

function mapProcessingError(error) {
  if (error?.name === "InstagramWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code)) {
    return orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
  }
  return orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
}

function safeFailureCode(value) {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)
    ? value
    : "INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE";
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
