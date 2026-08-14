const crypto = require("node:crypto");
const { createEmailProviderAdapter, EMAIL_EVENT_TYPES } = require("./emailProviderAdapter");
const {
  EMAIL_CAPABILITY_KEYS,
  EMAIL_CHANNEL_TYPE,
  REAL_EMAIL_INBOUND_KEY,
  emailError,
  normalizeProviderType,
  stableHash,
} = require("./emailFoundation");
const { readGlobalEmailConfiguration } = require("../platform/emailInboundProvisioning");
const { createAutomationService } = require("../automations/service");
const { lockActiveClienteRow } = require("../shared/clientLifecycleLock");
const { applyInboundConversationActivity } = require("../leads-communication/inboundActivity");

const PROVIDER = "EMAIL";
const PROCESSABLE = "RECEBIDO";
const PROCESSING = "PROCESSANDO";
const PROCESSED = "PROCESSADO";
const ACTIVE_LEAD_STATUSES = ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"];
const EMAIL_TRANSACTION_OPTIONS = Object.freeze({ maxWait: 5000, timeout: 15000 });

function createEmailInboundProcessor({ prisma, env = process.env, logger = console, clock = () => new Date() } = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para intake de E-mail.");

  async function ingestRawEmail(input) {
    requireInboundGates(env);
    const providerType = normalizeProviderType(input?.providerType || env.EMAIL_PROVIDER_TYPE);
    const adapter = createEmailProviderAdapter({ providerType });
    adapter.validateConfiguration({ env });
    const normalized = await adapter.normalizeInboundMessage(input);
    const integration = await mapMailbox(prisma, normalized, env);
    const intake = await persistIntake(prisma, integration, normalized, clock());
    try {
      const processing = await processWithRecovery(prisma, intake.event.id, clock, env);
      return {
        accepted: true,
        idempotent: intake.idempotent || processing.idempotent,
        eventType: normalized.eventType,
        state: processing.state,
      };
    } catch (error) {
      try {
        await recordProcessingFailure(prisma, intake.event.id, error, clock());
      } catch (failureError) {
        emitFailureDiagnostic(logger, failureError);
        throw emailProcessingError(
          "EMAIL_FAILURE_RECORD_UNAVAILABLE",
          "Nao foi possivel concluir o registro sanitizado da falha de E-mail.",
        );
      }
      throw isEmailProcessingError(error)
        ? error
        : emailProcessingError("EMAIL_PROCESSING_FAILED", "Nao foi possivel processar o E-mail.");
    }
  }

  return { ingestRawEmail };
}

async function mapMailbox(prisma, normalized, env) {
  const address = await prisma.emailMailboxAddress.findUnique({
    where: { addressNormalized: normalized.mailboxAddress },
    include: {
      empresa: { select: { id: true, ativo: true } },
      canalIntegracao: true,
    },
  });
  if (!address) throw emailError(404, "EMAIL_MAILBOX_NOT_MAPPED", "Caixa de E-mail nao configurada.");
  const channel = address.canalIntegracao;
  const global = readGlobalEmailConfiguration(env);
  if (
    !address.empresa?.ativo
    || address.empresaId !== channel?.empresaId
    || channel?.tipo !== EMAIL_CHANNEL_TYPE
    || channel?.chaveInterna !== REAL_EMAIL_INBOUND_KEY
    || channel?.modoTeste !== false
    || channel?.ativo !== true
    || channel?.status !== "ATIVO"
    || channel?.emailProviderType !== normalized.providerType
    || channel?.providerEnvironment !== global.providerEnvironment
  ) {
    throw emailError(409, "EMAIL_MAILBOX_INACTIVE", "Caixa de E-mail indisponivel para intake.");
  }
  const capabilities = await prisma.empresaFuncionalidade.findMany({
    where: { empresaId: address.empresaId, chave: { in: Object.values(EMAIL_CAPABILITY_KEYS) }, habilitada: true },
    select: { chave: true },
  });
  const enabled = new Set(capabilities.map((item) => item.chave));
  if (!enabled.has(EMAIL_CAPABILITY_KEYS.INTEGRATION) || !enabled.has(EMAIL_CAPABILITY_KEYS.INBOUND)) {
    throw emailError(409, "EMAIL_CAPABILITY_INACTIVE", "Capability de E-mail indisponivel.");
  }
  return { empresaId: address.empresaId, channel, address };
}

