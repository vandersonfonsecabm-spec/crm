const JOB_STATUSES = ["PENDENTE", "PROCESSANDO", "CONCLUIDO", "FALHOU", "FALHA_DEFINITIVA", "CANCELADO"];
const EXECUTION_STATUSES = ["PENDENTE", "PROCESSANDO", "CONCLUIDA", "FALHOU", "FALHA_DEFINITIVA", "CANCELADA", "SIMULADA"];
const WEBHOOK_STATUSES = ["RECEBIDO", "PROCESSANDO", "PROCESSADO", "FALHOU", "IGNORADO_DUPLICADO"];
const EMAIL_OUTBOX_STATUSES = ["PENDING", "PROCESSING", "RETRY_WAIT", "DELIVERED", "FAILED", "BOUNCED", "EXPIRED", "CANCELLED"];
const STOCK_OUTBOX_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "QUARANTINED"];
const DEFAULT_WORKER_STALE_MS = 5 * 60 * 1000;
const OPERATIONAL_CHECKPOINT_SUBSYSTEMS = Object.freeze([
  { key: "automation", prefix: "automation:" },
  { key: "notifications", prefix: "notifications:" },
  { key: "stock", prefix: "stock:" },
  { key: "email", prefix: "email:" },
]);

function createPlatformObservabilityService({ prisma }) {
  if (!prisma) throw new Error("Prisma obrigatorio para observabilidade da plataforma.");

  async function summary({ now = new Date() } = {}) {
    const [checkpoints, jobs, executions, webhooks, emailOutbox, stockOutbox, integrationErrors, lastIntegrationError, credentials, integrationCredentials, activeLeases, expiredLeases, retryingJobs] = await Promise.all([
      prisma.workerCheckpoint.findMany({ select: { chave: true, updatedAt: true } }),
      prisma.automacaoAcaoJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.automacaoExecucao.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.eventoWebhook.groupBy({ by: ["statusProcessamento"], _count: { _all: true } }),
      prisma.emailDeliveryOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.eventoOutboxEstoque.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.erroIntegracao.count({ where: { resolvido: false } }),
      prisma.erroIntegracao.findFirst({ where: { resolvido: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      prisma.metaCredential.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.integracao.groupBy({ by: ["status"], where: { credenciaisCriptografadas: { not: null } }, _count: { _all: true } }),
      countLiveLeases(now),
      countExpiredLeases(now),
      prisma.automacaoAcaoJob.count({ where: { status: "FALHOU", nextAttemptAt: { not: null } } }),
    ]);

    const operationalCheckpoints = checkpoints.filter((row) => isOperationalCheckpointKey(row.chave));
    const checkpointHealth = workerHealthBySubsystem(operationalCheckpoints, now);
    return {
      generatedAt: new Date(now).toISOString(),
      worker: {
        checkpointCount: operationalCheckpoints.length,
        lastCheckpointAt: latestTimestamp(operationalCheckpoints.map((row) => row.updatedAt)),
        health: checkpointHealth.health,
        healthBySubsystem: checkpointHealth.bySubsystem,
        staleAfterSeconds: DEFAULT_WORKER_STALE_MS / 1000,
        activeLeases,
        expiredLeases,
      },
      jobs: countMap(jobs),
      executions: countMap(executions),
      retryingJobs,
      credentials: countMap([...credentials, ...integrationCredentials]),
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
      prisma.operacaoDistribuidaLease.count({ where: { expiresAt: { gt: now } } }),
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
      prisma.operacaoDistribuidaLease.count({ where: { expiresAt: { lt: now } } }),
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
  return rows.reduce((result, row) => {
    const key = Object.values(row).find((value) => typeof value === "string") || "UNKNOWN";
    result[key] = (result[key] || 0) + Number(row._count?._all || 0);
    return result;
  }, {});
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

function isOperationalCheckpointKey(value) {
  const key = String(value || "");
  return OPERATIONAL_CHECKPOINT_SUBSYSTEMS.some(({ prefix }) => key.startsWith(prefix));
}

function workerHealthBySubsystem(rows, now) {
  const bySubsystem = {};
  for (const subsystem of OPERATIONAL_CHECKPOINT_SUBSYSTEMS) {
    const matching = rows.filter((row) => String(row.chave || "").startsWith(subsystem.prefix));
    const last = latestTimestamp(matching.map((row) => row.updatedAt));
    bySubsystem[subsystem.key] = last ? workerHealth(last, now) : "UNKNOWN";
  }
  const observed = Object.values(bySubsystem).filter((value) => value !== "UNKNOWN");
  const health = observed.length === 0
    ? "UNKNOWN"
    : observed.some((value) => value === "STALE")
      ? "STALE"
      : observed.every((value) => value === "HEALTHY") ? "HEALTHY" : "UNKNOWN";
  return { health, bySubsystem };
}

module.exports = {
  createPlatformObservabilityService,
  JOB_STATUSES,
  EXECUTION_STATUSES,
  WEBHOOK_STATUSES,
  EMAIL_OUTBOX_STATUSES,
  STOCK_OUTBOX_STATUSES,
  DEFAULT_WORKER_STALE_MS,
  isOperationalCheckpointKey,
  workerHealthBySubsystem,
};
