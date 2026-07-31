const crypto = require("node:crypto");
const {
  EMAIL_CAPABILITY_KEYS,
  EMAIL_CHANNEL_TYPE,
  REAL_EMAIL_INBOUND_KEY,
  emailError,
  maskEmailAddress,
  normalizeAliases,
  normalizeCorrelationId,
  normalizeEmailAddress,
  normalizeExpectedUpdatedAt,
  normalizeOptionalText,
  normalizeProviderType,
  normalizeRequiredText,
  sanitizeReason,
  stableHash,
} = require("../integrations/emailFoundation");

const ALLOWED_FIELDS = new Set([
  "name", "emailAddress", "aliases", "providerType", "providerAccountIdMasked",
  "displayNameMasked", "reason", "expectedUpdatedAt",
]);
const PROVIDER_ENVIRONMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

function createEmailInboundProvisioningService({ prisma, env = process.env, logger = console, clock = () => new Date(), randomUUID = () => crypto.randomUUID() } = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para provisionamento de E-mail.");

  async function provision({ tenantId, actorUserId, body, correlationId }) {
    const input = validatePayload(body);
    const globalConfig = readGlobalEmailConfiguration(env);
    await requireTenant(prisma, tenantId);
    const context = await loadContext(prisma, tenantId);
    assertNoLegacyConflict(context);

    if (!context.channel) {
      requireCreationFields(input);
      const reason = sanitizeReason(input.reason, [input.emailAddress, ...(input.aliases || [])]);
      assertCapabilitiesInactive(context.capabilities);
      let created;
      try {
        created = await prisma.$transaction(async (tx) => {
          await assertAddressesAvailable(tx, input.emailAddress, input.aliases || []);
          const channel = await tx.canalIntegracao.create({
            data: {
              empresaId: tenantId,
              tipo: EMAIL_CHANNEL_TYPE,
              nome: input.name,
              chaveInterna: REAL_EMAIL_INBOUND_KEY,
              publicId: randomUUID(),
              status: "INATIVO",
              modoTeste: false,
              ativo: false,
              providerEnvironment: globalConfig.providerEnvironment,
              emailProviderType: input.providerType,
              emailProviderAccountIdMasked: input.providerAccountIdMasked ?? null,
              emailDisplayNameMasked: input.displayNameMasked ?? null,
            },
          });
          await createAddresses(tx, tenantId, channel.id, input.emailAddress, input.aliases || []);
          return channel;
        });
      } catch (error) {
        if (error?.code !== "P2002") throw error;
        return resolveCreateRace({ tenantId, input, globalConfig, originalError: error });
      }
      emitAudit(logger, { action: "CREATED", actorUserId, tenantId, channel: created, changedFields: ["name", "emailAddress", "aliases", "providerType"], reason, correlationId, clock });
      return present(await loadContext(prisma, tenantId), true, true);
    }

    assertCanonical(context, globalConfig);
    assertCapabilitiesInactive(context.capabilities);
    assertIdentityImmutable(context, input);
    if (input.aliases !== undefined) input.aliases = normalizeAliases(input.aliases, context.primaryAddress);
    const next = metadataFromInput(context, input);
    const changedFields = changedMetadata(context, next);
    if (!changedFields.length) return present(context, false, false);
    if (!input.expectedUpdatedAt) throw emailError(422, "EMAIL_EXPECTED_UPDATED_AT_REQUIRED", "expectedUpdatedAt e obrigatorio para alterar metadata.");
    const reason = sanitizeReason(input.reason, [context.primaryAddress, ...(context.aliases || [])]);

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.canalIntegracao.updateMany({
          where: { id: context.channel.id, empresaId: tenantId, tipo: EMAIL_CHANNEL_TYPE, modoTeste: false, chaveInterna: REAL_EMAIL_INBOUND_KEY, updatedAt: input.expectedUpdatedAt },
          data: {
            nome: next.name,
            emailProviderAccountIdMasked: next.providerAccountIdMasked,
            emailDisplayNameMasked: next.displayNameMasked,
            updatedAt: clock(),
          },
        });
        if (updated.count !== 1) throw emailError(409, "EMAIL_CHANNEL_CONFLICT", "Canal alterado por outra operacao.");
        if (next.aliasesChanged) {
          await assertAddressesAvailable(tx, context.primaryAddress, next.aliases, context.channel.id);
          await tx.emailMailboxAddress.deleteMany({ where: { canalIntegracaoId: context.channel.id, kind: "ALIAS" } });
          await createAliasAddresses(tx, tenantId, context.channel.id, next.aliases);
        }
      });
    } catch (error) {
      if (error?.name === "EmailInboundError") throw error;
      if (error?.code === "P2002") throw emailError(409, "EMAIL_IDENTITY_CONFLICT", "Endereco de E-mail ja vinculado.");
      throw error;
    }
    const persisted = await loadContext(prisma, tenantId);
    emitAudit(logger, { action: "UPDATED", actorUserId, tenantId, channel: persisted.channel, changedFields, reason, correlationId, clock });
    return present(persisted, true, false);
  }

  async function getStatus({ tenantId }) {
    await requireTenant(prisma, tenantId);
    try {
      const context = await loadContext(prisma, tenantId);
      const globalConfiguration = hasGlobalEmailConfiguration(env);
      if (!context.channel) return presentStatus(context, globalConfiguration);
      assertNoLegacyConflict(context);
      assertCanonical(context, readGlobalEmailConfiguration(env));
      return presentStatus(context, globalConfiguration);
    } catch {
      return unavailableStatus();
    }
  }

  async function resolveCreateRace({ tenantId, input, globalConfig, originalError }) {
    const context = await loadContext(prisma, tenantId);
    if (context.channel) {
      assertCanonical(context, globalConfig);
      assertIdentityImmutable(context, input);
      if (changedMetadata(context, metadataFromInput(context, input)).length === 0) return present(context, false, false);
      throw emailError(409, "EMAIL_CHANNEL_CONFLICT", "Canal criado concorrentemente com dados diferentes.");
    }
    const conflict = await prisma.emailMailboxAddress.findFirst({ where: { addressNormalized: { in: [input.emailAddress, ...(input.aliases || [])] } }, select: { id: true } });
    if (conflict) throw emailError(409, "EMAIL_IDENTITY_CONFLICT", "Endereco de E-mail ja vinculado.");
    throw originalError;
  }

  return { getStatus, provision };
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw emailError(422, "EMAIL_PROVISIONING_INVALID", "Payload invalido.");
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) throw emailError(422, "EMAIL_PROVISIONING_INVALID", "Payload contem campos nao permitidos.");
  const input = {};
  if (Object.hasOwn(body, "name")) input.name = normalizeRequiredText(body.name, "name", 120);
  if (Object.hasOwn(body, "emailAddress")) input.emailAddress = normalizeEmailAddress(body.emailAddress);
  if (Object.hasOwn(body, "providerType")) input.providerType = normalizeProviderType(body.providerType);
  if (Object.hasOwn(body, "aliases")) input.aliases = normalizeAliases(body.aliases, input.emailAddress);
  if (Object.hasOwn(body, "providerAccountIdMasked")) input.providerAccountIdMasked = normalizeMaskedAccountId(body.providerAccountIdMasked);
  if (Object.hasOwn(body, "displayNameMasked")) input.displayNameMasked = normalizeOptionalText(body.displayNameMasked, "displayNameMasked", 160);
  if (Object.hasOwn(body, "reason")) input.reason = normalizeRequiredText(body.reason, "reason", 500);
  if (Object.hasOwn(body, "expectedUpdatedAt")) input.expectedUpdatedAt = normalizeExpectedUpdatedAt(body.expectedUpdatedAt);
  return input;
}

