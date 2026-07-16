function createSiteLeadRateLimiter({ now = () => Date.now() } = {}) {
  const buckets = new Map();
  const ipLimit = integerEnv("SITE_LEAD_RATE_IP_LIMIT", 10, 1, 1000);
  const publicLimit = integerEnv("SITE_LEAD_RATE_PUBLIC_LIMIT", 100, 1, 10000);
  function consume({ publicId, ip }) { prune(); hit(`ip:${publicId}:${ip || "unknown"}`, ipLimit, 10 * 60 * 1000); hit(`public:${publicId}`, publicLimit, 60 * 60 * 1000); }
  function hit(key, limit, windowMs) { const current = now(); const bucket = buckets.get(key); if (!bucket || current >= bucket.resetAt) { buckets.set(key, { count: 1, resetAt: current + windowMs }); return; } if (bucket.count >= limit) { const error = new Error("Muitas tentativas. Tente novamente mais tarde."); error.status = 429; error.codigo = "RATE_LIMITED"; throw error; } bucket.count += 1; }
  function prune() { const current = now(); for (const [key, value] of buckets) if (current >= value.resetAt) buckets.delete(key); }
  return { consume, clear: () => buckets.clear() };
}
function integerEnv(name, fallback, min, max) { const value = Number(process.env[name]); return Number.isInteger(value) && value >= min && value <= max ? value : fallback; }
module.exports = { createSiteLeadRateLimiter };
