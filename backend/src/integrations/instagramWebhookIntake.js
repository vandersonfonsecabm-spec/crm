const crypto = require("node:crypto");
const { readGlobalInstagramConfiguration } = require("../platform/instagramInboundProvisioning");
const PROVIDER = "INSTAGRAM";
const EVENT_TYPES = Object.freeze({
  TEXT: "INSTAGRAM_DIRECT_MESSAGE_RECEIVED",
  STATUS: "INSTAGRAM_DIRECT_STATUS",
  MEDIA_UNSUPPORTED: "INSTAGRAM_DIRECT_MEDIA_UNSUPPORTED",
  IGNORED: "INSTAGRAM_DIRECT_IGNORED",
});
const PAYLOAD_SCHEMA_VERSION = 1;
const MAX_ID_LENGTH = 512;
const MAX_ENTRIES_PER_REQUEST = 3;
const MAX_EVENTS_PER_ENTRY = 5;
const MAX_TOTAL_EVENTS_PER_REQUEST = 10;

function createInstagramWebhookIntake({ prisma, clock = () => new Date() }) {
  if (!prisma) throw new Error("Prisma e obrigatorio para o intake Instagram.");
  if (typeof clock !== "function") throw new Error("Relogio invalido para o intake Instagram.");

  return async function processInstagramWebhook(payload, { env = process.env } = {}) {
    const items = deduplicateBatch(parseAtomicEvents(payload));
    const identity = requireSingleIntegrationIdentity(items);
    const integration = await mapIntegration(prisma, identity, env);
    const { integrationEnabled, inboundEnabled } = await readCapabilities(
      prisma,
      integration.empresaId,
      env,
    );
    if (!integrationEnabled || !inboundEnabled) throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");

    const receivedAt = clock();
    if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
      throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
    }
    const records = items.map((item) => eventRecord(item, integration));
    const events = await persistBatch(prisma, records, integration, receivedAt, true);
    return { accepted: true, events };
  };
}

function parseAtomicEvents(payload) {
  if (!isObject(payload) || payload.object !== "instagram" || !Array.isArray(payload.entry)) {
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
    const instagramBusinessAccountId = requiredIdentifier(entry.id, MAX_ID_LENGTH);
    if (!instagramBusinessAccountId || !Array.isArray(entry.messaging)) {
      throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    }
    if (entry.messaging.length === 0) throw intakeError(422, "WEBHOOK_EVENT_UNSUPPORTED");
    if (entry.messaging.length > MAX_EVENTS_PER_ENTRY) {
      throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
    }
    totalEvents += entry.messaging.length;
    if (totalEvents > MAX_TOTAL_EVENTS_PER_REQUEST) {
      throw intakeError(413, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
    }
    for (const event of entry.messaging) {
      items.push(parseMessagingEvent(event, instagramBusinessAccountId));
    }
  }
  requireSingleIntegrationIdentity(items);
  return items;
}

function parseMessagingEvent(event, instagramBusinessAccountId) {
  if (!isObject(event) || !isObject(event.sender) || !isObject(event.recipient)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  const senderId = requiredIdentifier(event.sender.id, MAX_ID_LENGTH);
  const recipientId = requiredIdentifier(event.recipient.id, MAX_ID_LENGTH);
  const timestamp = requiredTimestamp(event.timestamp);
  const isEcho = isObject(event.message) && event.message.is_echo === true;
  if (
    !senderId
    || !recipientId
    || !timestamp
    || (isEcho ? senderId !== instagramBusinessAccountId : recipientId !== instagramBusinessAccountId)
  ) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }

  let eventType;
  let externalEventId;
  if (isObject(event.message)) {
    externalEventId = requiredIdentifier(event.message.mid, MAX_ID_LENGTH);
    if (!externalEventId) throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
    if (Array.isArray(event.message.attachments) && event.message.attachments.length > 0) {
      eventType = EVENT_TYPES.MEDIA_UNSUPPORTED;
    } else if (typeof event.message.text === "string" && event.message.is_echo !== true) {
      eventType = EVENT_TYPES.TEXT;
    } else {
      eventType = EVENT_TYPES.IGNORED;
    }
  } else if (isObject(event.delivery) || isObject(event.read)) {
    eventType = EVENT_TYPES.STATUS;
    externalEventId = derivedEventId(eventType, event);
  } else {
    eventType = EVENT_TYPES.IGNORED;
    externalEventId = derivedEventId(eventType, event);
  }

  const atomicPayload = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    provider: PROVIDER,
    instagramBusinessAccountId,
    event,
  };
  const payloadJson = canonicalStringify(atomicPayload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
  return {
    eventType,
    externalEventId,
    instagramBusinessAccountId,
    payloadJson,
    payloadHash,
  };
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
  if (items.some((item) => item.instagramBusinessAccountId !== first.instagramBusinessAccountId)) {
    throw intakeError(400, "WEBHOOK_PAYLOAD_INVALID");
  }
  return { instagramBusinessAccountId: first.instagramBusinessAccountId };
}

async function mapIntegration(prisma, { instagramBusinessAccountId }, env) {
  let matches;
  try {
    const global = readGlobalInstagramConfiguration(env);
    matches = await prisma.canalIntegracao.findMany({
      where: {
        tipo: "INSTAGRAM_META",
        chaveInterna: "instagram-meta-inbound-real",
        modoTeste: false,
        instagramBusinessAccountId,
        metaAppId: global.metaAppId,
        providerEnvironment: global.providerEnvironment,
        ativo: true,
        status: "ATIVO",
        empresa: { ativo: true },
      },
      select: {
        id: true,
        empresaId: true,
        instagramBusinessAccountId: true,
        metaAppId: true,
        providerEnvironment: true,
      },
      take: 2,
    });
  } catch {
    throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
  if (matches.length === 0) throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");
  if (matches.length > 1) throw intakeError(503, "WEBHOOK_INTEGRATION_AMBIGUOUS");
  return matches[0];
}

async function readCapabilities(prisma, empresaId, env) {
  if (env.INSTAGRAM_INTEGRATION_ENABLED !== "true" || env.INSTAGRAM_INBOUND_ENABLED !== "true") {
    return { integrationEnabled: false, inboundEnabled: false };
  }
  let rows;
  try {
    rows = await prisma.empresaFuncionalidade.findMany({
      where: {
        empresaId,
        chave: { in: ["INSTAGRAM_INTEGRATION", "INSTAGRAM_INBOUND"] },
        habilitada: true,
      },
      select: { chave: true },
    });
  } catch {
    throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
  const enabled = new Set(rows.map((row) => row.chave));
  return {
    integrationEnabled: enabled.has("INSTAGRAM_INTEGRATION"),
    inboundEnabled: enabled.has("INSTAGRAM_INTEGRATION") && enabled.has("INSTAGRAM_INBOUND"),
  };
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
        const created = await tx.eventoWebhook.create({ data: record, select: { id: true } });
        accepted.push({ eventoWebhookId: created.id, created: true });
      }
      await touchActiveChannel(tx, integration, receivedAt);
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
          const byId = new Map(existing.map((event) => [event.externalEventId, event]));
          return records.map((record) => ({
            eventoWebhookId: byId.get(record.externalEventId).id,
            created: false,
          }));
        }
      }
    }
    throw intakeError(503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
}