function normalizeMaskedAccountId(value) {
  const text = normalizeOptionalText(value, "providerAccountIdMasked", 160);
  if (text && !text.includes("*")) throw emailError(422, "EMAIL_MASKED_METADATA_INVALID", "providerAccountIdMasked deve permanecer mascarado.");
  return text;
}

function requireCreationFields(input) {
  if (!input.name || !input.emailAddress || !input.providerType || !input.reason) throw emailError(422, "EMAIL_PROVISIONING_INVALID", "name, emailAddress, providerType e reason sao obrigatorios na criacao.");
  if (input.aliases === undefined) input.aliases = [];
}

function readGlobalEmailConfiguration(env = process.env) {
  const providerEnvironment = String(env.EMAIL_PROVIDER_ENVIRONMENT || "").trim();
  if (!PROVIDER_ENVIRONMENT_PATTERN.test(providerEnvironment)) throw emailError(503, "EMAIL_GLOBAL_CONFIGURATION_INVALID", "Configuracao global de E-mail indisponivel.");
  return { providerEnvironment };
}

function hasGlobalEmailConfiguration(env) {
  try { readGlobalEmailConfiguration(env); return true; } catch { return false; }
}

async function requireTenant(prisma, tenantId) {
  if (!Number.isInteger(tenantId) || tenantId < 1) throw emailError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
  const tenant = await prisma.empresa.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw emailError(404, "PLATFORM_TENANT_NOT_FOUND", "Tenant nao encontrado.");
}

