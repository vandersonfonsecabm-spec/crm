const crypto = require("node:crypto");
const { sanitizeAuditReason: sanitizeSharedAuditReason } = require("../security/auditReason");

const REAL_MESSENGER_INBOUND_KEY = "messenger-meta-inbound-real";
const MESSENGER_CHANNEL_TYPE = "MESSENGER_META";
const MESSENGER_CAPABILITY_KEYS = Object.freeze({
  INTEGRATION: "MESSENGER_INTEGRATION",
  INBOUND: "MESSENGER_INBOUND",
});
const MESSENGER_PROVISIONING_STATUS = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  CONFIGURED_INACTIVE: "CONFIGURED_INACTIVE",
  ERROR: "ERROR",
});
const MAX_NAME_LENGTH = 120;
const MAX_PAGE_NAME_MASKED_LENGTH = 120;
const MAX_REASON_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PROVIDER_ENVIRONMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const UNIQUE_CONFLICT_KIND = Object.freeze({
  TENANT_KEY: "TENANT_KEY",
  GLOBAL_IDENTITY: "GLOBAL_IDENTITY",
  UNKNOWN: "UNKNOWN",
});
const TENANT_KEY_FIELDS = ["empresaId", "chaveInterna"];
const GLOBAL_IDENTITY_FIELDS = ["messengerPageId"];
const ALLOWED_INPUT_FIELDS = new Set([
  "name",
  "messengerPageId",
  "messengerPageNameMasked",
  "expectedUpdatedAt",
  "reason",
]);

