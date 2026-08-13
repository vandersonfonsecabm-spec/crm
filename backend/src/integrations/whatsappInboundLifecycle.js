const crypto = require("node:crypto");
const { FEATURE_KEYS } = require("../tenant-features/service");

const REAL_WHATSAPP_INBOUND_KEY = "whatsapp-meta-inbound-real";
const WHATSAPP_CHANNEL_TYPE = "WHATSAPP_META";
const MAX_REASON_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PROVIDER_ENVIRONMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const ALLOWED_ACTION_FIELDS = new Set(["expectedUpdatedAt", "reason"]);
const ACTIONS = new Set(["ACTIVATE", "PAUSE", "REACTIVATE"]);
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

const WHATSAPP_OPERATIONAL_STATUS = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  WAITING_META_AUTH: "WAITING_META_AUTH",
  CONFIGURED_INACTIVE: "CONFIGURED_INACTIVE",
  CONNECTED: "CONNECTED",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
  UNAVAILABLE: "UNAVAILABLE",
});

function createWhatsappInboundLifecycleService({
  prisma,
  env = process.env,
  logger = console,
  clock = () => new Date(),
} = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para lifecycle WhatsApp.");

  async function getStatus({ tenantId }) {
    validateTenantId(tenantId);
    try {
      const context = await loadContext(prisma, tenantId, env);
      if (!context.tenant) throw lifecycleError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
      return presentStatus(context);
    } catch (error) {
      if (isLifecycleError(error)) throw error;
      return unavailableStatus();
    }
  }

  async function changeState({
    tenantId,
    actorUserId,
    action,
    body,
    correlationId,
  }) {
    validateTenantId(tenantId);
    validateActor(actorUserId);
    if (!ACTIONS.has(action)) {
      throw lifecycleError(422, "WHATSAPP_LIFECYCLE_INVALID", "Acao de lifecycle invalida.");
    }
    const input = validateLifecyclePayload(body);
    const globalConfig = action === "PAUSE" ? null : requireGlobalConfiguration(env);

    const result = await prisma.$transaction(async (tx) => {
      const context = await loadContext(tx, tenantId, env);
      if (!context.tenant) throw lifecycleError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
      const channel = action === "PAUSE"
        ? requirePausableChannel(context)
        : requireCanonicalChannel(context, globalConfig);
      if (globalConfig) await assertIdentityAvailable(tx, channel);
      assertPersistedStateIsCoherent(context, action);
      const auditReason = sanitizeAuditReason(input.reason, [
        channel.wabaId,
        channel.phoneNumberId,
      ]);

      const target = targetForAction(action, context);
      const previousState = deriveState(context);
      if (matchesTarget(context, target)) {
        return {
          changed: false,
          previousState,
          state: previousState,
          changedFields: [],
          channel,
          context,
        };
      }

      const changedFields = channelChangedFields(channel, target);
      const updated = await tx.canalIntegracao.updateMany({
        where: {
          id: channel.id,
          empresaId: tenantId,
          chaveInterna: REAL_WHATSAPP_INBOUND_KEY,
          tipo: WHATSAPP_CHANNEL_TYPE,
          modoTeste: false,
          updatedAt: input.expectedUpdatedAt,
          ativo: channel.ativo,
          status: channel.status,
        },
        data: {
          ativo: target.ativo,
          status: target.status,
        },
      });
      if (updated.count !== 1) throw channelConflict();

      const capabilities = new Map(context.featureRows.map((row) => [row.chave, row]));
      for (const change of target.capabilityChanges) {
        const capabilityChanged = await setCapabilityInTransaction(tx, {
          tenantId,
          actorUserId,
          featureKey: change.featureKey,
          enabled: change.enabled,
          current: capabilities.get(change.featureKey) || null,
          reason: auditReason,
          now: clock(),
        });
        if (capabilityChanged) changedFields.push(`capability:${change.featureKey}`);
      }

      const nextContext = await loadContext(tx, tenantId, env);
      const nextState = deriveState(nextContext);
      assertExpectedState(action, nextState, nextContext.channel);
      return {
        changed: true,
        previousState,
        state: nextState,
        changedFields,
        channel: nextContext.channel,
        context: nextContext,
        auditReason,
      };
    }, { maxWait: 5000, timeout: 10000 });

    if (result.changed) {
      emitLifecycleAudit(logger, {
        action,
        actorUserId,
        tenantId,
        channel: result.channel,
        previousState: result.previousState,
        newState: result.state,
        changedFields: result.changedFields,
        reason: result.auditReason,
        correlationId,
        clock,
      });
    }

    return {
      changed: result.changed,
      ...presentStatus(result.context),
    };
  }

  return {
    activate: (input) => changeState({ ...input, action: "ACTIVATE" }),
    getStatus,
    pause: (input) => changeState({ ...input, action: "PAUSE" }),
    reactivate: (input) => changeState({ ...input, action: "REACTIVATE" }),
  };
}

