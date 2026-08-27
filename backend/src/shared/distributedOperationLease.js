const crypto = require("node:crypto");

const DEFAULT_TTL_MS = 45_000;
const DEFAULT_HEARTBEAT_MS = 10_000;

function createDistributedOperationLease({
  prisma,
  clock = () => new Date(),
  ttlMs = DEFAULT_TTL_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
} = {}) {
  if (!prisma?.operacaoDistribuidaLease) throw new Error("DISTRIBUTED_LEASE_STORE_REQUIRED");

  async function withLease({ empresaId, namespace, resourceKey }, handler) {
    const key = normalizeKey(empresaId, namespace, resourceKey);
    const ownerToken = crypto.randomUUID();
    const controller = new AbortController();
    let released = false;
    let heartbeatRunning = false;
    let heartbeatTimer = null;
    let lostError = null;

    await acquire(key, ownerToken);

    const context = {
      ownerToken,
      signal: controller.signal,
      async heartbeat() {
        assertNotLost();
        const now = clock();
        const result = await prisma.operacaoDistribuidaLease.updateMany({
          where: {
            ...key,
            ownerToken,
            expiresAt: { gt: now },
          },
          data: {
            heartbeatAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        });
        if (result.count !== 1) markLost();
        assertNotLost();
      },
      async fencedTransaction(callback) {
        assertNotLost();
        return prisma.$transaction(async (tx) => {
          const now = clock();
          const owned = await tx.operacaoDistribuidaLease.updateMany({
            where: {
              ...key,
              ownerToken,
              expiresAt: { gt: now },
            },
            data: {
              heartbeatAt: now,
              expiresAt: new Date(now.getTime() + ttlMs),
            },
          });
          if (owned.count !== 1) {
            markLost();
            throw lostError;
          }
          return callback(tx);
        });
      },
      assertOwned() {
        assertNotLost();
      },
    };

    heartbeatTimer = setInterval(async () => {
      if (released || heartbeatRunning || lostError) return;
      heartbeatRunning = true;
      try {
        await context.heartbeat();
      } catch {
        markLost();
      } finally {
        heartbeatRunning = false;
      }
    }, Math.max(250, heartbeatMs));
    heartbeatTimer.unref?.();

    try {
      return await handler(context);
    } finally {
      released = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      await prisma.operacaoDistribuidaLease.deleteMany({
        where: { ...key, ownerToken },
      }).catch(() => undefined);
    }

    function markLost() {
      if (lostError) return;
      lostError = leaseError("DISTRIBUTED_LEASE_LOST", "A operação perdeu sua coordenação distribuída.", 409);
      controller.abort(lostError);
    }

    function assertNotLost() {
      if (lostError) throw lostError;
    }
  }

  async function acquire(key, ownerToken) {
    const now = clock();
    const data = {
      ...key,
      ownerToken,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };

    try {
      await prisma.operacaoDistribuidaLease.create({ data });
      return;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }

    const claimed = await prisma.operacaoDistribuidaLease.updateMany({
      where: {
        ...key,
        expiresAt: { lte: now },
      },
      data: {
        ownerToken,
        heartbeatAt: now,
        expiresAt: data.expiresAt,
      },
    });
    if (claimed.count !== 1) {
      throw leaseError("INTEGRATION_OPERATION_IN_PROGRESS", "Já existe uma operação em andamento para esta integração.", 409);
    }
  }

  return { withLease };
}

function normalizeKey(empresaId, namespace, resourceKey) {
  const safeEmpresaId = Number(empresaId);
  const safeNamespace = String(namespace || "").trim();
  const safeResourceKey = String(resourceKey || "").trim();
  if (!Number.isSafeInteger(safeEmpresaId) || safeEmpresaId < 1 || !/^[A-Z][A-Z0-9_]{1,63}$/.test(safeNamespace) || !safeResourceKey || safeResourceKey.length > 180) {
    throw leaseError("DISTRIBUTED_LEASE_KEY_INVALID", "Chave de coordenação distribuída inválida.", 500);
  }
  return { empresaId: safeEmpresaId, namespace: safeNamespace, resourceKey: safeResourceKey };
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

function leaseError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

module.exports = {
  createDistributedOperationLease,
  _private: { normalizeKey, isUniqueConflict },
};