async function loadContext(prisma, tenantId) {
  const channels = await prisma.canalIntegracao.findMany({
    where: { empresaId: tenantId, tipo: EMAIL_CHANNEL_TYPE, modoTeste: false },
    include: { enderecosEmail: { orderBy: [{ kind: "asc" }, { addressNormalized: "asc" }] } },
    orderBy: { id: "asc" },
  });
  const rows = await prisma.empresaFuncionalidade.findMany({ where: { empresaId: tenantId, chave: { in: Object.values(EMAIL_CAPABILITY_KEYS) } }, select: { chave: true, habilitada: true } });
  const enabled = new Map(rows.map((row) => [row.chave, row.habilitada === true]));
  const channel = channels.find((item) => item.chaveInterna === REAL_EMAIL_INBOUND_KEY) || null;
  const primary = channel?.enderecosEmail.filter((item) => item.kind === "PRIMARY") || [];
  return {
    channels,
    channel,
    primaryAddress: primary[0]?.addressNormalized || null,
    aliases: channel?.enderecosEmail.filter((item) => item.kind === "ALIAS").map((item) => item.addressNormalized).sort() || [],
    primaryCount: primary.length,
    capabilities: { integration: enabled.get(EMAIL_CAPABILITY_KEYS.INTEGRATION) === true, inbound: enabled.get(EMAIL_CAPABILITY_KEYS.INBOUND) === true },
  };
}

function assertNoLegacyConflict(context) {
  if (context.channels.length > 1 || (context.channels[0] && context.channels[0].chaveInterna !== REAL_EMAIL_INBOUND_KEY)) throw emailError(409, "EMAIL_LEGACY_CONFLICT", "Configuracao legada de E-mail exige reconciliacao.");
}

function assertCanonical(context, globalConfig) {
  const channel = context.channel;
  if (!channel || channel.tipo !== EMAIL_CHANNEL_TYPE || channel.modoTeste !== false || channel.providerEnvironment !== globalConfig.providerEnvironment || !channel.emailProviderType || context.primaryCount !== 1) {
    throw emailError(409, "EMAIL_LEGACY_CONFLICT", "Configuracao legada de E-mail exige reconciliacao.");
  }
}

function assertCapabilitiesInactive(capabilities) {
  if (capabilities.integration || capabilities.inbound) throw emailError(409, "EMAIL_CHANNEL_STATE_CONFLICT", "Canal de E-mail precisa estar inativo para provisionamento.");
}

function assertIdentityImmutable(context, input) {
  if (input.emailAddress && input.emailAddress !== context.primaryAddress) throw emailError(409, "EMAIL_IDENTITY_IMMUTABLE", "A identidade da caixa de E-mail nao pode ser alterada.");
  if (input.providerType && input.providerType !== context.channel.emailProviderType) throw emailError(409, "EMAIL_PROVIDER_IMMUTABLE", "O providerType da caixa nao pode ser alterado.");
}

function metadataFromInput(context, input) {
  const aliases = input.aliases === undefined ? context.aliases : input.aliases;
  return {
    name: input.name ?? context.channel.nome,
    providerAccountIdMasked: Object.hasOwn(input, "providerAccountIdMasked") ? input.providerAccountIdMasked : context.channel.emailProviderAccountIdMasked,
    displayNameMasked: Object.hasOwn(input, "displayNameMasked") ? input.displayNameMasked : context.channel.emailDisplayNameMasked,
    aliases,
    aliasesChanged: JSON.stringify(aliases) !== JSON.stringify(context.aliases),
  };
}

function changedMetadata(context, next) {
  const changed = [];
  if (next.name !== context.channel.nome) changed.push("name");
  if (next.providerAccountIdMasked !== context.channel.emailProviderAccountIdMasked) changed.push("providerAccountIdMasked");
  if (next.displayNameMasked !== context.channel.emailDisplayNameMasked) changed.push("displayNameMasked");
  if (next.aliasesChanged) changed.push("aliases");
  return changed;
}