function createMessengerInboundProvisioningService({
  prisma,
  env = process.env,
  logger = console,
  clock = () => new Date(),
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para provisionamento Messenger.");

  async function provision({ tenantId, actorUserId, body, correlationId }) {
    const input = validateProvisioningPayload(body);
    const globalConfig = readGlobalMessengerConfiguration(env);
    await requireTenant(tenantId);

    const realChannels = await findRealChannels(tenantId);
    const capabilities = await readCapabilities(tenantId);
    const canonical = canonicalChannel(realChannels);
    if (
      realChannels.some((channel) => channel.chaveInterna !== REAL_MESSENGER_INBOUND_KEY)
      || realChannels.filter((channel) => channel.chaveInterna === REAL_MESSENGER_INBOUND_KEY).length > 1
    ) {
      throw legacyConflict();
    }

    if (canonical) {
      assertCanonicalConfiguration(canonical, globalConfig);
      assertInactiveProvisioningState(canonical, capabilities);
      return updateExistingChannel({
        channel: canonical,
        capabilities,
        tenantId,
        actorUserId,
        input,
        globalConfig,
        correlationId,
      });
    }

    const creation = creationData(input);
    requireReason(input.reason);
    assertCapabilitiesInactive(capabilities);
    await assertIdentityAvailable({
      tenantId,
      messengerPageId: creation.messengerPageId,
    });

    let channel;
    try {
      channel = await prisma.canalIntegracao.create({
        data: {
          empresaId: tenantId,
          tipo: MESSENGER_CHANNEL_TYPE,
          nome: creation.name,
          chaveInterna: REAL_MESSENGER_INBOUND_KEY,
          publicId: randomUUID(),
          status: "INATIVO",
          modoTeste: false,
          ativo: false,
          providerEnvironment: globalConfig.providerEnvironment,
          metaAppId: globalConfig.metaAppId,
          messengerPageId: creation.messengerPageId,
          messengerPageNameMasked: creation.messengerPageNameMasked,
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
      changedFields: ["name", "messengerPageNameMasked"],
      reason: input.reason,
      correlationId,
      clock,
    });
    return presentProvisioningResult(channel, capabilities, true, true);
  }

  async function getStatus({ tenantId }) {
    await requireTenant(tenantId);
    const [realChannels, capabilities] = await Promise.all([
      findRealChannels(tenantId),
      readCapabilities(tenantId),
    ]);
    if (realChannels.length === 0) {
      return presentStatus(null, capabilities, {
        globalConfiguration: hasValidGlobalConfiguration(env),
      });
    }

    const canonical = canonicalChannel(realChannels);
    if (
      !canonical
      || realChannels.length !== 1
      || !hasValidGlobalConfiguration(env)
    ) {
      return presentStatus(canonical, capabilities, {
        globalConfiguration: hasValidGlobalConfiguration(env),
        forceError: true,
      });
    }

    try {
      assertCanonicalConfiguration(canonical, readGlobalMessengerConfiguration(env));
      return presentStatus(canonical, capabilities, { globalConfiguration: true });
    } catch {
      return presentStatus(canonical, capabilities, {
        globalConfiguration: false,
        forceError: true,
      });
    }
  }

  async function requireTenant(tenantId) {
    const tenant = await prisma.empresa.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw provisioningError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
  }

  async function findRealChannels(tenantId) {
    return prisma.canalIntegracao.findMany({
      where: { empresaId: tenantId, tipo: MESSENGER_CHANNEL_TYPE, modoTeste: false },
      orderBy: { id: "asc" },
    });
  }

  async function readCapabilities(tenantId) {
    const rows = await prisma.empresaFuncionalidade.findMany({
      where: {
        empresaId: tenantId,
        chave: { in: Object.values(MESSENGER_CAPABILITY_KEYS) },
      },
      select: { chave: true, habilitada: true },
    });
    const enabled = new Map(rows.map((row) => [row.chave, row.habilitada === true]));
    return {
      integration: enabled.get(MESSENGER_CAPABILITY_KEYS.INTEGRATION) === true,
      inbound: enabled.get(MESSENGER_CAPABILITY_KEYS.INBOUND) === true,
    };
  }

  async function updateExistingChannel({
    channel,
    capabilities,
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
      messengerPageId: channel.messengerPageId,
    });

    const nextMetadata = metadataFromInput(channel, input);
    const changedFields = metadataChangedFields(channel, nextMetadata);
    if (changedFields.length === 0) {
      return presentProvisioningResult(channel, capabilities, false, false);
    }

    requireReason(input.reason);
    if (!input.expectedUpdatedAt) {
      throw provisioningError(
        422,
        "MESSENGER_EXPECTED_UPDATED_AT_REQUIRED",
        "expectedUpdatedAt e obrigatorio para alterar metadata.",
      );
    }

    const updated = await prisma.canalIntegracao.updateMany({
      where: {
        id: channel.id,
        empresaId: tenantId,
        chaveInterna: REAL_MESSENGER_INBOUND_KEY,
        tipo: MESSENGER_CHANNEL_TYPE,
        modoTeste: false,
        updatedAt: input.expectedUpdatedAt,
      },
      data: {
        nome: nextMetadata.name,
        messengerPageNameMasked: nextMetadata.messengerPageNameMasked,
      },
    });
    if (updated.count !== 1) {
      throw provisioningError(409, "MESSENGER_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
    }

    const persisted = await prisma.canalIntegracao.findFirst({
      where: { id: channel.id, empresaId: tenantId },
    });
    if (!persisted) {
      throw provisioningError(409, "MESSENGER_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
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
    return presentProvisioningResult(persisted, capabilities, true, false);
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
          chaveInterna: REAL_MESSENGER_INBOUND_KEY,
        },
      },
    });
    if (channel) {
      assertCanonicalConfiguration(channel, globalConfig);
      assertIdentityImmutable(channel, input);
      const sameMetadata = metadataChangedFields(channel, creation).length === 0;
      if (
        channel.messengerPageId === creation.messengerPageId
        && sameMetadata
      ) {
        const capabilities = await readCapabilities(tenantId);
        assertInactiveProvisioningState(channel, capabilities);
        return presentProvisioningResult(channel, capabilities, false, false);
      }
      throw provisioningError(
        409,
        "MESSENGER_CHANNEL_CONFLICT",
        "Canal criado concorrentemente com dados diferentes.",
      );
    }

    if (conflictKind === UNIQUE_CONFLICT_KIND.TENANT_KEY) throw originalError;
    await assertIdentityAvailable({
      tenantId,
      messengerPageId: creation.messengerPageId,
    });
    throw originalError;
  }

  async function assertIdentityAvailable({
    tenantId,
    channelId,
    messengerPageId,
  }) {
    const channel = await prisma.canalIntegracao.findFirst({
      where: {
        messengerPageId,
        ...(channelId ? { id: { not: channelId } } : {}),
      },
      select: {
        id: true,
        empresaId: true,
      },
    });
    if (channel) {
      throw provisioningError(
        409,
        "MESSENGER_IDENTITY_CONFLICT",
        "Identidade Messenger ja vinculada.",
      );
    }
  }

  return { getStatus, provision };
}

function readGlobalMessengerConfiguration(env = process.env) {
  const metaAppId = normalizeOpaqueId(env.MESSENGER_META_APP_ID, "MESSENGER_META_APP_ID");
  const providerEnvironment = String(env.MESSENGER_PROVIDER_ENVIRONMENT || "").trim();
  if (!PROVIDER_ENVIRONMENT_PATTERN.test(providerEnvironment)) {
    throw provisioningError(
      503,
      "MESSENGER_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do Messenger indisponivel.",
    );
  }
  return { metaAppId, providerEnvironment };
}

function hasValidGlobalConfiguration(env) {
  try {
    readGlobalMessengerConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

function validateProvisioningPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", "Payload invalido.");
  }
  const unknown = Object.keys(body).filter((key) => !ALLOWED_INPUT_FIELDS.has(key));
  if (unknown.length) {
    throw provisioningError(
      422,
      "MESSENGER_PROVISIONING_INVALID",
      "Payload contem campos nao permitidos.",
    );
  }

  const input = {};
  if (Object.hasOwn(body, "name")) input.name = normalizeRequiredText(body.name, "name", MAX_NAME_LENGTH);
  if (Object.hasOwn(body, "messengerPageId")) {
    input.messengerPageId = normalizeOpaqueId(
      body.messengerPageId,
      "messengerPageId",
    );
  }
  if (Object.hasOwn(body, "messengerPageNameMasked")) {
    input.messengerPageNameMasked = normalizeMaskedPageName(body.messengerPageNameMasked);
  }
  if (Object.hasOwn(body, "reason")) input.reason = normalizeReason(body.reason);
  if (Object.hasOwn(body, "expectedUpdatedAt")) {
    input.expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  }
  return input;
}

function creationData(input) {
  if (!input.name || !input.messengerPageId) {
    throw provisioningError(
      422,
      "MESSENGER_PROVISIONING_INVALID",
      "name e messengerPageId sao obrigatorios na criacao.",
    );
  }
  return {
    name: input.name,
    messengerPageId: input.messengerPageId,
    messengerPageNameMasked: input.messengerPageNameMasked ?? null,
  };
}

function canonicalChannel(channels) {
  return channels.find((channel) => channel.chaveInterna === REAL_MESSENGER_INBOUND_KEY) || null;
}

function assertCanonicalConfiguration(channel, globalConfig) {
  if (
    channel.tipo !== MESSENGER_CHANNEL_TYPE
    || channel.modoTeste !== false
    || channel.metaAppId !== globalConfig.metaAppId
    || channel.providerEnvironment !== globalConfig.providerEnvironment
    || !channel.messengerPageId
  ) {
    throw legacyConflict();
  }
}

function assertInactiveProvisioningState(channel, capabilities) {
  if (channel.ativo !== false || channel.status !== "INATIVO") {
    throw channelStateConflict();
  }
  assertCapabilitiesInactive(capabilities);
}

function assertCapabilitiesInactive(capabilities) {
  if (capabilities.integration || capabilities.inbound) {
    throw channelStateConflict();
  }
}

function assertIdentityImmutable(channel, input) {
  if (
    input.messengerPageId
    && input.messengerPageId !== channel.messengerPageId
  ) {
    throw provisioningError(
      409,
      "MESSENGER_IDENTITY_IMMUTABLE",
      "A identidade Messenger nao pode ser alterada.",
    );
  }
}

function metadataFromInput(channel, input) {
  return {
    name: input.name ?? channel.nome,
    messengerPageNameMasked: Object.hasOwn(input, "messengerPageNameMasked")
      ? input.messengerPageNameMasked
      : channel.messengerPageNameMasked,
  };
}

function metadataChangedFields(channel, metadata) {
  const changed = [];
  if (metadata.name !== channel.nome) changed.push("name");
  if (metadata.messengerPageNameMasked !== channel.messengerPageNameMasked) {
    changed.push("messengerPageNameMasked");
  }
  return changed;
}

function presentProvisioningResult(channel, capabilities, changed, created) {
  return {
    created,
    body: {
      changed,
      state: MESSENGER_PROVISIONING_STATUS.CONFIGURED_INACTIVE,
      configured: true,
      ativo: channel.ativo,
      status: channel.status,
      tipo: channel.tipo,
      name: channel.nome,
      messengerPageIdMasked: maskOpaqueId(channel.messengerPageId),
      messengerPageNameMasked: channel.messengerPageNameMasked,
      capabilities,
      connectedAt: channel.connectedAt,
      verifiedAt: channel.verifiedAt,
      lastWebhookAt: channel.lastWebhookAt,
      updatedAt: channel.updatedAt,
      nextRequirement: "ACTIVATE_MESSENGER_INBOUND",
    },
  };
}

function presentStatus(channel, capabilities, {
  globalConfiguration,
  forceError = false,
} = {}) {
  const configured = Boolean(channel?.messengerPageId);
  const coherentInactive = configured
    && channel.chaveInterna === REAL_MESSENGER_INBOUND_KEY
    && channel.tipo === MESSENGER_CHANNEL_TYPE
    && channel.modoTeste === false
    && channel.ativo === false
    && channel.status === "INATIVO"
    && capabilities.integration === false
    && capabilities.inbound === false;
  const state = forceError
    ? MESSENGER_PROVISIONING_STATUS.ERROR
    : configured && coherentInactive
      ? MESSENGER_PROVISIONING_STATUS.CONFIGURED_INACTIVE
      : configured
        ? MESSENGER_PROVISIONING_STATUS.ERROR
        : MESSENGER_PROVISIONING_STATUS.NOT_CONFIGURED;

  return {
    state,
    configured,
    ativo: channel?.ativo ?? false,
    status: channel?.status ?? null,
    tipo: channel?.tipo ?? MESSENGER_CHANNEL_TYPE,
    name: channel?.nome ?? null,
    messengerPageIdMasked: maskOpaqueId(channel?.messengerPageId),
    messengerPageNameMasked: channel?.messengerPageNameMasked ?? null,
    capabilities,
    connectedAt: channel?.connectedAt ?? null,
    verifiedAt: channel?.verifiedAt ?? null,
    lastWebhookAt: channel?.lastWebhookAt ?? null,
    updatedAt: channel?.updatedAt ?? null,
    checklist: {
      globalConfiguration: globalConfiguration === true,
      channel: Boolean(channel),
      identity: configured,
      integrationCapability: capabilities.integration,
      inboundCapability: capabilities.inbound,
    },
    callback: null,
    nextRequirement: state === MESSENGER_PROVISIONING_STATUS.NOT_CONFIGURED
      ? "PROVISION_MESSENGER_INBOUND"
      : state === MESSENGER_PROVISIONING_STATUS.CONFIGURED_INACTIVE
        ? "ACTIVATE_MESSENGER_INBOUND"
        : "RECONCILE_MESSENGER_CHANNEL",
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
    event: "messenger_inbound_channel_provisioning",
    timestamp: clock().toISOString(),
    service: "platform-messenger-provisioning",
    correlationId: normalizeCorrelationId(correlationId),
    actorRef: stableHash(`actor:${actorUserId}`),
    tenantId,
    channelRef: channel?.publicId ? stableHash(`channel:${channel.publicId}`) : null,
    action,
    changedFields: changedFields.filter((field) => [
      "name",
      "messengerPageNameMasked",
    ].includes(field)),
    previousState: action === "CREATED"
      ? MESSENGER_PROVISIONING_STATUS.NOT_CONFIGURED
      : MESSENGER_PROVISIONING_STATUS.CONFIGURED_INACTIVE,
    newState: MESSENGER_PROVISIONING_STATUS.CONFIGURED_INACTIVE,
    reason: sanitizeAuditReason(reason, [channel?.messengerPageId]),
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
    const globalField = field === "MESSENGER_META_APP_ID";
    throw provisioningError(
      globalField ? 503 : 422,
      globalField ? "MESSENGER_GLOBAL_CONFIGURATION_INVALID" : "MESSENGER_PROVISIONING_INVALID",
      `${field} invalido.`,
    );
  }
  return normalized;
}

function normalizeRequiredText(value, field, maxLength) {
  const normalized = normalizeOptionalText(value, field, maxLength);
  if (!normalized) {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", `${field} e obrigatorio.`);
  }
  return normalized;
}

function normalizeOptionalText(value, field, maxLength) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", `${field} deve ser texto.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", `${field} invalido.`);
  }
  return normalized || null;
}