async function touchActiveChannel(tx, integration, receivedAt, allowRetry = true) {
  const channel = await tx.canalIntegracao.findFirst({
    where: {
      id: integration.id,
      empresaId: integration.empresaId,
      tipo: "INSTAGRAM_META",
      chaveInterna: "instagram-meta-inbound-real",
      modoTeste: false,
      ativo: true,
      status: "ATIVO",
      instagramBusinessAccountId: integration.instagramBusinessAccountId,
      metaAppId: integration.metaAppId,
      providerEnvironment: integration.providerEnvironment,
    },
    select: { lastWebhookAt: true },
  });
  if (!channel) throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");
  const nextWebhookAt = channel.lastWebhookAt && channel.lastWebhookAt.getTime() >= receivedAt.getTime()
    ? channel.lastWebhookAt
    : receivedAt;
  const touched = await tx.canalIntegracao.updateMany({
    where: {
      id: integration.id,
      empresaId: integration.empresaId,
      tipo: "INSTAGRAM_META",
      chaveInterna: "instagram-meta-inbound-real",
      modoTeste: false,
      ativo: true,
      status: "ATIVO",
      instagramBusinessAccountId: integration.instagramBusinessAccountId,
      metaAppId: integration.metaAppId,
      providerEnvironment: integration.providerEnvironment,
      lastWebhookAt: channel.lastWebhookAt,
    },
    data: { lastWebhookAt: nextWebhookAt },
  });
  if (touched.count === 1) return;
  if (allowRetry) return touchActiveChannel(tx, integration, receivedAt, false);
  throw intakeError(404, "WEBHOOK_NOT_AVAILABLE");
}

function findExisting(client, records) {
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
    && left.instagramBusinessAccountId === right.instagramBusinessAccountId
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
  const normalized = typeof value === "number" ? String(value) : value;
  return typeof normalized === "string" && /^\d{1,20}$/.test(normalized) ? normalized : null;
}

function derivedEventId(type, event) {
  return `${type.toLowerCase()}:${crypto.createHash("sha256").update(canonicalStringify(event), "utf8").digest("hex")}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function intakeError(status, code) {
  const error = new Error(code);
  error.name = "InstagramWebhookIntakeError";
  error.status = status;
  error.code = code;
  return error;
}

function isIntakeError(error) {
  return error?.name === "InstagramWebhookIntakeError";
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

module.exports = {
  EVENT_TYPES,
  MAX_ENTRIES_PER_REQUEST,
  MAX_EVENTS_PER_ENTRY,
  MAX_TOTAL_EVENTS_PER_REQUEST,
  PROVIDER,
  canonicalStringify,
  createInstagramWebhookIntake,
  deduplicateBatch,
  derivedEventId,
  parseAtomicEvents,
};
