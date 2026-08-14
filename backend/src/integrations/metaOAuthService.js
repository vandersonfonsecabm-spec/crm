const {
  META_OAUTH_PROVIDER,
  META_INSTAGRAM_FLOW,
  createMetaOAuthState,
  consumeMetaOAuthState,
  peekMetaOAuthState,
} = require("./metaOAuthState");
const { createMetaInstagramClient } = require("./metaInstagramClient");
const { createMetaCredentialStore } = require("./metaCredentialStore");
const { readGlobalInstagramConfiguration } = require("../platform/instagramInboundProvisioning");
const { SYSTEM_ACTOR_EMAIL } = require("../system-actor");

function createMetaOAuthService({ prisma, client = createMetaInstagramClient({}), credentialStore = createMetaCredentialStore({ prisma }), now = () => new Date(), env = process.env } = {}) {
  if (!prisma) throw new Error("Prisma e obrigatorio para o MetaOAuthService.");

  async function iniciarOAuth({ auth, canalIntegracaoId }) {
    const context = assertAdminAuth(auth);
    const channelId = positiveId(canalIntegracaoId);
    if (!channelId) throw metaError(400, "META_CHANNEL_INVALID", "Canal Instagram invalido.");
    const channel = await prisma.canalIntegracao.findFirst({ where: { id: channelId, empresaId: context.empresaId, tipo: "INSTAGRAM_META", modoTeste: false, ativo: true, status: "ATIVO" }, select: { id: true, empresaId: true, tipo: true } });
    if (!channel) throw metaError(404, "META_CHANNEL_NOT_FOUND", "Canal Instagram nao encontrado.");
    if (!(await assertOAuthGate(prisma, context.empresaId, env))) throw metaError(404, "META_CHANNEL_NOT_FOUND", "Canal Instagram nao encontrado.");
    const rawState = await createMetaOAuthState({ prisma, empresaId: context.empresaId, usuarioId: context.usuarioId, canalIntegracaoId: channel.id, now: now() });
    return {
      authorizationUrl: client.buildAuthorizationUrl({ state: rawState }),
      expiresAt: new Date(now().getTime() + 10 * 60 * 1000).toISOString(),
      provider: META_OAUTH_PROVIDER,
      flow: META_INSTAGRAM_FLOW,
    };
  }

  async function concluirOAuth({ code, state, error: authError, errorDescription }) {
    const rawCode = singleText(code, "code", 4096);
    const rawState = singleText(state, "state", 256);
    if (!rawState) throw metaError(400, "META_INVALID_STATE", "Autorizacao Instagram invalida.");
    const stored = await peekMetaOAuthState({ prisma, rawState });
    if (!stored || stored.provedor !== META_OAUTH_PROVIDER || stored.fluxo !== META_INSTAGRAM_FLOW) throw metaError(400, "META_INVALID_STATE", "Autorizacao Instagram invalida.");
    const consumed = await consumeMetaOAuthState({
      prisma,
      rawState,
      empresaId: stored.empresaId,
      canalIntegracaoId: stored.canalIntegracaoId,
      now: now(),
      validateContext: (tx, state) => assertOAuthContextActive(tx, state, env),
    });
    if (!consumed) throw metaError(400, "META_INVALID_STATE", "Autorizacao Instagram expirada ou ja utilizada.");
    if (authError) throw metaError(400, "META_AUTH_DENIED", safeAuthError(authError, errorDescription));
    if (!rawCode) throw metaError(400, "META_AUTH_CODE_REQUIRED", "Codigo de autorizacao Instagram ausente.");

    const shortToken = await client.exchangeAuthorizationCode({ code: rawCode });
    const longToken = await client.exchangeLongLivedToken({ accessToken: shortToken.accessToken });
    if (!(await assertOAuthContextActive(prisma, stored, env))) {
      throw metaError(400, "META_INVALID_STATE", "Autorizacao Instagram invalida.");
    }
    const instagramUserId = longToken.userId || shortToken.userId;
    if (typeof instagramUserId !== "string" || instagramUserId.length === 0) {
      throw metaError(409, "META_IDENTITY_MISSING", "A identidade Instagram nao foi retornada pela Meta.");
    }
    const expiresAt = longToken.expiresIn ? new Date(now().getTime() + longToken.expiresIn * 1000).toISOString() : undefined;
    const credential = await credentialStore.createLocalCredential({
      empresaId: stored.empresaId,
      canalIntegracaoId: stored.canalIntegracaoId,
      provider: META_OAUTH_PROVIDER,
      validateContext: (tx, state) => assertOAuthCredentialContext(tx, { ...stored, ...state, instagramUserId }, env),
      credentials: {
        accessToken: longToken.accessToken,
        ...(expiresAt ? { expiresAt } : {}),
        ...(longToken.userId ? { userId: longToken.userId } : shortToken.userId ? { userId: shortToken.userId } : {}),
        tokenType: longToken.tokenType || "bearer",
        ...(longToken.scopes ? { scopes: longToken.scopes } : shortToken.scopes ? { scopes: shortToken.scopes } : {}),
      },
    });
    if (!instagramUserId || typeof client.subscribeMessages !== "function" || typeof client.getSubscription !== "function") {
      if (typeof credentialStore.markLocalCredentialError === "function") {
        await credentialStore.markLocalCredentialError({ empresaId: stored.empresaId, canalIntegracaoId: stored.canalIntegracaoId, provider: META_OAUTH_PROVIDER, reference: credential.reference });
      }
      throw metaError(503, "META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi verificada; a credencial local permanece recuperavel.");
    }
    try {
      const subscribed = await client.subscribeMessages({ instagramUserId, accessToken: longToken.accessToken });
      const subscribeSuccess = subscribed?.success === true || subscribed?.result?.success === true;
      if (!subscribeSuccess) throw metaError(503, "META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi confirmada.");
      const currentSubscription = await client.getSubscription({ instagramUserId, accessToken: longToken.accessToken });
      const subscriptionRows = Array.isArray(currentSubscription?.data) ? currentSubscription.data : [];
      if (!subscriptionRows.some((row) => Array.isArray(row?.subscribed_fields) && row.subscribed_fields.includes("messages"))) {
        throw metaError(503, "META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi verificada.");
      }
    } catch {
      if (typeof credentialStore.markLocalCredentialError === "function") {
        await credentialStore.markLocalCredentialError({ empresaId: stored.empresaId, canalIntegracaoId: stored.canalIntegracaoId, provider: META_OAUTH_PROVIDER, reference: credential.reference });
      }
      throw metaError(503, "META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi verificada; a credencial local permanece recuperavel.");
    }
    return { mode: "LOCAL_ONLY", provider: META_OAUTH_PROVIDER, canalIntegracaoId: stored.canalIntegracaoId, credential: { reference: credential.reference, revision: credential.revision }, subscription: "VERIFIED" };
  }

  async function subscribeMessages({ auth, canalIntegracaoId, instagramUserId }) {
    const context = assertAdminAuth(auth);
    const channel = await prisma.canalIntegracao.findFirst({ where: { id: positiveId(canalIntegracaoId), empresaId: context.empresaId, tipo: "INSTAGRAM_META", modoTeste: false, ativo: true, status: "ATIVO" }, select: { id: true } });
    if (!channel) throw metaError(404, "META_CHANNEL_NOT_FOUND", "Canal Instagram nao encontrado.");
    if (!(await assertOAuthGate(prisma, context.empresaId, env))) throw metaError(404, "META_CHANNEL_NOT_FOUND", "Canal Instagram nao encontrado.");
    const current = await credentialStore.resolveCurrentCredential({ empresaId: context.empresaId, canalIntegracaoId: channel.id, provider: META_OAUTH_PROVIDER });
    if (!current?.credentials?.accessToken) throw metaError(409, "META_CREDENTIAL_NOT_FOUND", "Credencial Meta ativa nao encontrada.");
    return client.subscribeMessages({ instagramUserId, accessToken: current.credentials.accessToken });
  }

  return { iniciarOAuth, concluirOAuth, subscribeMessages };
}

