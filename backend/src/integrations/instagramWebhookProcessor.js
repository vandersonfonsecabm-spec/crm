const crypto = require("node:crypto");
const { createAutomationService } = require("../automations/service");
const { lockActiveClienteRow } = require("../shared/clientLifecycleLock");
const { readGlobalInstagramConfiguration } = require("../platform/instagramInboundProvisioning");
const {
  EVENT_TYPES,
  PROVIDER,
  canonicalStringify,
  derivedEventId,
} = require("./instagramWebhookIntake");

const ACTIVE_LEAD_STATUSES = ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"];
const PROCESSABLE_STATUS = "RECEBIDO";
const PROCESSING_STATUS = "PROCESSANDO";
const PROCESSED_STATUS = "PROCESSADO";

async function processInstagramWebhookEvent({ prisma, eventoWebhookId }) {
  if (!prisma || !Number.isInteger(eventoWebhookId) || eventoWebhookId < 1) {
    throw processingError("INSTAGRAM_EVENT_PROCESSOR_INVALID_INPUT");
  }
  const event = await loadEvent(prisma, eventoWebhookId);
  validateEventOwnership(event);
  await requireProcessingCapabilities(prisma, event.empresaId);
  return processWithUniqueRecovery(prisma, eventoWebhookId, true);
}

async function processWithUniqueRecovery(prisma, eventoWebhookId, allowUniqueRecovery) {
  try {
    return await prisma.$transaction(
      (tx) => processTransaction(tx, eventoWebhookId),
      { maxWait: 5000, timeout: 10000 },
    );
  } catch (error) {
    if (isProcessingError(error)) throw error;
    if (error?.code === "P2002" && allowUniqueRecovery) {
      return processWithUniqueRecovery(prisma, eventoWebhookId, false);
    }
    throw processingError("INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE");
  }
}

async function processTransaction(tx, eventoWebhookId) {
  let event = await loadEvent(tx, eventoWebhookId);
  validateEventOwnership(event);
  await requireProcessingCapabilities(tx, event.empresaId);
  const atomic = validateAtomicPayload(event);

  if (event.statusProcessamento === PROCESSED_STATUS) {
    if (!event.processadoEm) throw processingError("INSTAGRAM_EVENT_STATE_INVALID");
    if (atomic.kind === EVENT_TYPES.TEXT) await verifyProcessedChain(tx, event, atomic);
    else await verifyTerminalEvent(tx, event);
    return result(true);
  }
  if (event.statusProcessamento !== PROCESSABLE_STATUS || event.processadoEm !== null) {
    throw processingError("INSTAGRAM_EVENT_STATE_INVALID");
  }

  const claim = await tx.eventoWebhook.updateMany({
    where: {
      id: event.id,
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      statusProcessamento: PROCESSABLE_STATUS,
      processadoEm: null,
    },
    data: { statusProcessamento: PROCESSING_STATUS },
  });
  if (claim.count !== 1) {
    event = await loadEvent(tx, eventoWebhookId);
    if (event?.statusProcessamento === PROCESSED_STATUS && event.processadoEm) {
      if (atomic.kind === EVENT_TYPES.TEXT) await verifyProcessedChain(tx, event, atomic);
      else await verifyTerminalEvent(tx, event);
      return result(true);
    }
    throw processingError("INSTAGRAM_EVENT_CONCURRENCY_CONFLICT");
  }

  if (atomic.kind === EVENT_TYPES.TEXT) {
    const contact = await resolveContact(tx, event, atomic);
    const client = await resolveClient(tx, event, contact);
    const linkedContact = await linkContactToClient(tx, event, contact, client);
    const activeConversation = await findSingleActiveConversation(tx, event, linkedContact);
    const lead = await resolveLead(tx, event, client, activeConversation);
    const conversation = await resolveConversation(
      tx,
      event,
      linkedContact,
      client,
      lead,
      activeConversation,
      atomic.messageTime,
    );
    const message = await resolveMessage(tx, event, linkedContact, conversation, atomic);
    await updateConversationActivity(tx, conversation, message, atomic.messageTime);
  }

  await reserveActiveChannel(tx, event);
  const completedAt = new Date();
  const completed = await tx.eventoWebhook.updateMany({
    where: {
      id: event.id,
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      statusProcessamento: PROCESSING_STATUS,
      processadoEm: null,
      externalEventId: event.externalEventId,
      payloadHash: event.payloadHash,
      payloadJson: event.payloadJson,
    },
    data: { statusProcessamento: PROCESSED_STATUS, processadoEm: completedAt },
  });
  if (completed.count !== 1) throw processingError("INSTAGRAM_EVENT_STATE_INVALID");
  if (atomic.kind === EVENT_TYPES.TEXT) await markChannelConnected(tx, event, completedAt);
  return result(false);
}

