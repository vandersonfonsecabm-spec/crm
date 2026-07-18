const crypto = require("node:crypto");
const { normalizePhone } = require("../channels/phoneNormalizer");
const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../tenant-features/service");
const {
  EVENT_TYPE,
  PROVIDER,
  canonicalStringify,
} = require("./whatsappWebhookIntake");

const PAYLOAD_SCHEMA_VERSION = 1;
const ACTIVE_LEAD_STATUSES = ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"];
const PROCESSABLE_STATUS = "RECEBIDO";
const PROCESSING_STATUS = "PROCESSANDO";
const PROCESSED_STATUS = "PROCESSADO";

async function processWhatsAppWebhookEvent({ prisma, eventoWebhookId }) {
  if (!prisma) throw processingError("WHATSAPP_EVENT_PROCESSOR_INVALID_INPUT");
  if (!Number.isInteger(eventoWebhookId) || eventoWebhookId < 1) {
    throw processingError("WHATSAPP_EVENT_PROCESSOR_INVALID_INPUT");
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
    if (isUniqueConflict(error) && allowUniqueRecovery) {
      return processWithUniqueRecovery(prisma, eventoWebhookId, false);
    }
    throw processingError("WHATSAPP_EVENT_PROCESSING_UNAVAILABLE");
  }
}

async function processTransaction(tx, eventoWebhookId) {
  let event = await loadEvent(tx, eventoWebhookId);
  validateEventOwnership(event);
  await requireProcessingCapabilities(tx, event.empresaId);
  const atomic = validateAtomicPayload(event);

  if (event.statusProcessamento === PROCESSED_STATUS) {
    if (!event.processadoEm) throw processingError("WHATSAPP_EVENT_STATE_INVALID");
    await verifyProcessedChain(tx, event, atomic);
    return result(true);
  }
  if (event.statusProcessamento !== PROCESSABLE_STATUS || event.processadoEm !== null) {
    throw processingError("WHATSAPP_EVENT_STATE_INVALID");
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
      await verifyProcessedChain(tx, event, atomic);
      return result(true);
    }
    throw processingError("WHATSAPP_EVENT_CONCURRENCY_CONFLICT");
  }

  const contact = await resolveContact(tx, event, atomic);
  const client = await resolveClient(tx, event, contact, atomic);
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
    data: {
      statusProcessamento: PROCESSED_STATUS,
      processadoEm: completedAt,
    },
  });
  if (completed.count !== 1) throw processingError("WHATSAPP_EVENT_STATE_INVALID");
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
            status: true,
            ativo: true,
            wabaId: true,
            phoneNumberId: true,
          },
        },
      },
    });
  } catch {
    throw processingError("WHATSAPP_EVENT_PROCESSING_UNAVAILABLE");
  }
  if (!event) throw processingError("WHATSAPP_EVENT_NOT_FOUND");
  return event;
}

function validateEventOwnership(event) {
  if (event.provedor !== PROVIDER || event.tipoEvento !== EVENT_TYPE) {
    throw processingError("WHATSAPP_EVENT_UNSUPPORTED");
  }
  if (!event.empresa?.ativo
    || event.empresa.id !== event.empresaId
    || !event.canalIntegracao
    || event.canalIntegracao.id !== event.canalIntegracaoId
    || event.canalIntegracao.empresaId !== event.empresaId
    || event.canalIntegracao.tipo !== "WHATSAPP_META"
    || event.canalIntegracao.ativo !== true
    || event.canalIntegracao.status !== "ATIVO") {
    throw processingError("WHATSAPP_EVENT_INTEGRATION_INVALID");
  }
}

async function requireProcessingCapabilities(prisma, empresaId) {
  const integrationEnabled = await isFeatureEnabledForTenant({
    prisma,
    empresaId,
    featureKey: FEATURE_KEYS.WHATSAPP_INTEGRATION,
  });
  const inboundEnabled = await isFeatureEnabledForTenant({
    prisma,
    empresaId,
    featureKey: FEATURE_KEYS.WHATSAPP_INBOUND,
  });
  if (!integrationEnabled || !inboundEnabled) {
    throw processingError("WHATSAPP_EVENT_PROCESSING_NOT_AVAILABLE");
  }
}

