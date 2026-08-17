const assert = require("node:assert/strict");
const test = require("node:test");
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