async function loadContext(client, tenantId, env) {
  const global = inspectGlobalConfiguration(env);
  const [tenant, realChannels, featureRows] = await Promise.all([
    client.empresa.findUnique({ where: { id: tenantId }, select: { id: true } }),
    client.canalIntegracao.findMany({
      where: { empresaId: tenantId, tipo: WHATSAPP_CHANNEL_TYPE, modoTeste: false },
      orderBy: { id: "asc" },
    }),
    client.empresaFuncionalidade.findMany({
      where: {
        empresaId: tenantId,
        chave: { in: [FEATURE_KEYS.WHATSAPP_INTEGRATION, FEATURE_KEYS.WHATSAPP_INBOUND] },
      },
    }),
  ]);
  const canonicalChannels = realChannels.filter(
    (channel) => channel.chaveInterna === REAL_WHATSAPP_INBOUND_KEY,
  );
  const channel = canonicalChannels.length === 1 ? canonicalChannels[0] : null;
  const features = new Map(featureRows.map((row) => [row.chave, row.habilitada === true]));
  return {
    tenant,
    realChannels,
    channel,
    featureRows,
    capabilities: {
      integration: features.get(FEATURE_KEYS.WHATSAPP_INTEGRATION) === true,
      inbound: features.get(FEATURE_KEYS.WHATSAPP_INBOUND) === true,
    },
    global,
  };
}

function deriveState(context) {
  const { channel, realChannels, global, capabilities } = context;
  if (!channel) {
    return realChannels.length > 0
      ? WHATSAPP_OPERATIONAL_STATUS.ERROR
      : WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED;
  }
  if (!hasEssentialIdentity(channel)) return WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED;
  if (
    realChannels.length !== 1
    || !global.valid
    || channel.metaAppId !== global.metaAppId
    || channel.providerEnvironment !== global.providerEnvironment
    || hasCurrentFailure(channel)
    || capabilities.inbound && !capabilities.integration
  ) {
    return WHATSAPP_OPERATIONAL_STATUS.ERROR;
  }
  if (channel.ativo === false && channel.status === "INATIVO") {
    return channel.verifiedAt || channel.connectedAt
      ? WHATSAPP_OPERATIONAL_STATUS.PAUSED
      : WHATSAPP_OPERATIONAL_STATUS.CONFIGURED_INACTIVE;
  }
  if (channel.ativo !== true || channel.status !== "ATIVO") {
    return WHATSAPP_OPERATIONAL_STATUS.ERROR;
  }
  if (!capabilities.integration || !capabilities.inbound) {
    return WHATSAPP_OPERATIONAL_STATUS.ERROR;
  }
  return channel.verifiedAt
    ? WHATSAPP_OPERATIONAL_STATUS.CONNECTED
    : WHATSAPP_OPERATIONAL_STATUS.WAITING_META_AUTH;
}

