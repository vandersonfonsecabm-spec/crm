const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createAutomationService } = require("../src/automations/service");
const { automationProvider, preflightWorkerDatabase, startAutomationWorker } = require("../src/automations/worker");
const {
  MAX_ERROR_MESSAGE_LENGTH,
  createAutomationWorkerLogger,
  sanitizeErrorMessage,
} = require("../src/automations/worker-observability");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const service = createAutomationService({ prisma, env });
const CALLBACK_FIELDS = new Set([
  "event",
  "tenantId",
  "ruleId",
  "jobId",
  "executionId",
  "eventId",
  "actionType",
  "triggerType",
  "attempt",
  "maxAttempts",
  "status",
  "durationMs",
  "retryAt",
  "leaseUntil",
  "final",
  "willRetry",
  "permanent",
  "retryable",
  "failureReason",
  "errorClass",
  "errorCode",
  "errorName",
  "errorMessage",
]);
let sequence = 0;

before(cleanDatabase);
afterEach(cleanDatabase);
after(() => prisma.$disconnect());

test("preflight do worker usa timeout finito do probe de banco", async () => {
  const calls = [];
  await preflightWorkerDatabase({
    prisma: { marker: "worker" },
    env: { CRM_DATABASE_PROVIDER: "postgresql" },
    queryDatabase: async (options) => { calls.push(options); },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prisma.marker, "worker");
  assert.equal(calls[0].env.CRM_DATABASE_PROVIDER, "postgresql");
  assert.equal(calls[0].timeoutMs, 5000);
});

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
  assert.equal(startup[0].status, "started");
  assert.match(startup[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  const stopped = entries.filter((entry) => entry.event === "worker_stopped");
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].status, "stopped");
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
  assert.equal(pollErrors[0].errorCode, "UNKNOWN_ERROR");
  assert.equal(pollErrors[0].errorName, "Error");
  assert.ok(pollErrors[0].durationMs >= 0);
  assert.ok(pollErrors[0].errorMessage.length <= 240);
  assert.doesNotMatch(capture.text(), /db_password|token-value-123|session-secret|customer@example\.test|99999-8888|top-secret|eyJhbGci|private\.example/i);
});

test("sanitizacao cobre headers compostos, credenciais, PII e payload Prisma", () => {
  const cases = [
    ["Cookie: session=abc; refresh=def; tracking=ghi", ["session=abc", "refresh=def", "tracking=ghi"]],
    ["Set-Cookie: session=abc; Path=/; HttpOnly; Secure; SameSite=Lax", ["session=abc", "Path=/", "SameSite=Lax"]],
    ["Authorization: Basic dXNlcjpwYXNz", ["dXNlcjpwYXNz"]],
    ["Authorization: Bearer bearer-value-123", ["bearer-value-123"]],
    ["JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue", ["eyJhbGci"]],
    ["URL https://private.example/path?token=url-secret", ["private.example", "url-secret"]],
    ["DB postgresql://db_user:db_password@private.example:5432/crm", ["db_user", "db_password", "private.example"]],
    ["PII customer@example.test +55 (11) 99999-8888 123.456.789-00 12.345.678/0001-90", [
      "customer@example.test",
      "99999-8888",
      "123.456.789-00",
      "12.345.678/0001-90",
    ]],
    ["password=pass-secret secret=secret-value token=token-value apiKey=api-key-value", [
      "pass-secret",
      "secret-value",
      "token-value",
      "api-key-value",
    ]],
    ['PrismaClientKnownRequestError meta={"target":["email"],"data":{"name":"Pessoa Privada","email":"person@example.test"}} args={"url":"postgresql://u:p@db.internal/crm"}', [
      "target",
      "Pessoa Privada",
      "person@example.test",
      "db.internal",
    ]],
  ];

  for (const [message, forbidden] of cases) {
    const sanitized = sanitizeErrorMessage(message);
    assert.ok(sanitized.length <= MAX_ERROR_MESSAGE_LENGTH);
    for (const value of forbidden) assert.equal(sanitized.includes(value), false, `${value} permaneceu em ${sanitized}`);
  }
  assert.equal(sanitizeErrorMessage("x".repeat(MAX_ERROR_MESSAGE_LENGTH + 100)).length, MAX_ERROR_MESSAGE_LENGTH);
});

