const assert = require("node:assert/strict");
const test = require("node:test");
const { createPostgresAuthRateLimiter } = require("../src/auth-rate-limiter");

function fakePrisma() {
  const rows = new Map();
  const model = {
    async findMany({ where }) {
      const ids = new Set(where.id.in);
      return [...rows.values()].filter((row) => ids.has(row.id)).map(clone);
    },
    async deleteMany({ where }) {
      let count = 0;
      for (const [id, row] of rows) {
        if ((where.id && id === where.id) || (where.resetAt && row.resetAt <= where.resetAt.lte)) {
          rows.delete(id);
          count += 1;
        }
      }
      return { count };
    },
    async updateMany({ where, data }) {
      const row = rows.get(where.id);
      if (!row || row.resetAt <= where.resetAt.gt) return { count: 0 };
      row.count += data.count.increment;
      return { count: 1 };
    },
    async create({ data }) {
      if (rows.has(data.id)) {
        const error = new Error("duplicate");
        error.code = "P2002";
        throw error;
      }
      rows.set(data.id, { ...data, updatedAt: data.createdAt || new Date() });
      return clone(data);
    },
  };
  return {
    rateLimitBucket: model,
    async $transaction(callback) {
      return callback({ rateLimitBucket: model });
    },
    rows,
  };
}

function clone(row) {
  return { ...row, resetAt: new Date(row.resetAt), createdAt: row.createdAt && new Date(row.createdAt), updatedAt: row.updatedAt && new Date(row.updatedAt) };
}

test("duas instancias compartilham buckets, TTL e 429", async () => {
  let clock = 1_000;
  const prisma = fakePrisma();
  const options = { prisma, now: () => clock, windowMs: 1_000, identityLimit: 2, ipLimit: 20, pruneEveryMs: 0 };
  const first = createPostgresAuthRateLimiter(options);
  const second = createPostgresAuthRateLimiter(options);
  const context = { identity: "tenant-a:user-a", ip: "203.0.113.10" };

  await first.recordFailure(context);
  await second.recordFailure(context);
  await assert.rejects(second.check(context), (error) => error.code === "AUTH_RATE_LIMITED" && error.status === 429);

  clock += 1_001;
  await assert.doesNotReject(first.check(context));
  assert.equal(prisma.rows.size, 0);
});

test("falha do store e fail-closed sem fallback local", async () => {
  const unavailable = {
    rateLimitBucket: {
      findMany: async () => { throw new Error("database down"); },
      deleteMany: async () => { throw new Error("database down"); },
    },
  };
  const limiter = createPostgresAuthRateLimiter({ prisma: unavailable });
  await assert.rejects(limiter.check({ identity: "a", ip: "b" }), (error) => error.code === "AUTH_RATE_LIMIT_STORE_UNAVAILABLE" && error.status === 503);
});
