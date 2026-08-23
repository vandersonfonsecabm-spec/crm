import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

const originalFetch = globalThis.fetch;
globalThis.localStorage = new MemoryStorage();
const api = await import("../src/services/crmApi.ts");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function seedAccessToken(token = "access-token-de-teste") {
  localStorage.clear();
  api.setAuthToken(token);
}

function resetAuthTestState() {
  api.clearAuthSession();
  localStorage.clear();
  globalThis.fetch = originalFetch;
}

async function captureRejection(request) {
  let caught;
  await assert.rejects(request, (error) => {
    caught = error;
    return true;
  });
  return caught;
}

test("fluxos públicos e autenticados de segurança permanecem separados", async () => {
  const [api, app, login, publicFlow, panel] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/App.tsx"),
    source("src/pages/Login.tsx"),
    source("src/pages/PublicSecurityFlow.tsx"),
    source("src/components/dashboard/DashboardUserSecurityPanel.tsx"),
  ]);

  assert.match(api, /export function refreshAuthSession/);
  assert.match(api, /export async function requestPasswordRecovery/);
  assert.match(api, /runAuthRefreshSingleFlight\(performAuthRefresh\)/);
  assert.match(api, /response = await fetchAuthenticated\(path/);
  assert.match(api, /requestApiPublicPost[^\n]*empresaSlug/);
  assert.match(api, /export async function resetPasswordWithToken/);
  assert.match(api, /export async function acceptUserInvite/);
  assert.match(api, /requestApiPublicPost/);
  assert.match(app, /pathname === "\/redefinir-senha"/);
  assert.match(app, /pathname === "\/aceitar-convite"/);
  assert.match(login, /Esqueci minha senha/);
  assert.match(publicFlow, /window\.history\.replaceState/);
  assert.match(publicFlow, /label="Empresa"/);
  assert.match(app, /if \(shouldInvalidateAuthSession\(error\)\) \{\s*clearAuthSession\(\);/);
  assert.match(panel, /fetchSecurityAudit/);
  assert.match(panel, /Nenhuma senha temporária é criada pelo administrador/);
  assert.match(panel, /Sair de todos os dispositivos/);
  assert.match(panel, /confirmSecurityAction/);
  assert.doesNotMatch(`${api}\n${publicFlow}\n${panel}`, /console\.log\([^\n]*(?:token|senha|secret)/i);
});

test("refresh 401 preserva a autenticacao definitiva para o logout local", async (t) => {
  t.after(resetAuthTestState);
  seedAccessToken("access-token-invalido");
  const requests = [];
  const authorization = [];
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    requests.push(pathname);
    if (pathname === "/auth/refresh") {
      return jsonResponse({ erro: "Refresh expirado", codigo: "AUTH_REFRESH_INVALID" }, 401);
    }
    authorization.push(new Headers(init?.headers).get("Authorization"));
    return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
  };

  const error = await captureRejection(api.fetchManagedUsers());

  assert.equal(error instanceof api.ApiHttpError, true);
  assert.equal(error.status, 401);
  assert.equal(error.code, "AUTH_REFRESH_INVALID");
  assert.deepEqual(requests, ["/usuarios", "/auth/refresh"]);
  assert.deepEqual(authorization, ["Bearer access-token-invalido"]);
  assert.equal(api.shouldInvalidateAuthSession(error), true);
  api.clearAuthSession();
  assert.equal(api.getAuthToken(), null);
});