async function persistIntake(prisma, integration, normalized, receivedAt, allowRetry = true) {
  const payloadJson = canonicalStringify(normalized);
  const payloadHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.eventoWebhook.findUnique({
        where: {
          empresaId_canalIntegracaoId_provedor_externalEventId: {
            empresaId: integration.empresaId,
            canalIntegracaoId: integration.channel.id,
            provedor: PROVIDER,
            externalEventId: normalized.externalEventId,
          },
        },
      });
      if (existing) {
        assertEquivalentEvent(existing, payloadHash, payloadJson, normalized.eventType);
        return { event: existing, idempotent: true };
      }
      const event = await tx.eventoWebhook.create({
        data: {
          empresaId: integration.empresaId,
          canalIntegracaoId: integration.channel.id,
          provedor: PROVIDER,
          externalEventId: normalized.externalEventId,
          tipoEvento: normalized.eventType,
          payloadHash,
          payloadJson,
          statusProcessamento: PROCESSABLE,
          tentativas: 0,
          recebidoEm: receivedAt,
        },
      });
      await tx.canalIntegracao.updateMany({
        where: {
          id: integration.channel.id,
          empresaId: integration.empresaId,
          tipo: EMAIL_CHANNEL_TYPE,
          ativo: true,
          OR: [{ lastWebhookAt: null }, { lastWebhookAt: { lt: receivedAt } }],
        },
        data: { lastWebhookAt: receivedAt },
      });
      return { event, idempotent: false };
    }, EMAIL_TRANSACTION_OPTIONS);
  } catch (error) {
    if (allowRetry && isUniqueConflict(error)) {
      const existing = await prisma.eventoWebhook.findUnique({
        where: {
          empresaId_canalIntegracaoId_provedor_externalEventId: {
            empresaId: integration.empresaId,
            canalIntegracaoId: integration.channel.id,
            provedor: PROVIDER,
            externalEventId: normalized.externalEventId,
          },
        },
      });
      if (existing) {
        assertEquivalentEvent(existing, payloadHash, payloadJson, normalized.eventType);
        return { event: existing, idempotent: true };
      }
    }
    throw error;
  }
}

async function processWithRecovery(prisma, eventId, clock, env) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => processTransaction(tx, eventId, clock, env),
        { isolationLevel: "Serializable", ...EMAIL_TRANSACTION_OPTIONS },
      );
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === 2) throw error;
      await delay(15 * (attempt + 1));
    }
  }
  throw emailProcessingError("EMAIL_CONCURRENCY_CONFLICT", "Concorrencia no processamento de E-mail.");
}