function assertAdminAuth(auth) {
  if (!auth || !positiveId(auth.usuarioId) || !positiveId(auth.empresaId) || auth.papel !== "ADMIN") throw metaError(403, "META_OAUTH_FORBIDDEN", "Acesso negado.");
  return { usuarioId: Number(auth.usuarioId), empresaId: Number(auth.empresaId) };
}

async function assertOAuthContextActive(prisma, state, env = process.env) {
  const [actor, channel] = await Promise.all([
    prisma.usuario.findFirst({ where: { id: state.usuarioId, empresaId: state.empresaId, ativo: true, email: { not: SYSTEM_ACTOR_EMAIL }, papel: "ADMIN", empresa: { ativo: true } }, select: { id: true } }),
    prisma.canalIntegracao.findFirst({ where: { id: state.canalIntegracaoId, empresaId: state.empresaId, tipo: "INSTAGRAM_META", modoTeste: false, ativo: true, status: "ATIVO" }, select: { id: true } }),
  ]);
  if (!actor || !channel) return false;
  return assertOAuthGate(prisma, state.empresaId, env);
}

async function assertOAuthCredentialContext(prisma, state, env = process.env) {
  const actor = await prisma.usuario.findFirst({
    where: { id: state.usuarioId, empresaId: state.empresaId, ativo: true, email: { not: SYSTEM_ACTOR_EMAIL }, papel: "ADMIN", empresa: { ativo: true } },
    select: { id: true },
  });
  const channel = await prisma.canalIntegracao.findFirst({
    where: { id: state.canalIntegracaoId, empresaId: state.empresaId },
    select: {
      id: true,
      tipo: true,
      modoTeste: true,
      ativo: true,
      status: true,
      instagramBusinessAccountId: true,
      metaAppId: true,
      providerEnvironment: true,
    },
  });
  if (!actor || !channel) throw metaError(409, "META_CHANNEL_IDENTITY_INCOMPLETE", "O contexto Instagram nao esta ativo.");
  if (channel.tipo !== "INSTAGRAM_META" || channel.modoTeste !== false || channel.ativo !== true || channel.status !== "ATIVO") {
    throw metaError(409, "META_CHANNEL_READINESS_CONFLICT", "O canal Instagram nao esta pronto para autorizacao.");
  }
  if (typeof state.instagramUserId !== "string" || state.instagramUserId.length === 0) {
    throw metaError(409, "META_IDENTITY_MISSING", "A identidade Instagram nao foi retornada pela Meta.");
  }
  if (channel.instagramBusinessAccountId !== state.instagramUserId) {
    throw metaError(409, "META_IDENTITY_CHANNEL_MISMATCH", "A identidade retornada nao pertence ao canal autorizado.");
  }
  let configuration;
  try {
    configuration = readGlobalInstagramConfiguration(env);
  } catch {
    throw metaError(503, "META_CHANNEL_IDENTITY_INCOMPLETE", "A configuracao global do Instagram esta incompleta.");
  }
  if (channel.metaAppId === null || channel.providerEnvironment === null) {
    throw metaError(409, "META_CHANNEL_IDENTITY_INCOMPLETE", "A identidade do canal Instagram esta incompleta.");
  }
  if (channel.metaAppId !== configuration.metaAppId) {
    throw metaError(409, "META_CHANNEL_APP_MISMATCH", "O App ID do canal nao corresponde a configuracao do servidor.");
  }
  if (channel.providerEnvironment !== configuration.providerEnvironment) {
    throw metaError(409, "META_CHANNEL_ENVIRONMENT_MISMATCH", "O ambiente do canal nao corresponde a configuracao do servidor.");
  }
  if (!(await assertOAuthGate(prisma, state.empresaId, env))) {
    throw metaError(409, "META_CHANNEL_READINESS_CONFLICT", "O gate Instagram nao esta ativo.");
  }
  return true;
}

