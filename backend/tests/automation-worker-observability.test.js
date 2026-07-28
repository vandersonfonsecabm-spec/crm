const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createAutomationService } = require("../src/automations/service");
const { automationProvider, startAutomationWorker } = require("../src/automations/worker");
const { createAutomationWorkerLogger } = require("../src/automations/worker-observability");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const service = createAutomationService({ prisma, env });
let sequence = 0;

before(cleanDatabase);
afterEach(cleanDatabase);
after(() => prisma.$disconnect());

test("worker registra startup uma vez e polling vazio sem ruido de job", async () => {
  assert.equal(automationProvider({ POSTGRES_DATABASE_URL: "postgresql://stored-but-inactive" }), "sqlite");
  assert.equal(automationProvider({ CRM_DATABASE_PROVIDER: "postgresql" }), "postgresql");
  const capture = logCapture();
  const scheduled = [];
  let cycleObserved;
  const cycleDone = new Promise((resolve) => {
    cycleObserved = resolve;
  });
  const worker = startAutomationWorker({
    service: {
      async processDueJobs() {
        cycleObserved();
        return { processed: 0, results: [] };
      },
    },
    env: {
      NODE_ENV: "production",
      AUTOMATION_WORKER_ENABLED: "true",
      AUTOMATION_WORKER_POLL_INTERVAL_MS: "1000",
      DATABASE_URL: "file:C:/sensitive/test.db",
    },
    workerId: "worker-observability-startup",
    logger: capture.logger,
    setTimeoutImpl: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    clearTimeoutImpl() {},
  });

  assert.equal(worker.started, true);
  scheduled[0]();
  await cycleDone;
  await flushTasks();
  await worker.stop();

  const entries = capture.entries();
  const startup = entries.filter((entry) => entry.event === "worker_started");
  assert.equal(startup.length, 1);
  assert.equal(startup[0].service, "automation-worker");
  assert.equal(startup[0].provider, "sqlite");
  assert.equal(startup[0].pollIntervalMs, 1000);
  assert.match(startup[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(entries.filter((entry) => entry.event === "worker_stopped").length, 1);
  assert.equal(entries.some((entry) => entry.event.startsWith("job_")), false);
  assert.equal(entries.some((entry) => entry.event.startsWith("polling_")), false);
  assert.doesNotMatch(capture.text(), /sensitive|test\.db/i);
});

test("worker_poll_error preserva diagnostico tecnico sem vazar dados sensiveis", async () => {
  const capture = logCapture();
  const scheduled = [];
  let pollObserved;
  const pollDone = new Promise((resolve) => {
    pollObserved = resolve;
  });
  const worker = startAutomationWorker({
    service: {
      async processDueJobs() {
        pollObserved();
        const error = new Error([
          "postgresql://db_user:db_password@private.example:5432/crm",
          "Bearer token-value-123",
          "cookie=session-secret",
          "customer@example.test",
          "+55 (11) 99999-8888",
          "token=top-secret",
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue",
        ].join(" "));
        error.code = "POLL_TEST_FAILURE";
        throw error;
      },
    },
    env: {
      NODE_ENV: "production",
      AUTOMATION_WORKER_ENABLED: "true",
      AUTOMATION_WORKER_POLL_INTERVAL_MS: "1000",
      CRM_DATABASE_PROVIDER: "postgresql",
    },
    workerId: "worker-observability-error",
    logger: capture.logger,
    setTimeoutImpl: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    clearTimeoutImpl() {},
  });

  scheduled[0]();
  await pollDone;
  await flushTasks();
  await worker.stop();

  const pollErrors = capture.entries().filter((entry) => entry.event === "worker_poll_error");
  assert.equal(pollErrors.length, 1);
  assert.equal(pollErrors[0].errorCode, "POLL_TEST_FAILURE");
  assert.equal(pollErrors[0].errorName, "Error");
  assert.ok(pollErrors[0].durationMs >= 0);
  assert.ok(pollErrors[0].errorMessage.length <= 240);
  assert.doesNotMatch(capture.text(), /db_password|token-value-123|session-secret|customer@example\.test|99999-8888|top-secret|eyJhbGci|private\.example/i);
});

test("sucesso registra ciclo transacional uma vez e sem payload sensivel", async () => {
  const tenant = await seedTenant("worker-logs-success");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Observabilidade de sucesso");
  await service.activateRule(context, rule.id);
  await service.produceAutomationEvent({
    tenantId: tenant.empresa.id,
    eventType: "LEAD_CREATED",
    sourceType: "PILOT_SYNTHETIC",
    sourceId: "worker-log-success",
    idempotencyKey: "worker-log-success",
    occurredAt: new Date(),
    payload: {
      name: "Pessoa customer@example.test token=payload-secret",
      origin: "+55 (11) 99999-7777",
    },
  });
  const capture = logCapture({ workerInstanceId: "worker-success" });

  const result = await service.processDueJobs({
    now: new Date(),
    leaseOwner: "worker-success",
    onEvent: capture.observer.event,
  });

  assert.equal(result.processed, 1);
  assert.deepEqual(
    capture.entries().map((entry) => entry.event),
    ["job_found", "job_claimed", "execution_started", "action_started", "action_succeeded", "job_succeeded"],
  );
  for (const event of ["job_claimed", "execution_started", "action_started", "action_succeeded", "job_succeeded"]) {
    assert.equal(capture.entries().filter((entry) => entry.event === event).length, 1);
  }
  const claimed = capture.entries().find((entry) => entry.event === "job_claimed");
  assert.equal(claimed.tenantId, tenant.empresa.id);
  assert.equal(claimed.ruleId, rule.id);
  assert.equal(claimed.actionType, "CREATE_INTERNAL_EVENT");
  assert.equal(claimed.triggerType, "LEAD_CREATED");
  assert.equal(claimed.attempt, 1);
  assert.equal(claimed.maxAttempts, 3);
  assert.ok(claimed.durationMs >= 0);
  const succeeded = capture.entries().find((entry) => entry.event === "job_succeeded");
  assert.ok(succeeded.eventId > 0);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id, status: "CONCLUIDO" } }), 1);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.doesNotMatch(capture.text(), /customer@example\.test|payload-secret|99999-7777/i);

  const previousLogCount = capture.entries().length;
  await service.processDueJobs({
    now: new Date(),
    leaseOwner: "worker-success",
    onEvent: capture.observer.event,
  });
  assert.equal(capture.entries().length, previousLogCount);
});