test("logger reduz erro Prisma arbitrario a diagnostico tecnico seguro", () => {
  const capture = logCapture();
  const error = new Error('PrismaClientKnownRequestError meta={"target":["email"],"data":{"name":"Pessoa Privada"}} postgresql://u:p@db.internal/crm');
  error.name = "PrismaClientKnownRequestError";
  error.code = "P2002";
  error.meta = { target: ["email"], data: { name: "Pessoa Privada" } };

  capture.observer.error("worker_poll_error", error, { durationMs: 1 });

  const entry = capture.entries()[0];
  assert.equal(entry.errorCode, "P2002");
  assert.equal(entry.errorName, "PrismaClientKnownRequestError");
  assert.equal(entry.errorClass, "PRISMA");
  assert.equal(entry.errorMessage, "Database operation failed.");
  assert.doesNotMatch(capture.text(), /Pessoa Privada|"target"|"meta"|"data"|db\.internal|postgresql:/i);
});

test("logger fecha o envelope contra campos e identificadores arbitrarios", () => {
  const capture = logCapture();
  const rawError = new Error("raw-error-secret");
  rawError.code = "RAW_SECRET";
  assert.equal(capture.observer.event(rawError), false);
  assert.equal(capture.entries().length, 0);

  capture.observer.info("worker_poll_error", {
    durationMs: 1,
    errorCode: `customer@example.test Bearer injected-token https://private.example ${"x".repeat(200)}`,
    errorName: '{"password":"name-secret"}',
    errorClass: "postgresql://user:password@private.example/crm",
    failureReason: "token=failure-secret",
    errorMessage: "callback-message customer@example.test secret=message-secret",
    stack: "stack secret=stack-secret",
    cause: new Error("cause-secret"),
    request: { headers: { authorization: "Basic dXNlcjpwYXNz" } },
    response: { headers: { "set-cookie": "session=response-secret" } },
    headers: { cookie: "session=header-secret" },
    config: { password: "config-secret" },
    env: { JWT_SECRET: "env-secret" },
    meta: { target: ["email"] },
    target: ["email"],
    args: { data: { email: "args@example.test" } },
    data: { email: "data@example.test" },
    payload: { email: "payload@example.test" },
    unknownField: "unknown-secret",
  });

  const entry = capture.entries()[0];
  assert.equal(entry.errorCode, "UNKNOWN_ERROR");
  assert.equal(entry.errorName, "Error");
  assert.equal(entry.errorClass, "UNEXPECTED");
  assert.equal(entry.failureReason, "UNKNOWN_ERROR");
  assert.equal(entry.errorMessage, "Automation worker operation failed.");
  for (const field of [
    "stack",
    "cause",
    "request",
    "response",
    "headers",
    "config",
    "env",
    "meta",
    "target",
    "args",
    "data",
    "payload",
    "unknownField",
  ]) {
    assert.equal(Object.hasOwn(entry, field), false, `${field} atravessou o envelope`);
  }
  assert.doesNotMatch(
    capture.text(),
    /customer@example|injected-token|private\.example|name-secret|failure-secret|message-secret|stack-secret|cause-secret|dXNlcjpwYXNz|response-secret|header-secret|config-secret|env-secret|args@example|data@example|payload@example|unknown-secret/i,
  );
});

test("logger restringe identificadores operacionais a dominios conhecidos", () => {
  const capture = logCapture({
    workerInstanceId: "worker@example.test",
    provider: "postgresql://user:password@private.example/crm",
  });
  capture.observer.info("Bearer event-secret", {
    actionType: "action-secret@example.test",
    triggerType: "token=trigger-secret",
    status: "https://private.example/status",
  });

  assert.deepEqual(capture.entries()[0], {
    event: "worker_event",
    timestamp: capture.entries()[0].timestamp,
    service: "automation-worker",
    workerInstanceId: "worker-unknown",
    provider: "unknown",
    actionType: "UNKNOWN_ACTION",
    triggerType: "UNKNOWN_TRIGGER",
    status: "UNKNOWN_STATUS",
  });
  assert.doesNotMatch(capture.text(), /worker@example|private\.example|password|event-secret|action-secret|trigger-secret/i);
});