test("wrappers diretos preservam ApiHttpError 401 do refresh", async (t) => {
  t.after(resetAuthTestState);
  const consumers = [
    ["clientes", () => api.fetchClientesFromBackend()],
    ["dashboard", () => api.fetchDashboardSummaryFromBackend()],
    ["PDF de proposta", () => api.fetchCommercialProposalPdf(1)],
  ];

  for (const [label, request] of consumers) {
    seedAccessToken();
    let refreshCalls = 0;
    globalThis.fetch = async (url) => {
      if (new URL(String(url)).pathname === "/auth/refresh") {
        refreshCalls += 1;
        return jsonResponse({ erro: "Refresh expirado", codigo: "AUTH_REFRESH_INVALID" }, 401);
      }
      return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
    };

    const error = await captureRejection(request());
    assert.equal(error instanceof api.ApiHttpError, true, label);
    assert.equal(error.status, 401, label);
    assert.equal(error.code, "AUTH_REFRESH_INVALID", label);
    assert.equal(refreshCalls, 1, label);
  }
});

test("ausencia de access token permanece 401 sem requisicao de rede", async (t) => {
  t.after(resetAuthTestState);
  localStorage.clear();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch nao deveria ser chamado");
  };

  const error = await captureRejection(api.fetchManagedUsers());

  assert.equal(error instanceof api.ApiHttpError, true);
  assert.equal(error.status, 401);
  assert.equal(error.code, "AUTH_TOKEN_REQUIRED");
  assert.equal(api.shouldInvalidateAuthSession(error), true);
  assert.equal(fetchCalls, 0);
});

test("falha de rede vira NETWORK_ERROR, enquanto HTTP 500 permanece 500", async (t) => {
  t.after(resetAuthTestState);
  seedAccessToken();
  globalThis.fetch = async () => {
    throw new TypeError("network down");
  };

  const networkError = await captureRejection(api.fetchManagedUsers());
  assert.equal(networkError instanceof api.ApiHttpError, true);
  assert.equal(networkError.status, 0);
  assert.equal(networkError.code, "NETWORK_ERROR");
  assert.equal(api.shouldInvalidateAuthSession(networkError), false);
  assert.equal(api.getAuthToken(), "access-token-de-teste");

  seedAccessToken();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse({ erro: "Falha do servidor", codigo: "HTTP_500" }, 500);
  };

  const serverError = await captureRejection(api.fetchManagedUsers());
  assert.equal(serverError instanceof api.ApiHttpError, true);
  assert.equal(serverError.status, 500);
  assert.equal(serverError.code, "HTTP_500");
  assert.equal(api.shouldInvalidateAuthSession(serverError), false);
  assert.equal(api.getAuthToken(), "access-token-de-teste");
  assert.equal(fetchCalls, 1);
});

test("renovacao autenticada compartilha um unico refresh concorrente", async () => {
  const coordinatorSource = await source("src/services/auth-refresh-coordinator.ts");
  const compiled = ts.transpileModule(coordinatorSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const coordinator = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  let calls = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const refresh = async () => {
    calls += 1;
    await barrier;
    return { access_token: "renewed" };
  };

  const first = coordinator.runAuthRefreshSingleFlight(refresh);
  const second = coordinator.runAuthRefreshSingleFlight(refresh);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [{ access_token: "renewed" }, { access_token: "renewed" }]);

  await coordinator.runAuthRefreshSingleFlight(async () => {
    calls += 1;
    return { access_token: "next" };
  });
  assert.equal(calls, 2);
});

test("fetchAuthMe preserva a sessao quando o refresh falha por rede ou 500", async (t) => {
  t.after(resetAuthTestState);

  seedAccessToken("access-token-que-deve-permanecer");
  globalThis.fetch = async (url) => {
    if (new URL(String(url)).pathname === "/auth/refresh") throw new TypeError("network down");
    return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
  };

  const networkError = await captureRejection(api.fetchAuthMe());
  assert.equal(networkError instanceof api.ApiHttpError, true);
  assert.equal(networkError.status, 0);
  assert.equal(networkError.code, "NETWORK_ERROR");
  assert.equal(api.getAuthToken(), "access-token-que-deve-permanecer");

  seedAccessToken("access-token-que-deve-permanecer");
  globalThis.fetch = async (url) => {
    if (new URL(String(url)).pathname === "/auth/refresh") {
      return jsonResponse({ erro: "Falha temporaria", codigo: "AUTH_REFRESH_ERROR" }, 500);
    }
    return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
  };

  const serverError = await captureRejection(api.fetchAuthMe());
  assert.equal(serverError instanceof api.ApiHttpError, true);
  assert.equal(serverError.status, 500);
  assert.equal(serverError.code, "AUTH_REFRESH_ERROR");
  assert.equal(api.getAuthToken(), "access-token-que-deve-permanecer");
});

