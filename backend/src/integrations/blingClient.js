const crypto = require("node:crypto");

const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";
const BLING_REVOKE_URL = "https://api.bling.com.br/oauth/revoke";
const BLING_API_BASE_URL = "https://api.bling.com.br/Api/v3";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;
const USER_AGENT = "CRM-Agro-SaaS/1.0 (+https://crm-murex-six-83.vercel.app)";

function getBlingConfig() {
  return {
    clientId: clean(process.env.BLING_CLIENT_ID),
    clientSecret: clean(process.env.BLING_CLIENT_SECRET),
    redirectUri: clean(process.env.BLING_REDIRECT_URI),
    timeoutMs: positiveInt(process.env.BLING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxPages: positiveInt(process.env.BLING_MAX_PAGES, DEFAULT_MAX_PAGES),
    pageSize: positiveInt(process.env.BLING_PAGE_SIZE, DEFAULT_PAGE_SIZE),
  };
}

function assertBlingConfigured() {
  const config = getBlingConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw blingError("BLING_NOT_CONFIGURED", "Conector Bling disponível para configuração. Defina as credenciais do aplicativo para conectar.");
  }
  return config;
}

function buildAuthorizationUrl({ state }) {
  const config = assertBlingConfigured();
  const url = new URL(BLING_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForTokens(code) {
  return tokenRequest({ grant_type: "authorization_code", code });
}

async function refreshBlingTokens(refreshToken) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function revokeBlingToken(token, tokenTypeHint) {
  if (!token) return { ok: false, skipped: true };
  const config = assertBlingConfigured();
  const body = new URLSearchParams();
  body.set("token", token);
  body.set("token_type_hint", tokenTypeHint);
  const response = await fetchWithTimeout(BLING_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  }, config.timeoutMs);
  return { ok: response.ok, status: response.status };
}

async function tokenRequest(params) {
  const config = assertBlingConfigured();
  const body = new URLSearchParams(params);
  const response = await fetchWithTimeout(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "1.0",
      Authorization: basicAuth(config),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      "enable-jwt": "1",
    },
    body,
  }, config.timeoutMs);
  const data = await safeJson(response);
  if (!response.ok) {
    throw blingError("BLING_TOKEN_ERROR", sanitizeBlingError(data, "Não foi possível autenticar no Bling."), response.status);
  }
  return normalizeTokenResponse(data);
}

class BlingHttpClient {
  constructor({ credentials, onTokenRefresh, correlationId } = {}) {
    this.credentials = credentials || {};
    this.onTokenRefresh = onTokenRefresh;
    this.correlationId = correlationId || crypto.randomUUID();
    this.config = getBlingConfig();
  }

  async testConnection() {
    const result = await this.get("/produtos", { limite: 1, pagina: 1 });
    return {
      conectado: true,
      validadoEm: new Date().toISOString(),
      conta: result?.data?.length >= 0 ? "Bling" : null,
    };
  }

  async fetchPaginated(path, params = {}) {
    const items = [];
    for (let page = 1; page <= this.config.maxPages; page += 1) {
      const data = await this.get(path, {
        ...params,
        pagina: page,
        limite: params.limite || this.config.pageSize,
      });
      const pageItems = Array.isArray(data?.data) ? data.data : [];
      items.push(...pageItems);
      if (pageItems.length === 0 || pageItems.length < Number(params.limite || this.config.pageSize)) break;
    }
    return items;
  }

  async get(path, params = {}, attempt = 0) {
    await this.ensureFreshToken();
    const url = new URL(`${BLING_API_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        "X-Correlation-Id": this.correlationId,
      },
    }, this.config.timeoutMs);

    if (response.status === 401 && attempt === 0) {
      await this.refreshTokens();
      return this.get(path, params, attempt + 1);
    }
    if (response.status === 429 && attempt < 2) {
      await wait(retryAfterMs(response) || 1200 * (attempt + 1));
      return this.get(path, params, attempt + 1);
    }

    const data = await safeJson(response);
    if (!response.ok) {
      throw blingError("BLING_HTTP_ERROR", sanitizeBlingError(data, "Falha ao consultar o Bling."), response.status);
    }
    return data;
  }

  async ensureFreshToken() {
    if (!this.credentials?.accessToken || !this.credentials?.refreshToken) {
      throw blingError("BLING_CREDENTIALS_REQUIRED", "Integração Bling sem credenciais válidas.");
    }
    const expiresAt = new Date(this.credentials.expiresAt || 0).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > 60_000) return;
    await this.refreshTokens();
  }

  async refreshTokens() {
    const tokens = await refreshBlingTokens(this.credentials.refreshToken);
    this.credentials = {
      ...this.credentials,
      ...tokens,
      refreshToken: tokens.refreshToken || this.credentials.refreshToken,
      refreshedAt: new Date().toISOString(),
    };
    if (this.onTokenRefresh) await this.onTokenRefresh(this.credentials);
  }
}

function normalizeTokenResponse(data = {}) {
  const expiresIn = Number(data.expires_in || data.expiresIn || 21600);
  return {
    accessToken: String(data.access_token || ""),
    refreshToken: String(data.refresh_token || ""),
    tokenType: String(data.token_type || "Bearer"),
    scope: data.scope ? String(data.scope) : null,
    expiresIn,
    expiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
    obtainedAt: new Date().toISOString(),
  };
}

function basicAuth(config) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw blingError("BLING_TIMEOUT", "Tempo de resposta do Bling excedido.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sanitizeBlingError(data, fallback) {
  const error = data?.error || data?.erro || data;
  return clean(error?.description || error?.message || error?.type || data?.message || fallback);
}

function retryAfterMs(response) {
  const value = response.headers.get("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function blingError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value || "").trim();
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  BLING_AUTHORIZE_URL,
  BLING_API_BASE_URL,
  BlingHttpClient,
  assertBlingConfigured,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshBlingTokens,
  revokeBlingToken,
  blingError,
};