test("logger preserva evento disabled e estados legitimos do ciclo de vida", () => {
  const capture = logCapture();
  capture.observer.info("worker_disabled", { status: "disabled" });
  capture.observer.info("worker_stopping", { status: "stopping" });

  assert.deepEqual(
    capture.entries().map(({ event, status }) => ({ event, status })),
    [
      { event: "worker_disabled", status: "disabled" },
      { event: "worker_stopping", status: "stopping" },
    ],
  );
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
    ["job_claimed", "execution_started", "action_started", "action_succeeded", "job_succeeded"],
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
  assert.equal(capture.entries().filter((entry) => entry.event === "job_found").length, 0);
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
    acoes: [{ tipo: "ASSIGN_OWNER", usuarioId: 2147483000 }],
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
    supportedActions: ["ASSIGN_OWNER"],
    onEvent: capture.observer.event,
  });

  const firstEvents = capture.entries().map((entry) => entry.event);
  assert.deepEqual(firstEvents, [
    "job_claimed",
    "execution_started",
    "action_started",
    "action_failed",
    "job_attempt_failed",
    "job_retry_scheduled",
  ]);
  assert.equal(firstEvents.includes("job_succeeded"), false);
  assert.equal(firstEvents.includes("job_failed"), false);
  const attemptFailed = capture.entries().find((entry) => entry.event === "job_attempt_failed");
  assert.equal(attemptFailed.final, false);
  assert.equal(attemptFailed.willRetry, true);
  assert.equal(attemptFailed.retryable, true);
  assert.equal(attemptFailed.failureReason, "RETRYABLE_ERROR");
  assert.equal(attemptFailed.attempt, 1);
  assert.equal(attemptFailed.maxAttempts, 2);
  assert.match(attemptFailed.retryAt, /^\d{4}-\d{2}-\d{2}T/);
  const actionFailed = capture.entries().find((entry) => entry.event === "action_failed");
  assert.equal(Object.hasOwn(actionFailed, "final"), false);
  assert.equal(Object.hasOwn(actionFailed, "willRetry"), false);
  assert.equal(Object.hasOwn(actionFailed, "permanent"), false);
  assert.equal(Object.hasOwn(actionFailed, "retryAt"), false);
  assert.equal(Object.hasOwn(actionFailed, "failureReason"), false);
  const retryScheduled = capture.entries().find((entry) => entry.event === "job_retry_scheduled");
  assert.equal(retryScheduled.final, false);
  assert.equal(retryScheduled.willRetry, true);
  assert.equal(retryScheduled.failureReason, "RETRYABLE_ERROR");
  let job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  assert.equal(job.status, "FALHOU");
  assert.ok(job.nextAttemptAt > firstNow);

  const beforeFinalAttempt = capture.entries().length;
  await service.processDueJobs({
    now: new Date(firstNow.getTime() + 2000),
    leaseOwner: "worker-retry",
    maxAttempts: 2,
    retryDelayMs: 1000,
    supportedActions: ["ASSIGN_OWNER"],
    onEvent: capture.observer.event,
  });

  const finalEvents = capture.entries().slice(beforeFinalAttempt).map((entry) => entry.event);
  assert.deepEqual(finalEvents, [
    "job_claimed",
    "execution_started",
    "action_started",
    "action_failed",
    "job_attempt_failed",
    "job_attempts_exhausted",
    "job_failed",
  ]);
  const jobFailed = capture.entries().find((entry) => entry.event === "job_failed");
  assert.equal(jobFailed.final, true);
  assert.equal(jobFailed.willRetry, false);
  assert.equal(jobFailed.retryable, true);
  assert.equal(jobFailed.failureReason, "ATTEMPTS_EXHAUSTED");
  assert.equal(jobFailed.attempt, 2);
  assert.equal(jobFailed.maxAttempts, 2);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_retry_scheduled").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_attempts_exhausted").length, 1);
  assert.equal(capture.entries().filter((entry) => entry.event === "job_succeeded").length, 0);
  job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  assert.equal(job.status, "FALHA_DEFINITIVA");
  assert.equal(job.nextAttemptAt, null);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("erro permanente precoce encerra sem declarar tentativas esgotadas", async () => {
  const tenant = await seedTenant("worker-logs-permanent");
  const context = adminContext(tenant);
  const rule = await legacyUnsupportedRule(context, "Falha permanente observavel");
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "worker-permanent",
    occurredAt: lead.createdAt,
  });
  const capture = logCapture({ workerInstanceId: "worker-permanent" });
  const callbackArguments = [];
  const onEvent = (...args) => {
    callbackArguments.push(args);
    return capture.observer.event(...args);
  };

  await service.processDueJobs({
    now: new Date(Date.now() + 1000),
    leaseOwner: "worker-permanent",
    maxAttempts: 3,
    onEvent,
  });

  assert.deepEqual(capture.entries().map((entry) => entry.event), [
    "job_claimed",
    "execution_started",
    "action_started",
    "action_failed",
    "job_permanent_failure",
    "job_failed",
  ]);
  assert.ok(callbackArguments.length > 0);
  for (const args of callbackArguments) {
    assert.equal(args.length, 1);
    assert.equal(args[0] instanceof Error, false);
    assert.equal(Object.values(args[0]).some((value) => value instanceof Error), false);
    for (const [key, value] of Object.entries(args[0])) {
      assert.equal(CALLBACK_FIELDS.has(key), true, `${key} nao pertence ao envelope`);
      assert.equal(value !== null && typeof value === "object", false, `${key} manteve objeto aninhado`);
    }
  }
  const jobFailed = capture.entries().find((entry) => entry.event === "job_failed");
  assert.equal(jobFailed.final, true);
  assert.equal(jobFailed.willRetry, false);
  assert.equal(jobFailed.retryable, false);
  assert.equal(jobFailed.failureReason, "PERMANENT_ERROR");
  assert.equal(jobFailed.attempt, 1);
  assert.equal(jobFailed.maxAttempts, 3);
  assert.equal(capture.entries().some((entry) => entry.event === "job_attempts_exhausted"), false);
  assert.equal(capture.entries().some((entry) => entry.event === "job_retry_scheduled"), false);
  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  assert.equal(job.status, "FALHA_DEFINITIVA");
  assert.equal(job.tentativas, 1);
  assert.equal(job.nextAttemptAt, null);
});