async function loadEvent(client, eventoWebhookId) {
  let event;
  try {
    event = await client.eventoWebhook.findUnique({
      where: { id: eventoWebhookId },
      include: {
        empresa: { select: { id: true, ativo: true } },
        canalIntegracao: {
          select: {
            id: true,
            empresaId: true,
            tipo: true,
            chaveInterna: true,
            modoTeste: true,
            status: true,
            ativo: true,
            metaAppId: true,
            providerEnvironment: true,
            instagramBusinessAccountId: true,
          },
        },
      },
    });
  } catch {
    throw processingError("INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE");
  }
  if (!event) throw processingError("INSTAGRAM_EVENT_NOT_FOUND");
  return event;
}

function validateEventOwnership(event) {
  let global;
  try {
    global = readGlobalInstagramConfiguration(process.env);
  } catch {
    throw processingError("INSTAGRAM_EVENT_INTEGRATION_INVALID");
  }
  if (event.provedor !== PROVIDER || !Object.values(EVENT_TYPES).includes(event.tipoEvento)) {
    throw processingError("INSTAGRAM_EVENT_UNSUPPORTED");
  }
  if (
    !event.empresa?.ativo
    || event.empresa.id !== event.empresaId
    || !event.canalIntegracao
    || event.canalIntegracao.id !== event.canalIntegracaoId
    || event.canalIntegracao.empresaId !== event.empresaId
    || event.canalIntegracao.tipo !== "INSTAGRAM_META"
    || event.canalIntegracao.chaveInterna !== "instagram-meta-inbound-real"
    || event.canalIntegracao.modoTeste !== false
    || event.canalIntegracao.ativo !== true
    || event.canalIntegracao.status !== "ATIVO"
    || event.canalIntegracao.metaAppId !== global.metaAppId
    || event.canalIntegracao.providerEnvironment !== global.providerEnvironment
  ) {
    throw processingError("INSTAGRAM_EVENT_INTEGRATION_INVALID");
  }
}

async function requireProcessingCapabilities(prisma, empresaId) {
  if (
    process.env.INSTAGRAM_INTEGRATION_ENABLED !== "true"
    || process.env.INSTAGRAM_INBOUND_ENABLED !== "true"
  ) {
    throw processingError("INSTAGRAM_EVENT_PROCESSING_NOT_AVAILABLE");
  }
  const rows = await prisma.empresaFuncionalidade.findMany({
    where: {
      empresaId,
      chave: { in: ["INSTAGRAM_INTEGRATION", "INSTAGRAM_INBOUND"] },
      habilitada: true,
    },
    select: { chave: true },
  });
  const enabled = new Set(rows.map((row) => row.chave));
  if (!enabled.has("INSTAGRAM_INTEGRATION") || !enabled.has("INSTAGRAM_INBOUND")) {
    throw processingError("INSTAGRAM_EVENT_PROCESSING_NOT_AVAILABLE");
  }
}

