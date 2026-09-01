const JOB_STATUSES = ["PENDENTE", "PROCESSANDO", "CONCLUIDO", "FALHOU", "FALHA_DEFINITIVA", "CANCELADO"];
const EXECUTION_STATUSES = ["PENDENTE", "PROCESSANDO", "CONCLUIDA", "FALHOU", "FALHA_DEFINITIVA", "CANCELADA", "SIMULADA"];
const WEBHOOK_STATUSES = ["RECEBIDO", "PROCESSANDO", "PROCESSADO", "FALHOU", "IGNORADO_DUPLICADO"];
const EMAIL_OUTBOX_STATUSES = ["PENDING", "PROCESSING", "RETRY_WAIT", "DELIVERED", "FAILED", "BOUNCED", "EXPIRED", "CANCELLED"];
const STOCK_OUTBOX_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "QUARANTINED"];
const DEFAULT_WORKER_STALE_MS = 5 * 60 * 1000;

function createPlatformObservabilityService({ prisma }) {
  if (!prisma) throw new Error("Prisma obrigatorio para observabilidade da plataforma.");

  async function summary({ now = new Date() } = {}) {
    const [checkpoints, jobs, executions, webhooks, emailOutbox, stockOutbox, integrationErrors, lastIntegrationError, credentials, activeLeases, expiredLeases, retryingJobs] = await Promise.all([
      prisma.workerCheckpoint.findMany({ select: { updatedAt: true } }),
      prisma.automacaoAcaoJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.automacaoExecucao.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.eventoWebhook.groupBy({ by: ["statusProcessamento"], _count: { _all: true } }),
      prisma.emailDeliveryOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.eventoOutboxEstoque.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.erroIntegracao.count({ where: { resolvido: false } }),
      prisma.erroIntegracao.findFirst({ where: { resolvido: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      prisma.metaCredential.groupBy({ by: ["status"], _count: { _all: true } }),
      countLiveLeases(now),
      countExpiredLeases(now),
      prisma.automacaoAcaoJob.count({ where: { status: "FALHOU", nextAttemptAt: { not: null } } }),
    ]);

    return {
      generatedAt: new Date(now).toISOString(),
      worker: {
        checkpointCount: checkpoints.length,
        lastCheckpointAt: latestTimestamp(checkpoints.map((row) => row.updatedAt)),
        health: workerHealth(latestTimestamp(checkpoints.map((row) => row.updatedAt)), now),
        staleAfterSeconds: DEFAULT_WORKER_STALE_MS / 1000,
        activeLeases,
        expiredLeases,
      },
      jobs: countMap(jobs),
      executions: countMap(executions),
      retryingJobs,
      credentials: countMap(credentials),
      webhooks: countMap(webhooks),
      outbox: {
        email: countMap(emailOutbox),
        stock: countMap(stockOutbox),
      },
      unresolvedIntegrationErrors: integrationErrors,
      lastIntegrationErrorAt: lastIntegrationError?.createdAt instanceof Date ? lastIntegrationError.createdAt.toISOString() : lastIntegrationError?.createdAt ? new Date(lastIntegrationError.createdAt).toISOString() : null,
    };
  }

  async function countLiveLeases(now) {
    const where = { leaseOwner: { not: null }, leaseExpiresAt: { gt: now } };
    const counts = await Promise.all([
      prisma.automacaoAcaoJob.count({ where }),
      prisma.eventoWebhook.count({ where }),
      prisma.emailDeliveryOutbox.count({ where }),
      prisma.eventoOutboxEstoque.count({ where }),
    ]);
    return counts.reduce((total, value) => total + value, 0);
  }

  async function countExpiredLeases(now) {
    const where = { leaseOwner: { not: null }, leaseExpiresAt: { lt: now } };
    const counts = await Promise.all([
      prisma.automacaoAcaoJob.count({ where }),
      prisma.eventoWebhook.count({ where }),
      prisma.emailDeliveryOutbox.count({ where }),
      prisma.eventoOutboxEstoque.count({ where }),
    ]);
    return counts.reduce((total, value) => total + value, 0);
  }

  return { summary };
}

function countMap(rows) {
  return Object.fromEntries(rows.map((row) => [Object.values(row).find((value) => typeof value === "string") || "UNKNOWN", Number(row._count?._all || 0)]));
}

function latestTimestamp(values) {
  const timestamps = values.map((value) => value instanceof Date ? value.getTime() : Date.parse(String(value || ""))).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function workerHealth(lastCheckpointAt, now) {
  if (!lastCheckpointAt) return "UNKNOWN";
  const age = (now instanceof Date ? now.getTime() : Date.parse(String(now))) - Date.parse(lastCheckpointAt);
  if (age < 0) return "UNKNOWN";
  return age <= DEFAULT_WORKER_STALE_MS ? "HEALTHY" : "STALE";
}

module.exports = {
  createPlatformObservabilityService,
  JOB_STATUSES,
  EXECUTION_STATUSES,
  WEBHOOK_STATUSES,
  EMAIL_OUTBOX_STATUSES,
  STOCK_OUTBOX_STATUSES,
  DEFAULT_WORKER_STALE_MS,
};
