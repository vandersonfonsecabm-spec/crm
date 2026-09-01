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
    workerCheckpoint: { findMany: async () => [{ updatedAt: new Date("2026-09-01T02:59:00.000Z") }] },
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
    metaCredential: { groupBy: async () => [{ status: "ERRO", _count: { _all: 1 } }] },
  };
  const result = await createPlatformObservabilityService({ prisma }).summary({ now });
  assert.equal(result.generatedAt, now.toISOString());
  assert.equal(result.worker.checkpointCount, 1);
  assert.equal(result.worker.health, "HEALTHY");
  assert.equal(result.worker.staleAfterSeconds, 300);
  assert.equal(result.worker.activeLeases, 0);
  assert.equal(result.jobs.PENDENTE, 2);
  assert.equal(result.retryingJobs, 1);
  assert.equal(result.executions.PROCESSANDO, 1);
  assert.equal(result.credentials.ERRO, 1);
  assert.equal(result.webhooks.FALHOU, 1);
  assert.equal(result.unresolvedIntegrationErrors, 3);
  assert.equal(result.lastIntegrationErrorAt, "2026-09-01T02:58:00.000Z");
  assert.equal(Object.hasOwn(result.worker, "cursorJson"), false);
});
