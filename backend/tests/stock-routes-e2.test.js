"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const multer = require("multer");
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

test("MIME-aware parser preserves multipart uploads and allows bounded preview JSON", async () => {
  const app = express();
  app.use(express.json({ limit: "100kb", type: (req) => !req.path.startsWith("/estoque/importacoes/preview") && /^application\/(?:json|[A-Za-z0-9.+-]+\+json)(?:;|$)/i.test(String(req.headers["content-type"] || "")) }));
  app.post("/importacoes/upload", multer().single("file"), (req, res) => res.json({ size: req.file?.size || 0 }));
  app.post("/estoque/importacoes/preview", express.json({ limit: "6mb" }), (req, res) => res.json({ length: req.body.content.length }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  try {
    const port = server.address().port;
    const boundary = "----stock-e2-boundary";
    const multipart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="stock.csv"\r\nContent-Type: text/csv\r\n\r\nsource_product_id,unit,on_hand\np1,UN,1\r\n--${boundary}--\r\n`);
    const upload = await httpRequest({ port, path: "/importacoes/upload", method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": multipart.length } }, multipart);
    assert.equal(upload.status, 200);
    assert.equal(JSON.parse(upload.body).size > 0, true);
    const content = "x".repeat(120000);
    const previewBody = Buffer.from(JSON.stringify({ content }));
    const preview = await httpRequest({ port, path: "/estoque/importacoes/preview", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": previewBody.length } }, previewBody);
    assert.equal(preview.status, 200);
    assert.equal(JSON.parse(preview.body).length, content.length);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", ...options }, (response) => {
      const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject); request.end(body);
  });
}
