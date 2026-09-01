const {
  EMAIL_CAPABILITY_KEYS,
  EMAIL_CHANNEL_TYPE,
  REAL_EMAIL_INBOUND_KEY,
  emailError,
  maskEmailAddress,
  normalizeCorrelationId,
  normalizeExpectedUpdatedAt,
  normalizeProviderType,
  sanitizeReason,
  stableHash,
} = require("./emailFoundation");
const { readGlobalEmailConfiguration } = require("../platform/emailInboundProvisioning");

const ALLOWED_FIELDS = new Set(["expectedUpdatedAt", "reason"]);

function createEmailInboundLifecycleService({ prisma, env = process.env, logger = console, clock = () => new Date() } = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para lifecycle de E-mail.");

  async function getStatus({ tenantId }) {
    try {
      await requireTenant(tenantId);
      return presentStatus(await loadContext(prisma, tenantId, env));
    } catch (error) {
      if (error?.code === "PLATFORM_TENANT_NOT_FOUND") throw error;
      return unavailableStatus();
    }
  }

  async function runAction(action, { tenantId, actorUserId, body, correlationId }) {
    if (!Number.isInteger(actorUserId) || actorUserId < 1) throw emailError(403, "EMAIL_PLATFORM_OPERATOR_REQUIRED", "Operador de plataforma obrigatorio.");
    const input = validatePayload(body);
    await requireTenant(tenantId);
    let context = await loadContext(prisma, tenantId, env);
    requireCanonicalChannel(context);
    if (action !== "PAUSE") requireRuntimeReady(context, env);
    const target = targetForAction(action, context.capabilities.integration);
    if (matchesTarget(context, target)) return { changed: false, ...presentStatus(context) };

    const reason = sanitizeReason(input.reason, [context.primaryAddress, ...(context.aliases || [])]);
    const now = clock();
    const channelChanged = context.channel.ativo !== target.ativo || context.channel.status !== target.status;
    await prisma.$transaction(async (tx) => {
      if (channelChanged) {
        const updated = await tx.canalIntegracao.updateMany({
          where: {
            id: context.channel.id,
            empresaId: tenantId,
            tipo: EMAIL_CHANNEL_TYPE,
            chaveInterna: REAL_EMAIL_INBOUND_KEY,
            modoTeste: false,
            updatedAt: input.expectedUpdatedAt,
          },
          data: { ativo: target.ativo, status: target.status },
        });
        if (updated.count !== 1) throw channelConflict();
      } else if (context.channel.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw channelConflict();
      }

      for (const change of target.capabilityChanges) {
        await setCapability(tx, { tenantId, actorUserId, reason, now, ...change });
      }
    });

    context = await loadContext(prisma, tenantId, env);
    emitAudit(logger, { action, actorUserId, tenantId, channel: context.channel, reason, correlationId, clock });
    return { changed: true, ...presentStatus(context) };
  }

  async function requireTenant(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId < 1) throw emailError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
    const tenant = await prisma.empresa.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw emailError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
  }

  return {
    getStatus,
    activate: (input) => runAction("ACTIVATE", input),
    pause: (input) => runAction("PAUSE", input),
    reactivate: (input) => runAction("REACTIVATE", input),
  };
}

async function loadContext(prisma, tenantId, env) {
  const channels = await prisma.canalIntegracao.findMany({
    where: { empresaId: tenantId, tipo: EMAIL_CHANNEL_TYPE, modoTeste: false },
    include: { enderecosEmail: { orderBy: [{ kind: "asc" }, { addressNormalized: "asc" }] } },
    orderBy: { id: "asc" },
  });
  const capabilityRows = await prisma.empresaFuncionalidade.findMany({ where: { empresaId: tenantId, chave: { in: Object.values(EMAIL_CAPABILITY_KEYS) } } });
  const map = new Map(capabilityRows.map((row) => [row.chave, row]));
  const channel = channels.find((item) => item.chaveInterna === REAL_EMAIL_INBOUND_KEY) || null;
  const primaries = channel?.enderecosEmail.filter((item) => item.kind === "PRIMARY") || [];
  const context = {
    channels,
    channel,
    primaryAddress: primaries[0]?.addressNormalized || null,
    primaryCount: primaries.length,
    aliases: channel?.enderecosEmail.filter((item) => item.kind === "ALIAS").map((item) => item.addressNormalized) || [],
    capabilities: {
      integration: map.get(EMAIL_CAPABILITY_KEYS.INTEGRATION)?.habilitada === true,
      inbound: map.get(EMAIL_CAPABILITY_KEYS.INBOUND)?.habilitada === true,
    },
    // The provider-neutral foundation deliberately has no credential store or
    // authorization handshake.  A verified inbound event is useful history,
    // but it is not proof that a current provider authorization exists.
    providerAuthorization: false,
    capabilityRows: map,
    runtime: inspectRuntime(env),
  };
  context.state = deriveState(context);
  return context;
}