async function processTransaction(tx, eventId, clock, env) {
  let event = await loadEvent(tx, eventId);
  const normalized = validateStoredEvent(event);
  await requireActiveProcessingContext(tx, event);
  if (event.statusProcessamento === PROCESSED && event.processadoEm) {
    await verifyProcessedState(tx, event, normalized);
    return { idempotent: true, state: normalized.eventType === EMAIL_EVENT_TYPES.TEXT ? "PROCESSED" : "TERMINAL" };
  }
  if (event.statusProcessamento !== PROCESSABLE || event.processadoEm !== null) {
    throw emailProcessingError("EMAIL_EVENT_STATE_CONFLICT", "Estado do evento de E-mail invalido.");
  }
  const claim = await tx.eventoWebhook.updateMany({
    where: { id: event.id, empresaId: event.empresaId, canalIntegracaoId: event.canalIntegracaoId, statusProcessamento: PROCESSABLE, processadoEm: null },
    data: { statusProcessamento: PROCESSING, tentativas: { increment: 1 } },
  });
  if (claim.count !== 1) {
    event = await loadEvent(tx, eventId);
    if (event.statusProcessamento === PROCESSED && event.processadoEm) {
      await verifyProcessedState(tx, event, normalized);
      return { idempotent: true, state: normalized.eventType === EMAIL_EVENT_TYPES.TEXT ? "PROCESSED" : "TERMINAL" };
    }
    throw emailProcessingError("EMAIL_CONCURRENCY_CONFLICT", "Concorrencia no processamento de E-mail.");
  }

  if (normalized.eventType === EMAIL_EVENT_TYPES.TEXT) {
    const contact = await resolveContact(tx, event, normalized);
    const client = await resolveClient(tx, event, contact, normalized);
    const linkedContact = await linkContact(tx, event, contact, client);
    const thread = await resolveThread(tx, event, normalized, linkedContact, clock());
    const lead = await resolveLead(tx, event, client, thread.conversation, env);
    const conversation = await attachLead(tx, event, thread.conversation, lead);
    const message = await resolveMessage(tx, event, normalized, conversation);
    await updateConversationActivity(tx, conversation, message, new Date(normalized.receivedAt), event.recebidoEm);
  }

  await reserveActiveChannel(tx, event);
  const completedAt = clock();
  const completed = await tx.eventoWebhook.updateMany({
    where: { id: event.id, empresaId: event.empresaId, canalIntegracaoId: event.canalIntegracaoId, statusProcessamento: PROCESSING, processadoEm: null },
    data: { statusProcessamento: PROCESSED, processadoEm: completedAt, erroCodigo: null, erroResumo: null },
  });
  if (completed.count !== 1) throw emailProcessingError("EMAIL_EVENT_STATE_CONFLICT", "Estado do evento de E-mail invalido.");
  if (normalized.eventType === EMAIL_EVENT_TYPES.TEXT) await markChannelConnected(tx, event, completedAt);
  return { idempotent: false, state: normalized.eventType === EMAIL_EVENT_TYPES.TEXT ? "PROCESSED" : "TERMINAL" };
}

async function loadEvent(client, eventId) {
  const event = await client.eventoWebhook.findUnique({
    where: { id: eventId },
    include: {
      empresa: { select: { id: true, ativo: true } },
      canalIntegracao: true,
    },
  });
  if (!event) throw emailProcessingError("EMAIL_EVENT_NOT_FOUND", "Evento de E-mail nao encontrado.");
  return event;
}

function validateStoredEvent(event) {
  if (event.provedor !== PROVIDER || !Object.values(EMAIL_EVENT_TYPES).includes(event.tipoEvento)) {
    throw emailProcessingError("EMAIL_EVENT_UNSUPPORTED", "Evento de E-mail nao suportado.");
  }
  if (!event.payloadJson || !/^[0-9a-f]{64}$/.test(event.payloadHash || "")) {
    throw emailProcessingError("EMAIL_EVENT_PAYLOAD_INVALID", "Payload normalizado de E-mail invalido.");
  }
  if (crypto.createHash("sha256").update(event.payloadJson, "utf8").digest("hex") !== event.payloadHash) {
    throw emailProcessingError("EMAIL_EVENT_PAYLOAD_INTEGRITY", "Integridade do evento de E-mail invalida.");
  }
  let normalized;
  try { normalized = JSON.parse(event.payloadJson); } catch { throw emailProcessingError("EMAIL_EVENT_PAYLOAD_INVALID", "Payload normalizado de E-mail invalido."); }
  if (
    canonicalStringify(normalized) !== event.payloadJson
    || normalized.schemaVersion !== 1
    || normalized.externalEventId !== event.externalEventId
    || normalized.eventType !== event.tipoEvento
  ) {
    throw emailProcessingError("EMAIL_EVENT_PAYLOAD_INVALID", "Payload normalizado de E-mail invalido.");
  }
  return normalized;
}

async function requireActiveProcessingContext(tx, event) {
  const channel = event.canalIntegracao;
  if (
    !event.empresa?.ativo
    || !channel
    || channel.empresaId !== event.empresaId
    || channel.tipo !== EMAIL_CHANNEL_TYPE
    || channel.chaveInterna !== REAL_EMAIL_INBOUND_KEY
    || channel.modoTeste !== false
    || channel.ativo !== true
    || channel.status !== "ATIVO"
  ) throw emailProcessingError("EMAIL_PROCESSING_CHANNEL_INACTIVE", "Canal de E-mail inativo.");
  const rows = await tx.empresaFuncionalidade.findMany({
    where: { empresaId: event.empresaId, chave: { in: Object.values(EMAIL_CAPABILITY_KEYS) }, habilitada: true },
    select: { chave: true },
  });
  const enabled = new Set(rows.map((row) => row.chave));
  if (!enabled.has(EMAIL_CAPABILITY_KEYS.INTEGRATION) || !enabled.has(EMAIL_CAPABILITY_KEYS.INBOUND)) {
    throw emailProcessingError("EMAIL_PROCESSING_CAPABILITY_INACTIVE", "Capability de E-mail inativa.");
  }
}