function normalizeMaskedPageName(value) {
  const normalized = normalizeOptionalText(
    value,
    "messengerPageNameMasked",
    MAX_PAGE_NAME_MASKED_LENGTH,
  );
  if (normalized === null) return null;
  const visibleCharacters = (normalized.match(/[A-Za-z0-9]/g) || []).length;
  if (
    !/\*{3,}/.test(normalized)
    || visibleCharacters > 12
  ) {
    throw provisioningError(
      422,
      "MESSENGER_PROVISIONING_INVALID",
      "messengerPageNameMasked deve estar mascarado.",
    );
  }
  return normalized;
}

function normalizeExpectedUpdatedAt(value) {
  if (typeof value !== "string") {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", "expectedUpdatedAt invalido.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", "expectedUpdatedAt invalido.");
  }
  return parsed;
}

function normalizeReason(value) {
  if (value === null) return "";
  if (typeof value !== "string" || value.length > MAX_REASON_LENGTH) {
    throw provisioningError(422, "MESSENGER_PROVISIONING_INVALID", "reason invalido.");
  }
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireReason(reason) {
  if (!reason) {
    throw provisioningError(
      422,
      "MESSENGER_REASON_REQUIRED",
      "reason e obrigatorio para criar ou alterar o canal.",
    );
  }
}

function sanitizeAuditReason(value, sensitiveValues = []) {
  return sanitizeSharedAuditReason(value || "Operacao de auditoria.", sensitiveValues, 240);
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

function maskOpaqueId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
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
    "MESSENGER_LEGACY_CHANNEL_CONFLICT",
    "Existe configuracao Messenger real divergente que exige reconciliacao manual.",
  );
}

function channelStateConflict() {
  return provisioningError(
    409,
    "MESSENGER_CHANNEL_STATE_CONFLICT",
    "O canal Messenger nao esta em estado seguro para provisionamento.",
  );
}

function provisioningError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = {
  MESSENGER_PROVISIONING_STATUS,
  REAL_MESSENGER_INBOUND_KEY,
  classifyCanalUniqueConflictTarget,
  createMessengerInboundProvisioningService,
  readGlobalMessengerConfiguration,
  validateProvisioningPayload,
};
