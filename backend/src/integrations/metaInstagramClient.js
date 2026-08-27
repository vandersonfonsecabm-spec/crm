const AUTHORIZATION_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE_URL = "https://graph.instagram.com";
const META_INSTAGRAM_SCOPES = Object.freeze([
  "instagram_business_basic",
  "instagram_business_manage_messages",
]);
const META_INSTAGRAM_SUBSCRIBED_FIELDS = Object.freeze(["messages"]);

function createMetaInstagramClient({ transport = disabledTransport, config = process.env } = {}) {
  if (!transport || typeof transport !== "object") throw metaClientError("META_TRANSPORT_INVALID", "Transport Meta invalido.");

  function buildAuthorizationUrl({ clientId, redirectUri, state }) {
    const resolvedClientId = requiredConfig(clientId || config.META_INSTAGRAM_APP_ID || config.INSTAGRAM_META_APP_ID, "META_INSTAGRAM_APP_ID");
    const resolvedRedirectUri = validRedirectUri(redirectUri || config.META_INSTAGRAM_OAUTH_REDIRECT_URI || config.INSTAGRAM_OAUTH_REDIRECT_URI);
    const rawState = requiredText(state, "state", 256);
    const url = new URL(AUTHORIZATION_URL);
    url.searchParams.set("client_id", resolvedClientId);
    url.searchParams.set("redirect_uri", resolvedRedirectUri);
    url.searchParams.set("response_type", "code");
    // Meta's Business Login examples use a comma-separated scope string.
    url.searchParams.set("scope", META_INSTAGRAM_SCOPES.join(","));
    url.searchParams.set("state", rawState);
    return url.toString();
  }

  async function exchangeAuthorizationCode({ code, redirectUri }) {
    const body = formBody({
      client_id: requiredConfig(config.META_INSTAGRAM_APP_ID || config.INSTAGRAM_META_APP_ID, "META_INSTAGRAM_APP_ID"),
      client_secret: requiredConfig(config.META_INSTAGRAM_APP_SECRET || config.INSTAGRAM_APP_SECRET, "META_INSTAGRAM_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: validRedirectUri(redirectUri || config.META_INSTAGRAM_OAUTH_REDIRECT_URI || config.INSTAGRAM_OAUTH_REDIRECT_URI),
      code: requiredText(code, "code", 4096),
    });
    return validateTokenResponse(await transport.post({ url: SHORT_TOKEN_URL, headers: formHeaders(), body }), "short");
  }

  async function exchangeLongLivedToken({ accessToken }) {
    const token = requiredText(accessToken, "accessToken", 4096);
    const url = new URL(`${GRAPH_BASE_URL}/access_token`);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", requiredConfig(config.META_INSTAGRAM_APP_SECRET || config.INSTAGRAM_APP_SECRET, "META_INSTAGRAM_APP_SECRET"));
    url.searchParams.set("access_token", token);
    return validateTokenResponse(await transport.get({ url: url.toString() }), "long");
  }

  async function refreshLongLivedToken({ accessToken }) {
    const url = new URL(`${GRAPH_BASE_URL}/refresh_access_token`);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", requiredText(accessToken, "accessToken", 4096));
    return validateTokenResponse(await transport.get({ url: url.toString() }), "refresh");
  }

  async function subscribeMessages({ instagramUserId, accessToken }) {
    const id = requiredText(instagramUserId, "instagramUserId", 200);
    const token = requiredText(accessToken, "accessToken", 4096);
    const url = `${GRAPH_BASE_URL}/${encodeURIComponent(id)}/subscribed_apps`;
    const result = await transport.post({
      url,
      headers: formHeaders(),
      body: formBody({ subscribed_fields: META_INSTAGRAM_SUBSCRIBED_FIELDS.join(","), access_token: token }),
    });
    if (!result || typeof result !== "object") throw metaClientError("META_RESPONSE_INVALID", "Resposta Meta invalida.");
    if (result.success !== true) throw metaClientError("META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi confirmada.");
    return { subscribedFields: [...META_INSTAGRAM_SUBSCRIBED_FIELDS], result: sanitizeObject(result) };
  }

  async function getSubscription({ instagramUserId, accessToken }) {
    const id = requiredText(instagramUserId, "instagramUserId", 200);
    const url = new URL(`${GRAPH_BASE_URL}/${encodeURIComponent(id)}/subscribed_apps`);
    url.searchParams.set("access_token", requiredText(accessToken, "accessToken", 4096));
    const result = await transport.get({ url: url.toString() });
    if (!result || typeof result !== "object") throw metaClientError("META_RESPONSE_INVALID", "Resposta Meta invalida.");
    if (result.success === false) throw metaClientError("META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi verificada.");
    const rows = Array.isArray(result.data) ? result.data : [];
    const verified = rows.some((row) => {
      const fields = Array.isArray(row?.subscribed_fields) ? row.subscribed_fields : [];
      return fields.includes("messages");
    });
    if (!verified) throw metaClientError("META_SUBSCRIPTION_FAILED", "A assinatura Meta nao foi verificada.");
    return sanitizeObject(result);
  }

  async function removeSubscription({ instagramUserId, accessToken }) {
    const id = requiredText(instagramUserId, "instagramUserId", 200);
    const url = new URL(`${GRAPH_BASE_URL}/${encodeURIComponent(id)}/subscribed_apps`);
    url.searchParams.set("access_token", requiredText(accessToken, "accessToken", 4096));
    const result = await transport.delete({ url: url.toString() });
    if (!result || typeof result !== "object") throw metaClientError("META_RESPONSE_INVALID", "Resposta Meta invalida.");
    return sanitizeObject(result);
  }

  return {
    buildAuthorizationUrl,
    exchangeAuthorizationCode,
    exchangeLongLivedToken,
    refreshLongLivedToken,
    subscribeMessages,
    getSubscription,
    removeSubscription,
    scopes: [...META_INSTAGRAM_SCOPES],
    subscribedFields: [...META_INSTAGRAM_SUBSCRIBED_FIELDS],
  };
}

const disabledTransport = Object.freeze({
  async get() { throw metaClientError("META_EXTERNAL_NETWORK_DISABLED", "Transporte Meta externo desativado nesta fase."); },
  async post() { throw metaClientError("META_EXTERNAL_NETWORK_DISABLED", "Transporte Meta externo desativado nesta fase."); },
  async delete() { throw metaClientError("META_EXTERNAL_NETWORK_DISABLED", "Transporte Meta externo desativado nesta fase."); },
});

function validateTokenResponse(value, stage) {
  if (!value || typeof value !== "object") throw metaClientError("META_RESPONSE_INVALID", `Resposta Meta invalida (${stage}).`);
  const accessToken = typeof value.access_token === "string" ? value.access_token.trim() : "";
  if (!accessToken || accessToken.length > 4096) throw metaClientError("META_TOKEN_RESPONSE_INVALID", `Resposta Meta sem token valido (${stage}).`);
  const expiresIn = value.expires_in === undefined ? null : Number(value.expires_in);
  if (expiresIn !== null && (!Number.isFinite(expiresIn) || expiresIn <= 0)) throw metaClientError("META_TOKEN_RESPONSE_INVALID", `Expiracao Meta invalida (${stage}).`);
  return {
    accessToken,
    expiresIn,
    tokenType: typeof value.token_type === "string" ? value.token_type : "bearer",
    userId: typeof value.user_id === "string" || typeof value.user_id === "number" ? String(value.user_id) : null,
    scopes: Array.isArray(value.permissions) ? value.permissions.filter((item) => typeof item === "string") : undefined,
  };
}

function formBody(values) {
  return new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)])).toString();
}