test("reconciliacao de lease expirado registra exaustao com contexto operacional sanitizado", async () => {
  const tenant = await seedTenant("worker-logs-reconcile-exhausted");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Reconciliacao observavel");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "worker-reconcile-exhausted",
    occurredAt: lead.createdAt,
  });
  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  const now = new Date(Date.now() + 1000);
  const expiredAt = new Date(now.getTime() - 5000);
  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSANDO",
      leaseOwner: "worker-stale",
      leaseExpiresAt: expiredAt,
      tentativas: 3,
      erroCodigo: "P2028",
      erroResumo: "Database operation failed.",
    },
  });
  const capture = logCapture({ workerInstanceId: "worker-reconcile-exhausted" });

  const result = await service.processDueJobs({
    now,
    leaseOwner: "worker-reconcile",
    maxAttempts: 3,
    onEvent: capture.observer.event,
  });

  assert.equal(result.processed, 0);
  const exhausted = capture.entries().find((entry) => entry.event === "job_attempts_exhausted");
  assert.ok(exhausted);
  assert.equal(exhausted.tenantId, tenant.empresa.id);
  assert.equal(exhausted.jobId, job.id);
  assert.equal(exhausted.executionId, job.execucaoId);
  assert.equal(exhausted.attempt, 3);
  assert.equal(exhausted.maxAttempts, 3);
  assert.equal(exhausted.status, "FALHA_DEFINITIVA");
  assert.equal(exhausted.failureReason, "ATTEMPTS_EXHAUSTED");
  assert.equal(exhausted.errorCode, "P2028");
  assert.equal(exhausted.final, true);
  assert.equal(exhausted.retryable, true);
  assert.equal(exhausted.willRetry, false);
  assert.equal(exhausted.leaseUntil, expiredAt.toISOString());
  assert.ok(Number.isFinite(exhausted.durationMs));
  assert.ok(exhausted.durationMs >= 0 && exhausted.durationMs <= 10 * 60 * 1000);
  assert.doesNotMatch(capture.text(), /worker-stale|secret|password|token|@/i);

  const reconciled = await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(reconciled.status, "FALHA_DEFINITIVA");
  assert.equal(reconciled.leaseOwner, null);
  assert.equal(reconciled.leaseExpiresAt, null);
  assert.equal(reconciled.erroCodigo, "ATTEMPTS_EXHAUSTED");
  const execution = await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: job.execucaoId } });
  assert.equal(execution.status, "FALHA_DEFINITIVA");
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

async function legacyUnsupportedRule(context, nome) {
  return prisma.automacaoRegra.create({
    data: {
      empresaId: context.empresaId,
      nome,
      ativa: true,
      prioridade: 20,
      gatilho: "LEAD_CREATED",
      condicoesJson: "[]",
      acoesJson: JSON.stringify([{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds: [2147483000] }]),
      timezone: "America/Sao_Paulo",
      activatedAt: new Date(Date.now() - 1000),
      createdById: context.usuarioId,
      updatedById: context.usuarioId,
    },
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