function presentStatus(context) {
  const channel = context.channel;
  const state = deriveState(context);
  return {
    canalIntegracaoId: channel?.id || null,
    credentialConfigured: Boolean(channel?.accessTokenRef),
    publicId: channel?.publicId || null,
    state,
    status: channel?.status || null,
    ativo: channel?.ativo === true,
    capabilities: {
      integration: context.capabilities.integration,
      inbound: context.capabilities.inbound,
    },
    connectedAt: channel?.connectedAt || null,
    verifiedAt: channel?.verifiedAt || null,
    lastWebhookAt: channel?.lastWebhookAt || null,
    lastFailureAt: channel?.lastFailureAt || null,
    lastFailureCode: sanitizeFailureCode(channel?.lastFailureCode),
    updatedAt: channel?.updatedAt || null,
    readiness: {
      globalFlags: context.global.flagsValid,
      globalSecrets: context.global.secretsValid,
      globalIdentity: context.global.identityValid,
      channelIdentity: hasEssentialIdentity(channel),
      capabilityIntegration: context.capabilities.integration,
      capabilityInbound: context.capabilities.inbound,
      channelActive: channel?.ativo === true && channel?.status === "ATIVO",
      callbackAvailable: true,
    },
    callbackPath: "/webhooks/whatsapp",
    nextHumanRequirement: nextHumanRequirement(state),
    ready: state === WHATSAPP_OPERATIONAL_STATUS.CONNECTED,
  };
}

function unavailableStatus() {
  return {
    canalIntegracaoId: null,
    credentialConfigured: false,
    publicId: null,
    state: WHATSAPP_OPERATIONAL_STATUS.UNAVAILABLE,
    status: null,
    ativo: false,
    capabilities: { integration: false, inbound: false },
    connectedAt: null,
    verifiedAt: null,
    lastWebhookAt: null,
    lastFailureAt: null,
    lastFailureCode: null,
    updatedAt: null,
    readiness: {
      globalFlags: false,
      globalSecrets: false,
      globalIdentity: false,
      channelIdentity: false,
      capabilityIntegration: false,
      capabilityInbound: false,
      channelActive: false,
      callbackAvailable: true,
    },
    callbackPath: "/webhooks/whatsapp",
    nextHumanRequirement: "RETRY_STATUS",
    ready: false,
  };
}

function nextHumanRequirement(state) {
  if (state === WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED) return "PROVISION_META_IDENTITY";
  if (state === WHATSAPP_OPERATIONAL_STATUS.CONFIGURED_INACTIVE) return "CONFIGURE_META_CALLBACK";
  if (state === WHATSAPP_OPERATIONAL_STATUS.WAITING_META_AUTH) return "SEND_FIRST_INBOUND_TEXT";
  if (state === WHATSAPP_OPERATIONAL_STATUS.PAUSED) return "REACTIVATE_CHANNEL";
  if (state === WHATSAPP_OPERATIONAL_STATUS.ERROR) return "REVIEW_CONFIGURATION";
  if (state === WHATSAPP_OPERATIONAL_STATUS.UNAVAILABLE) return "RETRY_STATUS";
  return null;
}

function validateLifecyclePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw lifecycleError(422, "WHATSAPP_LIFECYCLE_INVALID", "Payload invalido.");
  }
  const unknown = Object.keys(body).filter((key) => !ALLOWED_ACTION_FIELDS.has(key));
  if (unknown.length) {
    throw lifecycleError(422, "WHATSAPP_LIFECYCLE_INVALID", "Payload contem campos nao permitidos.");
  }
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  const reason = normalizeReason(body.reason);
  if (!reason) throw lifecycleError(422, "WHATSAPP_REASON_REQUIRED", "reason e obrigatorio.");
  return {
    expectedUpdatedAt,
    reason,
  };
}