async function resolveContact(tx, event, normalized) {
  const existing = await tx.contatoCanal.findUnique({
    where: { canalIntegracaoId_externalId: { canalIntegracaoId: event.canalIntegracaoId, externalId: normalized.from.address } },
  });
  if (existing) {
    if (existing.empresaId !== event.empresaId || existing.telefoneNormalizado !== null) {
      throw emailProcessingError("EMAIL_CONTACT_INTEGRITY", "Contato de E-mail inconsistente.");
    }
    return existing;
  }
  return tx.contatoCanal.create({ data: {
    empresaId: event.empresaId,
    canalIntegracaoId: event.canalIntegracaoId,
    externalId: normalized.from.address,
    telefoneNormalizado: null,
    nome: normalized.from.name,
  } });
}

async function resolveClient(tx, event, contact, normalized) {
  if (contact.clienteId !== null) {
    const client = await tx.cliente.findFirst({ where: { id: contact.clienteId, empresaId: event.empresaId } });
    if (!client) throw emailProcessingError("EMAIL_CLIENT_INTEGRITY", "Cliente de E-mail inconsistente.");
    if (client.arquivadoEm !== null) throw emailProcessingError("EMAIL_CLIENT_ARCHIVED_READ_ONLY", "O cliente arquivado precisa ser restaurado antes de receber novos e-mails.");
    await lockActiveClienteRow(tx, event.empresaId, client.id);
    return client;
  }
  return tx.cliente.create({ data: {
    empresaId: event.empresaId,
    nome: normalized.from.name || "Contato por e-mail",
    telefone: "",
    email: normalized.from.address,
    empresa: "",
    interesse: "",
    origem: "E-mail",
  } });
}

async function linkContact(tx, event, contact, client) {
  if (contact.clienteId === client.id) return contact;
  if (contact.clienteId !== null || client.empresaId !== event.empresaId) throw emailProcessingError("EMAIL_CONTACT_CLIENT_CONFLICT", "Vinculo de contato de E-mail invalido.");
  const updated = await tx.contatoCanal.updateMany({ where: { id: contact.id, empresaId: event.empresaId, canalIntegracaoId: event.canalIntegracaoId, clienteId: null }, data: { clienteId: client.id } });
  if (updated.count !== 1) throw emailProcessingError("EMAIL_CONTACT_CLIENT_CONFLICT", "Vinculo de contato de E-mail invalido.");
  return { ...contact, clienteId: client.id };
}

async function resolveThread(tx, event, normalized, contact, now) {
  const linkedConversation = await findReferencedConversation(tx, event, normalized);
  const emailThreadKey = linkedConversation?.emailThreadKey || deriveThreadKey(event.canalIntegracaoId, normalized);
  let conversation = linkedConversation || await tx.conversaCanal.findUnique({ where: { emailThreadKey } });
  if (conversation) {
    assertConversationOwnership(conversation, event, contact);
    if (conversation.status === "ENCERRADA") {
      const nextStatus = inboundConversationStatus(conversation);
      const reopened = await tx.conversaCanal.updateMany({
        where: { id: conversation.id, empresaId: event.empresaId, canalIntegracaoId: event.canalIntegracaoId, status: "ENCERRADA", emailThreadKey },
        data: { status: nextStatus, chaveAberta: emailThreadKey, encerradaEm: null, reabertaEm: now, aguardandoDesde: event.recebidoEm },
      });
      if (reopened.count !== 1) throw emailProcessingError("EMAIL_THREAD_CONFLICT", "Thread de E-mail alterada concorrentemente.");
      conversation = { ...conversation, status: nextStatus, chaveAberta: emailThreadKey, encerradaEm: null, reabertaEm: now };
    }
    return { conversation, emailThreadKey };
  }
  conversation = await tx.conversaCanal.create({ data: {
    empresaId: event.empresaId,
    canalIntegracaoId: event.canalIntegracaoId,
    contatoCanalId: contact.id,
    status: "AGUARDANDO_ATENDIMENTO",
    chaveAberta: emailThreadKey,
    emailThreadKey,
    emailSubject: normalized.subject,
    primeiraMensagemEm: new Date(normalized.receivedAt),
    ultimaMensagemEm: new Date(normalized.receivedAt),
    aguardandoDesde: event.recebidoEm,
  } });
  return { conversation, emailThreadKey };
}