test("claim concorrente registra somente o claim realmente confirmado", async () => {
  const tenant = await seedTenant("worker-logs-claim");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Claim observavel");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "worker-claim-race",
    occurredAt: lead.createdAt,
  });
  const capture = logCapture({ workerInstanceId: "worker-claim-race" });
  const now = new Date();

  const results = await Promise.all([
    service.processDueJobs({ now, limit: 1, leaseOwner: "worker-claim-a", onEvent: capture.observer.event }),
    service.processDueJobs({ now, limit: 1, leaseOwner: "worker-claim-b", onEvent: capture.observer.event }),
  ]);

  assert.equal(results[0].processed + results[1].processed, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_claimed").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_succeeded").length, 1);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 1);
});

test("falha transitoria registra retry e depois tentativas esgotadas", async () => {
  const tenant = await seedTenant("worker-logs-retry");
  const context = adminContext(tenant);
  const rule = await service.createRule(context, {
    nome: "Retry observavel",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds: [2147483000] }],
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "worker-retry",
    occurredAt: lead.createdAt,
  });
  const capture = logCapture({ workerInstanceId: "worker-retry" });
  const firstNow = new Date(Date.now() + 1000);

  await service.processDueJobs({
    now: firstNow,
    leaseOwner: "worker-retry",
    maxAttempts: 2,
    retryDelayMs: 1000,
    supportedActions: ["ASSIGN_ROUND_ROBIN"],
    onEvent: capture.observer.event,
  });

  const firstEvents = capture.entries().map((entry) => entry.event);
  assert.deepEqual(firstEvents, [
    "job_found",
    "job_claimed",
    "execution_started",
    "action_started",
    "action_failed",
    "job_failed",
    "job_retry_scheduled",
  ]);
  assert.equal(firstEvents.includes("job_succeeded"), false);
  let job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  assert.equal(job.status, "FALHOU");
  assert.ok(job.nextAttemptAt > firstNow);

  const beforeFinalAttempt = capture.entries().length;
  await service.processDueJobs({
    now: new Date(firstNow.getTime() + 2000),
    leaseOwner: "worker-retry",
    maxAttempts: 2,
    retryDelayMs: 1000,
    supportedActions: ["ASSIGN_ROUND_ROBIN"],
    onEvent: capture.observer.event,
  });

  const finalEvents = capture.entries().slice(beforeFinalAttempt).map((entry) => entry.event);
  assert.deepEqual(finalEvents, [
    "job_found",
    "job_claimed",
    "execution_started",
    "action_started",
    "action_failed",
    "job_failed",
    "job_attempts_exhausted",
  ]);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_retry_scheduled").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_attempts_exhausted").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_succeeded").length, 0);
  job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  assert.equal(job.status, "FALHA_DEFINITIVA");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("lease recuperado e registrado somente depois da expiracao real", async () => {
  const tenant = await seedTenant("worker-logs-lease");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Lease observavel");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "worker-lease",
    occurredAt: lead.createdAt,
  });
  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  const now = new Date(Date.now() + 1000);
  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSANDO",
      leaseOwner: "worker-busy",
      leaseExpiresAt: new Date(now.getTime() + 60000),
      tentativas: 1,
    },
  });
  const capture = logCapture({ workerInstanceId: "worker-lease" });

  const locked = await service.processDueJobs({
    now,
    leaseOwner: "worker-lease",
    onEvent: capture.observer.event,
  });
  assert.equal(locked.processed, 0);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_lease_recovered").length, 0);

  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: { leaseExpiresAt: new Date(now.getTime() - 1000) },
  });
  const recovered = await service.processDueJobs({
    now,
    leaseOwner: "worker-lease",
    onEvent: capture.observer.event,
  });

  assert.equal(recovered.processed, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_lease_recovered").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_claimed").length, 1);
  assert.ok(
    capture.entries().findIndex((entry) => entry.event === "job_lease_recovered")
      < capture.entries().findIndex((entry) => entry.event === "job_claimed"),
  );
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 1);
});

