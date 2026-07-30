const crypto = require("node:crypto");
const {
  WHATSAPP_OPERATIONAL_STATUS,
} = require("../integrations/whatsappInboundLifecycle");

const REAL_WHATSAPP_INBOUND_KEY = "whatsapp-meta-inbound-real";
const WHATSAPP_CHANNEL_TYPE = "WHATSAPP_META";
const MAX_NAME_LENGTH = 120;
const MAX_DISPLAY_PHONE_LENGTH = 64;
const MAX_VERIFIED_NAME_LENGTH = 120;
const MAX_REASON_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PROVIDER_ENVIRONMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const MASKED_PHONE_PATTERN = /^[+()0-9*Xx .-]+$/;
const UNIQUE_CONFLICT_KIND = Object.freeze({
  TENANT_KEY: "TENANT_KEY",
  GLOBAL_IDENTITY: "GLOBAL_IDENTITY",
  UNKNOWN: "UNKNOWN",
});
const TENANT_KEY_FIELDS = ["empresaId", "chaveInterna"];
const GLOBAL_IDENTITY_FIELDS = [
  "tipo",
  "providerEnvironment",
  "metaAppId",
  "phoneNumberId",
];
const SENSITIVE_REASON_KEYS = [
  "accessTokenRef",
  "accessToken",
  "appSecret",
  "verifyToken",
  "authorization",
  "cookie",
  "payload",
  "phoneNumberId",
  "wabaId",
  "telefone",
  "phone",
  "token",
];
const ALLOWED_INPUT_FIELDS = new Set([
  "name",
  "wabaId",
  "phoneNumberId",
  "displayPhoneMasked",
  "verifiedDisplayName",
  "expectedUpdatedAt",
  "reason",
]);