function normalizeExpectedUpdatedAt(value) {
  if (typeof value !== "string") {
    throw lifecycleError(422, "WHATSAPP_EXPECTED_UPDATED_AT_REQUIRED", "expectedUpdatedAt e obrigatorio.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw lifecycleError(422, "WHATSAPP_LIFECYCLE_INVALID", "expectedUpdatedAt invalido.");
  }
  return parsed;
}

function normalizeReason(value) {
  if (typeof value !== "string" || value.length > MAX_REASON_LENGTH) {
    throw lifecycleError(422, "WHATSAPP_LIFECYCLE_INVALID", "reason invalido.");
  }
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function targetForAction(action, context) {
  if (action === "PAUSE") {
    return {
      ativo: false,
      status: "INATIVO",
      capabilityChanges: [
        { featureKey: FEATURE_KEYS.WHATSAPP_INBOUND, enabled: false },
      ],
    };
  }
  return {
    ativo: true,
    status: "ATIVO",
    capabilityChanges: [
      { featureKey: FEATURE_KEYS.WHATSAPP_INTEGRATION, enabled: true },
      { featureKey: FEATURE_KEYS.WHATSAPP_INBOUND, enabled: true },
    ],
  };
}

function matchesTarget(context, target) {
  if (
    context.channel.ativo !== target.ativo
    || context.channel.status !== target.status
  ) return false;
  return target.capabilityChanges.every(({ featureKey, enabled }) => {
    const current = featureKey === FEATURE_KEYS.WHATSAPP_INTEGRATION
      ? context.capabilities.integration
      : context.capabilities.inbound;
    return current === enabled;
  });
}

function channelChangedFields(channel, target) {
  const changed = [];
  if (channel.ativo !== target.ativo) changed.push("ativo");
  if (channel.status !== target.status) changed.push("status");
  return changed;
}

async function setCapabilityInTransaction(tx, {
  tenantId,
  actorUserId,
  featureKey,
  enabled,
  current,
  reason,
  now,
}) {
  const previousEnabled = current?.habilitada === true;
  if (previousEnabled === enabled) return false;
  let feature;
  if (current) {
    feature = await tx.empresaFuncionalidade.update({
      where: { id: current.id },
      data: {
        habilitada: enabled,
        habilitadoEm: enabled ? now : null,
        habilitadoPorUsuarioId: null,
      },
    });
  } else {
    if (!enabled) return false;
    feature = await tx.empresaFuncionalidade.create({
      data: {
        empresaId: tenantId,
        chave: featureKey,
        habilitada: true,
        habilitadoEm: now,
        habilitadoPorUsuarioId: null,
      },
    });
  }
  await tx.auditoriaFuncionalidade.create({
    data: {
      empresaId: tenantId,
      funcionalidadeId: feature.id,
      chave: featureKey,
      valorAnterior: current ? previousEnabled : null,
      valorNovo: enabled,
      operadoPor: "platform-operator",
      usuarioId: actorUserId,
      motivo: reason,
    },
  });
  return true;
}

function requireCanonicalChannel(context, globalConfig) {
  const { channel, realChannels } = context;
  if (!channel && realChannels.length === 0) {
    throw lifecycleError(404, "WHATSAPP_CHANNEL_NOT_FOUND", "Canal WhatsApp real nao encontrado.");
  }
  if (
    !channel
    || realChannels.length !== 1
    || channel.tipo !== WHATSAPP_CHANNEL_TYPE
    || channel.modoTeste !== false
    || channel.metaAppId !== globalConfig.metaAppId
    || channel.providerEnvironment !== globalConfig.providerEnvironment
    || !hasEssentialIdentity(channel)
  ) {
    throw lifecycleError(
      409,
      "WHATSAPP_LEGACY_CHANNEL_CONFLICT",
      "Configuracao WhatsApp real divergente exige reconciliacao manual.",
    );
  }
  return channel;
}

function requirePausableChannel(context) {
  const { channel, realChannels } = context;
  if (!channel && realChannels.length === 0) {
    throw lifecycleError(404, "WHATSAPP_CHANNEL_NOT_FOUND", "Canal WhatsApp real nao encontrado.");
  }
  if (
    !channel
    || realChannels.length !== 1
    || channel.tipo !== WHATSAPP_CHANNEL_TYPE
    || channel.modoTeste !== false
    || !hasEssentialIdentity(channel)
  ) {
    throw lifecycleError(
      409,
      "WHATSAPP_LEGACY_CHANNEL_CONFLICT",
      "Configuracao WhatsApp real divergente exige reconciliacao manual.",
    );
  }
  return channel;
}

async function assertIdentityAvailable(tx, channel) {
  const conflict = await tx.canalIntegracao.findFirst({
    where: {
      id: { not: channel.id },
      tipo: WHATSAPP_CHANNEL_TYPE,
      modoTeste: false,
      phoneNumberId: channel.phoneNumberId,
    },
    select: { id: true },
  });
  if (conflict) {
    throw lifecycleError(
      409,
      "WHATSAPP_IDENTITY_CONFLICT",
      "Identidade WhatsApp ja vinculada ou inconsistente.",
    );
  }
}

function assertPersistedStateIsCoherent(context, action) {
  const { channel, capabilities } = context;
  const channelPairValid = (
    channel.ativo === true && channel.status === "ATIVO"
  ) || (
    channel.ativo === false && channel.status === "INATIVO"
  );
  if (!channelPairValid || capabilities.inbound && !capabilities.integration) {
    throw lifecycleError(
      409,
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "Estado persistido do canal impede a operacao segura.",
    );
  }
  if (action !== "PAUSE" && hasCurrentFailure(channel)) {
    throw lifecycleError(
      409,
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "Falha operacional atual impede a operacao segura.",
    );
  }
}

function assertExpectedState(action, state, channel) {
  const expected = action === "PAUSE"
    ? new Set([
      WHATSAPP_OPERATIONAL_STATUS.CONFIGURED_INACTIVE,
      WHATSAPP_OPERATIONAL_STATUS.PAUSED,
      WHATSAPP_OPERATIONAL_STATUS.ERROR,
    ])
    : new Set([
      WHATSAPP_OPERATIONAL_STATUS.WAITING_META_AUTH,
      WHATSAPP_OPERATIONAL_STATUS.CONNECTED,
    ]);
  if (!expected.has(state) || !channel) {
    throw lifecycleError(
      409,
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "Transicao nao produziu o estado esperado.",
    );
  }
}

function requireGlobalConfiguration(env) {
  const inspected = inspectGlobalConfiguration(env);
  if (!inspected.valid) {
    throw lifecycleError(
      503,
      "WHATSAPP_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do WhatsApp indisponivel.",
    );
  }
  return {
    metaAppId: inspected.metaAppId,
    providerEnvironment: inspected.providerEnvironment,
  };
}

function inspectGlobalConfiguration(env = process.env) {
  let metaAppId = null;
  let providerEnvironment = null;
  let identityValid = false;
  try {
    const identity = readGlobalWhatsappConfiguration(env);
    metaAppId = identity.metaAppId;
    providerEnvironment = identity.providerEnvironment;
    identityValid = true;
  } catch {
    identityValid = false;
  }
  const flagsValid = env.WHATSAPP_INTEGRATION_ENABLED === "true"
    && env.WHATSAPP_INBOUND_ENABLED === "true";
  const secretsValid = hasConfiguredSecret(env.WHATSAPP_APP_SECRET)
    && hasConfiguredSecret(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  return {
    metaAppId,
    providerEnvironment,
    identityValid,
    flagsValid,
    secretsValid,
    valid: identityValid && flagsValid && secretsValid,
  };
}

function readGlobalWhatsappConfiguration(env = process.env) {
  const metaAppId = normalizeOpaqueId(env.WHATSAPP_META_APP_ID);
  const providerEnvironment = String(env.WHATSAPP_PROVIDER_ENVIRONMENT || "").trim();
  if (!PROVIDER_ENVIRONMENT_PATTERN.test(providerEnvironment)) {
    throw lifecycleError(
      503,
      "WHATSAPP_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do WhatsApp indisponivel.",
    );
  }
  return { metaAppId, providerEnvironment };
}

function normalizeOpaqueId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > MAX_ID_LENGTH || !SAFE_ID_PATTERN.test(normalized)) {
    throw lifecycleError(
      503,
      "WHATSAPP_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do WhatsApp indisponivel.",
    );
  }
  return normalized;
}

function hasEssentialIdentity(channel) {
  return Boolean(
    channel
      && typeof channel.wabaId === "string"
      && channel.wabaId.length > 0
      && typeof channel.phoneNumberId === "string"
      && channel.phoneNumberId.length > 0,
  );
}

function hasCurrentFailure(channel) {
  if (!channel?.lastFailureAt) return false;
  if (!channel.lastWebhookAt) return true;
  return new Date(channel.lastFailureAt).getTime() >= new Date(channel.lastWebhookAt).getTime();
}

function sanitizeFailureCode(value) {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)
    ? value
    : value ? "WHATSAPP_OPERATIONAL_ERROR" : null;
}

