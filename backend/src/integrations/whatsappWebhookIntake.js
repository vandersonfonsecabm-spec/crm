const crypto = require("node:crypto");
const { isFeatureEnabledForTenant, FEATURE_KEYS } = require("../tenant-features/service");

const PROVIDER = "WHATSAPP";
const EVENT_TYPE = "WHATSAPP_MESSAGE_RECEIVED";
const PAYLOAD_SCHEMA_VERSION = 1;
const MAX_WABA_ID_LENGTH = 128;
const MAX_PHONE_NUMBER_ID_LENGTH = 128;
const MAX_MESSAGE_ID_LENGTH = 512;
const MAX_SENDER_ID_LENGTH = 64;
const MAX_TIMESTAMP_LENGTH = 20;

function createWhatsAppWebhookIntake({ prisma }) {
  if (!prisma) throw new Error("Prisma e obrigatorio para o intake WhatsApp.");

  return async function processWhatsAppWebhook(payload, { env = process.env } = {}) {
    const parsedItems = parseAtomicMessages(payload);
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
    const events = await persistBatch(prisma, records, true);
    return { accepted: true, events };
  };
}

function parseAtomicMessages(payload) {
  if (!isObject(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  if (payload.entry.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");

  const items = [];
  for (const entry of payload.entry) {
    if (!isObject(entry)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    const wabaId = requiredIdentifier(entry.id, MAX_WABA_ID_LENGTH);
    if (!wabaId || !Array.isArray(entry.changes)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    if (entry.changes.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");

    for (const change of entry.changes) {
      if (!isObject(change)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      if (change.field !== "messages") throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
      if (!isObject(change.value) || !isObject(change.value.metadata)) {
        throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      }

      const phoneNumberId = requiredIdentifier(change.value.metadata.phone_number_id, MAX_PHONE_NUMBER_ID_LENGTH);
      if (!phoneNumberId) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      if (!Array.isArray(change.value.messages)) {
        if (Array.isArray(change.value.statuses)) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
        throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
      }
      if (change.value.messages.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");

      const contacts = readContacts(change.value.contacts);
      for (const message of change.value.messages) {
        items.push(parseMessage({ message, contacts, wabaId, phoneNumberId, field: change.field }));
      }
    }
  }

  if (items.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
  requireSingleIntegrationIdentity(items);
  return items;
}

function parseMessage({ message, contacts, wabaId, phoneNumberId, field }) {
  if (!isObject(message)) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  const externalEventId = requiredIdentifier(message.id, MAX_MESSAGE_ID_LENGTH);
  const senderId = requiredIdentifier(message.from, MAX_SENDER_ID_LENGTH);
  const timestamp = requiredTimestamp(message.timestamp);
  if (!externalEventId || !senderId || !timestamp) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  if (message.type !== "text") throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
  if (!isObject(message.text) || typeof message.text.body !== "string") {
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
  return { externalEventId, wabaId, phoneNumberId, payloadJson, payloadHash };
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
    tipoEvento: EVENT_TYPE,
    payloadHash: item.payloadHash,
    payloadJson: item.payloadJson,
    statusProcessamento: "RECEBIDO",
    tentativas: 0,
  };
}

async function persistBatch(prisma, records, allowUniqueRetry) {
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
      return accepted;
    });
  } catch (error) {
    if (isIntakeError(error)) throw error;
    if (isUniqueConflict(error) && allowUniqueRetry) return persistBatch(prisma, records, false);
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
      provedor: PROVIDER,
      externalEventId: { in: records.map((record) => record.externalEventId) },
    },
    select: {
      id: true,
      empresaId: true,
      canalIntegracaoId: true,
      provedor: true,
      externalEventId: true,
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
    && event.payloadHash === expected.payloadHash
    && event.payloadJson === expected.payloadJson;
}

function sameAtomicItem(left, right) {
  return left.externalEventId === right.externalEventId
    && left.wabaId === right.wabaId
    && left.phoneNumberId === right.phoneNumberId
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
  PROVIDER,
  canonicalStringify,
  createWhatsAppWebhookIntake,
  deduplicateBatch,
  parseAtomicMessages,
};