async function findReferencedConversation(tx, event, normalized) {
  const identifiers = [...new Set([normalized.inReplyTo, ...(normalized.references || [])].filter(Boolean))];
  const clauses = [];
  if (normalized.providerThreadId) clauses.push({ providerThreadId: normalized.providerThreadId });
  if (identifiers.length) clauses.push({ messageId: { in: identifiers } }, { providerMessageId: { in: identifiers } });
  if (!clauses.length) return null;
  const matches = await tx.mensagemCanal.findMany({
    where: {
      empresaId: event.empresaId,
      canalIntegracaoId: event.canalIntegracaoId,
      emailMetadata: { is: { empresaId: event.empresaId, OR: clauses } },
    },
    select: { conversaCanal: true },
    distinct: ["conversaCanalId"],
    take: 2,
  });
  const conversations = new Map(matches.map((item) => [item.conversaCanal.id, item.conversaCanal]));
  if (conversations.size > 1) throw emailProcessingError("EMAIL_THREAD_AMBIGUOUS", "Referencias de E-mail ambiguas.");
  return [...conversations.values()][0] || null;
}

function assertConversationOwnership(conversation, event, contact) {
  if (conversation.empresaId !== event.empresaId || conversation.canalIntegracaoId !== event.canalIntegracaoId || conversation.contatoCanalId !== contact.id) {
    throw emailProcessingError("EMAIL_THREAD_PARTICIPANT_CONFLICT", "Thread de E-mail pertence a outro contato.");
  }
}

async function resolveLead(tx, event, client, conversation, env) {
  if (conversation?.leadId) {
    const lead = await tx.lead.findFirst({ where: { id: conversation.leadId, empresaId: event.empresaId, clienteId: client.id } });
    if (!lead || !ACTIVE_LEAD_STATUSES.includes(lead.status)) throw emailProcessingError("EMAIL_LEAD_INTEGRITY", "Lead de E-mail inconsistente.");
    return lead;
  }
  const candidates = await tx.lead.findMany({ where: { empresaId: event.empresaId, clienteId: client.id, origem: "EMAIL", status: { in: ACTIVE_LEAD_STATUSES } }, orderBy: { id: "asc" }, take: 2 });
  if (candidates.length > 1) throw emailProcessingError("EMAIL_LEAD_AMBIGUOUS", "Lead de E-mail ambiguo.");
  if (candidates.length === 1) return candidates[0];
  const lead = await tx.lead.create({ data: { empresaId: event.empresaId, clienteId: client.id, responsavelId: null, status: "NOVO", origem: "EMAIL" } });
  await createAutomationService({ prisma: tx, env }).enqueueLeadCreated({
    tx,
    empresaId: event.empresaId,
    leadId: lead.id,
    originalEventId: `email:${event.id}`,
    occurredAt: lead.createdAt,
  });
  return lead;
}

async function attachLead(tx, event, conversation, lead) {
  if (conversation.leadId === lead.id) return conversation;
  if (conversation.leadId !== null) throw emailProcessingError("EMAIL_LEAD_INTEGRITY", "Lead de E-mail inconsistente.");
  const updated = await tx.conversaCanal.updateMany({ where: { id: conversation.id, empresaId: event.empresaId, leadId: null }, data: { leadId: lead.id } });
  if (updated.count !== 1) throw emailProcessingError("EMAIL_LEAD_INTEGRITY", "Lead de E-mail inconsistente.");
  return { ...conversation, leadId: lead.id };
}