function formHeaders() {
  return { "content-type": "application/x-www-form-urlencoded" };
}

function validRedirectUri(value) {
  const uri = requiredText(value, "redirectUri", 2048);
  let parsed;
  try { parsed = new URL(uri); } catch { throw metaClientError("META_REDIRECT_URI_INVALID", "redirect_uri invalido."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.hash) throw metaClientError("META_REDIRECT_URI_INVALID", "redirect_uri invalido.");
  return parsed.toString();
}

function requiredConfig(value, name) {
  return requiredText(value, name, 4096);
}

function requiredText(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001F\u007F]/.test(value)) {
    throw metaClientError("META_CONFIG_INVALID", `${name} ausente ou invalido.`);
  }
  return value.trim();
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|authorization|code|state/i.test(key)) continue;
    result[key] = sanitizeObject(item);
  }
  return result;
}

function metaClientError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = code === "META_EXTERNAL_NETWORK_DISABLED" ? 503 : 400;
  return error;
}

module.exports = {
  AUTHORIZATION_URL,
  SHORT_TOKEN_URL,
  GRAPH_BASE_URL,
  META_INSTAGRAM_SCOPES,
  META_INSTAGRAM_SUBSCRIBED_FIELDS,
  createMetaInstagramClient,
  disabledTransport,
};