function deriveState(context) {
  if (!context.channel) return context.channels.length ? "ERROR" : "NOT_CONFIGURED";
  const coherent = context.channels.length === 1
    && context.channel.chaveInterna === REAL_EMAIL_INBOUND_KEY
    && context.primaryCount === 1
    && Boolean(context.channel.emailProviderType);
  if (!coherent || hasCurrentFailure(context.channel)) return "ERROR";
  if (!context.channel.ativo || context.channel.status !== "ATIVO") {
    return context.channel.verifiedAt || context.channel.connectedAt ? "PAUSED" : "CONFIGURED_INACTIVE";
  }
  if (!context.capabilities.integration || !context.capabilities.inbound || !context.runtime.ready) return "ERROR";
  return context.providerAuthorization === true && context.channel.verifiedAt
    ? "CONNECTED"
    : "WAITING_PROVIDER_AUTH";
}

function presentStatus(context) {
  return {
    state: context.state,
    configured: Boolean(context.channel && context.primaryAddress),
    ativo: context.channel?.ativo ?? false,
    status: context.channel?.status ?? null,
    tipo: EMAIL_CHANNEL_TYPE,
    name: context.channel?.nome ?? null,
    emailAddressMasked: maskEmailAddress(context.primaryAddress),
    aliasesMasked: context.aliases.map(maskEmailAddress),
    providerType: context.channel?.emailProviderType ?? null,
    capabilities: context.capabilities,
    connectedAt: context.channel?.connectedAt ?? null,
    verifiedAt: context.channel?.verifiedAt ?? null,
    lastWebhookAt: context.channel?.lastWebhookAt ?? null,
    lastFailureAt: context.channel?.lastFailureAt ?? null,
    lastFailureCode: sanitizeFailureCode(context.channel?.lastFailureCode),
    updatedAt: context.channel?.updatedAt ?? null,
    checklist: {
      globalConfiguration: context.runtime.globalConfiguration,
      providerAuthorization: context.providerAuthorization === true,
      channel: Boolean(context.channel),
      identity: Boolean(context.primaryAddress),
      integrationCapability: context.capabilities.integration,
      inboundCapability: context.capabilities.inbound,
    },
    callback: null,
    nextRequirement: nextRequirement(context.state),
  };
}

function unavailableStatus() {
  return {
    state: "UNAVAILABLE", configured: false, ativo: false, status: null, tipo: EMAIL_CHANNEL_TYPE,
    name: null, emailAddressMasked: null, aliasesMasked: [], providerType: null,
    capabilities: { integration: false, inbound: false }, connectedAt: null, verifiedAt: null,
    lastWebhookAt: null, lastFailureAt: null, lastFailureCode: null, updatedAt: null,
    checklist: { globalConfiguration: false, providerAuthorization: false, channel: false, identity: false, integrationCapability: false, inboundCapability: false },
    callback: null, nextRequirement: "RETRY_STATUS",
  };
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) throw emailError(422, "EMAIL_LIFECYCLE_INVALID", "Payload invalido.");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) throw emailError(422, "EMAIL_EXPECTED_UPDATED_AT_REQUIRED", "expectedUpdatedAt e obrigatorio.");
  if (!body.reason) throw emailError(422, "EMAIL_REASON_REQUIRED", "reason e obrigatorio.");
  return { expectedUpdatedAt, reason: body.reason };
}

function inspectRuntime(env) {
  let globalConfiguration = false;
  let providerType = null;
  try {
    readGlobalEmailConfiguration(env);
    providerType = normalizeProviderType(env.EMAIL_PROVIDER_TYPE);
    globalConfiguration = true;
  } catch {}
  return {
    globalConfiguration,
    providerType,
    ready: globalConfiguration && env.EMAIL_INTEGRATION_ENABLED === "true" && env.EMAIL_INBOUND_ENABLED === "true",
  };
}

