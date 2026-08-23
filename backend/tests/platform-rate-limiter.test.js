const assert = require("node:assert/strict");
const test = require("node:test");
const { createPlatformRateLimiter } = require("../src/platform/routes");

function responseSpy() {
  return {
    headers: new Map(),
    statusCode: null,
    body: null,
    set(name, value) { this.headers.set(name, value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("limiter de plataforma reserva a operacao antes do handler", async () => {
  const calls = [];
  const middleware = createPlatformRateLimiter({
    limiter: {
      async consume(context) { calls.push(context); },
    },
  });
  const req = { auth: { usuarioId: 42 }, socket: { remoteAddress: "::ffff:203.0.113.7" } };
  const res = responseSpy();
  let nextCalls = 0;

  await middleware(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.deepEqual(calls, [{ identity: "platform:42", ip: "203.0.113.7" }]);
});

test("limiter de plataforma falha fechado sem expor erro do store", async () => {
  const unavailable = new Error("database unavailable");
  unavailable.status = 503;
  unavailable.code = "AUTH_RATE_LIMIT_STORE_UNAVAILABLE";
  const middleware = createPlatformRateLimiter({
    limiter: { async consume() { throw unavailable; } },
  });
  const res = responseSpy();

  await middleware({ auth: { usuarioId: 42 }, socket: { remoteAddress: "203.0.113.7" } }, res, () => {
    throw new Error("next nao deve ser chamado");
  });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    erro: "Operacao de plataforma temporariamente indisponivel.",
    codigo: "PLATFORM_RATE_LIMIT_STORE_UNAVAILABLE",
  });
});
