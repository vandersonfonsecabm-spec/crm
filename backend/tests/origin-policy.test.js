const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_ALLOWED_ORIGINS, getAllowedOrigins, normalizeAllowedOrigin } = require("../src/security/origin-policy");

test("origens padrão são explícitas e incluem somente hosts CRM", () => {
  assert.deepEqual(getAllowedOrigins({ NODE_ENV: "production" }), DEFAULT_ALLOWED_ORIGINS);
  assert.equal(DEFAULT_ALLOWED_ORIGINS.includes("https://crm-murex-six-83.vercel.app"), true);
  assert.equal(DEFAULT_ALLOWED_ORIGINS.includes("https://crm-ga3-bundle-staging.vercel.app"), true);
});

test("origens configuradas aceitam HTTPS exato e rejeitam wildcard, credenciais e caminho", () => {
  const env = { NODE_ENV: "production" };
  assert.equal(normalizeAllowedOrigin("https://crm.example", env), "https://crm.example");
  assert.equal(normalizeAllowedOrigin("https://crm.example/path", env), null);
  assert.equal(normalizeAllowedOrigin("https://user:pass@crm.example", env), null);
  assert.equal(normalizeAllowedOrigin("*", env), null);
  assert.equal(normalizeAllowedOrigin("http://crm.example", env), null);
  assert.equal(normalizeAllowedOrigin("http://localhost:5173", env), null);
});

test("configuração inválida falha fechada em vez de ignorar origem", () => {
  assert.throws(
    () => getAllowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://crm.example,https://crm.example/path" }),
    /CORS invalida/,
  );
});

test("desenvolvimento permite somente localhost HTTP", () => {
  const env = { NODE_ENV: "development" };
  assert.equal(normalizeAllowedOrigin("http://localhost:5173", env), "http://localhost:5173");
  assert.equal(normalizeAllowedOrigin("http://127.0.0.1:5173", env), "http://127.0.0.1:5173");
});
