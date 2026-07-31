const crypto = require("node:crypto");
const { isFeatureEnabledForTenant, FEATURE_KEYS } = require("../tenant-features/service");

const PROVIDER = "WHATSAPP";
const EVENT_TYPE = "WHATSAPP_MESSAGE_RECEIVED";
const EVENT_TYPES = Object.freeze({
  TEXT: EVENT_TYPE,
  STATUS: "WHATSAPP_MESSAGE_STATUS",
  MEDIA_UNSUPPORTED: "WHATSAPP_MESSAGE_MEDIA_UNSUPPORTED",
  IGNORED: "WHATSAPP_MESSAGE_IGNORED",
});
const MEDIA_MESSAGE_TYPES = new Set(["audio", "document", "image", "sticker", "video"]);
const PAYLOAD_SCHEMA_VERSION = 1;
const MAX_WABA_ID_LENGTH = 128;
const MAX_PHONE_NUMBER_ID_LENGTH = 128;
const MAX_MESSAGE_ID_LENGTH = 512;
const MAX_SENDER_ID_LENGTH = 64;
const MAX_TIMESTAMP_LENGTH = 20;
const MAX_EVENT_KIND_LENGTH = 64;
const MAX_ENTRIES_PER_REQUEST = 3;
const MAX_CHANGES_PER_ENTRY = 5;
const MAX_EVENTS_PER_CHANGE = 5;
const MAX_TOTAL_EVENTS_PER_REQUEST = 10;

function createWhatsAppWebhookIntake({ prisma, clock = () => new Date() }) {
  if (!prisma) throw new Error("Prisma e obrigatorio para o intake WhatsApp.");
  if (typeof clock !== "function") throw new Error("Relogio invalido para o intake WhatsApp.");

  return async function processWhatsAppWebhook(payload, { env = process.env } = {}) {
    const parsedItems = parseAtomicEvents(payload);
    const items = deduplicateBatch(parsedItems);
    const identity = requireSingleIntegrationIdentity(items);
    const integration = await mapIntegration(prisma, identity);

    const integrationEnabled = await isFeatureEnabledForTenant({
      prisma,
      empresaId: integration.empresaId,
      featureKey: FEATURE_KEYS.WHATSAPP_INTEGRATION,
      env,
    });
    const inboundEnabled = await isFeatureEnabledForTenant({
      prisma,
      empresaId: integration.empresaId,
      featureKey: FEATURE_KEYS.WHATSAPP_INBOUND,
      env,
    });
    if (!integrationEnabled || !inboundEnabled) {
      throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");
    }

    const records = items.map((item) => eventRecord(item, integration));
    const receivedAt = clock();
    if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
      throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
    }
    const events = await persistBatch(prisma, records, integration, receivedAt, true);
    return { accepted: true, events };
  };
}

