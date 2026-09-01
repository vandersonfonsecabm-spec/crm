const assert = require("node:assert/strict");
const test = require("node:test");
const { createPlatformObservabilityService } = require("../src/platform/observability");

test("observabilidade de plataforma agrega somente contadores sanitizados", async () => {
  const now = new Date("2026-09-01T03:00:00.000Z");
  const model = (rows = []) => ({
    findMany: async () => rows,
    groupBy: async () => rows,
    count: async () => rows.length,
  });
  const prisma = {
    workerCheckpoint: { findMany: async () => [
      { chave: "automation:temporal:tenants", updatedAt: new Date("2026-09-01T02:59:00.000Z") },
      { chave: "qa:lease", updatedAt: new Date("2026-09-01T02:59:59.000Z") },
    ] },
    automacaoAcaoJob: {
      groupBy: async () => [{ status: "PENDENTE", _count: { _all: 2 } }, { status: "FALHOU", _count: { _all: 1 } }],
      count: async (args) => args.where.nextAttemptAt ? 1 : 0,
    },
    automacaoExecucao: { groupBy: async () => [{ status: "PROCESSANDO", _count: { _all: 1 } }] },
    eventoWebhook: {
      groupBy: async () => [{ statusProcessamento: "FALHOU", _count: { _all: 1 } }],
      count: async () => 0,
    },
    emailDeliveryOutbox: { groupBy: async () => [], count: async () => 0 },
    eventoOutboxEstoque: { groupBy: async () => [], count: async () => 0 },
    erroIntegracao: { count: async () => 3, findFirst: async () => ({ createdAt: new Date("2026-09-01T02:58:00.000Z") }) },
    metaCredential: { groupBy: async () => [{ status: "ERRO", _count: { _all: 1 } }, { status: "ATIVA", _count: { _all: 3 } }] },
    integracao: { groupBy: async () => [{ status: "ATIVA", _count: { _all: 2 } }] },
    operacaoDistribuidaLease: { count: async ({ where }) => where.expiresAt.gt ? 2 : 1 },
  };
  const result = await createPlatformObservabilityService({ prisma }).summary({ now });
  assert.equal(result.generatedAt, now.toISOString());
  assert.equal(result.worker.checkpointCount, 1);
  assert.equal(result.worker.health, "HEALTHY");
  assert.equal(result.worker.healthBySubsystem.automation, "HEALTHY");
  assert.equal(result.worker.healthBySubsystem.notifications, "UNKNOWN");
  assert.equal(result.worker.healthBySubsystem.stock, "UNKNOWN");
  assert.equal(result.worker.healthBySubsystem.email, "UNKNOWN");
  assert.equal(result.worker.staleAfterSeconds, 300);
  assert.equal(result.worker.activeLeases, 2);
  assert.equal(result.worker.expiredLeases, 1);
  assert.equal(result.jobs.PENDENTE, 2);
  assert.equal(result.retryingJobs, 1);
  assert.equal(result.executions.PROCESSANDO, 1);
  assert.equal(result.credentials.ERRO, 1);
  assert.equal(result.credentials.ATIVA, 5);
  assert.equal(result.webhooks.FALHOU, 1);
  assert.equal(result.unresolvedIntegrationErrors, 3);
  assert.equal(result.lastIntegrationErrorAt, "2026-09-01T02:58:00.000Z");
  assert.equal(Object.hasOwn(result.worker, "cursorJson"), false);
});

test("saude ignora checkpoint de lock ou subsistema fora do worker operacional", async () => {
  const now = new Date("2026-09-01T03:00:00.000Z");
  const prisma = {
    workerCheckpoint: { findMany: async () => [
      { chave: "automation:temporal:tenants", updatedAt: new Date("2026-09-01T01:00:00.000Z") },
      { chave: "qa:lease", updatedAt: new Date("2026-09-01T02:59:00.000Z") },
    ] },
    automacaoAcaoJob: { groupBy: async () => [], count: async () => 0 },
    automacaoExecucao: { groupBy: async () => [] },
    eventoWebhook: { groupBy: async () => [], count: async () => 0 },
    emailDeliveryOutbox: { groupBy: async () => [], count: async () => 0 },
    eventoOutboxEstoque: { groupBy: async () => [], count: async () => 0 },
    erroIntegracao: { count: async () => 0, findFirst: async () => null },
    metaCredential: { groupBy: async () => [] },
    integracao: { groupBy: async () => [] },
    operacaoDistribuidaLease: { count: async () => 0 },
  };
  const result = await createPlatformObservabilityService({ prisma }).summary({ now });
  assert.equal(result.worker.health, "STALE");
  assert.equal(result.worker.healthBySubsystem.automation, "STALE");
  assert.equal(result.worker.healthBySubsystem.notifications, "UNKNOWN");
  assert.equal(result.worker.checkpointCount, 1);
});