async function resolveMessage(tx, event, normalized, conversation) {
  const existing = await tx.mensagemCanal.findUnique({ where: { canalIntegracaoId_externalId: { canalIntegracaoId: event.canalIntegracaoId, externalId: event.externalEventId } }, include: { emailMetadata: true } });
  if (existing) {
    assertMessageEquivalent(existing, event, normalized, conversation);
    return { ...existing, createdNow: false };
  }
  const created = await tx.mensagemCanal.create({ data: {
    empresaId: event.empresaId,
    canalIntegracaoId: event.canalIntegracaoId,
    conversaCanalId: conversation.id,
    externalId: event.externalEventId,
    direcao: "ENTRADA",
    tipo: "TEXTO",
    texto: normalized.text,
    status: "RECEBIDA",
    statusEntrega: "RECEBIDA",
    enviadaEm: new Date(normalized.receivedAt),
    simulada: false,
    emailMetadata: { create: {
      messageId: normalized.messageId,
      providerMessageId: normalized.providerMessageId,
      providerThreadId: normalized.providerThreadId,
      threadKey: conversation.emailThreadKey,
      inReplyTo: normalized.inReplyTo,
      referencesJson: JSON.stringify(normalized.references),
      fromAddress: normalized.from.address,
      fromName: normalized.from.name,
      toJson: JSON.stringify(normalized.to),
      ccJson: JSON.stringify(normalized.cc),
      bccCount: normalized.bccCount,
      replyTo: normalized.replyTo,
      subject: normalized.subject,
      htmlSanitized: normalized.htmlSanitized,
      attachmentsJson: JSON.stringify(normalized.attachments),
      attachmentCount: normalized.attachments.length,
      rawSize: normalized.rawSize,
      receivedAt: new Date(normalized.receivedAt),
    } },
  }, include: { emailMetadata: true } });
  return { ...created, createdNow: true };
}

async function updateConversationActivity(tx, conversation, message, messageTime, receivedAt) {
  if (!message.createdNow) return;
  await applyInboundConversationActivity(tx, conversation, messageTime, receivedAt);
  if (message.emailMetadata?.subject && conversation.emailSubject !== message.emailMetadata.subject) {
    await tx.conversaCanal.updateMany({
      where: { id: conversation.id, empresaId: conversation.empresaId },
      data: { emailSubject: conversation.emailSubject || message.emailMetadata.subject },
    });
  }
}

function inboundConversationStatus(conversation) {
  return conversation.responsavelId === null ? "AGUARDANDO_ATENDIMENTO" : "EM_ATENDIMENTO";
}

async function verifyProcessedState(tx, event, normalized) {
  const message = await tx.mensagemCanal.findUnique({ where: { canalIntegracaoId_externalId: { canalIntegracaoId: event.canalIntegracaoId, externalId: event.externalEventId } }, include: { emailMetadata: true, conversaCanal: true } });
  if (normalized.eventType !== EMAIL_EVENT_TYPES.TEXT) {
    if (message) throw emailProcessingError("EMAIL_TERMINAL_EVENT_INCONSISTENT", "Evento terminal de E-mail inconsistente.");
    return;
  }
  if (!message || !message.emailMetadata || !message.conversaCanal) throw emailProcessingError("EMAIL_PROCESSED_EVENT_INCONSISTENT", "Evento processado de E-mail inconsistente.");
  assertMessageEquivalent(message, event, normalized, message.conversaCanal);
}

function assertMessageEquivalent(message, event, normalized, conversation) {
  if (
    message.empresaId !== event.empresaId
    || message.canalIntegracaoId !== event.canalIntegracaoId
    || message.conversaCanalId !== conversation.id
    || message.externalId !== event.externalEventId
    || message.direcao !== "ENTRADA"
    || message.tipo !== "TEXTO"
    || message.texto !== normalized.text
    || message.emailMetadata?.fromAddress !== normalized.from.address
  ) throw emailProcessingError("EMAIL_MESSAGE_INTEGRITY", "Mensagem de E-mail inconsistente.");
}

