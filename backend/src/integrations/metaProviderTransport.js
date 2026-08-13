const GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const { REAL_WHATSAPP_INBOUND_KEY, inspectGlobalConfiguration: inspectWhatsappConfiguration } = require("./whatsappInboundLifecycle");
const { inspectGlobalConfiguration: inspectMessengerConfiguration } = require("./messengerInboundLifecycle");

const PROVIDERS = Object.freeze({
  WHATSAPP: {
    credentialProvider: "META_WHATSAPP",
    channelType: "WHATSAPP_META",
    channelKey: REAL_WHATSAPP_INBOUND_KEY,
    integrationEnv: "WHATSAPP_INTEGRATION_ENABLED",
    inspectConfiguration: inspectWhatsappConfiguration,
    enabledEnv: "WHATSAPP_OUTBOUND_ENABLED",
    identityField: "phoneNumberId",
  },
  MESSENGER: {
    credentialProvider: "META_MESSENGER",
    channelType: "MESSENGER_META",
    channelKey: "messenger-meta-inbound-real",
    integrationEnv: "MESSENGER_INTEGRATION_ENABLED",
    inspectConfiguration: inspectMessengerConfiguration,
    enabledEnv: "MESSENGER_OUTBOUND_ENABLED",
    identityField: "messengerPageId",
  },
});

