const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  assertAllowedSmokeRequest,
  runAuthenticatedReadOnlySmoke,
} = require("../scripts/postgres-cutover-smoke.cjs");

test("smoke autenticado usa login e somente rotas de leitura", async () => {
  const calls = [];
  const result = await runAuthenticatedReadOnlySmoke({
    baseUrl: "https://api.example.test",
    email: "admin@example.test",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method, authorization: options.headers?.authorization });
      const path = new URL(url).pathname;
      if (path === "/health") return jsonResponse(200, { status: "ok" });
      if (path === "/auth/login") return jsonResponse(200, { access_token: "secret-smoke-token" });
      if (path === "/auth/me") return jsonResponse(200, { empresa: { slug: "crm-agro-saas" }, papel: "ADMIN" });
      if (path === "/clientes") return jsonResponse(200, { data: [{ id: 123 }], pagination: { total: 1 } });
      if (path === "/clientes/123") return jsonResponse(200, { id: 123 });
      if (path === "/clientes/123/notas") return jsonResponse(200, []);
      if (path === "/clientes/123/360") return jsonResponse(200, { cliente: { id: 123 } });
      return jsonResponse(404, { erro: "not found" });
    },
    password: "secret-smoke-password",
  });

  assert.equal(result.ok, true);
  assert.equal(result.checkedCustomer360, true);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET", "GET", "GET", "GET", "GET"]);
  assert.equal(calls.filter((call) => call.method !== "GET" && new URL(call.url).pathname !== "/auth/login").length, 0);
  assert.equal(JSON.stringify(result).includes("secret-smoke-token"), false);
  assert.equal(JSON.stringify(result).includes("secret-smoke-password"), false);
});

test("smoke sem cliente pula notas e Cliente 360 sem falhar", async () => {
  const result = await runAuthenticatedReadOnlySmoke({
    baseUrl: "https://api.example.test",
    email: "admin@example.test",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/health") return jsonResponse(200, { status: "ok" });
      if (path === "/auth/login") return jsonResponse(200, { access_token: "token" });
      if (path === "/auth/me") return jsonResponse(200, { papel: "ADMIN" });
      if (path === "/clientes") return jsonResponse(200, { data: [], pagination: { total: 0 } });
      return jsonResponse(500, {});
    },
    password: "senha-temporaria",
  });

  assert.equal(result.ok, true);
  assert.equal(result.checkedCustomer360, false);
  assert.deepEqual(result.routes.map((route) => route.path), ["/health", "/auth/login", "/auth/me", "/clientes?page=1&limit=1"]);
});

test("smoke bloqueia escrita de negocio e origem externa", async () => {
  assert.throws(() => assertAllowedSmokeRequest("POST", "/clientes"), { code: "SMOKE_WRITE_BLOCKED" });

  await assert.rejects(runAuthenticatedReadOnlySmoke({
    baseUrl: "https://api.example.test",
    email: "admin@example.test",
    fetchImpl: async (url) => jsonResponse(new URL(url).pathname === "/health" ? 200 : 500, {}),
    password: "senha-temporaria",
  }), { code: "SMOKE_ROUTE_FAILED" });
});

test("smoke exige credenciais temporarias sem persistir token", async () => {
  await assert.rejects(runAuthenticatedReadOnlySmoke({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse(200, {}),
  }), { code: "SMOKE_CREDENTIALS_REQUIRED" });
});

function jsonResponse(status, body) {
  return {
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : "";
      },
    },
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