function sanitizeAuditReason(value, sensitiveValues = []) {
  const keys = SENSITIVE_REASON_KEYS.map(escapeRegExp).join("|");
  let sanitized = String(value || "Operacao de lifecycle.");
  for (const sensitiveValue of sensitiveValues) {
    const normalized = String(sensitiveValue || "").trim();
    if (normalized.length < 6) continue;
    sanitized = sanitized.replace(new RegExp(escapeRegExp(normalized), "g"), "[REDACTED_ID]");
  }
  return sanitized
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\b(${keys})\\b\\s*[:=]\\s*[^\\s,;]+`, "gi"), "$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]")
    .trim()
    .slice(0, 240);
}

function emitLifecycleAudit(logger, {
  action,
  actorUserId,
  tenantId,
  channel,
  previousState,
  newState,
  changedFields,
  reason,
  correlationId,
  clock,
}) {
  const output = typeof logger?.info === "function"
    ? logger.info
    : typeof logger?.log === "function" ? logger.log : null;
  if (!output) return false;
  try {
    output.call(logger, JSON.stringify({
      event: "whatsapp_inbound_lifecycle",
      timestamp: clock().toISOString(),
      service: "platform-whatsapp-lifecycle",
      correlationId: normalizeCorrelationId(correlationId),
      actorRef: stableHash(`actor:${actorUserId}`),
      tenantId,
      channelRef: channel?.publicId || null,
      action,
      previousState,
      newState,
      changedFields: changedFields.filter((field) => (
        ["ativo", "status"].includes(field) || field.startsWith("capability:")
      )),
      reason,
    }));
    return true;
  } catch {
    return false;
  }
}

function validateTenantId(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw lifecycleError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
  }
}

function validateActor(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw lifecycleError(403, "PLATFORM_FORBIDDEN", "Operador de plataforma invalido.");
  }
}

function channelConflict() {
  return lifecycleError(409, "WHATSAPP_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
}

function lifecycleError(status, code, message) {
  const error = new Error(message);
  error.name = "WhatsAppInboundLifecycleError";
  error.status = status;
  error.code = code;
  return error;
}

function isLifecycleError(error) {
  return error?.name === "WhatsAppInboundLifecycleError";
}

function hasConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function normalizeCorrelationId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9-]{1,120}$/.test(normalized) ? normalized : crypto.randomUUID();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  REAL_WHATSAPP_INBOUND_KEY,
  WHATSAPP_OPERATIONAL_STATUS,
  createWhatsappInboundLifecycleService,
  deriveState,
  inspectGlobalConfiguration,
  readGlobalWhatsappConfiguration,
};