function validateAtomicPayload(event) {
  if (typeof event.payloadJson !== "string" || !event.payloadJson
    || typeof event.payloadHash !== "string" || !/^[0-9a-f]{64}$/.test(event.payloadHash)) {
    throw processingError("WHATSAPP_EVENT_PAYLOAD_INVALID");
  }
  const calculatedHash = crypto.createHash("sha256").update(event.payloadJson, "utf8").digest("hex");
  if (calculatedHash !== event.payloadHash) {
    throw processingError("WHATSAPP_EVENT_PAYLOAD_INTEGRITY_FAILED");
  }

  let payload;
  try {
    payload = JSON.parse(event.payloadJson);
  } catch {
    throw processingError("WHATSAPP_EVENT_PAYLOAD_INVALID");
  }
  if (!isObject(payload) || canonicalStringify(payload) !== event.payloadJson
    || payload.schemaVersion !== PAYLOAD_SCHEMA_VERSION
    || payload.provider !== PROVIDER
    || payload.field !== "messages"
    || payload.wabaId !== event.canalIntegracao.wabaId
    || payload.phoneNumberId !== event.canalIntegracao.phoneNumberId
    || !isObject(payload.message)
    || payload.message.id !== event.externalEventId
    || payload.message.type !== "text"
    || !isObject(payload.message.text)
    || typeof payload.message.text.body !== "string") {
    throw processingError("WHATSAPP_EVENT_PAYLOAD_INVALID");
  }

  const senderId = requiredSenderId(payload.message.from);
  if (payload.contact !== null && payload.contact !== undefined) {
    if (!isObject(payload.contact) || payload.contact.wa_id !== senderId) {
      throw processingError("WHATSAPP_EVENT_CONTACT_CONFLICT");
    }
  }
  const normalizedPhone = normalizeWhatsAppPhone(senderId);
  const messageTime = parseExternalTimestamp(payload.message.timestamp);
  return {
    contactName: readContactName(payload.contact),
    externalContactId: normalizedPhone,
    message: payload.message,
    messageTime,
    normalizedPhone,
    payload,
    senderId,
  };
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
    if (existing.empresaId !== event.empresaId
      || existing.canalIntegracaoId !== event.canalIntegracaoId
      || (existing.telefoneNormalizado && existing.telefoneNormalizado !== atomic.normalizedPhone)) {
      throw processingError("WHATSAPP_CONTACT_INTEGRITY_CONFLICT");
    }
    const missing = {};
    if (!existing.telefoneNormalizado) missing.telefoneNormalizado = atomic.normalizedPhone;
    if (!existing.nome && atomic.contactName) missing.nome = atomic.contactName;
    return Object.keys(missing).length
      ? tx.contatoCanal.update({ where: { id: existing.id }, data: missing })
      : existing;
  }
  return tx.contatoCanal.create({
    data: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      externalId: atomic.externalContactId,
      telefoneNormalizado: atomic.normalizedPhone,
      nome: atomic.contactName,
    },
  });
}

async function resolveClient(tx, event, contact, atomic) {
  if (contact.clienteId !== null) {
    const linked = await tx.cliente.findFirst({
      where: { id: contact.clienteId, empresaId: event.empresaId },
    });
    if (!linked) throw processingError("WHATSAPP_CLIENT_INTEGRITY_CONFLICT");
    return linked;
  }

  const clients = await tx.cliente.findMany({
    where: { empresaId: event.empresaId },
    orderBy: { id: "asc" },
  });
  const candidates = clients.filter((client) => normalizedClientPhone(client.telefone) === atomic.normalizedPhone);
  if (candidates.length > 1) throw processingError("WHATSAPP_CLIENT_AMBIGUOUS");
  if (candidates.length === 1) return candidates[0];

  return tx.cliente.create({
    data: {
      empresaId: event.empresaId,
      nome: atomic.contactName || "Contato WhatsApp",
      telefone: atomic.normalizedPhone,
      email: "",
      empresa: "",
      interesse: "",
      origem: "WhatsApp",
    },
  });
}

async function linkContactToClient(tx, event, contact, client) {
  if (client.empresaId !== event.empresaId) {
    throw processingError("WHATSAPP_CLIENT_INTEGRITY_CONFLICT");
  }
  if (contact.clienteId === client.id) return contact;
  if (contact.clienteId !== null) throw processingError("WHATSAPP_CONTACT_CLIENT_CONFLICT");
  const updated = await tx.contatoCanal.updateMany({
    where: {
      id: contact.id,
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      clienteId: null,
    },
    data: { clienteId: client.id },
  });
  if (updated.count !== 1) throw processingError("WHATSAPP_CONTACT_CLIENT_CONFLICT");
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
  if (conversations.length > 1) throw processingError("WHATSAPP_CONVERSATION_AMBIGUOUS");
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
      throw processingError("WHATSAPP_LEAD_INTEGRITY_CONFLICT");
    }
    return linked;
  }

  const candidates = await tx.lead.findMany({
    where: {
      empresaId: event.empresaId,
      clienteId: client.id,
      origem: "WHATSAPP",
      status: { in: ACTIVE_LEAD_STATUSES },
    },
    orderBy: { id: "asc" },
    take: 2,
  });
  if (candidates.length > 1) throw processingError("WHATSAPP_LEAD_AMBIGUOUS");
  if (candidates.length === 1) return candidates[0];
  return tx.lead.create({
    data: {
      empresaId: event.empresaId,
      clienteId: client.id,
      responsavelId: null,
      status: "NOVO",
      origem: "WHATSAPP",
    },
  });
}