async function assertAddressesAvailable(tx, primary, aliases, channelId) {
  const conflict = await tx.emailMailboxAddress.findFirst({ where: { addressNormalized: { in: [primary, ...aliases] }, ...(channelId ? { canalIntegracaoId: { not: channelId } } : {}) }, select: { id: true } });
  if (conflict) throw emailError(409, "EMAIL_IDENTITY_CONFLICT", "Endereco de E-mail ja vinculado.");
}

async function createAddresses(tx, tenantId, channelId, primary, aliases) {
  await tx.emailMailboxAddress.create({ data: { empresaId: tenantId, canalIntegracaoId: channelId, addressNormalized: primary, kind: "PRIMARY", primarySlot: `email-primary:${channelId}` } });
  await createAliasAddresses(tx, tenantId, channelId, aliases);
}

async function createAliasAddresses(tx, tenantId, channelId, aliases) {
  for (const alias of aliases) await tx.emailMailboxAddress.create({ data: { empresaId: tenantId, canalIntegracaoId: channelId, addressNormalized: alias, kind: "ALIAS", primarySlot: null } });
}

function present(context, changed, created) {
  return { created, body: { ...presentStatus(context, true), changed } };
}

function presentStatus(context, globalConfiguration, forceError = false) {
  const configured = Boolean(context.channel && context.primaryAddress);
  const coherentInactive = configured && context.channel.ativo === false && context.channel.status === "INATIVO" && !context.capabilities.integration && !context.capabilities.inbound;
  const state = forceError ? "ERROR" : !configured ? "NOT_CONFIGURED" : coherentInactive ? "CONFIGURED_INACTIVE" : "ERROR";
  return {
    state,
    configured,
    ativo: context.channel?.ativo ?? false,
    status: context.channel?.status ?? null,
    tipo: EMAIL_CHANNEL_TYPE,
    name: context.channel?.nome ?? null,
    emailAddressMasked: maskEmailAddress(context.primaryAddress),
    aliasesMasked: context.aliases.map(maskEmailAddress),
    providerType: context.channel?.emailProviderType ?? null,
    providerAccountIdMasked: context.channel?.emailProviderAccountIdMasked ?? null,
    displayNameMasked: context.channel?.emailDisplayNameMasked ?? null,
    capabilities: context.capabilities,
    connectedAt: context.channel?.connectedAt ?? null,
    verifiedAt: context.channel?.verifiedAt ?? null,
    lastWebhookAt: context.channel?.lastWebhookAt ?? null,
    updatedAt: context.channel?.updatedAt ?? null,
    checklist: { globalConfiguration: globalConfiguration === true, channel: Boolean(context.channel), identity: Boolean(context.primaryAddress), integrationCapability: context.capabilities.integration, inboundCapability: context.capabilities.inbound, providerAuthorization: false },
    callback: null,
    nextRequirement: state === "NOT_CONFIGURED" ? "PROVISION_EMAIL_INBOUND" : state === "CONFIGURED_INACTIVE" ? "AUTHORIZE_EMAIL_PROVIDER" : "RECONCILE_EMAIL_CHANNEL",
  };
}

function unavailableStatus() {
  return {
    state: "UNAVAILABLE",
    configured: false,
    ativo: false,
    status: null,
    tipo: EMAIL_CHANNEL_TYPE,
    name: null,
    emailAddressMasked: null,
    aliasesMasked: [],
    providerType: null,
    providerAccountIdMasked: null,
    displayNameMasked: null,
    capabilities: { integration: false, inbound: false },
    connectedAt: null,
    verifiedAt: null,
    lastWebhookAt: null,
    updatedAt: null,
    checklist: {
      globalConfiguration: false,
      channel: false,
      identity: false,
      integrationCapability: false,
      inboundCapability: false,
      providerAuthorization: false,
    },
    callback: null,
    nextRequirement: "RETRY_STATUS",
  };
}

function emitAudit(logger, { action, actorUserId, tenantId, channel, changedFields, reason, correlationId, clock }) {
  const output = typeof logger?.info === "function" ? logger.info.bind(logger) : typeof logger?.log === "function" ? logger.log.bind(logger) : null;
  if (!output) return;
  try {
    output({ event: "email_inbound_channel_provisioning", action, actorUserId, tenantId, channelRef: stableHash(channel.publicId || channel.id).slice(0, 16), changedFields, reason, correlationId: normalizeCorrelationId(correlationId), timestamp: clock().toISOString() });
  } catch {}
}

module.exports = { createEmailInboundProvisioningService, hasGlobalEmailConfiguration, readGlobalEmailConfiguration };
