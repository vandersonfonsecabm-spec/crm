const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const express = require("express");
const http = require("node:http");
const test = require("node:test");
const { createAuth } = require("../src/auth");
const {
  authIdentity,
  createAuthRateLimiter,
  normalizeIp,
  requestIp,
} = require("../src/auth-rate-limiter");

test("limita identidade e IP em janela finita com Retry-After", () => {
  let now = 1_000;
  const limiter = createAuthRateLimiter({
    now: () => now,
    windowMs: 10_000,
    identityLimit: 2,
    ipLimit: 3,
  });
  const first = { identity: authIdentity("user@example.com", "tenant-a"), ip: "10.0.0.1" };
  limiter.recordFailure(first);
  limiter.recordFailure(first);
  assert.throws(() => limiter.check(first), (error) => error.code === "AUTH_RATE_LIMITED" && error.retryAfterSeconds === 10);

  const second = { identity: authIdentity("other@example.com", "tenant-a"), ip: "10.0.0.1" };
  limiter.recordFailure(second);
  assert.throws(() => limiter.check(second), (error) => error.code === "AUTH_RATE_LIMITED");

  now += 10_001;
  assert.doesNotThrow(() => limiter.check(first));
  assert.doesNotThrow(() => limiter.check(second));
});

test("sucesso libera somente a identidade e preserva a protecao por IP", () => {
  const limiter = createAuthRateLimiter({ identityLimit: 2, ipLimit: 2 });
  const context = { identity: authIdentity("user@example.com", ""), ip: "10.0.0.2" };
  limiter.recordFailure(context);
  limiter.recordFailure(context);
  limiter.recordSuccess(context);
  assert.throws(() => limiter.check(context), (error) => error.code === "AUTH_RATE_LIMITED");
});

test("normaliza IPv4 mapeado e ignora X-Forwarded-For nao confiavel", () => {
  assert.equal(normalizeIp("::FFFF:192.0.2.4"), "192.0.2.4");
  assert.equal(requestIp({
    headers: { "x-forwarded-for": "203.0.113.9" },
    socket: { remoteAddress: "::ffff:192.0.2.5" },
  }), "192.0.2.5");
});

test("usa somente X-Real-IP valido quando o alvo Railway foi atestado", () => {
  const base = {
    app: { locals: { railwayTargetVerified: true } },
    headers: { "x-forwarded-for": "198.51.100.99", "x-real-ip": "203.0.113.10" },
    socket: { remoteAddress: "192.0.2.5" },
  };
  assert.equal(requestIp(base), "203.0.113.10");
  assert.equal(requestIp({ ...base, headers: { ...base.headers, "x-real-ip": "203.0.113.10, 198.51.100.99" } }), "192.0.2.5");
  assert.equal(requestIp({ ...base, app: { locals: { railwayTargetVerified: false } } }), "192.0.2.5");
});

test("falha ao limpar bucket de login nao cria nem expõe sessao", async (t) => {
  const password = "SenhaSegura123";
  const usuario = {
    id: 1,
    empresaId: 1,
    nome: "Admin",
    email: "admin@rate-limit.example",
    senhaHash: await bcrypt.hash(password, 4),
    papel: "ADMIN",
    ativo: true,
    empresa: { id: 1, nome: "Empresa", slug: "empresa", ativo: true, createdAt: new Date(), updatedAt: new Date() },
  };
  const sessions = [];
  const prisma = {
    usuario: {
      async findMany() { return [usuario]; },
    },
    async $transaction(callback) {
      return callback({
        usuario: {
          async updateMany() { return { count: 1 }; },
          async findFirst() { return usuario; },
        },
        sessaoUsuario: {
          async create({ data }) { sessions.push(data); return data; },
        },
        sessaoRefreshToken: {
          async create({ data }) { return data; },
        },
      });
    },
    auditoriaSeguranca: {
      async create({ data }) { return data; },
    },
  };
  const unavailable = new Error("store unavailable");
  unavailable.status = 503;
  unavailable.code = "AUTH_RATE_LIMIT_STORE_UNAVAILABLE";
  const loginRateLimiter = {
    async check() {},
    async recordFailure() {},
    async recordSuccess() { throw unavailable; },
  };
  const app = express();
  app.use(express.json());
  createAuth({
    prisma,
    loginRateLimiter,
    securityDelivery: { async deliver() { return { status: "NOT_CONFIGURED" }; } },
  }).mountRoutes(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: usuario.email, senha: password }),
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).codigo, "AUTH_RATE_LIMIT_STORE_UNAVAILABLE");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(sessions.length, 0);
});

test("falha ao registrar credencial ausente retorna indisponibilidade sanitizada", async (t) => {
  const unavailable = new Error("store unavailable");
  unavailable.status = 503;
  unavailable.code = "AUTH_RATE_LIMIT_STORE_UNAVAILABLE";
  const app = express();
  app.use(express.json());
  createAuth({
    prisma: {},
    loginRateLimiter: {
      async check() {},
      async recordFailure() { throw unavailable; },
      async recordSuccess() {},
    },
    securityDelivery: { async deliver() { return { status: "NOT_CONFIGURED" }; } },
  }).mountRoutes(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "missing@rate-limit.example" }),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    erro: "Nao foi possivel autenticar agora.",
    codigo: "AUTH_RATE_LIMIT_STORE_UNAVAILABLE",
  });
});