async function assertOAuthGate(prisma, empresaId, env = process.env) {
  if (env.INSTAGRAM_INTEGRATION_ENABLED !== "true" || env.INSTAGRAM_INBOUND_ENABLED !== "true") return false;
  const rows = await prisma.empresaFuncionalidade.findMany({
    where: { empresaId, chave: { in: ["INSTAGRAM_INTEGRATION", "INSTAGRAM_INBOUND"] }, habilitada: true },
    select: { chave: true },
  });
  const enabled = new Set(rows.map((row) => row.chave));
  return enabled.has("INSTAGRAM_INTEGRATION") && enabled.has("INSTAGRAM_INBOUND");
}

function singleText(value, name, max) {
  if (Array.isArray(value) || (value !== undefined && typeof value !== "string")) throw metaError(400, "META_CALLBACK_INVALID", `Parametro ${name} invalido.`);
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).trim();
  if (!text || text.length > max || /[\u0000-\u001F\u007F]/.test(text)) throw metaError(400, "META_CALLBACK_INVALID", `Parametro ${name} invalido.`);
  return text;
}

function safeAuthError(error, description) {
  const normalized = String(description || error || "negada").trim().replace(/[^a-zA-Z0-9 _-]/g, "");
  return normalized.slice(0, 120) || "Autorizacao negada.";
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function metaError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = { createMetaOAuthService };