async function reserveActiveChannel(tx, event) {
  const updated = await tx.canalIntegracao.updateMany({ where: { id: event.canalIntegracaoId, empresaId: event.empresaId, tipo: EMAIL_CHANNEL_TYPE, chaveInterna: REAL_EMAIL_INBOUND_KEY, modoTeste: false, ativo: true, status: "ATIVO" }, data: { ativo: true } });
  if (updated.count !== 1) throw emailProcessingError("EMAIL_PROCESSING_CHANNEL_INACTIVE", "Canal de E-mail inativo.");
}

async function markChannelConnected(tx, event, completedAt) {
  await tx.canalIntegracao.updateMany({ where: { id: event.canalIntegracaoId, empresaId: event.empresaId, verifiedAt: null }, data: { verifiedAt: completedAt } });
  await tx.canalIntegracao.updateMany({ where: { id: event.canalIntegracaoId, empresaId: event.empresaId, connectedAt: null }, data: { connectedAt: completedAt } });
}

async function recordProcessingFailure(prisma, eventId, error, failedAt) {
  const code = sanitizeFailureCode(error?.code || error?.message);
  return prisma.$transaction(async (tx) => {
    const event = await tx.eventoWebhook.findUnique({ where: { id: eventId }, select: { id: true, empresaId: true, canalIntegracaoId: true, statusProcessamento: true } });
    if (!event || event.statusProcessamento === PROCESSED) return { recorded: false };
    const failed = await tx.eventoWebhook.updateMany({ where: { id: event.id, statusProcessamento: { not: PROCESSED } }, data: { statusProcessamento: "FALHOU", erroCodigo: code, erroResumo: "Falha sanitizada no processamento de E-mail." } });
    if (failed.count !== 1) return { recorded: false };
    await tx.canalIntegracao.updateMany({ where: { id: event.canalIntegracaoId, empresaId: event.empresaId, ativo: true, status: "ATIVO" }, data: { lastFailureAt: failedAt, lastFailureCode: code } });
    return { recorded: true };
  }, EMAIL_TRANSACTION_OPTIONS);
}

function emitFailureDiagnostic(logger, error) {
  const output = typeof logger?.error === "function" ? logger.error.bind(logger) : null;
  if (!output) return false;
  try {
    output(JSON.stringify({
      event: "email_failure_record_unavailable",
      code: sanitizeFailureCode(error?.code),
    }));
    return true;
  } catch (diagnosticError) {
    void diagnosticError;
    return false;
  }
}

function deriveThreadKey(channelId, normalized) {
  const rootReference = normalized.references?.[0] || normalized.inReplyTo;
  const seed = normalized.providerThreadId || rootReference || normalized.messageId || normalized.providerMessageId || normalized.externalEventId;
  return `email:${channelId}:thread:${stableHash(seed)}`;
}

function assertEquivalentEvent(existing, payloadHash, payloadJson, eventType) {
  if (existing.payloadHash !== payloadHash || existing.payloadJson !== payloadJson || existing.tipoEvento !== eventType) {
    throw emailError(409, "EMAIL_REPLAY_CONFLICT", "Replay de E-mail divergente.");
  }
}

function requireInboundGates(env) {
  if (env.EMAIL_INTEGRATION_ENABLED !== "true" || env.EMAIL_INBOUND_ENABLED !== "true") {
    throw emailError(404, "EMAIL_INBOUND_DISABLED", "Inbound de E-mail indisponivel.");
  }
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sanitizeFailureCode(value) {
  const normalized = String(value || "EMAIL_PROCESSING_FAILED").toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 80);
  return normalized || "EMAIL_PROCESSING_FAILED";
}

function emailProcessingError(code, message) {
  const error = new Error(message);
  error.name = "EmailProcessingError";
  error.code = code;
  error.status = 409;
  return error;
}

function isEmailProcessingError(error) {
  return error?.name === "EmailProcessingError";
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

function isRetryableConflict(error) {
  return isUniqueConflict(error)
    || error?.code === "P2034"
    || error?.code === "EMAIL_CONCURRENCY_CONFLICT"
    || error?.code === "EMAIL_THREAD_CONFLICT";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createEmailInboundProcessor,
  emailProcessingError,
  isEmailProcessingError,
};