test("redefinir senha e aceitar convite antecedem o bootstrap autenticado", async () => {
  const [app, publicFlow] = await Promise.all([
    source("src/App.tsx"),
    source("src/pages/PublicSecurityFlow.tsx"),
  ]);

  assert.match(app, /function getPublicSecurityMode\(pathname: string\)/);
  const publicEffectGuard = app.indexOf("if (securityMode) return;");
  const bootstrapMutation = app.indexOf("cleanupLegacyBypassStorage()");
  const publicRenderGuard = app.indexOf("if (securityMode) return <PublicSecurityFlow");
  const checkingRender = app.indexOf('if (authState === "checking")');
  assert.ok(publicEffectGuard >= 0 && publicEffectGuard < bootstrapMutation);
  assert.ok(publicRenderGuard >= 0 && publicRenderGuard < checkingRender);
  assert.match(publicFlow, /new URLSearchParams\(window\.location\.search\)\.get\("token"\)/);
  assert.match(publicFlow, /window\.history\.replaceState\(\{\}, document\.title, window\.location\.pathname\)/);
});

async function importIsolatedRefreshCoordinator() {
  const coordinatorSource = await source("src/services/auth-refresh-coordinator.ts");
  const compiled = ts.transpileModule(coordinatorSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const suffix = `${Date.now()}-${Math.random()}`;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${suffix}`);
}

test("duas abas independentes elegem uma unica renovacao", async (t) => {
  t.after(resetAuthTestState);
  localStorage.clear();
  const [firstTab, secondTab] = await Promise.all([
    importIsolatedRefreshCoordinator(),
    importIsolatedRefreshCoordinator(),
  ]);
  let calls = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const refresh = async () => {
    calls += 1;
    await barrier;
    return { access_token: "renovado-apenas-na-aba-lider" };
  };

  let first;
  let second;
  try {
    first = firstTab.runAuthRefreshSingleFlight(refresh);
    await Promise.resolve();
    second = secondTab.runAuthRefreshSingleFlight(refresh);
    await Promise.resolve();
    assert.equal(calls, 1);
  } finally {
    release();
    await Promise.allSettled([first, second].filter(Boolean));
  }
});

function authRefreshPayload(token = "access-token-renovado") {
  return {
    access_token: token,
    expires_at: "2030-01-01T00:00:00.000Z",
    usuario: { id: 7, empresaId: 3, nome: "Usuario de teste", papel: "ADMIN" },
    empresa: { id: 3, nome: "Empresa de teste", slug: "empresa-de-teste" },
    papel: "ADMIN",
  };
}

function authMePayload() {
  const { usuario, empresa, papel } = authRefreshPayload();
  return { usuario, empresa, papel };
}

test("reload sem access token restaura a sessao pelo cookie valido", async (t) => {
  t.after(resetAuthTestState);
  localStorage.clear();
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(String(url)).pathname);
    return jsonResponse(authRefreshPayload("access-token-restaurado"));
  };

  const restored = await api.refreshAuthSession();
  assert.equal(restored.access_token, "access-token-restaurado");
  assert.equal(api.getAuthToken(), "access-token-restaurado");
  assert.equal(localStorage.getItem("crm-auth-token"), null);
  assert.equal(api.getAuthSession()?.usuario.empresaId, 3);
  assert.deepEqual(requests, ["/auth/refresh"]);

  const app = await source("src/App.tsx");
  assert.match(app, /if \(!getAuthSession\(\)\) await refreshAuthSession\(\);/);
});

test("produção encaminha auth pelo mesmo host antes do fallback da SPA", async () => {
  const [apiSource, vercelConfigSource] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("vercel.json"),
  ]);
  const [vercelConfig, rootVercelConfig] = [JSON.parse(vercelConfigSource), JSON.parse(await source("../vercel.json"))];

  assert.match(apiSource, /runtimeEnv\?\.PROD \? "\/api" : configuredApiUrl \|\| "http:\/\/localhost:3001"/);
  assert.deepEqual(vercelConfig.rewrites.slice(0, 2), [
    {
      source: "/api/:path*",
      destination: "https://api-production-875f9.up.railway.app/:path*",
    },
    {
      source: "/(.*)",
      destination: "/index.html",
    },
  ]);
  assert.deepEqual(rootVercelConfig.rewrites.slice(0, 2), vercelConfig.rewrites.slice(0, 2));
});

test("falha transitória no reload preserva retry e oferece retorno local ao login", async () => {
  const app = await source("src/App.tsx");

  assert.match(app, /function returnToLogin\(\) \{\s*clearAuthSession\(\);\s*setAuthState\("unauthenticated"\);\s*\}/);
  assert.match(app, /onRetry=\{\(\) => \{\s*setAuthState\("checking"\);\s*setAuthCheckAttempt\(\(attempt\) => attempt \+ 1\);\s*\}\}/);
  assert.match(app, /<Button onClick=\{returnToLogin\} size="sm" variant="ghost">Voltar ao login<\/Button>/);
});

test("fetchAuthMe limpa somente apos refresh 401 e permite nova tentativa apos falha transitoria", async (t) => {
  t.after(resetAuthTestState);
  seedAccessToken("access-token-expirado");
  globalThis.fetch = async (url) => {
    if (new URL(String(url)).pathname === "/auth/refresh") {
      return jsonResponse({ erro: "Refresh invalido", codigo: "AUTH_REFRESH_INVALID" }, 401);
    }
    return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
  };

  const terminalError = await captureRejection(api.fetchAuthMe());
  assert.equal(terminalError instanceof api.ApiHttpError, true);
  assert.equal(terminalError.status, 401);
  assert.equal(terminalError.code, "AUTH_REFRESH_INVALID");
  assert.equal(api.getAuthToken(), null);

  seedAccessToken("access-token-expirado");
  let secondAuthMeCalls = 0;
  let secondRefreshCalls = 0;
  globalThis.fetch = async (url) => {
    if (new URL(String(url)).pathname === "/auth/refresh") {
      secondRefreshCalls += 1;
      return jsonResponse(authRefreshPayload("access-token-que-ainda-sera-rejeitado"));
    }
    secondAuthMeCalls += 1;
    return jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401);
  };

  const secondAuthMeError = await captureRejection(api.fetchAuthMe());
  assert.equal(secondAuthMeError instanceof api.ApiHttpError, true);
  assert.equal(secondAuthMeError.status, 401);
  assert.equal(secondAuthMeError.code, "AUTH_TOKEN_INVALID");
  assert.equal(api.getAuthToken(), null);
  assert.equal(secondRefreshCalls, 1);
  assert.equal(secondAuthMeCalls, 2);

  seedAccessToken("access-token-expirado");
  let authMeCalls = 0;
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/refresh") {
      refreshCalls += 1;
      if (refreshCalls === 1) throw new TypeError("network down");
      return jsonResponse(authRefreshPayload());
    }
    authMeCalls += 1;
    return authMeCalls < 3
      ? jsonResponse({ erro: "Access token invalido", codigo: "AUTH_TOKEN_INVALID" }, 401)
      : jsonResponse(authMePayload());
  };

  const transientError = await captureRejection(api.fetchAuthMe());
  assert.equal(transientError instanceof api.ApiHttpError, true);
  assert.equal(transientError.status, 0);
  assert.equal(api.getAuthToken(), "access-token-expirado");

  const restored = await api.fetchAuthMe();
  assert.equal(restored?.usuario.id, 7);
  assert.equal(api.getAuthToken(), "access-token-renovado");
  assert.equal(refreshCalls, 2);
  assert.equal(authMeCalls, 3);
});

function createSignalBus() {
  const peers = new Set();
  const messages = [];

  class TestBroadcastChannel {
    constructor() {
      this.onmessage = null;
      peers.add(this);
    }

    postMessage(message) {
      messages.push(JSON.stringify(message));
      for (const peer of peers) {
        if (peer === this || typeof peer.onmessage !== "function") continue;
        queueMicrotask(() => peer.onmessage({ data: JSON.parse(JSON.stringify(message)) }));
      }
    }

    close() {
      peers.delete(this);
      this.onmessage = null;
    }
  }

  return { BroadcastChannel: TestBroadcastChannel, messages };
}

function createExclusiveWebLocks() {
  let held = false;
  return {
    async request(_name, options, callback) {
      if (options.ifAvailable && held) return callback(null);
      held = true;
      try {
        return await callback({});
      } finally {
        held = false;
      }
    },
  };
}

async function waitForCondition(predicate, description) {
  const deadline = Date.now() + 750;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(description);
}

async function assertCrossTabSingleRefresh({ locks }) {
  const coordinator = await importIsolatedRefreshCoordinator();
  const storage = new MemoryStorage();
  const bus = createSignalBus();
  const leader = coordinator.createAuthRefreshCoordinator({
    storage,
    locks,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_leader_01",
  });
  const follower = coordinator.createAuthRefreshCoordinator({
    storage,
    locks,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_follower_02",
  });
  let calls = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const refresh = async () => {
    calls += 1;
    await barrier;
    return { access_token: "access-token-never-broadcast" };
  };

  const first = leader.runAuthRefreshSingleFlight(refresh);
  const second = follower.runAuthRefreshSingleFlight(refresh);
  await waitForCondition(() => calls === 1, "uma unica aba deve executar o refresh");

  const noise = new bus.BroadcastChannel("crm-auth-refresh-v1");
  noise.postMessage({ version: 1, type: "unknown", correlationId: "ignored_noise_01", ownerId: "ignored_owner_01", startedAt: Date.now(), expiresAt: Date.now() + 100 });
  noise.close();
  release();

  const [leaderResult, followerResult] = await Promise.all([first, second]);
  assert.equal(leaderResult.access_token, "access-token-never-broadcast");
  assert.equal(followerResult, undefined);
  assert.equal(calls, 1);
  assert.ok(bus.messages.length >= 2);
  const sent = bus.messages.join("\n");
  assert.doesNotMatch(sent, /access-token-never-broadcast|refresh-token|cookie|usuario|empresa/i);
  for (const message of bus.messages) {
    const parsed = JSON.parse(message);
    if (parsed.type === "unknown") continue;
    assert.equal(parsed.version, 1);
    assert.equal(typeof parsed.type, "string");
    assert.equal(typeof parsed.correlationId, "string");
  }
}

test("Web Locks coordena abas e BroadcastChannel transmite apenas sinais", async () => {
  await assertCrossTabSingleRefresh({ locks: createExclusiveWebLocks() });
});

test("Web Locks nao executa refresh tardio apos sucesso recente de outra aba", async () => {
  const coordinator = await importIsolatedRefreshCoordinator();
  const storage = new MemoryStorage();
  const locks = createExclusiveWebLocks();
  const bus = createSignalBus();
  const leader = coordinator.createAuthRefreshCoordinator({
    storage,
    locks,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_late_leader",
  });
  const follower = coordinator.createAuthRefreshCoordinator({
    storage,
    locks,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_late_follower",
  });
  const staleRequestToken = "access-token-antigo";
  let sharedAccessToken = staleRequestToken;
  let calls = 0;
  const refresh = async () => {
    calls += 1;
    sharedAccessToken = "access-token-renovado-em-outra-aba";
    return { access_token: sharedAccessToken };
  };

  const leaderResult = await leader.runAuthRefreshSingleFlight(refresh);
  const followerResult = await follower.runAuthRefreshSingleFlight(refresh);
  const retryToken = sharedAccessToken;

  assert.equal(leaderResult.access_token, "access-token-renovado-em-outra-aba");
  assert.equal(followerResult, undefined);
  assert.notEqual(retryToken, staleRequestToken);
  assert.equal(calls, 1);
});

test("lease localStorage coordena sem Web Locks e recupera lease abandonado", async () => {
  await assertCrossTabSingleRefresh({ locks: null });

  const coordinator = await importIsolatedRefreshCoordinator();
  const storage = new MemoryStorage();
  storage.setItem("crm-auth-refresh-coordination-v1", JSON.stringify({
    version: 1,
    type: "refresh-start",
    correlationId: "abandoned_refresh_01",
    ownerId: "abandoned_owner_01",
    startedAt: Date.now() - 500,
    expiresAt: Date.now() - 1,
  }));
  const recovered = coordinator.createAuthRefreshCoordinator({
    storage,
    locks: null,
    BroadcastChannel: createSignalBus().BroadcastChannel,
    ownerId: "tab_recovery_03",
  });
  let calls = 0;
  await recovered.runAuthRefreshSingleFlight(async () => {
    calls += 1;
    return { access_token: "local-only" };
  });
  assert.equal(calls, 1);
});

test("timeout e logout remoto nao viram refresh duplicado", async () => {
  const coordinator = await importIsolatedRefreshCoordinator();
  const storage = new MemoryStorage();
  storage.setItem("crm-auth-refresh-coordination-v1", JSON.stringify({
    version: 1,
    type: "refresh-start",
    correlationId: "active_refresh_01",
    ownerId: "active_owner_01",
    startedAt: Date.now(),
    expiresAt: Date.now() + 1_000,
  }));
  const waiting = coordinator.createAuthRefreshCoordinator({
    storage,
    locks: null,
    BroadcastChannel: createSignalBus().BroadcastChannel,
    ownerId: "tab_timeout_04",
    leaseMs: 250,
    waitTimeoutMs: 250,
  });
  let timedOutCalls = 0;
  const timeoutError = await captureRejection(waiting.runAuthRefreshSingleFlight(async () => {
    timedOutCalls += 1;
    return { access_token: "nao-deve-executar" };
  }));
  assert.equal(timeoutError.status, 0);
  assert.equal(timedOutCalls, 0);

  const bus = createSignalBus();
  const logoutStorage = new MemoryStorage();
  const leader = coordinator.createAuthRefreshCoordinator({
    storage: logoutStorage,
    locks: null,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_logout_leader",
  });
  const follower = coordinator.createAuthRefreshCoordinator({
    storage: logoutStorage,
    locks: null,
    BroadcastChannel: bus.BroadcastChannel,
    ownerId: "tab_logout_follower",
  });
  let rejectRefresh;
  const pending = new Promise((_resolve, reject) => {
    rejectRefresh = reject;
  });
  let calls = 0;
  const first = leader.runAuthRefreshSingleFlight(async () => {
    calls += 1;
    return pending;
  });
  const second = follower.runAuthRefreshSingleFlight(async () => {
    calls += 1;
    return { access_token: "nao-deve-executar" };
  });
  await waitForCondition(() => calls === 1, "a aba seguidora deve aguardar o logout remoto");
  rejectRefresh(Object.assign(new Error("refresh encerrado"), { status: 401 }));
  const [leaderError, followerError] = await Promise.all([captureRejection(first), captureRejection(second)]);
  assert.equal(leaderError.status, 401);
  assert.equal(followerError.status, 401);
  assert.equal(calls, 1);
});