function validateAtomicPayload(event) {
  if (
    typeof event.payloadJson !== "string"
    || !event.payloadJson
    || typeof event.payloadHash !== "string"
    || !/^[0-9a-f]{64}$/.test(event.payloadHash)
  ) {
    throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
  }
  const hash = crypto.createHash("sha256").update(event.payloadJson, "utf8").digest("hex");
  if (hash !== event.payloadHash) throw processingError("INSTAGRAM_EVENT_PAYLOAD_INTEGRITY_FAILED");

  let payload;
  try {
    payload = JSON.parse(event.payloadJson);
  } catch {
    throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
  }
  if (
    !isObject(payload)
    || canonicalStringify(payload) !== event.payloadJson
    || payload.schemaVersion !== 1
    || payload.provider !== PROVIDER
    || payload.instagramBusinessAccountId !== event.canalIntegracao.instagramBusinessAccountId
    || !isObject(payload.event)
  ) {
    throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
  }

  const source = payload.event;
  const senderId = requiredOpaqueValue(source.sender?.id, 512);
  const recipientId = requiredOpaqueValue(source.recipient?.id, 512);
  const messageTime = parseExternalTimestamp(source.timestamp);
  const isEcho = isObject(source.message) && source.message.is_echo === true;
  if (
    !senderId
    || !recipientId
    || (isEcho
      ? senderId !== payload.instagramBusinessAccountId
      : recipientId !== payload.instagramBusinessAccountId)
  ) {
    throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
  }
  if (event.tipoEvento === EVENT_TYPES.TEXT) {
    if (
      !isObject(source.message)
      || source.message.mid !== event.externalEventId
      || typeof source.message.text !== "string"
      || source.message.is_echo === true
    ) {
      throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
    }
    return {
      kind: EVENT_TYPES.TEXT,
      externalContactId: senderId,
      message: source.message,
      messageTime,
    };
  }
  if (event.tipoEvento === EVENT_TYPES.MEDIA_UNSUPPORTED) {
    if (
      !isObject(source.message)
      || source.message.mid !== event.externalEventId
      || !Array.isArray(source.message.attachments)
      || source.message.attachments.length === 0
    ) {
      throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
    }
    return { kind: EVENT_TYPES.MEDIA_UNSUPPORTED, messageTime };
  }
  if (event.tipoEvento === EVENT_TYPES.STATUS) {
    if (
      (!isObject(source.delivery) && !isObject(source.read))
      || derivedEventId(EVENT_TYPES.STATUS, source) !== event.externalEventId
    ) {
      throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
    }
    return { kind: EVENT_TYPES.STATUS, messageTime };
  }
  if (event.tipoEvento === EVENT_TYPES.IGNORED) {
    if (isObject(source.message)) {
      if (
        source.message.mid !== event.externalEventId
        || (Array.isArray(source.message.attachments) && source.message.attachments.length > 0)
        || (typeof source.message.text === "string" && source.message.is_echo !== true)
      ) {
        throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
      }
    } else if (derivedEventId(EVENT_TYPES.IGNORED, source) !== event.externalEventId) {
      throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
    }
    return { kind: EVENT_TYPES.IGNORED, messageTime };
  }
  throw processingError("INSTAGRAM_EVENT_PAYLOAD_INVALID");
}

async function reserveActiveChannel(tx, event) {
  const reserved = await tx.canalIntegracao.updateMany({
    where: {
      id: event.canalIntegracaoId,
      empresaId: event.empresaId,
      tipo: "INSTAGRAM_META",
      chaveInterna: "instagram-meta-inbound-real",
      modoTeste: false,
      ativo: true,
      status: "ATIVO",
      instagramBusinessAccountId: event.canalIntegracao.instagramBusinessAccountId,
      metaAppId: event.canalIntegracao.metaAppId,
      providerEnvironment: event.canalIntegracao.providerEnvironment,
    },
    data: { ativo: true },
  });
  if (reserved.count !== 1) throw processingError("INSTAGRAM_EVENT_INTEGRATION_INVALID");
}

async function markChannelConnected(tx, event, completedAt) {
  await tx.canalIntegracao.updateMany({
    where: { id: event.canalIntegracaoId, empresaId: event.empresaId, verifiedAt: null },
    data: { verifiedAt: completedAt },
  });
  await tx.canalIntegracao.updateMany({
    where: { id: event.canalIntegracaoId, empresaId: event.empresaId, connectedAt: null },
    data: { connectedAt: completedAt },
  });
}

async function verifyTerminalEvent(tx, event) {
  const message = await tx.mensagemCanal.findUnique({
    where: {
      canalIntegracaoId_externalId: {
        canalIntegracaoId: event.canalIntegracaoId,
        externalId: event.externalEventId,
      },
    },
    select: { id: true },
  });
  if (message) throw processingError("INSTAGRAM_PROCESSED_EVENT_INCONSISTENT");
}

async function resolveContact(tx, event, atomic) {
  const existing = await tx.contatoCanal.findUnique({
    where: {
      canalIntegracaoId_externalId: {
        canalIntegracaoId: event.canalIntegracaoId,
        externalId: atomic.externalContactId,
      },
    },
  });
  if (existing) {
    if (
      existing.empresaId !== event.empresaId
      || existing.canalIntegracaoId !== event.canalIntegracaoId
      || existing.telefoneNormalizado !== null
    ) {
      throw processingError("INSTAGRAM_CONTACT_INTEGRITY_CONFLICT");
    }
    return existing;
  }
  return tx.contatoCanal.create({
    data: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      externalId: atomic.externalContactId,
      telefoneNormalizado: null,
      nome: null,
    },
  });
}

async function resolveClient(tx, event, contact) {
  if (contact.clienteId !== null) {
    const linked = await tx.cliente.findFirst({
      where: { id: contact.clienteId, empresaId: event.empresaId },
    });
    if (!linked) throw processingError("INSTAGRAM_CLIENT_INTEGRITY_CONFLICT");
    if (linked.arquivadoEm !== null) throw processingError("INSTAGRAM_CLIENT_ARCHIVED_READ_ONLY");
    await lockActiveClienteRow(tx, event.empresaId, linked.id);
    return linked;
  }
  return tx.cliente.create({
    data: {
      empresaId: event.empresaId,
      nome: "Contato Instagram",
      telefone: "",
      email: "",
      empresa: "",
      interesse: "",
      origem: "Instagram",
    },
  });
}

