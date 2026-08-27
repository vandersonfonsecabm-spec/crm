const { test } = require("node:test");
const assert = require("node:assert/strict");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";

test("PostgreSQL coordena lease Bling entre dois PrismaClient e aplica fencing apos expiry", { skip: !postgres }, async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = requiredPostgresUrl();

  const { PrismaClient } = require("@prisma/client");
  const { createDistributedOperationLease } = require("../src/shared/distributedOperationLease");
  const firstClient = new PrismaClient();
  const secondClient = new PrismaClient();
  const firstManager = createDistributedOperationLease({ prisma: firstClient, ttlMs: 80, heartbeatMs: 10_000 });
  const secondManager = createDistributedOperationLease({ prisma: secondClient, ttlMs: 80, heartbeatMs: 10_000 });
  const suffix = `${Date.now()}-${process.pid}`;
  let empresaId;

  try {
    const empresa = await firstClient.empresa.create({
      data: { nome: `Bling Lease PG ${suffix}`, slug: `bling-lease-pg-${suffix}` },
    });
    empresaId = empresa.id;
    const key = { empresaId, namespace: "INTEGRATION_OPERATION", resourceKey: "bling-test" };

    let releaseFirst;
    let firstEntered;
    const firstReady = new Promise((resolve) => { firstEntered = resolve; });
    const firstHold = new Promise((resolve) => { releaseFirst = resolve; });
    const firstRun = firstManager.withLease(key, async () => {
      firstEntered();
      await firstHold;
    });
    await firstReady;
    await assert.rejects(
      () => secondManager.withLease(key, async () => undefined),
      (error) => error.code === "INTEGRATION_OPERATION_IN_PROGRESS" && error.status === 409,
    );
    releaseFirst();
    await firstRun;

    let staleContext;
    await firstManager.withLease(key, async (lease) => {
      staleContext = lease;
      await delay(110);

      let releaseSecond;
      let secondEntered;
      const secondReady = new Promise((resolve) => { secondEntered = resolve; });
      const secondHold = new Promise((resolve) => { releaseSecond = resolve; });
      const secondRun = secondManager.withLease(key, async (secondLease) => {
        await secondLease.fencedTransaction((tx) => tx.operacaoDistribuidaLease.count({ where: { empresaId } }));
        secondEntered();
        await secondHold;
      });
      await secondReady;

      await assert.rejects(
        () => staleContext.fencedTransaction((tx) => tx.operacaoDistribuidaLease.count({ where: { empresaId } })),
        (error) => error.code === "DISTRIBUTED_LEASE_LOST",
      );
      releaseSecond();
      await secondRun;
    });

    assert.equal(await firstClient.operacaoDistribuidaLease.count({ where: { empresaId } }), 0);
  } finally {
    try {
      if (empresaId) {
        await firstClient.operacaoDistribuidaLease.deleteMany({ where: { empresaId } });
        await firstClient.empresa.delete({ where: { id: empresaId } });
      }
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
    }
  }
});

function requiredPostgresUrl() {
  const value = String(process.env.CRM_TEST_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("CRM_TEST_DATABASE_URL PostgreSQL obrigatoria.");
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