function createMetaProviderTransport({
  prisma,
  env = process.env,
  fetchImpl = globalThis.fetch,
  credentialResolver,
  authorizationResolver,
  channelResolver,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw transportError(500, "META_TRANSPORT_FETCH_UNAVAILABLE");
  if (typeof credentialResolver !== "function") throw transportError(500, "META_TRANSPORT_CREDENTIAL_RESOLVER_UNAVAILABLE");
  if (typeof authorizationResolver !== "function") throw transportError(500, "META_TRANSPORT_AUTHORIZATION_RESOLVER_UNAVAILABLE");
  if (!channelResolver && prisma) channelResolver = createPrismaMetaChannelResolver({ prisma });
  if (typeof channelResolver !== "function") throw transportError(500, "META_TRANSPORT_CHANNEL_RESOLVER_UNAVAILABLE");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) {
    throw transportError(500, "META_TRANSPORT_TIMEOUT_INVALID");
  }

  async function sendWhatsAppText(input) {
    return sendText({ provider: "WHATSAPP", input });
  }

  async function sendMessengerText(input) {
    return sendText({ provider: "MESSENGER", input });
  }

  async function sendText({ provider, input }) {
    const definition = PROVIDERS[provider];
    const context = await resolveContext(input, definition, channelResolver, env);
    if (env.META_EXTERNAL_NETWORK_ENABLED !== "true") {
      throw transportError(503, "META_EXTERNAL_NETWORK_DISABLED");
    }
    if (env[definition.integrationEnv] !== "true") {
      throw transportError(503, `${provider}_INTEGRATION_DISABLED`);
    }
    if (env[definition.enabledEnv] !== "true") {
      throw transportError(503, `${provider}_OUTBOUND_DISABLED`);
    }
    assertActiveChannel(context.channel, definition);
    const authorized = await authorizationResolver({
      empresaId: context.channel.empresaId,
      canalIntegracaoId: context.channel.id,
      provider,
      channel: context.channel,
      recipient: context.recipient,
    });
    if (authorized !== true) throw transportError(403, "META_PROVIDER_TENANT_CAPABILITY_REQUIRED");

    const resolved = await credentialResolver({
      empresaId: context.channel.empresaId,
      canalIntegracaoId: context.channel.id,
      provider: definition.credentialProvider,
    });
    const accessToken = resolved?.credentials?.accessToken;
    if (!accessToken) throw transportError(409, "META_PROVIDER_CREDENTIAL_REQUIRED");

    const version = String(env.META_GRAPH_API_VERSION || "").trim();
    if (!/^v\d+\.\d+$/.test(version)) throw transportError(503, "META_GRAPH_API_VERSION_NOT_CONFIGURED");
    const identity = context.channel[definition.identityField];
    const url = `${GRAPH_BASE_URL}/${encodeURIComponent(version)}/${encodeURIComponent(identity)}/messages`;
    const payload = provider === "WHATSAPP"
      ? {
          messaging_product: "whatsapp",
          to: context.recipient,
          type: "text",
          text: { body: context.text, preview_url: false },
        }
      : { recipient: { id: context.recipient }, message: { text: context.text }, messaging_type: "RESPONSE" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await readProviderBody(response);
      if (!response.ok) throw transportError(502, "META_PROVIDER_REQUEST_FAILED", { providerStatus: response.status });
      const messageId = providerMessageId(body, provider);
      if (!messageId) throw transportError(502, "META_PROVIDER_RESPONSE_INVALID");
      return { provider, accepted: true, providerMessageId: messageId };
    } catch (error) {
      if (error?.codigo) throw error;
      if (error?.name === "AbortError") throw transportError(504, "META_PROVIDER_TIMEOUT");
      throw transportError(502, "META_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  return { sendMessengerText, sendWhatsAppText };
}

function createPrismaMetaChannelResolver({ prisma }) {
  if (!prisma?.canalIntegracao?.findFirst) throw transportError(500, "META_TRANSPORT_PRISMA_UNAVAILABLE");
  return async ({ empresaId, canalIntegracaoId, provider }) => {
    const definition = Object.values(PROVIDERS).find((item) => item.credentialProvider === provider);
    if (!definition) return null;
    return prisma.canalIntegracao.findFirst({
      where: {
        id: canalIntegracaoId,
        empresaId,
        tipo: definition.channelType,
        chaveInterna: definition.channelKey,
      },
      select: {
        id: true,
        empresaId: true,
        tipo: true,
        modoTeste: true,
        ativo: true,
        status: true,
        chaveInterna: true,
        metaAppId: true,
        providerEnvironment: true,
        phoneNumberId: true,
        messengerPageId: true,
      },
    });
  };
}

async function resolveContext(input, definition, channelResolver, env) {
  if (!input || typeof input !== "object") throw transportError(422, "META_TRANSPORT_CONTEXT_INVALID");
  const empresaId = Number(input.empresaId);
  const canalIntegracaoId = Number(input.canalIntegracaoId);
  if (!Number.isSafeInteger(empresaId) || empresaId < 1 || !Number.isSafeInteger(canalIntegracaoId) || canalIntegracaoId < 1) {
    throw transportError(422, "META_TRANSPORT_CONTEXT_INVALID");
  }
  const channel = await channelResolver({ empresaId, canalIntegracaoId, provider: definition.credentialProvider });
  if (!channel || typeof channel !== "object") throw transportError(409, "META_PROVIDER_CHANNEL_NOT_FOUND");
  if (!Number.isSafeInteger(channel.id) || !Number.isSafeInteger(channel.empresaId)) throw transportError(422, "META_TRANSPORT_CONTEXT_INVALID");
  if (channel.id !== canalIntegracaoId || channel.empresaId !== empresaId) throw transportError(409, "META_PROVIDER_CHANNEL_BINDING_INVALID");
  const identity = channel[definition.identityField];
  if (channel.tipo !== definition.channelType || channel.chaveInterna !== definition.channelKey || channel.modoTeste !== false || typeof identity !== "string" || !identity.trim()) {
    throw transportError(409, "META_PROVIDER_CHANNEL_MISMATCH");
  }
  const configuration = definition.inspectConfiguration?.(env) || { valid: false };
  if (!configuration.valid || channel.metaAppId !== configuration.metaAppId || channel.providerEnvironment !== configuration.providerEnvironment) {
    throw transportError(409, "META_PROVIDER_CHANNEL_CONFIGURATION_MISMATCH");
  }
  const recipient = normalizeText(input.recipient, 256, "META_TRANSPORT_RECIPIENT_INVALID");
  const text = normalizeText(input.text, 4096, "META_TRANSPORT_MESSAGE_INVALID");
  return { channel, recipient, text };
}

function assertActiveChannel(channel, definition) {
  if (channel.modoTeste === true || channel.ativo !== true || channel.status !== "ATIVO") {
    throw transportError(409, `${definition.channelType}_CHANNEL_NOT_ACTIVE`);
  }
}

function normalizeText(value, max, code) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw transportError(422, code);
  return text;
}

async function readProviderBody(response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function providerMessageId(body, provider) {
  const candidate = provider === "WHATSAPP"
    ? body?.messages?.[0]?.id
    : body?.message_id;
  return typeof candidate === "string"
    && candidate.length > 0
    && candidate.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(candidate)
    ? candidate
    : null;
}

function transportError(status, codigo, details) {
  const error = new Error("Transport Meta indisponivel.");
  error.status = status;
  error.codigo = codigo;
  if (details && Number.isInteger(details.providerStatus)) error.providerStatus = details.providerStatus;
  return error;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  GRAPH_BASE_URL,
  PROVIDERS,
  createMetaProviderTransport,
  createPrismaMetaChannelResolver,
};