async function linkContactToClient(tx, event, contact, client) {
  if (client.empresaId !== event.empresaId) throw processingError("INSTAGRAM_CLIENT_INTEGRITY_CONFLICT");
  if (contact.clienteId === client.id) return contact;
  if (contact.clienteId !== null) throw processingError("INSTAGRAM_CONTACT_CLIENT_CONFLICT");
  const updated = await tx.contatoCanal.updateMany({
    where: {
      id: contact.id,
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      clienteId: null,
    },
    data: { clienteId: client.id },
  });
  if (updated.count !== 1) throw processingError("INSTAGRAM_CONTACT_CLIENT_CONFLICT");
  return { ...contact, clienteId: client.id };
}

async function findSingleActiveConversation(tx, event, contact) {
  const conversations = await tx.conversaCanal.findMany({
    where: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      contatoCanalId: contact.id,
      status: { not: "ENCERRADA" },
    },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (conversations.length > 1) throw processingError("INSTAGRAM_CONVERSATION_AMBIGUOUS");
  return conversations[0] || null;
}

async function resolveLead(tx, event, client, activeConversation) {
  if (activeConversation?.leadId) {
    const linked = await tx.lead.findFirst({
      where: {
        id: activeConversation.leadId,
        empresaId: event.empresaId,
        clienteId: client.id,
      },
    });
    if (!linked || !ACTIVE_LEAD_STATUSES.includes(linked.status)) {
      throw processingError("INSTAGRAM_LEAD_INTEGRITY_CONFLICT");
    }
    return linked;
  }
  const candidates = await tx.lead.findMany({
    where: {
      empresaId: event.empresaId,
      clienteId: client.id,
      origem: "INSTAGRAM",
      status: { in: ACTIVE_LEAD_STATUSES },
    },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (candidates.length > 1) throw processingError("INSTAGRAM_LEAD_AMBIGUOUS");
  if (candidates.length === 1) return candidates[0];
  const lead = await tx.lead.create({
    data: {
      empresaId: event.empresaId,
      clienteId: client.id,
      responsavelId: null,
      status: "NOVO",
      origem: "INSTAGRAM",
    },
  });
  await createAutomationService({ prisma: tx }).enqueueLeadCreated({
    tx,
    empresaId: event.empresaId,
    leadId: lead.id,
    originalEventId: `instagram:${event.id}`,
    occurredAt: lead.createdAt,
  });
  return lead;
}

async function resolveConversation(tx, event, contact, client, lead, activeConversation, messageTime) {
  if (lead.empresaId !== event.empresaId || lead.clienteId !== client.id) {
    throw processingError("INSTAGRAM_LEAD_INTEGRITY_CONFLICT");
  }
  if (activeConversation) {
    if (
      activeConversation.empresaId !== event.empresaId
      || activeConversation.canalIntegracaoId !== event.canalIntegracaoId
      || activeConversation.contatoCanalId !== contact.id
      || (activeConversation.leadId !== null && activeConversation.leadId !== lead.id)
    ) {
      throw processingError("INSTAGRAM_CONVERSATION_INTEGRITY_CONFLICT");
    }
    if (activeConversation.leadId === lead.id) return activeConversation;
    const linked = await tx.conversaCanal.updateMany({
      where: { id: activeConversation.id, empresaId: event.empresaId, leadId: null },
      data: { leadId: lead.id },
    });
    if (linked.count !== 1) throw processingError("INSTAGRAM_CONVERSATION_INTEGRITY_CONFLICT");
    return { ...activeConversation, leadId: lead.id };
  }
  const chaveAberta = `canal:${event.canalIntegracaoId}:contato:${contact.id}`;
  const occupied = await tx.conversaCanal.findUnique({ where: { chaveAberta } });
  if (occupied) throw processingError("INSTAGRAM_CONVERSATION_INTEGRITY_CONFLICT");
  return tx.conversaCanal.create({
    data: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      contatoCanalId: contact.id,
      leadId: lead.id,
      responsavelId: null,
      respostaReservadaPorId: null,
      respostaReservadaAte: null,
      status: "AGUARDANDO_ATENDIMENTO",
      chaveAberta,
      primeiraMensagemEm: messageTime,
      ultimaMensagemEm: messageTime,
      aguardandoDesde: event.recebidoEm,
    },
  });
}

async function resolveMessage(tx, event, contact, conversation, atomic) {
  const existing = await tx.mensagemCanal.findUnique({
    where: {
      canalIntegracaoId_externalId: {
        canalIntegracaoId: event.canalIntegracaoId,
        externalId: event.externalEventId,
      },
    },
  });
  if (existing) {
    assertMessageEquivalent(existing, event, contact, conversation, atomic);
    return { ...existing, createdNow: false };
  }
  const created = await tx.mensagemCanal.create({
    data: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      conversaCanalId: conversation.id,
      autorUsuarioId: null,
      externalId: event.externalEventId,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: atomic.message.text,
      status: "RECEBIDA",
      statusEntrega: "RECEBIDA",
      enviadaEm: atomic.messageTime,
      simulada: false,
    },
  });
  return { ...created, createdNow: true };
}

async function updateConversationActivity(tx, conversation, message, messageTime) {
  if (!message.createdNow) return;
  const first = conversation.primeiraMensagemEm
    ? new Date(Math.min(new Date(conversation.primeiraMensagemEm).getTime(), messageTime.getTime()))
    : messageTime;
  const last = conversation.ultimaMensagemEm
    ? new Date(Math.max(new Date(conversation.ultimaMensagemEm).getTime(), messageTime.getTime()))
    : messageTime;
  await tx.conversaCanal.update({
    where: { id: conversation.id },
    data: { primeiraMensagemEm: first, ultimaMensagemEm: last },
  });
}

async function verifyProcessedChain(tx, event, atomic) {
  const message = await tx.mensagemCanal.findUnique({
    where: {
      canalIntegracaoId_externalId: {
        canalIntegracaoId: event.canalIntegracaoId,
        externalId: event.externalEventId,
      },
    },
    include: { conversaCanal: { include: { contatoCanal: true, lead: true } } },
  });
  const conversation = message?.conversaCanal;
  const contact = conversation?.contatoCanal;
  if (
    !message
    || !conversation
    || !contact
    || !contact.clienteId
    || !conversation.lead
    || conversation.lead.clienteId !== contact.clienteId
  ) {
    throw processingError("INSTAGRAM_PROCESSED_EVENT_INCONSISTENT");
  }
  assertMessageEquivalent(message, event, contact, conversation, atomic);
}

function assertMessageEquivalent(message, event, contact, conversation, atomic) {
  if (
    message.empresaId !== event.empresaId
    || message.canalIntegracaoId !== event.canalIntegracaoId
    || message.conversaCanalId !== conversation.id
    || conversation.empresaId !== event.empresaId
    || conversation.canalIntegracaoId !== event.canalIntegracaoId
    || conversation.contatoCanalId !== contact.id
    || contact.empresaId !== event.empresaId
    || contact.canalIntegracaoId !== event.canalIntegracaoId
    || contact.externalId !== atomic.externalContactId
    || contact.telefoneNormalizado !== null
    || message.externalId !== event.externalEventId
    || message.direcao !== "ENTRADA"
    || message.tipo !== "TEXTO"
    || message.texto !== atomic.message.text
    || message.autorUsuarioId !== null
    || message.status !== "RECEBIDA"
    || message.statusEntrega !== "RECEBIDA"
    || message.simulada !== false
    || !sameDate(message.enviadaEm, atomic.messageTime)
  ) {
    throw processingError("INSTAGRAM_MESSAGE_IDEMPOTENCY_CONFLICT");
  }
}

function requiredOpaqueValue(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u0020\u007f]/.test(value)
    ? value
    : null;
}

function parseExternalTimestamp(value) {
  const normalized = typeof value === "number" ? String(value) : value;
  if (typeof normalized !== "string" || !/^\d{1,20}$/.test(normalized)) {
    throw processingError("INSTAGRAM_EVENT_TIMESTAMP_INVALID");
  }
  const milliseconds = Number(normalized);
  if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(milliseconds)) {
    throw processingError("INSTAGRAM_EVENT_TIMESTAMP_INVALID");
  }
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw processingError("INSTAGRAM_EVENT_TIMESTAMP_INVALID");
  return date;
}

function sameDate(left, right) {
  return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
}

function result(idempotent) {
  return { processed: true, idempotent };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function processingError(code) {
  const error = new Error("Evento Instagram nao processado.");
  error.name = "InstagramWebhookProcessingError";
  error.code = code;
  return error;
}

function isProcessingError(error) {
  return error?.name === "InstagramWebhookProcessingError";
}

module.exports = {
  processInstagramWebhookEvent,
};
