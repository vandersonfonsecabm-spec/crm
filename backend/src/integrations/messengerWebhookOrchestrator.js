const { createMessengerWebhookIntake } = require("./messengerWebhookIntake");
const { processMessengerWebhookEvent } = require("./messengerWebhookProcessor");

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
} = {}) {
  if (!prisma || typeof intake !== "function" || typeof processEvent !== "function") {
    throw new Error("Dependencias invalidas para a orquestracao Messenger.");
  }
  return async function orchestrateMessengerWebhook(payload, { env = process.env } = {}) {
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
  const occurredAt = clock();
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) return;
  await prisma.$transaction(async (tx) => {
    const reserved = await tx.eventoWebhook.updateMany({
      where: {
        id: eventoWebhookId,
        provedor: "MESSENGER",
        statusProcessamento: "RECEBIDO",
        processadoEm: null,
      },
      data: { statusProcessamento: "RECEBIDO" },
    });
    if (reserved.count !== 1) return;
    const event = await tx.eventoWebhook.findUnique({
      where: { id: eventoWebhookId },
      select: { empresaId: true, canalIntegracaoId: true },
    });
    if (!event) return;
    await tx.canalIntegracao.updateMany({
      where: {
        id: event.canalIntegracaoId,
        empresaId: event.empresaId,
        tipo: "MESSENGER_META",
        chaveInterna: "messenger-meta-inbound-real",
        modoTeste: false,
        ativo: true,
        status: "ATIVO",
      },
      data: {
        lastFailureAt: occurredAt,
        lastFailureCode: safeFailureCode(error?.code),
      },
    });
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
  if (error?.name === "MessengerWebhookProcessingError" && PROCESSING_CONFLICT_CODES.has(error.code)) {
    return orchestrationError(409, "WEBHOOK_PROCESSING_CONFLICT");
  }
  return orchestrationError(503, "WEBHOOK_PROCESSING_UNAVAILABLE");
}

function safeFailureCode(value) {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)
    ? value
    : "MESSENGER_EVENT_PROCESSING_UNAVAILABLE";
}

function orchestrationError(status, code) {
  const error = new Error(code);
  error.name = "MessengerWebhookOrchestrationError";
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  createMessengerWebhookOrchestrator,
  recordProcessingFailure,
};