function logCapture({ workerInstanceId = "worker-observability", provider = "sqlite" } = {}) {
  const lines = [];
  const logger = {
    log(line) {
      lines.push(line);
    },
    error(line) {
      lines.push(line);
    },
  };
  const observer = createAutomationWorkerLogger({ logger, workerInstanceId, provider });
  return {
    logger,
    observer,
    entries: () => lines.map((line) => JSON.parse(line)),
    text: () => lines.join("\n"),
  };
}

async function flushTasks() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function adminContext(tenant) {
  return { empresaId: tenant.empresa.id, usuarioId: tenant.admin.id, papel: "ADMIN" };
}

async function seedTenant(label) {
  const slug = `${label}-${process.pid}-${++sequence}`;
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa ${slug}`, slug } });
  const admin = await prisma.usuario.create({
    data: {
      empresaId: empresa.id,
      nome: "Admin Observability",
      email: `admin.${process.pid}.${++sequence}@worker.test`,
      senhaHash: "hash-test",
      papel: "ADMIN",
      ativo: true,
    },
  });
  await prisma.empresaFuncionalidade.create({
    data: {
      empresaId: empresa.id,
      chave: "AUTOMATIONS",
      habilitada: true,
      habilitadoEm: new Date(),
      habilitadoPorUsuarioId: admin.id,
    },
  });
  return { empresa, admin };
}

async function seedLead(tenant) {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Cliente Observability ${++sequence}`,
      telefone: "",
      email: "",
      empresa: "QA",
      interesse: "Automacao",
      origem: "QA",
    },
  });
  return prisma.lead.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: cliente.id,
      status: "NOVO",
      origem: "SITE",
      interesse: "Automacao",
    },
  });
}

async function internalEventRule(context, nome) {
  return service.createRule(context, {
    nome,
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "LEAD_CREATED_TEST", resumo: "Evento tecnico." }],
  });
}

async function cleanDatabase() {
  await prisma.automacaoEventoInterno.deleteMany();
  await prisma.automacaoAcaoJob.deleteMany();
  await prisma.automacaoExecucao.deleteMany();
  await prisma.automacaoRoundRobinEstado.deleteMany();
  await prisma.automacaoRegra.deleteMany();
  await prisma.historicoAcompanhamento.deleteMany();
  await prisma.acompanhamento.deleteMany();
  await prisma.historicoAtribuicao.deleteMany();
  await prisma.negocio.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.empresaFuncionalidade.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.empresa.deleteMany();
}