function parseAtomicEvents(payload) {
  if (!isObject(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  if (payload.entry.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
  if (payload.entry.length > MAX_ENTRIES_PER_REQUEST) {
    throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
  }

  const items = [];
  let totalEvents = 0;
  for (const entry of payload.entry) {
    if (!isObject(entry)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    const wabaId = requiredIdentifier(entry.id, MAX_WABA_ID_LENGTH);
    if (!wabaId || !Array.isArray(entry.changes)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    if (entry.changes.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
    if (entry.changes.length > MAX_CHANGES_PER_ENTRY) {
      throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
    }

    for (const change of entry.changes) {
      if (!isObject(change)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      if (change.field !== "messages") throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
      if (!isObject(change.value) || !isObject(change.value.metadata)) {
        throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      }

      const phoneNumberId = requiredIdentifier(change.value.metadata.phone_number_id, MAX_PHONE_NUMBER_ID_LENGTH);
      if (!phoneNumberId) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      const hasMessages = Array.isArray(change.value.messages);
      const hasStatuses = Array.isArray(change.value.statuses);
      if (!hasMessages && !hasStatuses) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      if (hasMessages && hasStatuses) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      if (hasMessages && change.value.messages.length === 0) {
        throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
      }
      if (hasStatuses && change.value.statuses.length === 0) {
        throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
      }
      const eventCount = hasMessages
        ? change.value.messages.length
        : change.value.statuses.length;
      if (eventCount > MAX_EVENTS_PER_CHANGE) {
        throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
      }
      totalEvents += eventCount;
      if (totalEvents > MAX_TOTAL_EVENTS_PER_REQUEST) {
        throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
      }

      const contacts = readContacts(change.value.contacts);
      for (const message of change.value.messages || []) {
        items.push(parseMessageEvent({ message, contacts, wabaId, phoneNumberId, field: change.field }));
      }
      for (const status of change.value.statuses || []) {
        items.push(parseStatusEvent({ status, wabaId, phoneNumberId, field: change.field }));
      }
    }
  }

  if (items.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
  requireSingleIntegrationIdentity(items);
  return items;
}

function parseMessageEvent({ message, contacts, wabaId, phoneNumberId, field }) {
  if (!isObject(message)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  const externalEventId = requiredIdentifier(message.id, MAX_MESSAGE_ID_LENGTH);
  const senderId = requiredIdentifier(message.from, MAX_SENDER_ID_LENGTH);
  const timestamp = requiredTimestamp(message.timestamp);
  if (!externalEventId || !senderId || !timestamp) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  const messageType = requiredIdentifier(message.type, MAX_EVENT_KIND_LENGTH);
  if (!messageType) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  if (messageType === "text" && (!isObject(message.text) || typeof message.text.body !== "string")) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }

  const contact = matchingContact(contacts, senderId);
  const atomicPayload = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    provider: PROVIDER,
    wabaId,
    phoneNumberId,
    field,
    message,
    contact,
  };
  const payloadJson = canonicalStringify(atomicPayload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
  return {
    eventType: messageType === "text"
      ? EVENT_TYPES.TEXT
      : MEDIA_MESSAGE_TYPES.has(messageType)
        ? EVENT_TYPES.MEDIA_UNSUPPORTED
        : EVENT_TYPES.IGNORED,
    externalEventId,
    wabaId,
    phoneNumberId,
    payloadJson,
    payloadHash,
  };
}

function parseStatusEvent({ status, wabaId, phoneNumberId, field }) {
  if (!isObject(status)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  const messageId = requiredIdentifier(status.id, MAX_MESSAGE_ID_LENGTH);
  const statusType = requiredIdentifier(status.status, MAX_EVENT_KIND_LENGTH);
  const timestamp = requiredTimestamp(status.timestamp);
  const recipientId = requiredIdentifier(status.recipient_id, MAX_SENDER_ID_LENGTH);
  if (!messageId || !statusType || !timestamp || !recipientId) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  const atomicPayload = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    provider: PROVIDER,
    wabaId,
    phoneNumberId,
    field,
    status,
  };
  const payloadJson = canonicalStringify(atomicPayload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
  return {
    eventType: EVENT_TYPES.STATUS,
    externalEventId: statusEventId(payloadJson),
    wabaId,
    phoneNumberId,
    payloadJson,
    payloadHash,
  };
}

function readContacts(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  if (value.some((contact) => !isObject(contact))) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  return value;
}

function matchingContact(contacts, senderId) {
  const matches = contacts.filter((contact) => contact.wa_id === senderId);
  if (matches.length === 0) return null;
  const firstCanonical = canonicalStringify(matches[0]);
  if (matches.some((contact) => canonicalStringify(contact) !== firstCanonical)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  return matches[0];
}

function deduplicateBatch(items) {
  const byId = new Map();
  for (const item of items) {
    const existing = byId.get(item.externalEventId);
    if (!existing) {
      byId.set(item.externalEventId, item);
      continue;
    }
    if (!sameAtomicItem(existing, item)) throw intakeError(409, "WEBHOOK_IDEMPOTENCY_CONFLICT");
  }
  return [...byId.values()];
}

function requireSingleIntegrationIdentity(items) {
  const first = items[0];
  if (!first) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
  if (items.some((item) => item.wabaId !== first.wabaId || item.phoneNumberId !== first.phoneNumberId)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  return { wabaId: first.wabaId, phoneNumberId: first.phoneNumberId };
}

async function mapIntegration(prisma, { wabaId, phoneNumberId }) {
  let matches;
  try {
    matches = await prisma.canalIntegracao.findMany({
      where: {
        tipo: "WHATSAPP_META",
        wabaId,
        phoneNumberId,
        ativo: true,
        status: "ATIVO",
        empresa: { ativo: true },
      },
      select: { id: true, empresaId: true },
      take: 2,
    });
  } catch {
    throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
  if (matches.length === 0) throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");
  if (matches.length > 1) throw intakeError(503, "WEBHOOK_INTEGRATION_AMBIGUOUS");
  return matches[0];
}

function eventRecord(item, integration) {
  return {
    empresaId: integration.empresaId,
    canalIntegracaoId: integration.id,
    provedor: PROVIDER,
    externalEventId: item.externalEventId,
    tipoEvento: item.eventType,
    payloadHash: item.payloadHash,
    payloadJson: item.payloadJson,
    statusProcessamento: "RECEBIDO",
    tentativas: 0,
  };
}

async function persistBatch(prisma, records, integration, receivedAt, allowUniqueRetry) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await findExisting(tx, records);
      assertExistingEquivalent(existing, records);
      const existingById = new Map(existing.map((event) => [event.externalEventId, event]));
      const accepted = [];
      for (const record of records) {
        const stored = existingById.get(record.externalEventId);
        if (stored) {
          accepted.push({ eventoWebhookId: stored.id, created: false });
          continue;
        }
        const created = await tx.eventoWebhook.create({
          data: record,
          select: { id: true },
        });
        accepted.push({ eventoWebhookId: created.id, created: true });
      }
      await tx.canalIntegracao.updateMany({
        where: {
          id: integration.id,
          empresaId: integration.empresaId,
          OR: [
            { lastWebhookAt: null },
            { lastWebhookAt: { lt: receivedAt } },
          ],
        },
        data: { lastWebhookAt: receivedAt },
      });
      return accepted;
    });
  } catch (error) {
    if (isIntakeError(error)) throw error;
    if (isUniqueConflict(error) && allowUniqueRetry) {
      return persistBatch(prisma, records, integration, receivedAt, false);
    }
    if (isUniqueConflict(error)) {
      const existing = await findExisting(prisma, records).catch(() => null);
      if (existing) {
        assertExistingEquivalent(existing, records);
        if (existing.length === records.length) {
          const existingById = new Map(existing.map((event) => [event.externalEventId, event]));
          return records.map((record) => ({
            eventoWebhookId: existingById.get(record.externalEventId).id,
            created: false,
          }));
        }
      }
    }
    throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
}

async function findExisting(client, records) {
  return client.eventoWebhook.findMany({
    where: {
      OR: records.map((record) => ({
        empresaId: record.empresaId,
        canalIntegracaoId: record.canalIntegracaoId,
        provedor: record.provedor,
        externalEventId: record.externalEventId,
      })),
    },
    select: {
      id: true,
      empresaId: true,
      canalIntegracaoId: true,
      provedor: true,
      externalEventId: true,
      tipoEvento: true,
      payloadHash: true,
      payloadJson: true,
    },
  });
}

function assertExistingEquivalent(existing, records) {
  const expectedById = new Map(records.map((record) => [record.externalEventId, record]));
  const seen = new Set();
  for (const event of existing) {
    const expected = expectedById.get(event.externalEventId);
    if (!expected || seen.has(event.externalEventId) || !samePersistedEvent(event, expected)) {
      throw intakeError(409, "WEBHOOK_IDEMPOTENCY_CONFLICT");
    }
    seen.add(event.externalEventId);
  }
}

function samePersistedEvent(event, expected) {
  return event.empresaId === expected.empresaId
    && event.canalIntegracaoId === expected.canalIntegracaoId
    && event.provedor === expected.provedor
    && event.externalEventId === expected.externalEventId
    && event.tipoEvento === expected.tipoEvento
    && event.payloadHash === expected.payloadHash
    && event.payloadJson === expected.payloadJson;
}

function sameAtomicItem(left, right) {
  return left.externalEventId === right.externalEventId
    && left.wabaId === right.wabaId
    && left.phoneNumberId === right.phoneNumberId
    && left.eventType === right.eventType
    && left.payloadHash === right.payloadHash
    && left.payloadJson === right.payloadJson;
}

function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

function requiredIdentifier(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u0020\u007f]/.test(value)
    ? value
    : null;
}

function requiredTimestamp(value) {
  return typeof value === "string" && /^[0-9]{1,20}$/.test(value) ? value : null;
}

function statusEventId(payloadJson) {
  return `status:${crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex")}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function intakeError(status, code) {
  const error = new Error(code);
  error.name = "WhatsAppWebhookIntakeError";
  error.status = status;
  error.code = code;
  return error;
}

function isIntakeError(error) {
  return error?.name === "WhatsAppWebhookIntakeError";
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

module.exports = {
  EVENT_TYPE,
  EVENT_TYPES,
  MAX_CHANGES_PER_ENTRY,
  MAX_ENTRIES_PER_REQUEST,
  MAX_EVENTS_PER_CHANGE,
  MAX_TOTAL_EVENTS_PER_REQUEST,
  MEDIA_MESSAGE_TYPES,
  PROVIDER,
  canonicalStringify,
  createWhatsAppWebhookIntake,
  deduplicateBatch,
  parseAtomicEvents,
  parseAtomicMessages: parseAtomicEvents,
  statusEventId,
};