function requireCanonicalChannel(context) {
  if (!context.channel) throw emailError(404, "EMAIL_CHANNEL_NOT_FOUND", "Canal de E-mail nao configurado.");
  if (context.channels.length !== 1 || context.primaryCount !== 1 || context.channel.chaveInterna !== REAL_EMAIL_INBOUND_KEY || !context.channel.emailProviderType) {
    throw emailError(409, "EMAIL_LEGACY_CONFLICT", "Configuracao de E-mail exige reconciliacao.");
  }
}

function requireRuntimeReady(context, env) {
  if (!context.runtime.ready || context.runtime.providerType !== context.channel.emailProviderType) throw emailError(503, "EMAIL_GLOBAL_CONFIGURATION_INVALID", "Configuracao global de E-mail indisponivel.");
  readGlobalEmailConfiguration(env);
}

function targetForAction(action, integrationEnabled) {
  if (action === "PAUSE") return { ativo: false, status: "INATIVO", capabilityChanges: [{ featureKey: EMAIL_CAPABILITY_KEYS.INBOUND, enabled: false }] };
  return { ativo: true, status: "ATIVO", capabilityChanges: [
    { featureKey: EMAIL_CAPABILITY_KEYS.INTEGRATION, enabled: true },
    { featureKey: EMAIL_CAPABILITY_KEYS.INBOUND, enabled: true },
  ], previousIntegration: integrationEnabled };
}

function matchesTarget(context, target) {
  return context.channel.ativo === target.ativo && context.channel.status === target.status && target.capabilityChanges.every(({ featureKey, enabled }) => {
    const current = featureKey === EMAIL_CAPABILITY_KEYS.INTEGRATION ? context.capabilities.integration : context.capabilities.inbound;
    return current === enabled;
  });
}

async function setCapability(tx, { tenantId, actorUserId, featureKey, enabled, reason, now }) {
  const current = await tx.empresaFuncionalidade.findUnique({ where: { empresaId_chave: { empresaId: tenantId, chave: featureKey } } });
  const previous = current?.habilitada === true;
  if (previous === enabled) return;
  let feature;
  if (current) {
    const changed = await tx.empresaFuncionalidade.updateMany({ where: { id: current.id, empresaId: tenantId, chave: featureKey, habilitada: previous }, data: { habilitada: enabled, habilitadoEm: enabled ? now : null, habilitadoPorUsuarioId: null } });
    if (changed.count !== 1) throw channelConflict();
    feature = { ...current, habilitada: enabled };
  } else {
    if (!enabled) return;
    feature = await tx.empresaFuncionalidade.create({ data: { empresaId: tenantId, chave: featureKey, habilitada: true, habilitadoEm: now, habilitadoPorUsuarioId: null } });
  }
  await tx.auditoriaFuncionalidade.create({ data: { empresaId: tenantId, funcionalidadeId: feature.id, chave: featureKey, valorAnterior: current ? previous : null, valorNovo: enabled, operadoPor: "platform-operator", usuarioId: actorUserId, motivo: reason } });
}

function hasCurrentFailure(channel) {
  return Boolean(channel.lastFailureAt && (!channel.lastWebhookAt || channel.lastFailureAt > channel.lastWebhookAt));
}

function sanitizeFailureCode(value) {
  const text = String(value || "").trim();
  return /^[A-Z0-9_]{1,80}$/.test(text) ? text : null;
}

function nextRequirement(state) {
  if (state === "NOT_CONFIGURED") return "PROVISION_EMAIL_INBOUND";
  if (state === "CONFIGURED_INACTIVE") return "ACTIVATE_EMAIL_INBOUND";
  if (state === "WAITING_PROVIDER_AUTH") return "AUTHORIZE_EMAIL_PROVIDER";
  if (state === "PAUSED") return "REACTIVATE_EMAIL_INBOUND";
  if (state === "ERROR") return "RECONCILE_EMAIL_CHANNEL";
  if (state === "UNAVAILABLE") return "RETRY_STATUS";
  return null;
}

function channelConflict() {
  return emailError(409, "EMAIL_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
}

function emitAudit(logger, { action, actorUserId, tenantId, channel, reason, correlationId, clock }) {
  const output = typeof logger?.info === "function" ? logger.info.bind(logger) : typeof logger?.log === "function" ? logger.log.bind(logger) : null;
  if (!output) return;
  try {
    output({ event: "email_inbound_lifecycle", action, actorUserId, tenantId, channelRef: stableHash(channel.publicId || channel.id).slice(0, 16), reason, correlationId: normalizeCorrelationId(correlationId), timestamp: clock().toISOString() });
  } catch {}
}

module.exports = { createEmailInboundLifecycleService };
