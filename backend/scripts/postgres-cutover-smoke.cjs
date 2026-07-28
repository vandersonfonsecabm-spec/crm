const { sanitize } = require("./postgres-cutover-workflow.cjs");

const DEFAULT_TIMEOUT_MS = 10000;

async function runAuthenticatedReadOnlySmoke(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw smokeError("SMOKE_FETCH_UNAVAILABLE", "fetch indisponivel.");

  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.CRM_SMOKE_API_URL);
  const email = String(options.email || process.env.CRM_SMOKE_EMAIL || "").trim();
  const password = String(options.password || process.env.CRM_SMOKE_PASSWORD || "");
  const slug = String(options.empresaSlug || process.env.CRM_SMOKE_EMPRESA_SLUG || "").trim();
  const providedToken = String(options.token || process.env.CRM_SMOKE_BEARER_TOKEN || "").trim();

  if (!baseUrl) throw smokeError("SMOKE_BASE_URL_REQUIRED", "CRM_SMOKE_API_URL obrigatoria.");
  if (!providedToken && (!email || !password)) {
    throw smokeError("SMOKE_CREDENTIALS_REQUIRED", "Token ou credenciais temporarias obrigatorios.");
  }

  const routes = [];
  const request = async (method, path, body, token) => {
    assertAllowedSmokeRequest(method, path);
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) {
      throw smokeError("SMOKE_EXTERNAL_URL_BLOCKED", "Smoke nao pode chamar origem externa.");
    }
    const response = await fetchWithTimeout(fetchImpl, String(url), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      method,
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const parsed = await parseBody(response);
    routes.push({ method, path, status: response.status });
    if (response.status < 200 || response.status >= 300) {
      throw smokeError("SMOKE_ROUTE_FAILED", `Smoke falhou em ${method} ${path}: ${response.status}.`);
    }
    return parsed;
  };

  await request("GET", "/health");
  let token = providedToken;
  if (!token) {
    const loginBody = { email, senha: password, ...(slug ? { slug } : {}) };
    const login = await request("POST", "/auth/login", loginBody);
    token = String(login?.access_token || "");
    if (!token) throw smokeError("SMOKE_TOKEN_MISSING", "Login nao retornou token.");
  }

  await request("GET", "/auth/me", undefined, token);
  const clients = await request("GET", "/clientes?page=1&limit=1", undefined, token);
  const firstClient = Array.isArray(clients?.data) ? clients.data[0] : null;
  if (firstClient?.id) {
    const id = encodeURIComponent(String(firstClient.id));
    await request("GET", `/clientes/${id}`, undefined, token);
    await request("GET", `/clientes/${id}/notas`, undefined, token);
    await request("GET", `/clientes/${id}/360`, undefined, token);
  }

  return {
    authentication: providedToken ? "bearer-token" : "login",
    checkedCustomer360: Boolean(firstClient?.id),
    ok: true,
    routes,
  };
}

function assertAllowedSmokeRequest(method, path) {
  const upper = String(method || "").toUpperCase();
  if (upper === "GET") return;
  if (upper === "POST" && path === "/auth/login") return;
  throw smokeError("SMOKE_WRITE_BLOCKED", `Metodo nao permitido no smoke: ${upper} ${path}.`);
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function parseBody(response) {
  const text = await response.text();
  const contentType = response.headers?.get?.("content-type") || "";
  if (!text) return null;
  if (contentType.includes("application/json")) return JSON.parse(text);
  return text;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const url = new URL(text);
  return `${url.origin}/`;
}

function smokeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

if (require.main === module) {
  runAuthenticatedReadOnlySmoke()
    .then((result) => {
      console.log(JSON.stringify({
        authentication: result.authentication,
        checkedCustomer360: result.checkedCustomer360,
        event: "postgres_cutover_smoke_ok",
        routes: result.routes,
      }));
    })
    .catch((error) => {
      console.error(`[postgres-cutover-smoke] ${sanitize(error.message)}`);
      process.exitCode = 1;
    });
}

module.exports = {
  assertAllowedSmokeRequest,
  runAuthenticatedReadOnlySmoke,
};
