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

  function consume({ identity, ip }) {
    check({ identity, ip });
    recordFailure({ identity, ip });
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

  return { check, consume, recordFailure, recordSuccess };
}

function createPostgresAuthRateLimiter({
  prisma,
  now = () => Date.now(),
  windowMs = DEFAULT_WINDOW_MS,
  identityLimit = DEFAULT_IDENTITY_LIMIT,
  ipLimit = DEFAULT_IP_LIMIT,
  pruneEveryMs = 30 * 1000,
} = {}) {
  if (!prisma?.rateLimitBucket) {
    throw new Error("Rate limiter distribuido exige o modelo RateLimitBucket.");
  }

  let lastPruneAt = 0;

  async function check({ identity, ip }) {
    const keys = [bucketKey("identity", identity), bucketKey("ip", ip)];
    const current = new Date(now());
    await pruneIfDue(current);
    let rows;
    try {
      rows = await prisma.rateLimitBucket.findMany({ where: { id: { in: keys } } });
    } catch (error) {
      throw rateLimitStoreError(error);
    }
    const blocked = rows
      .filter((row) => row.resetAt > current && row.count >= row.limit)
      .sort((left, right) => right.resetAt.getTime() - left.resetAt.getTime())[0];
    if (!blocked) return;
    throw rateLimitError(Math.max(1, Math.ceil((blocked.resetAt.getTime() - current.getTime()) / 1000)));
  }

  async function recordFailure({ identity, ip }) {
    const current = new Date(now());
    await pruneIfDue(current);
    try {
      await prisma.$transaction(async (tx) => {
        await incrementBucket(tx, bucketKey("identity", identity), identityLimit, current);
        await incrementBucket(tx, bucketKey("ip", ip), ipLimit, current);
      });
    } catch (error) {
      throw rateLimitStoreError(error);
    }
  }

  async function consume({ identity, ip }) {
    const current = new Date(now());
    await pruneIfDue(current);
    try {
      await prisma.$transaction(async (tx) => {
        const identityResetAt = await consumeBucket(tx, bucketKey("identity", identity), identityLimit, current);
        if (identityResetAt) throw rateLimitError(retryAfterSeconds(identityResetAt, current));

        const ipResetAt = await consumeBucket(tx, bucketKey("ip", ip), ipLimit, current);
        if (ipResetAt) throw rateLimitError(retryAfterSeconds(ipResetAt, current));
      });
    } catch (error) {
      if (error?.code === "AUTH_RATE_LIMITED") throw error;
      throw rateLimitStoreError(error);
    }
  }

  async function recordSuccess({ identity }) {
    try {
      await prisma.rateLimitBucket.deleteMany({ where: { id: bucketKey("identity", identity) } });
    } catch (error) {
      throw rateLimitStoreError(error);
    }
  }

  async function pruneIfDue(current) {
    if (current.getTime() - lastPruneAt < pruneEveryMs) return;
    lastPruneAt = current.getTime();
    try {
      await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lte: current } } });
    } catch (error) {
      throw rateLimitStoreError(error);
    }
  }

  async function incrementBucket(tx, id, limit, current) {
    const resetAt = new Date(current.getTime() + windowMs);
    if (typeof tx.$executeRaw === "function") {
      // O upsert condicional é uma única operação PostgreSQL: duas réplicas
      // não perdem incrementos nem precisam continuar uma transação após
      // capturar uma violação de unique.
      await tx.$executeRaw`
        INSERT INTO "RateLimitBucket" ("id", "count", "limit", "resetAt", "createdAt", "updatedAt")
        VALUES (${id}, 1, ${limit}, ${resetAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("id") DO UPDATE SET
          "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${current}
            THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
          "limit" = EXCLUDED."limit",
          "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${current}
            THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
      `;
      return;
    }
    const updated = await tx.rateLimitBucket.updateMany({
      where: { id, resetAt: { gt: current } },
      data: { count: { increment: 1 } },
    });
    if (updated.count === 1) return;
    try {
      await tx.rateLimitBucket.create({ data: { id, count: 1, limit, resetAt } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      // Outra réplica criou o bucket entre o update e o create. O update
      // condicional preserva a janela e torna o incremento atômico.
      const retried = await tx.rateLimitBucket.updateMany({
        where: { id, resetAt: { gt: current } },
        data: { count: { increment: 1 } },
      });
      if (retried.count !== 1) throw error;
    }
  }

  async function consumeBucket(tx, id, limit, current) {
    const resetAt = new Date(current.getTime() + windowMs);
    if (typeof tx.$queryRaw === "function") {
      // A reserva e o limite sao decididos pela mesma instrucao. Assim, duas
      // replicas nao podem liberar simultaneamente a mesma tentativa.
      const rows = await tx.$queryRaw`
        INSERT INTO "RateLimitBucket" ("id", "count", "limit", "resetAt", "createdAt", "updatedAt")
        VALUES (${id}, 1, ${limit}, ${resetAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("id") DO UPDATE SET
          "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${current}
            THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
          "limit" = EXCLUDED."limit",
          "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${current}
            THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "RateLimitBucket"."resetAt" <= ${current}
          OR "RateLimitBucket"."count" < ${limit}
        RETURNING "resetAt"
      `;
      if (rows.length === 1) return null;
      const blocked = await tx.rateLimitBucket.findUnique({ where: { id }, select: { resetAt: true } });
      if (blocked?.resetAt > current) return blocked.resetAt;
      throw new Error("AUTH_RATE_LIMIT_CONSUME_STATE_INVALID");
    }

    const updated = await tx.rateLimitBucket.updateMany({
      where: { id, resetAt: { gt: current }, count: { lt: limit } },
      data: { count: { increment: 1 }, limit },
    });
    if (updated.count === 1) return null;

    const existing = await tx.rateLimitBucket.findUnique({ where: { id }, select: { resetAt: true } });
    if (existing?.resetAt > current) return existing.resetAt;

    try {
      await tx.rateLimitBucket.create({ data: { id, count: 1, limit, resetAt } });
      return null;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const retried = await tx.rateLimitBucket.updateMany({
        where: { id, resetAt: { gt: current }, count: { lt: limit } },
        data: { count: { increment: 1 }, limit },
      });
      if (retried.count === 1) return null;
      const blocked = await tx.rateLimitBucket.findUnique({ where: { id }, select: { resetAt: true } });
      if (blocked?.resetAt > current) return blocked.resetAt;
      throw error;
    }
  }

  return { check, consume, recordFailure, recordSuccess };
}

function rateLimitError(retryAfterSeconds) {
  const error = new Error("Nao foi possivel autenticar agora.");
  error.status = 429;
  error.code = "AUTH_RATE_LIMITED";
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function retryAfterSeconds(resetAt, current) {
  return Math.max(1, Math.ceil((resetAt.getTime() - current.getTime()) / 1000));
}

function rateLimitStoreError(cause) {
  const error = new Error("Rate limiter indisponivel.");
  error.status = 503;
  error.code = "AUTH_RATE_LIMIT_STORE_UNAVAILABLE";
  error.cause = cause;
  return error;
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
  createPostgresAuthRateLimiter,
  normalizeIp,
  requestIp,
};
