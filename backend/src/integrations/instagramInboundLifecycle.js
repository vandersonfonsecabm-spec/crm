const crypto = require("node:crypto");
const {
  REAL_INSTAGRAM_INBOUND_KEY,
  readGlobalInstagramConfiguration,
} = require("../platform/instagramInboundProvisioning");

const INSTAGRAM_CHANNEL_TYPE = "INSTAGRAM_META";
const INSTAGRAM_CAPABILITY_KEYS = Object.freeze({
  INTEGRATION: "INSTAGRAM_INTEGRATION",
  INBOUND: "INSTAGRAM_INBOUND",
});
const MAX_REASON_LENGTH = 500;
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
  "instagramBusinessAccountId",
  "pageId",
  "phoneNumberId",
  "wabaId",
  "telefone",
  "phone",
  "token",
];

const INSTAGRAM_OPERATIONAL_STATUS = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  WAITING_META_AUTH: "WAITING_META_AUTH",
  CONFIGURED_INACTIVE: "CONFIGURED_INACTIVE",
  CONNECTED: "CONNECTED",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
  UNAVAILABLE: "UNAVAILABLE",
});

function createInstagramInboundLifecycleService({
  prisma,
  env = process.env,
  logger = console,
  clock = () => new Date(),
} = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para lifecycle Instagram.");

  async function getStatus({ tenantId }) {
    validateTenantId(tenantId);
    try {
      const context = await loadContext(prisma, tenantId, env);
      if (!context.tenant) {
        throw lifecycleError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
      }
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
      throw lifecycleError(422, "INSTAGRAM_LIFECYCLE_INVALID", "Acao de lifecycle invalida.");
    }
    const input = validateLifecyclePayload(body);
    const globalConfig = action === "PAUSE" ? null : requireGlobalConfiguration(env);

    const result = await prisma.$transaction(async (tx) => {
      const context = await loadContext(tx, tenantId, env);
      if (!context.tenant) {
        throw lifecycleError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
      }
      const channel = action === "PAUSE"
        ? requirePausableChannel(context)
        : requireCanonicalChannel(context, globalConfig);
      if (globalConfig) await assertIdentityAvailable(tx, channel);
      assertPersistedStateIsCoherent(context, action);

      const target = targetForAction(action);
      const previousState = deriveState(context);
      if (matchesTarget(context, target)) {
        return {
          changed: false,
          context,
          previousState,
          state: previousState,
          changedFields: [],
          channel,
        };
      }

      const changedFields = channelChangedFields(channel, target);
      const updated = await tx.canalIntegracao.updateMany({
        where: {
          id: channel.id,
          empresaId: tenantId,
          chaveInterna: REAL_INSTAGRAM_INBOUND_KEY,
          tipo: INSTAGRAM_CHANNEL_TYPE,
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

      const auditReason = sanitizeAuditReason(input.reason, [
        channel.instagramBusinessAccountId,
      ]);
      const capabilities = new Map(context.featureRows.map((row) => [row.chave, row]));
      const now = clock();
      for (const change of target.capabilityChanges) {
        const capabilityChanged = await setCapabilityInTransaction(tx, {
          tenantId,
          actorUserId,
          featureKey: change.featureKey,
          enabled: change.enabled,
          current: capabilities.get(change.featureKey) || null,
          reason: auditReason,
          now,
        });
        if (capabilityChanged) changedFields.push(`capability:${change.featureKey}`);
      }

      const nextContext = await loadContext(tx, tenantId, env);
      const nextState = deriveState(nextContext);
      assertExpectedState(action, nextState, nextContext.channel);
      return {
        changed: true,
        context: nextContext,
        previousState,
        state: nextState,
        changedFields,
        channel: nextContext.channel,
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
      where: { empresaId: tenantId, tipo: INSTAGRAM_CHANNEL_TYPE, modoTeste: false },
      orderBy: { id: "asc" },
    }),
    client.empresaFuncionalidade.findMany({
      where: {
        empresaId: tenantId,
        chave: { in: Object.values(INSTAGRAM_CAPABILITY_KEYS) },
      },
    }),
  ]);
  const canonicalChannels = realChannels.filter(
    (channel) => channel.chaveInterna === REAL_INSTAGRAM_INBOUND_KEY,
  );
  const channel = canonicalChannels.length === 1 ? canonicalChannels[0] : null;
  const features = new Map(featureRows.map((row) => [row.chave, row.habilitada === true]));
  return {
    tenant,
    realChannels,
    channel,
    featureRows,
    capabilities: {
      integration: features.get(INSTAGRAM_CAPABILITY_KEYS.INTEGRATION) === true,
      inbound: features.get(INSTAGRAM_CAPABILITY_KEYS.INBOUND) === true,
    },
    global,
  };
}

function deriveState(context) {
  const { channel, realChannels, global, capabilities } = context;
  if (!channel) {
    return realChannels.length > 0
      ? INSTAGRAM_OPERATIONAL_STATUS.ERROR
      : INSTAGRAM_OPERATIONAL_STATUS.NOT_CONFIGURED;
  }
  if (!hasEssentialIdentity(channel)) return INSTAGRAM_OPERATIONAL_STATUS.NOT_CONFIGURED;
  if (
    realChannels.length !== 1
    || !global.valid
    || channel.metaAppId !== global.metaAppId
    || channel.providerEnvironment !== global.providerEnvironment
    || hasCurrentFailure(channel)
    || capabilities.inbound && !capabilities.integration
  ) {
    return INSTAGRAM_OPERATIONAL_STATUS.ERROR;
  }
  if (channel.ativo === false && channel.status === "INATIVO") {
    return channel.verifiedAt || channel.connectedAt
      ? INSTAGRAM_OPERATIONAL_STATUS.PAUSED
      : INSTAGRAM_OPERATIONAL_STATUS.CONFIGURED_INACTIVE;
  }
  if (channel.ativo !== true || channel.status !== "ATIVO") {
    return INSTAGRAM_OPERATIONAL_STATUS.ERROR;
  }
  if (!capabilities.integration || !capabilities.inbound) {
    return INSTAGRAM_OPERATIONAL_STATUS.ERROR;
  }
  return channel.verifiedAt
    ? INSTAGRAM_OPERATIONAL_STATUS.CONNECTED
    : INSTAGRAM_OPERATIONAL_STATUS.WAITING_META_AUTH;
}

function presentStatus(context) {
  const channel = context.channel;
  const state = deriveState(context);
  return {
    state,
    configured: hasEssentialIdentity(channel),
    ativo: channel?.ativo === true,
    status: channel?.status || null,
    tipo: channel?.tipo || INSTAGRAM_CHANNEL_TYPE,
    name: channel?.nome || null,
    instagramBusinessAccountIdMasked: maskOpaqueId(channel?.instagramBusinessAccountId),
    instagramUsernameMasked: channel?.instagramUsernameMasked || null,
    verifiedDisplayName: channel?.verifiedDisplayName || null,
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
    checklist: {
      globalConfiguration: context.global.valid,
      channel: Boolean(channel),
      identity: hasEssentialIdentity(channel),
      integrationCapability: context.capabilities.integration,
      inboundCapability: context.capabilities.inbound,
    },
    callback: "/webhooks/instagram",
    nextRequirement: nextRequirement(state),
  };
}

function unavailableStatus() {
  return {
    state: INSTAGRAM_OPERATIONAL_STATUS.UNAVAILABLE,
    configured: false,
    ativo: false,
    status: null,
    tipo: INSTAGRAM_CHANNEL_TYPE,
    name: null,
    instagramBusinessAccountIdMasked: null,
    instagramUsernameMasked: null,
    verifiedDisplayName: null,
    capabilities: { integration: false, inbound: false },
    connectedAt: null,
    verifiedAt: null,
    lastWebhookAt: null,
    lastFailureAt: null,
    lastFailureCode: null,
    updatedAt: null,
    checklist: {
      globalConfiguration: false,
      channel: false,
      identity: false,
      integrationCapability: false,
      inboundCapability: false,
    },
    callback: "/webhooks/instagram",
    nextRequirement: "RETRY_STATUS",
  };
}

function nextRequirement(state) {
  if (state === INSTAGRAM_OPERATIONAL_STATUS.NOT_CONFIGURED) {
    return "PROVISION_INSTAGRAM_INBOUND";
  }
  if (state === INSTAGRAM_OPERATIONAL_STATUS.CONFIGURED_INACTIVE) {
    return "ACTIVATE_INSTAGRAM_INBOUND";
  }
  if (state === INSTAGRAM_OPERATIONAL_STATUS.WAITING_META_AUTH) {
    return "CONFIGURE_META_CALLBACK";
  }
  if (state === INSTAGRAM_OPERATIONAL_STATUS.PAUSED) return "REACTIVATE_INSTAGRAM_INBOUND";
  if (state === INSTAGRAM_OPERATIONAL_STATUS.ERROR) return "RECONCILE_INSTAGRAM_CHANNEL";
  if (state === INSTAGRAM_OPERATIONAL_STATUS.UNAVAILABLE) return "RETRY_STATUS";
  return null;
}

function validateLifecyclePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw lifecycleError(422, "INSTAGRAM_LIFECYCLE_INVALID", "Payload invalido.");
  }
  const unknown = Object.keys(body).filter((key) => !ALLOWED_ACTION_FIELDS.has(key));
  if (unknown.length) {
    throw lifecycleError(
      422,
      "INSTAGRAM_LIFECYCLE_INVALID",
      "Payload contem campos nao permitidos.",
    );
  }
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  const reason = normalizeReason(body.reason);
  if (!reason) {
    throw lifecycleError(422, "INSTAGRAM_REASON_REQUIRED", "reason e obrigatorio.");
  }
  return { expectedUpdatedAt, reason };
}

function normalizeExpectedUpdatedAt(value) {
  if (typeof value !== "string") {
    throw lifecycleError(
      422,
      "INSTAGRAM_EXPECTED_UPDATED_AT_REQUIRED",
      "expectedUpdatedAt e obrigatorio.",
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw lifecycleError(422, "INSTAGRAM_LIFECYCLE_INVALID", "expectedUpdatedAt invalido.");
  }
  return parsed;
}

function normalizeReason(value) {
  if (typeof value !== "string" || value.length > MAX_REASON_LENGTH) {
    throw lifecycleError(422, "INSTAGRAM_LIFECYCLE_INVALID", "reason invalido.");
  }
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function targetForAction(action) {
  if (action === "PAUSE") {
    return {
      ativo: false,
      status: "INATIVO",
      capabilityChanges: [
        { featureKey: INSTAGRAM_CAPABILITY_KEYS.INBOUND, enabled: false },
      ],
    };
  }
  return {
    ativo: true,
    status: "ATIVO",
    capabilityChanges: [
      { featureKey: INSTAGRAM_CAPABILITY_KEYS.INTEGRATION, enabled: true },
      { featureKey: INSTAGRAM_CAPABILITY_KEYS.INBOUND, enabled: true },
    ],
  };
}

function matchesTarget(context, target) {
  if (
    context.channel.ativo !== target.ativo
    || context.channel.status !== target.status
  ) return false;
  return target.capabilityChanges.every(({ featureKey, enabled }) => {
    const current = featureKey === INSTAGRAM_CAPABILITY_KEYS.INTEGRATION
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
    const updated = await tx.empresaFuncionalidade.updateMany({
      where: {
        id: current.id,
        empresaId: tenantId,
        chave: featureKey,
        habilitada: previousEnabled,
      },
      data: {
        habilitada: enabled,
        habilitadoEm: enabled ? now : null,
        habilitadoPorUsuarioId: null,
      },
    });
    if (updated.count !== 1) throw channelConflict();
    feature = await tx.empresaFuncionalidade.findFirst({
      where: {
        id: current.id,
        empresaId: tenantId,
        chave: featureKey,
        habilitada: enabled,
      },
    });
    if (!feature) throw channelConflict();
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
    throw lifecycleError(
      404,
      "INSTAGRAM_CHANNEL_NOT_FOUND",
      "Canal Instagram real nao encontrado.",
    );
  }
  if (
    !channel
    || realChannels.length !== 1
    || channel.tipo !== INSTAGRAM_CHANNEL_TYPE
    || channel.modoTeste !== false
    || channel.metaAppId !== globalConfig.metaAppId
    || channel.providerEnvironment !== globalConfig.providerEnvironment
    || !hasEssentialIdentity(channel)
  ) {
    throw legacyConflict();
  }
  return channel;
}

function requirePausableChannel(context) {
  const { channel, realChannels } = context;
  if (!channel && realChannels.length === 0) {
    throw lifecycleError(
      404,
      "INSTAGRAM_CHANNEL_NOT_FOUND",
      "Canal Instagram real nao encontrado.",
    );
  }
  if (
    !channel
    || realChannels.length !== 1
    || channel.tipo !== INSTAGRAM_CHANNEL_TYPE
    || channel.modoTeste !== false
    || !hasEssentialIdentity(channel)
  ) {
    throw legacyConflict();
  }
  return channel;
}

async function assertIdentityAvailable(tx, channel) {
  const conflict = await tx.canalIntegracao.findFirst({
    where: {
      id: { not: channel.id },
      instagramBusinessAccountId: channel.instagramBusinessAccountId,
    },
    select: { id: true },
  });
  if (conflict) {
    throw lifecycleError(
      409,
      "INSTAGRAM_IDENTITY_CONFLICT",
      "Identidade Instagram ja vinculada ou inconsistente.",
    );
  }
}

function assertPersistedStateIsCoherent(context, action) {
  const { channel, capabilities } = context;
  const active = channel.ativo === true && channel.status === "ATIVO";
  const inactive = channel.ativo === false && channel.status === "INATIVO";
  const capabilitiesCoherent = !capabilities.inbound || capabilities.integration;
  const lifecycleCoherent = active
    ? capabilities.integration && capabilities.inbound
    : inactive && !capabilities.inbound;
  if (!capabilitiesCoherent || !lifecycleCoherent) {
    throw lifecycleError(
      409,
      "INSTAGRAM_CHANNEL_STATE_INVALID",
      "Estado persistido do canal impede a operacao segura.",
    );
  }
  if (action !== "PAUSE" && hasCurrentFailure(channel)) {
    throw lifecycleError(
      409,
      "INSTAGRAM_CHANNEL_STATE_INVALID",
      "Falha operacional atual impede a operacao segura.",
    );
  }
}

function assertExpectedState(action, state, channel) {
  const expected = action === "PAUSE"
    ? new Set([
      INSTAGRAM_OPERATIONAL_STATUS.CONFIGURED_INACTIVE,
      INSTAGRAM_OPERATIONAL_STATUS.PAUSED,
      INSTAGRAM_OPERATIONAL_STATUS.ERROR,
    ])
    : new Set([
      INSTAGRAM_OPERATIONAL_STATUS.WAITING_META_AUTH,
      INSTAGRAM_OPERATIONAL_STATUS.CONNECTED,
    ]);
  if (!expected.has(state) || !channel) {
    throw lifecycleError(
      409,
      "INSTAGRAM_CHANNEL_STATE_INVALID",
      "Transicao nao produziu o estado esperado.",
    );
  }
}

function requireGlobalConfiguration(env) {
  try {
    return readInboundRuntimeConfiguration(env);
  } catch {
    throw lifecycleError(
      503,
      "INSTAGRAM_GLOBAL_CONFIGURATION_INVALID",
      "Configuracao global do Instagram indisponivel.",
    );
  }
}

function inspectGlobalConfiguration(env) {
  try {
    const configuration = readInboundRuntimeConfiguration(env);
    return { ...configuration, valid: true };
  } catch {
    return { metaAppId: null, providerEnvironment: null, valid: false };
  }
}

function readInboundRuntimeConfiguration(env) {
  const configuration = readGlobalInstagramConfiguration(env);
  if (
    env.INSTAGRAM_INTEGRATION_ENABLED !== "true"
    || env.INSTAGRAM_INBOUND_ENABLED !== "true"
    || (env.NODE_ENV === "test" ? env.META_INBOUND_WORKER_ENABLED === "false" : env.META_INBOUND_WORKER_ENABLED !== "true")
    || !hasConfiguredSecret(env.INSTAGRAM_APP_SECRET)
    || !hasConfiguredSecret(env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)
  ) {
    throw new Error("Instagram inbound indisponivel.");
  }
  return configuration;
}

function hasConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length >= 8;
}

function hasEssentialIdentity(channel) {
  return Boolean(
    channel
      && typeof channel.instagramBusinessAccountId === "string"
      && channel.instagramBusinessAccountId.length > 0,
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
    : value ? "INSTAGRAM_OPERATIONAL_ERROR" : null;
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
      event: "instagram_inbound_lifecycle",
      timestamp: clock().toISOString(),
      service: "platform-instagram-lifecycle",
      correlationId: normalizeCorrelationId(correlationId),
      actorRef: stableHash(`actor:${actorUserId}`),
      tenantId,
      channelRef: channel?.publicId ? stableHash(`channel:${channel.publicId}`) : null,
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

function maskOpaqueId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
}

function legacyConflict() {
  return lifecycleError(
    409,
    "INSTAGRAM_LEGACY_CHANNEL_CONFLICT",
    "Existe configuracao Instagram real divergente que exige reconciliacao manual.",
  );
}

function channelConflict() {
  return lifecycleError(
    409,
    "INSTAGRAM_CHANNEL_CONFLICT",
    "Canal alterado por outra operacao.",
  );
}

function lifecycleError(status, code, message) {
  const error = new Error(message);
  error.name = "InstagramInboundLifecycleError";
  error.status = status;
  error.code = code;
  return error;
}

function isLifecycleError(error) {
  return error?.name === "InstagramInboundLifecycleError";
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
  INSTAGRAM_OPERATIONAL_STATUS,
  createInstagramInboundLifecycleService,
  deriveState,
  inspectGlobalConfiguration,
};
