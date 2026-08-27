"use strict";

const MAX_CURSOR_JSON_BYTES = 2048;
const CHECKPOINT_CONFLICT = "WORKER_CHECKPOINT_CONFLICT";
const ephemeralStores = new WeakMap();

const KEYS = Object.freeze({
  automationTenants: () => "automation:temporal:tenants",
  automationLeads: (empresaId, ruleId) => scopedKey("automation:temporal:leads", empresaId, ruleId),
  automationDeals: (empresaId, ruleId) => scopedKey("automation:temporal:deals", empresaId, ruleId),
  notificationTenants: () => "notifications:tenants",
  notificationSources: (empresaId) => scopedKey("notifications:sources", empresaId),
  stockRules: (empresaId) => scopedKey("stock:rules", empresaId),
});

const ALLOWED_KEY = /^(?:automation:temporal:tenants|automation:temporal:(?:leads|deals):[1-9]\d*:[1-9]\d*|notifications:tenants|notifications:sources:[1-9]\d*|stock:rules:[1-9]\d*)$/;

function createWorkerCheckpointStore({ prisma } = {}) {
  if (!prisma || typeof prisma !== "object") throw checkpointError("WORKER_CHECKPOINT_PRISMA_REQUIRED");
  if (!prisma.workerCheckpoint) return ephemeralStore(prisma);
  return {
    persistent: true,
    async read(key) {
      assertCheckpointKey(key);
      const row = await prisma.workerCheckpoint.findUnique({ where: { chave: key }, select: { cursorJson: true } });
      return decodeCursor(row?.cursorJson);
    },
    async write(key, cursor) {
      assertCheckpointKey(key);
      const cursorJson = encodeCursor(cursor);
      return persistWithCas(prisma, key, cursorJson);
    },
    async clear(key) {
      assertCheckpointKey(key);
      return clearWithCas(prisma, key);
    },
  };
}

function assertPersistentWorkerCheckpoints(prisma) {
  if (!prisma?.workerCheckpoint
    || typeof prisma.workerCheckpoint.findUnique !== "function"
    || typeof prisma.workerCheckpoint.updateMany !== "function"
    || typeof prisma.workerCheckpoint.create !== "function") {
    throw checkpointError("WORKER_CHECKPOINT_SCHEMA_REQUIRED");
  }
}

async function persistWithCas(prisma, key, cursorJson) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await prisma.workerCheckpoint.findUnique({ where: { chave: key }, select: { id: true, revisao: true } });
    if (!current) {
      try {
        return await prisma.workerCheckpoint.create({ data: { chave: key, cursorJson } });
      } catch (error) {
        if (error?.code === "P2002") continue;
        throw error;
      }
    }
    const updated = await prisma.workerCheckpoint.updateMany({
      where: { id: current.id, chave: key, revisao: current.revisao },
      data: { cursorJson, revisao: { increment: 1 } },
    });
    if (updated.count === 1) {
      return prisma.workerCheckpoint.findUnique({ where: { chave: key } });
    }
  }
  throw checkpointError(CHECKPOINT_CONFLICT);
}

async function clearWithCas(prisma, key) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await prisma.workerCheckpoint.findUnique({ where: { chave: key }, select: { id: true, cursorJson: true, revisao: true } });
    if (!current || current.cursorJson === null) return current;
    const updated = await prisma.workerCheckpoint.updateMany({
      where: { id: current.id, chave: key, revisao: current.revisao },
      data: { cursorJson: null, revisao: { increment: 1 } },
    });
    if (updated.count === 1) return prisma.workerCheckpoint.findUnique({ where: { chave: key } });
  }
  throw checkpointError(CHECKPOINT_CONFLICT);
}

function ephemeralStore(prisma) {
  let values = ephemeralStores.get(prisma);
  if (!values) {
    values = new Map();
    ephemeralStores.set(prisma, values);
  }
  return {
    persistent: false,
    async read(key) {
      assertCheckpointKey(key);
      return values.has(key) ? structuredCloneSafe(values.get(key)) : null;
    },
    async write(key, cursor) {
      assertCheckpointKey(key);
      const normalized = decodeCursor(encodeCursor(cursor));
      values.set(key, normalized);
      return { chave: key, cursorJson: encodeCursor(normalized), revisao: 1 };
    },
    async clear(key) {
      assertCheckpointKey(key);
      values.delete(key);
      return { chave: key, cursorJson: null, revisao: 1 };
    },
  };
}

function scopedKey(prefix, ...ids) {
  const normalized = ids.map((value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw checkpointError("WORKER_CHECKPOINT_SCOPE_INVALID");
    return id;
  });
  return `${prefix}:${normalized.join(":")}`;
}

function assertCheckpointKey(key) {
  if (!ALLOWED_KEY.test(String(key || ""))) throw checkpointError("WORKER_CHECKPOINT_KEY_INVALID");
}

function encodeCursor(cursor) {
  if (cursor === null || cursor === undefined) return null;
  const normalized = normalizeCursorValue(cursor, 0);
  const text = JSON.stringify(normalized);
  if (Buffer.byteLength(text, "utf8") > MAX_CURSOR_JSON_BYTES) throw checkpointError("WORKER_CHECKPOINT_CURSOR_TOO_LARGE");
  return text;
}

function decodeCursor(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
  }
  return normalizeCursorValue(parsed, 0);
}

function normalizeCursorValue(value, depth) {
  if (depth > 3) throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > 20) throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
    return value.map((item) => normalizeCursorValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 20) throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
    const result = {};
    for (const [key, item] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)) throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
      result[key] = normalizeCursorValue(item, depth + 1);
    }
    return result;
  }
  throw checkpointError("WORKER_CHECKPOINT_CURSOR_INVALID");
}

function structuredCloneSafe(value) {
  return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function checkpointError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  CHECKPOINT_CONFLICT,
  KEYS,
  assertCheckpointKey,
  assertPersistentWorkerCheckpoints,
  createWorkerCheckpointStore,
  decodeCursor,
  encodeCursor,
};
