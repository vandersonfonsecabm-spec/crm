const crypto = require("node:crypto");
const net = require("node:net");

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_IDENTITY_LIMIT = 8;
const DEFAULT_IP_LIMIT = 100;

function createAuthRateLimiter({
  now = () => Date.now(),
  windowMs = DEFAULT_WINDOW_MS,
  identityLimit = DEFAULT_IDENTITY_LIMIT,
  ipLimit = DEFAULT_IP_LIMIT,
} = {}) {
  const buckets = new Map();

  function check({ identity, ip }) {
    prune();
    const blocked = [bucketKey("identity", identity), bucketKey("ip", ip)]
      .map((key) => buckets.get(key))
      .filter((bucket) => bucket && bucket.count >= bucket.limit)
      .sort((left, right) => right.resetAt - left.resetAt)[0];

    if (!blocked) return;
    const retryAfterSeconds = Math.max(1, Math.ceil((blocked.resetAt - now()) / 1000));
    const error = new Error("Nao foi possivel autenticar agora.");
    error.status = 429;
    error.code = "AUTH_RATE_LIMITED";
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  function recordFailure({ identity, ip }) {
    prune();
    increment(bucketKey("identity", identity), identityLimit);
    increment(bucketKey("ip", ip), ipLimit);
  }

  function recordSuccess({ identity }) {
    buckets.delete(bucketKey("identity", identity));
  }

  function increment(key, limit) {
    const current = now();
    const bucket = buckets.get(key);
    if (!bucket || current >= bucket.resetAt) {
      buckets.set(key, { count: 1, limit, resetAt: current + windowMs });
      return;
    }
    bucket.count += 1;
  }

  function prune() {
    const current = now();
    for (const [key, bucket] of buckets) {
      if (current >= bucket.resetAt) buckets.delete(key);
    }
  }

  return { check, recordFailure, recordSuccess };
}

function authIdentity(email, slug) {
  return digest(`${String(email || "").trim().toLowerCase()}\n${String(slug || "").trim().toLowerCase()}`);
}

function requestIp(req) {
  const trustedRailwayTarget = req?.app?.locals?.railwayTargetVerified === true;
  const realIp = trustedRailwayTarget ? String(req?.headers?.["x-real-ip"] || "").trim() : "";
  const forwarded = realIp && net.isIP(realIp) ? realIp : null;
  return normalizeIp(forwarded || req?.socket?.remoteAddress);
}

function normalizeIp(value) {
  const text = String(value || "unknown").trim().toLowerCase();
  return text.startsWith("::ffff:") ? text.slice(7) : text;
}

function bucketKey(scope, value) {
  return `${scope}:${digest(value || "unknown")}`;
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = {
  authIdentity,
  createAuthRateLimiter,
  normalizeIp,
  requestIp,
};