async function resolveConversation(tx, event, contact, client, lead, activeConversation, messageTime) {
  if (lead.empresaId !== event.empresaId || lead.clienteId !== client.id) {
    throw processingError("WHATSAPP_LEAD_INTEGRITY_CONFLICT");
  }
  if (activeConversation) {
    if (activeConversation.empresaId !== event.empresaId
      || activeConversation.canalIntegracaoId !== event.canalIntegracaoId
      || activeConversation.contatoCanalId !== contact.id
      || (activeConversation.leadId !== null && activeConversation.leadId !== lead.id)) {
      throw processingError("WHATSAPP_CONVERSATION_INTEGRITY_CONFLICT");
    }
    if (activeConversation.leadId === lead.id) return activeConversation;
    const linked = await tx.conversaCanal.updateMany({
      where: {
        id: activeConversation.id,
        empresaId: event.empresaId,
        leadId: null,
      },
      data: { leadId: lead.id },
    });
    if (linked.count !== 1) throw processingError("WHATSAPP_CONVERSATION_INTEGRITY_CONFLICT");
    return { ...activeConversation, leadId: lead.id };
  }

  const chaveAberta = `canal:${event.canalIntegracaoId}:contato:${contact.id}`;
  const occupied = await tx.conversaCanal.findUnique({ where: { chaveAberta } });
  if (occupied) throw processingError("WHATSAPP_CONVERSATION_INTEGRITY_CONFLICT");
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
      texto: atomic.message.text.body,
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
  if (!message || !conversation || !contact || !contact.clienteId || !conversation.lead
    || conversation.lead.clienteId !== contact.clienteId) {
    throw processingError("WHATSAPP_PROCESSED_EVENT_INCONSISTENT");
  }
  assertMessageEquivalent(message, event, contact, conversation, atomic);
}

function assertMessageEquivalent(message, event, contact, conversation, atomic) {
  if (message.empresaId !== event.empresaId
    || message.canalIntegracaoId !== event.canalIntegracaoId
    || message.conversaCanalId !== conversation.id
    || conversation.empresaId !== event.empresaId
    || conversation.canalIntegracaoId !== event.canalIntegracaoId
    || conversation.contatoCanalId !== contact.id
    || contact.empresaId !== event.empresaId
    || contact.canalIntegracaoId !== event.canalIntegracaoId
    || contact.externalId !== atomic.externalContactId
    || contact.telefoneNormalizado !== atomic.normalizedPhone
    || message.externalId !== event.externalEventId
    || message.direcao !== "ENTRADA"
    || message.tipo !== "TEXTO"
    || message.texto !== atomic.message.text.body
    || message.autorUsuarioId !== null
    || message.status !== "RECEBIDA"
    || message.statusEntrega !== "RECEBIDA"
    || message.simulada !== false
    || !sameDate(message.enviadaEm, atomic.messageTime)) {
    throw processingError("WHATSAPP_MESSAGE_IDEMPOTENCY_CONFLICT");
  }
}

function normalizeWhatsAppPhone(senderId) {
  try {
    return normalizePhone(`+${senderId}`);
  } catch {
    throw processingError("WHATSAPP_EVENT_CONTACT_INVALID");
  }
}

function normalizedClientPhone(value) {
  if (!String(value || "").trim()) return null;
  try {
    return normalizePhone(value);
  } catch {
    try {
      return normalizePhone(value, { defaultCountryCode: "55" });
    } catch {
      return null;
    }
  }
}

function requiredSenderId(value) {
  return typeof value === "string" && /^\d{8,15}$/.test(value)
    ? value
    : (() => { throw processingError("WHATSAPP_EVENT_CONTACT_INVALID"); })();
}

function parseExternalTimestamp(value) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) {
    throw processingError("WHATSAPP_EVENT_TIMESTAMP_INVALID");
  }
  const seconds = Number(value);
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(milliseconds)) {
    throw processingError("WHATSAPP_EVENT_TIMESTAMP_INVALID");
  }
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw processingError("WHATSAPP_EVENT_TIMESTAMP_INVALID");
  return date;
}

function readContactName(contact) {
  const value = contact?.profile?.name;
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 160 ? name : null;
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
  const error = new Error("Evento WhatsApp nao processado.");
  error.name = "WhatsAppWebhookProcessingError";
  error.code = code;
  return error;
}

function isProcessingError(error) {
  return error?.name === "WhatsAppWebhookProcessingError";
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

module.exports = {
  processWhatsAppWebhookEvent,
};
