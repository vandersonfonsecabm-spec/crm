"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mountStockRoutes } = require("../src/stock/routes");

test("E2 routes are exact and mounted before legacy 410 middleware", () => {
  const methods = [];
  const app = new Proxy({}, { get: (_, method) => (route, ...handlers) => methods.push({ method, route, handlers }) });
  mountStockRoutes({ app, prisma: {}, authenticate: () => {}, requireRole: () => () => {}, env: {} });
  const paths = methods.map((entry) => entry.route);
  for (const required of [
    "/estoque/fontes", "/estoque/fontes/:id/validar", "/estoque/importacoes/preview", "/estoque/importacoes/:id",
    "/estoque/importacoes/:id/confirmar", "/estoque/importacoes/:id/cancelar", "/estoque/sincronizacoes/:id",
    "/estoque/produtos", "/estoque/lotes", "/estoque/saldos", "/estoque/freshness", "/estoque/problemas-qualidade",
  ]) assert.ok(paths.includes(required), required);
  const server = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  assert.ok(server.indexOf("mountStockRoutes") < server.indexOf("legacyInventoryUnavailable"));
  assert.match(server, /app\.use\(\s*\[\"\/categorias-produtos\", \"\/produtos\", \"\/estoque\"\]/);
  assert.match(server, /express\.json\(\{[\s\S]*type: \(req\) => !req\.path\.startsWith\("\/estoque\/importacoes\/preview"\)/);
  assert.match(server, /content-type/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "src", "stock", "routes.js"), "utf8"), /sourceGuardRoleLarge[\s\S]*express\.json\(\{ limit: "6mb"/);
  const stockFiles = fs.readdirSync(path.join(__dirname, "..", "src", "stock"), { recursive: true }).filter((name) => String(name).endsWith(".js"));
  for (const file of stockFiles) {
    const text = fs.readFileSync(path.join(__dirname, "..", "src", "stock", file), "utf8");
    assert.doesNotMatch(text, /notifications\/service|upsertProjection|Notificacao/);
  }
});