function createWhatsappInboundProvisioningService({
  prisma,
  env = process.env,
  logger = console,
  clock = () => new Date(),
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para provisionamento WhatsApp.");

  async function provision({ tenantId, actorUserId, body, correlationId }) {
    const input = validateProvisioningPayload(body);
    const globalConfig = readGlobalWhatsappConfiguration(env);
    const tenant = await prisma.empresa.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw provisioningError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");

    const realChannels = await prisma.canalIntegracao.findMany({
      where: { empresaId: tenantId, tipo: WHATSAPP_CHANNEL_TYPE, modoTeste: false },
      orderBy: { id: "asc" },
    });
    const canonical = realChannels.find((channel) => channel.chaveInterna === REAL_WHATSAPP_INBOUND_KEY) || null;
    if (
      realChannels.some((channel) => channel.chaveInterna !== REAL_WHATSAPP_INBOUND_KEY)
      || realChannels.filter((channel) => channel.chaveInterna === REAL_WHATSAPP_INBOUND_KEY).length > 1
    ) {
      throw legacyConflict();
    }

    if (canonical) {
      assertCanonicalConfiguration(canonical, globalConfig);
      return updateExistingChannel({
        channel: canonical,
        tenantId,
        actorUserId,
        input,
        globalConfig,
        correlationId,
      });
    }

    const creation = creationData(input);
    requireReason(input.reason);
    await assertIdentityAvailable({
      tenantId,
      wabaId: creation.wabaId,
      phoneNumberId: creation.phoneNumberId,
      globalConfig,
    });

    let channel;
    try {
      channel = await prisma.canalIntegracao.create({
        data: {
          empresaId: tenantId,
          tipo: WHATSAPP_CHANNEL_TYPE,
          nome: creation.name,
          chaveInterna: REAL_WHATSAPP_INBOUND_KEY,
          publicId: randomUUID(),
          status: "INATIVO",
          modoTeste: false,
          ativo: false,
          providerEnvironment: globalConfig.providerEnvironment,
          metaAppId: globalConfig.metaAppId,
          wabaId: creation.wabaId,
          phoneNumberId: creation.phoneNumberId,
          displayPhoneMasked: creation.displayPhoneMasked,
          verifiedDisplayName: creation.verifiedDisplayName,
        },
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const conflictKind = classifyCanalUniqueConflictTarget(error);
      if (conflictKind === UNIQUE_CONFLICT_KIND.UNKNOWN) throw error;
      return resolveCreateRace({
        tenantId,
        input,
        creation,
        globalConfig,
        conflictKind,
        originalError: error,
      });
    }

    emitAudit(logger, {
      action: "CREATED",
      actorUserId,
      tenantId,
      channel,
      changedFields: ["name", "displayPhoneMasked", "verifiedDisplayName"],
      reason: input.reason,
      correlationId,
      clock,
    });
    return presentResult(channel, true, true);
  }

  async function updateExistingChannel({
    channel,
    tenantId,
    actorUserId,
    input,
    globalConfig,
    correlationId,
  }) {
    assertIdentityImmutable(channel, input);
    await assertIdentityAvailable({
      tenantId,
      channelId: channel.id,
      wabaId: channel.wabaId,
      phoneNumberId: channel.phoneNumberId,
      globalConfig,
    });

    const nextMetadata = metadataFromInput(channel, input);
    const changedFields = metadataChangedFields(channel, nextMetadata);
    if (changedFields.length === 0) return presentResult(channel, false, false);

    requireReason(input.reason);
    if (!input.expectedUpdatedAt) {
      throw provisioningError(
        422,
        "WHATSAPP_EXPECTED_UPDATED_AT_REQUIRED",
        "expectedUpdatedAt e obrigatorio para alterar metadata.",
      );
    }

    const updated = await prisma.canalIntegracao.updateMany({
      where: {
        id: channel.id,
        empresaId: tenantId,
        chaveInterna: REAL_WHATSAPP_INBOUND_KEY,
        tipo: WHATSAPP_CHANNEL_TYPE,
        modoTeste: false,
        updatedAt: input.expectedUpdatedAt,
      },
      data: {
        nome: nextMetadata.name,
        displayPhoneMasked: nextMetadata.displayPhoneMasked,
        verifiedDisplayName: nextMetadata.verifiedDisplayName,
      },
    });
    if (updated.count !== 1) {
      throw provisioningError(409, "WHATSAPP_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
    }

    const persisted = await prisma.canalIntegracao.findFirst({
      where: { id: channel.id, empresaId: tenantId },
    });
    if (!persisted) {
      throw provisioningError(409, "WHATSAPP_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
    }

    emitAudit(logger, {
      action: "UPDATED",
      actorUserId,
      tenantId,
      channel: persisted,
      changedFields,
      reason: input.reason,
      correlationId,
      clock,
    });
    return presentResult(persisted, true, false);
  }

  async function resolveCreateRace({
    tenantId,
    input,
    creation,
    globalConfig,
    conflictKind,
    originalError,
  }) {
    const channel = await prisma.canalIntegracao.findUnique({
      where: {
        empresaId_chaveInterna: {
          empresaId: tenantId,
          chaveInterna: REAL_WHATSAPP_INBOUND_KEY,
        },
      },
    });
    if (channel) {
      assertCanonicalConfiguration(channel, globalConfig);
      assertIdentityImmutable(channel, input);
      const sameMetadata = metadataChangedFields(channel, creation).length === 0;
      if (
        channel.wabaId === creation.wabaId
        && channel.phoneNumberId === creation.phoneNumberId
        && sameMetadata
      ) {
        return presentResult(channel, false, false);
      }
      throw provisioningError(409, "WHATSAPP_CHANNEL_CONFLICT", "Canal criado concorrentemente com dados diferentes.");
    }

    if (conflictKind === UNIQUE_CONFLICT_KIND.TENANT_KEY) throw originalError;
    await assertIdentityAvailable({
      tenantId,
      wabaId: creation.wabaId,
      phoneNumberId: creation.phoneNumberId,
      globalConfig,
    });
    throw originalError;
  }

  async function assertIdentityAvailable({
    tenantId,
    channelId,
    wabaId,
    phoneNumberId,
    globalConfig,
  }) {
    const channels = await prisma.canalIntegracao.findMany({
      where: {
        tipo: WHATSAPP_CHANNEL_TYPE,
        modoTeste: false,
        phoneNumberId,
        ...(channelId ? { id: { not: channelId } } : {}),
      },
      orderBy: { id: "asc" },
    });
    for (const channel of channels) {
      if (
        channel.metaAppId !== globalConfig.metaAppId
        || channel.providerEnvironment !== globalConfig.providerEnvironment
      ) {
        throw legacyConflict();
      }
      if (channel.empresaId !== tenantId || channel.wabaId !== wabaId) {
        throw provisioningError(
          409,
          "WHATSAPP_IDENTITY_CONFLICT",
          "Identidade WhatsApp ja vinculada ou inconsistente.",
        );
      }
    }
  }

  return { provision };
}

function readGlobalWhatsappConfiguration(env = process.env) {
  const metaAppId = normalizeOpaqueId(env.WHATSAPP_META_APP_ID, "WHATSAPP_META_APP_ID");
  const providerEnvironment = String(env.WHATSAPP_PROVIDER_ENVIRONMENT || "").trim();
  if (!PROVIDER_ENVIRONMENT_PATTERN.test(providerEnvironment)) {
    throw provisioningError(
      503,
      "WHATSAPP_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do WhatsApp indisponivel.",
    );
  }
  return { metaAppId, providerEnvironment };
}

function validateProvisioningPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", "Payload invalido.");
  }
  const unknown = Object.keys(body).filter((key) => !ALLOWED_INPUT_FIELDS.has(key));
  if (unknown.length) {
    throw provisioningError(
      422,
      "WHATSAPP_PROVISIONING_INVALID",
      "Payload contem campos nao permitidos.",
    );
  }

  const input = {};
  if (Object.hasOwn(body, "name")) input.name = normalizeRequiredText(body.name, "name", MAX_NAME_LENGTH);
  if (Object.hasOwn(body, "wabaId")) input.wabaId = normalizeOpaqueId(body.wabaId, "wabaId");
  if (Object.hasOwn(body, "phoneNumberId")) input.phoneNumberId = normalizeOpaqueId(body.phoneNumberId, "phoneNumberId");
  if (Object.hasOwn(body, "displayPhoneMasked")) {
    input.displayPhoneMasked = normalizeMaskedPhone(body.displayPhoneMasked);
  }
  if (Object.hasOwn(body, "verifiedDisplayName")) {
    input.verifiedDisplayName = normalizeOptionalText(
      body.verifiedDisplayName,
      "verifiedDisplayName",
      MAX_VERIFIED_NAME_LENGTH,
    );
  }
  if (Object.hasOwn(body, "reason")) {
    input.reason = normalizeReason(body.reason);
  }
  if (Object.hasOwn(body, "expectedUpdatedAt")) {
    input.expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  }
  return input;
}

function creationData(input) {
  if (!input.name || !input.wabaId || !input.phoneNumberId) {
    throw provisioningError(
      422,
      "WHATSAPP_PROVISIONING_INVALID",
      "name, wabaId e phoneNumberId sao obrigatorios na criacao.",
    );
  }
  return {
    name: input.name,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneMasked: input.displayPhoneMasked ?? null,
    verifiedDisplayName: input.verifiedDisplayName ?? null,
  };
}

function assertCanonicalConfiguration(channel, globalConfig) {
  if (
    channel.tipo !== WHATSAPP_CHANNEL_TYPE
    || channel.modoTeste !== false
    || channel.metaAppId !== globalConfig.metaAppId
    || channel.providerEnvironment !== globalConfig.providerEnvironment
    || !channel.wabaId
    || !channel.phoneNumberId
  ) {
    throw legacyConflict();
  }
}

function assertIdentityImmutable(channel, input) {
  if (
    (input.wabaId && input.wabaId !== channel.wabaId)
    || (input.phoneNumberId && input.phoneNumberId !== channel.phoneNumberId)
  ) {
    throw provisioningError(
      409,
      "WHATSAPP_IDENTITY_IMMUTABLE",
      "A identidade WhatsApp nao pode ser alterada.",
    );
  }
}

function metadataFromInput(channel, input) {
  return {
    name: input.name ?? channel.nome,
    displayPhoneMasked: Object.hasOwn(input, "displayPhoneMasked")
      ? input.displayPhoneMasked
      : channel.displayPhoneMasked,
    verifiedDisplayName: Object.hasOwn(input, "verifiedDisplayName")
      ? input.verifiedDisplayName
      : channel.verifiedDisplayName,
  };
}

function metadataChangedFields(channel, metadata) {
  const changed = [];
  if (metadata.name !== channel.nome) changed.push("name");
  if (metadata.displayPhoneMasked !== channel.displayPhoneMasked) changed.push("displayPhoneMasked");
  if (metadata.verifiedDisplayName !== channel.verifiedDisplayName) changed.push("verifiedDisplayName");
  return changed;
}

function presentResult(channel, changed, created) {
  return {
    created,
    body: {
      publicId: channel.publicId,
      changed,
      tipo: channel.tipo,
      ativo: channel.ativo,
      modoTeste: channel.modoTeste,
      state: WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED,
      metadata: {
        name: channel.nome,
        displayPhoneMasked: channel.displayPhoneMasked,
        verifiedDisplayName: channel.verifiedDisplayName,
      },
      identity: {
        wabaHash: stableHash(channel.wabaId),
        phoneNumberHash: stableHash(channel.phoneNumberId),
      },
      updatedAt: channel.updatedAt,
    },
  };
}

function emitAudit(logger, {
  action,
  actorUserId,
  tenantId,
  channel,
  changedFields,
  reason,
  correlationId,
  clock,
}) {
  const output = typeof logger?.info === "function"
    ? logger.info
    : typeof logger?.log === "function" ? logger.log : null;
  if (!output) return false;
  const entry = {
    event: "whatsapp_inbound_channel_provisioning",
    timestamp: clock().toISOString(),
    service: "platform-whatsapp-provisioning",
    correlationId: normalizeCorrelationId(correlationId),
    actorRef: stableHash(`actor:${actorUserId}`),
    tenantId,
    channelRef: channel?.publicId || null,
    action,
    changedFields: changedFields.filter((field) => [
      "name",
      "displayPhoneMasked",
      "verifiedDisplayName",
    ].includes(field)),
    previousState: WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED,
    newState: WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED,
    reason: sanitizeAuditReason(reason, [
      channel?.wabaId,
      channel?.phoneNumberId,
    ]),
  };
  try {
    output.call(logger, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

function normalizeOpaqueId(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized
    || normalized.length > MAX_ID_LENGTH
    || !SAFE_ID_PATTERN.test(normalized)
  ) {
    const code = field.startsWith("WHATSAPP_")
      ? "WHATSAPP_GLOBAL_CONFIGURATION_INVALID"
      : "WHATSAPP_PROVISIONING_INVALID";
    const status = field.startsWith("WHATSAPP_") ? 503 : 422;
    throw provisioningError(status, code, `${field} invalido.`);
  }
  return normalized;
}

function normalizeRequiredText(value, field, maxLength) {
  const normalized = normalizeOptionalText(value, field, maxLength);
  if (!normalized) {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", `${field} e obrigatorio.`);
  }
  return normalized;
}

function normalizeOptionalText(value, field, maxLength) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", `${field} deve ser texto.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", `${field} invalido.`);
  }
  return normalized || null;
}

function normalizeMaskedPhone(value) {
  const normalized = normalizeOptionalText(value, "displayPhoneMasked", MAX_DISPLAY_PHONE_LENGTH);
  if (normalized === null) return null;
  const digitCount = (normalized.match(/\d/g) || []).length;
  if (
    !MASKED_PHONE_PATTERN.test(normalized)
    || !/[*Xx]/.test(normalized)
    || digitCount > 6
  ) {
    throw provisioningError(
      422,
      "WHATSAPP_PROVISIONING_INVALID",
      "displayPhoneMasked deve estar mascarado.",
    );
  }
  return normalized;
}

function normalizeExpectedUpdatedAt(value) {
  if (typeof value !== "string") {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", "expectedUpdatedAt invalido.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", "expectedUpdatedAt invalido.");
  }
  return parsed;
}

function normalizeReason(value) {
  if (value === null) return "";
  if (typeof value !== "string" || value.length > MAX_REASON_LENGTH) {
    throw provisioningError(422, "WHATSAPP_PROVISIONING_INVALID", "reason invalido.");
  }
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireReason(reason) {
  if (!reason) {
    throw provisioningError(422, "WHATSAPP_REASON_REQUIRED", "reason e obrigatorio para criar ou alterar o canal.");
  }
}

function sanitizeAuditReason(value, sensitiveValues = []) {
  let sanitized = String(value || "Operacao de provisionamento.")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ");
  for (const sensitiveValue of sensitiveValues) {
    const normalized = String(sensitiveValue || "").trim();
    if (normalized.length < 6) continue;
    sanitized = sanitized.replace(
      new RegExp(escapeRegExp(normalized), "g"),
      "[REDACTED_ID]",
    );
  }
  sanitized = redactSensitiveReasonPairs(sanitized)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_DOCUMENT]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[REDACTED_DOCUMENT]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s]+/gi, "[REDACTED_URL]")
    .replace(/\b(secret|password|senha|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return sanitized;
}

function redactSensitiveReasonPairs(value) {
  const keys = SENSITIVE_REASON_KEYS.map(escapeRegExp).join("|");
  const pattern = new RegExp(
    `\\b(${keys})\\b\\s*[:=]\\s*.*?(?=\\s+\\b(?:${keys})\\b\\s*[:=]|$)`,
    "gi",
  );
  return value.replace(pattern, (_match, key) => `${key}=[REDACTED]`);
}

function classifyCanalUniqueConflictTarget(error) {
  if (error?.code !== "P2002") return UNIQUE_CONFLICT_KIND.UNKNOWN;
  const targetParts = collectUniqueTargetParts(error?.meta?.target);
  if (hasUniqueTargetFields(targetParts, TENANT_KEY_FIELDS)) {
    return UNIQUE_CONFLICT_KIND.TENANT_KEY;
  }
  if (hasUniqueTargetFields(targetParts, GLOBAL_IDENTITY_FIELDS)) {
    return UNIQUE_CONFLICT_KIND.GLOBAL_IDENTITY;
  }
  return UNIQUE_CONFLICT_KIND.UNKNOWN;
}

function collectUniqueTargetParts(target, output = []) {
  if (typeof target === "string") {
    output.push(target);
    return output;
  }
  if (Array.isArray(target)) {
    for (const part of target) collectUniqueTargetParts(part, output);
    return output;
  }
  if (target && typeof target === "object") {
    for (const key of ["fields", "columns", "constraint", "index", "name"]) {
      if (Object.hasOwn(target, key)) collectUniqueTargetParts(target[key], output);
    }
  }
  return output;
}

function hasUniqueTargetFields(targetParts, fields) {
  const normalized = targetParts
    .join(" ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase();
  return fields.every((field) => (
    new RegExp(`(?:^|\\s)${field.toLowerCase()}(?:\\s|$)`).test(normalized)
  ));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function normalizeCorrelationId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9-]{1,120}$/.test(normalized) ? normalized : crypto.randomUUID();
}

function legacyConflict() {
  return provisioningError(
    409,
    "WHATSAPP_LEGACY_CHANNEL_CONFLICT",
    "Existe configuracao WhatsApp real divergente que exige reconciliacao manual.",
  );
}

function provisioningError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  REAL_WHATSAPP_INBOUND_KEY,
  classifyCanalUniqueConflictTarget,
  createWhatsappInboundProvisioningService,
  readGlobalWhatsappConfiguration,
  validateProvisioningPayload,
};
