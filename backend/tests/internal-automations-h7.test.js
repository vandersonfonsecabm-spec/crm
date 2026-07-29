const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { afterEach, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createAutomationService } = require("../src/automations/service");
const { readAutomationWorkerConfig, shouldStartAutomationWorker, startAutomationWorker } = require("../src/automations/worker");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const service = createAutomationService({ prisma, env });
let sequence = 0;

before(cleanDatabase);
afterEach(cleanDatabase);

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

test("H7 respeita feature gate, ativacao sem retroatividade e simulacao sem efeitos", async () => {
  const tenant = await seedTenant("h7-gate");
  const context = adminContext(tenant);
  const lead = await seedLead(tenant, { createdAt: new Date(Date.now() - 3600000) });

  const rule = await service.createRule(context, {
    nome: "Lead criado sem responsavel",
    prioridade: 10,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [{ campo: "semResponsavel", operador: "EQUALS", valor: true }],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "LEAD_CREATED_TEST", resumo: "Evento tecnico." }],
  });

  await service.activateRule(context, rule.id);
  const beforeExecutions = await prisma.automacaoExecucao.count();
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "old-lead", occurredAt: lead.createdAt });
  assert.equal(await prisma.automacaoExecucao.count(), beforeExecutions, "lead anterior a activatedAt nao dispara retroativo");

  const simulation = await service.simulate(context, { regraId: rule.id, entidadeTipo: "LEAD", entidadeId: lead.id });
  assert.equal(simulation.efetivada, false);
  assert.equal(simulation.entidadeEncontrada, true);
  assert.equal(await prisma.automacaoExecucao.count(), beforeExecutions);
  assert.equal(await prisma.automacaoEventoInterno.count(), 0);

  const disabledService = createAutomationService({ prisma, env: { AUTOMATIONS_ENABLED: "false", NODE_ENV: "test" } });
  const freshLead = await seedLead(tenant);
  await disabledService.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: freshLead.id, originalEventId: "feature-off", occurredAt: freshLead.createdAt });
  assert.equal(await prisma.automacaoExecucao.count(), beforeExecutions);
});

test("H8.1 processa CREATE_INTERNAL_EVENT com idempotencia e reprocessamento controlado", async () => {
  const tenant = await seedTenant("h7-idempotency");
  const context = adminContext(tenant);
  const rule = await service.createRule(context, {
    nome: "Registrar novo Lead",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "LEAD_CREATED_TEST", resumo: "Evento tecnico." }],
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);

  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "idem-1", occurredAt: lead.createdAt });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "idem-1", occurredAt: lead.createdAt });
  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id } }), 1);

  await service.processDueJobs({ now: new Date(), leaseOwner: "test-worker" });
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 0);

  await service.processDueJobs({ now: new Date(), leaseOwner: "test-worker" });
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);

  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  await prisma.automacaoAcaoJob.update({ where: { id: job.id }, data: { status: "FALHA_DEFINITIVA", erroCodigo: "TEST", erroResumo: "Falha sanitizada." } });
  const retried = await service.retryJob(context, job.id);
  assert.equal(retried.status, "PENDENTE");
  assert.equal(retried.tentativas, 0);
  assert.equal(retried.erroCodigo, null);
});

test("H8.1 nao executa acoes comerciais nao suportadas pelo worker", async () => {
  const tenant = await seedTenant("h7-round-robin");
  const sellerA = await seedUser(tenant.empresa.id, "Vendedor A", "VENDEDOR");
  const sellerB = await seedUser(tenant.empresa.id, "Vendedor B", "VENDEDOR");
  const context = adminContext(tenant);
  const rule = await service.createRule(context, {
    nome: "Distribuir Leads",
    prioridade: 5,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds: [sellerA.id, sellerB.id] }],
  });
  await service.activateRule(context, rule.id);

  const firstLead = await seedLead(tenant);
  const secondLead = await seedLead(tenant);
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: firstLead.id, originalEventId: "rr-1", occurredAt: firstLead.createdAt });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: secondLead.id, originalEventId: "rr-2", occurredAt: secondLead.createdAt });
  await service.processDueJobs({ now: new Date(), limit: 10, leaseOwner: "rr-worker" });

  assert.equal((await prisma.lead.findUnique({ where: { id: firstLead.id } })).responsavelId, null);
  assert.equal((await prisma.lead.findUnique({ where: { id: secondLead.id } })).responsavelId, null);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id, origem: "AUTOMATICA" } }), 0);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id, status: "FALHA_DEFINITIVA", erroCodigo: "ACTION_NOT_SUPPORTED" } }), 2);
});

test("H7 varre gatilhos temporais e o worker permanece desligado por padrao em teste", async () => {
  const tenant = await seedTenant("h7-temporal");
  const context = adminContext(tenant);
  const oldLead = await seedLead(tenant, { createdAt: new Date(Date.now() - 90 * 60000) });
  const rule = await service.createRule(context, {
    nome: "Lead sem acompanhamento",
    prioridade: 30,
    gatilho: "LEAD_WITHOUT_FOLLOW_UP",
    timezone: "America/Sao_Paulo",
    condicoes: [{ campo: "tempoSemAcompanhamentoMinutos", operador: "GTE", valor: 60 }],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "FOLLOW_UP_MISSING", resumo: "Sem acompanhamento humano." }],
  });
  await prisma.automacaoRegra.update({ where: { id: rule.id }, data: { ativa: true, activatedAt: new Date(Date.now() - 120 * 60000) } });

  const result = await service.scanTemporalTriggers({ now: new Date(), limit: 10 });
  assert.equal(result.created, 1);
  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: tenant.empresa.id, leadId: oldLead.id } }), 1);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "test", AUTOMATION_WORKER_ENABLED: "true" }), false);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production" }), false);
});

test("H8.1 interpreta gate e configuracao do worker com defaults seguros", async () => {
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production" }), false);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production", AUTOMATION_WORKER_ENABLED: "false" }), false);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production", AUTOMATION_WORKER_ENABLED: "yes" }), false);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production", AUTOMATION_WORKER_ENABLED: " true " }), true);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "production", AUTOMATION_WORKER_ENABLED: "1" }), true);
  assert.equal(shouldStartAutomationWorker({ NODE_ENV: "test", AUTOMATION_WORKER_ENABLED: "1" }), false);

  const config = readAutomationWorkerConfig({
    AUTOMATION_WORKER_BATCH_SIZE: "999",
    AUTOMATION_WORKER_POLL_INTERVAL_MS: "0",
    AUTOMATION_WORKER_LEASE_MS: "abc",
    AUTOMATION_WORKER_EXECUTION_TIMEOUT_MS: "9999999",
    AUTOMATION_WORKER_MAX_ATTEMPTS: "0",
  });
  assert.equal(config.batchSize, 5);
  assert.equal(config.pollIntervalMs, 5000);
  assert.equal(config.leaseMs, 60000);
  assert.equal(config.executionTimeoutMs, 30000);
  assert.equal(config.maxAttempts, 3);

  const logs = [];
  const disabled = startAutomationWorker({
    service,
    env: { NODE_ENV: "production" },
    logger: { log: (line) => logs.push(line), error: (line) => logs.push(line) },
  });
  assert.equal(disabled.started, false);
  assert.match(logs.join("\n"), /worker_disabled/);
});

test("H8.1 dois workers logicos nao processam o mesmo job", async () => {
  const tenant = await seedTenant("h8-concurrency");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Concorrencia evento interno");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "race-1", occurredAt: lead.createdAt });

  const [left, right] = await Promise.all([
    service.processDueJobs({ now: new Date(), limit: 1, leaseOwner: "worker-a" }),
    service.processDueJobs({ now: new Date(), limit: 1, leaseOwner: "worker-b" }),
  ]);

  assert.equal(left.processed + right.processed, 1);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id, status: "CONCLUIDO" } }), 1);
});

test("H8.1 lease valido nao e roubado e lease expirado e recuperado", async () => {
  const tenant = await seedTenant("h8-lease");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Lease evento interno");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "lease-1", occurredAt: lead.createdAt });
  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  const now = new Date(Date.now() + 1000);
  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: { status: "PROCESSANDO", leaseOwner: "busy-worker", leaseExpiresAt: new Date(now.getTime() + 60000), tentativas: 1 },
  });

  const locked = await service.processDueJobs({ now, limit: 1, leaseOwner: "worker-c" });
  assert.equal(locked.processed, 0);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 0);

  await prisma.automacaoAcaoJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(now.getTime() - 1000) } });
  const recovered = await service.processDueJobs({ now, limit: 1, leaseOwner: "worker-c" });
  assert.equal(recovered.processed, 1);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);
});

test("H8.1 adiamentos por janela acima de maxAttempts preservam elegibilidade", async () => {
  const tenant = await seedTenant("h8-window-attempts");
  const context = adminContext(tenant);
  const rule = await windowedInternalEventRule(context, "Janela sem consumo de tentativa", {
    inicio: "13:00",
    fim: "14:00",
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "window-attempts-1",
    occurredAt: lead.createdAt,
  });
  const observedEvents = [];

  for (const now of [
    new Date("2030-07-30T12:00:00.000Z"),
    new Date("2030-07-30T12:16:00.000Z"),
    new Date("2030-07-30T12:32:00.000Z"),
  ]) {
    const result = await service.processDueJobs({
      now,
      limit: 1,
      leaseOwner: "window-worker",
      maxAttempts: 2,
      onEvent: (event) => observedEvents.push(event),
    });
    assert.equal(result.processed, 1);
    assert.equal(result.results[0].status, "AGUARDANDO_JANELA");
    const deferred = await prisma.automacaoAcaoJob.findFirstOrThrow({
      where: { empresaId: tenant.empresa.id },
    });
    assert.equal(deferred.status, "PENDENTE");
    assert.equal(deferred.tentativas, 0);
    assert.equal(deferred.leaseOwner, null);
    assert.equal(deferred.leaseExpiresAt, null);
  }

  assert.equal(observedEvents.filter((event) => event.event === "job_retry_scheduled").length, 0);
  const insideWindow = await service.processDueJobs({
    now: new Date("2030-07-30T13:00:00.000Z"),
    limit: 1,
    leaseOwner: "window-worker",
    maxAttempts: 2,
  });
  assert.equal(insideWindow.processed, 1);
  assert.equal(insideWindow.results[0].status, "CONCLUIDO");
  const completed = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id },
  });
  assert.equal(completed.tentativas, 1);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 1);
  const repeated = await service.processDueJobs({
    now: new Date("2030-07-30T13:01:00.000Z"),
    limit: 1,
    leaseOwner: "window-worker",
    maxAttempts: 2,
  });
  assert.equal(repeated.processed, 0);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 1);
});

test("H8.1 janela cruzando meia-noite preserva falhas reais em outro timezone", async () => {
  const tenant = await seedTenant("h8-window-midnight");
  const context = adminContext(tenant);
  const rule = await service.createRule(context, {
    nome: "Janela noturna",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    janela: { inicio: "23:00", fim: "02:00" },
    condicoes: [],
    acoes: [{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds: [2147483000] }],
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "window-midnight-1",
    occurredAt: lead.createdAt,
  });
  let job = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id },
  });

  for (const now of [
    new Date("2030-07-30T04:30:00.000Z"),
    new Date("2030-07-30T04:30:02.000Z"),
  ]) {
    const failed = await service.processDueJobs({
      now,
      limit: 1,
      leaseOwner: "window-midnight-worker",
      maxAttempts: 5,
      retryDelayMs: 1000,
      supportedActions: ["ASSIGN_ROUND_ROBIN"],
    });
    assert.equal(failed.results[0].status, "FALHOU");
  }
  job = await prisma.automacaoAcaoJob.findUnique({ where: { id: job.id } });
  assert.equal(job.tentativas, 2);
  const executionBeforeDeferrals = await prisma.automacaoExecucao.findUnique({
    where: { id: job.execucaoId },
  });
  assert.equal(executionBeforeDeferrals.tentativas, 2);

  for (const now of [
    new Date("2030-07-30T18:00:00.000Z"),
    new Date("2030-07-30T18:16:00.000Z"),
    new Date("2030-07-30T18:32:00.000Z"),
  ]) {
    const result = await service.processDueJobs({
      now,
      limit: 1,
      leaseOwner: "window-midnight-worker",
      maxAttempts: 5,
      retryDelayMs: 1000,
      supportedActions: ["ASSIGN_ROUND_ROBIN"],
    });
    assert.equal(result.results[0].status, "AGUARDANDO_JANELA");
    assert.equal((await prisma.automacaoAcaoJob.findUnique({ where: { id: job.id } })).tentativas, 2);
  }

  const insideWindow = await service.processDueJobs({
    now: new Date("2030-07-31T04:30:00.000Z"),
    limit: 1,
    leaseOwner: "window-midnight-worker",
    maxAttempts: 5,
    retryDelayMs: 1000,
    supportedActions: ["ASSIGN_ROUND_ROBIN"],
  });
  assert.equal(insideWindow.results[0].status, "FALHOU");
  assert.equal((await prisma.automacaoAcaoJob.findUnique({ where: { id: job.id } })).tentativas, 3);
  const executionAfterDeferrals = await prisma.automacaoExecucao.findUnique({
    where: { id: job.execucaoId },
  });
  assert.equal(executionAfterDeferrals.tentativas, 3);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("H8.1 adiamento concorrente restitui uma vez e chamada repetida nao altera tentativas", async () => {
  const tenant = await seedTenant("h8-window-concurrency");
  const context = adminContext(tenant);
  const rule = await windowedInternalEventRule(context, "Janela concorrente", {
    inicio: "09:00",
    fim: "10:00",
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "window-concurrency-1",
    occurredAt: lead.createdAt,
  });
  const now = new Date("2030-07-30T12:00:00.000Z");

  const [left, right] = await Promise.all([
    service.processDueJobs({ now, limit: 1, leaseOwner: "window-worker-a", maxAttempts: 2 }),
    service.processDueJobs({ now, limit: 1, leaseOwner: "window-worker-b", maxAttempts: 2 }),
  ]);

  assert.equal(left.processed + right.processed, 1);
  const deferred = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id },
  });
  assert.equal(deferred.status, "PENDENTE");
  assert.equal(deferred.tentativas, 0);
  const repeated = await service.processDueJobs({
    now,
    limit: 1,
    leaseOwner: "window-worker-a",
    maxAttempts: 2,
  });
  assert.equal(repeated.processed, 0);
  assert.equal((await prisma.automacaoAcaoJob.findUnique({ where: { id: deferred.id } })).tentativas, 0);
});

test("H8.1 adiamento nao interfere em job de outro tenant", async () => {
  const tenantA = await seedTenant("h8-window-tenant-a");
  const tenantB = await seedTenant("h8-window-tenant-b");
  const ruleA = await windowedInternalEventRule(adminContext(tenantA), "Janela tenant A", {
    inicio: "09:00",
    fim: "10:00",
  });
  const ruleB = await windowedInternalEventRule(adminContext(tenantB), "Janela tenant B", {
    inicio: "09:00",
    fim: "10:00",
  });
  await service.activateRule(adminContext(tenantA), ruleA.id);
  await service.activateRule(adminContext(tenantB), ruleB.id);
  const leadA = await seedLead(tenantA);
  const leadB = await seedLead(tenantB);
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenantA.empresa.id,
    leadId: leadA.id,
    originalEventId: "window-tenant-a",
    occurredAt: leadA.createdAt,
  });
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenantB.empresa.id,
    leadId: leadB.id,
    originalEventId: "window-tenant-b",
    occurredAt: leadB.createdAt,
  });
  const jobB = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: tenantB.empresa.id },
  });
  await prisma.automacaoAcaoJob.update({
    where: { id: jobB.id },
    data: { tentativas: 2 },
  });

  const result = await service.processDueJobs({
    now: new Date("2030-07-30T12:00:00.000Z"),
    limit: 1,
    leaseOwner: "window-tenant-worker",
    maxAttempts: 5,
  });

  assert.equal(result.processed, 1);
  assert.equal((await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenantA.empresa.id } })).tentativas, 0);
  const untouchedB = await prisma.automacaoAcaoJob.findUnique({ where: { id: jobB.id } });
  assert.equal(untouchedB.status, "PENDENTE");
  assert.equal(untouchedB.tentativas, 2);
  assert.equal(untouchedB.leaseOwner, null);
});

test("H8.1 lease alheio ou expirado nao restitui tentativa no adiamento", async () => {
  for (const interference of ["wrong-owner", "expired"]) {
    const tenant = await seedTenant(`h8-window-${interference}`);
    const context = adminContext(tenant);
    const rule = await windowedInternalEventRule(context, `Janela ${interference}`, {
      inicio: "09:00",
      fim: "10:00",
    });
    await service.activateRule(context, rule.id);
    const lead = await seedLead(tenant);
    await service.enqueueLeadCreated({
      tx: prisma,
      empresaId: tenant.empresa.id,
      leadId: lead.id,
      originalEventId: `window-${interference}`,
      occurredAt: lead.createdAt,
    });
    const now = new Date("2030-07-30T12:00:00.000Z");
    const interferedPrisma = prismaWithWindowDeferralInterference(async (args) => {
      await prisma.automacaoAcaoJob.update({
        where: { id: args.where.id },
        data: interference === "wrong-owner"
          ? { leaseOwner: "other-worker" }
          : { leaseExpiresAt: new Date(now.getTime() - 1) },
      });
    });
    const interferedService = createAutomationService({ prisma: interferedPrisma, env });

    await assert.rejects(
      interferedService.processDueJobs({
        now,
        limit: 1,
        leaseOwner: "window-owner-worker",
        maxAttempts: 3,
      }),
      (error) => error?.codigo === "JOB_WINDOW_DEFERRAL_CONFLICT",
    );
    const unchanged = await prisma.automacaoAcaoJob.findFirstOrThrow({
      where: { empresaId: tenant.empresa.id },
    });
    assert.equal(unchanged.status, "PROCESSANDO");
    assert.equal(unchanged.tentativas, 1);
    await cleanDatabase();
  }
});

test("H8.1 shutdown aguarda ciclo ativo e nao agenda novo polling", async () => {
  const scheduled = [];
  let releaseCycle;
  let processed = false;
  const worker = startAutomationWorker({
    service: {
      processDueJobs: async () => {
        processed = true;
        await new Promise((resolve) => {
          releaseCycle = resolve;
        });
      },
    },
    env: { NODE_ENV: "production", AUTOMATION_WORKER_ENABLED: "true", AUTOMATION_WORKER_POLL_INTERVAL_MS: "1000" },
    logger: { log() {}, error() {} },
    setTimeoutImpl: (fn) => {
      scheduled.push(fn);
      return fn;
    },
    clearTimeoutImpl() {},
  });
  assert.equal(worker.started, true);
  scheduled[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(processed, true);
  const stopping = worker.stop();
  releaseCycle();
  await stopping;
  assert.equal(scheduled.length, 1);
});

test("H8.2 produtor controlado cria jobs idempotentes sem entidade comercial", async () => {
  const tenant = await seedTenant("h8-producer");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Piloto produtor interno");
  const disabled = await service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-disabled"));
  assert.equal(disabled.createdJobs, 0);

  const offService = createAutomationService({ prisma, env: { AUTOMATIONS_ENABLED: "false", NODE_ENV: "test" } });
  await service.activateRule(context, rule.id);
  const featureOff = await offService.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-feature-off"));
  assert.equal(featureOff.createdJobs, 0);

  const created = await service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-event-001"));
  assert.equal(created.createdExecutions, 1);
  assert.equal(created.createdJobs, 1);

  const duplicate = await service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-event-001"));
  assert.equal(duplicate.duplicate, true);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id } }), 1);

  const [left, right] = await Promise.all([
    service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-race-001")),
    service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "h8-2-race-001")),
  ]);
  assert.equal(left.createdJobs + right.createdJobs, 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id } }), 2);

  await service.processDueJobs({ now: new Date(), limit: 10, leaseOwner: "producer-worker" });
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 2);
  await service.processDueJobs({ now: new Date(), limit: 10, leaseOwner: "producer-worker" });
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: tenant.empresa.id } }), 2);
  assert.equal(await prisma.lead.count({ where: { empresaId: tenant.empresa.id } }), 0);
  assert.equal(await prisma.cliente.count({ where: { empresaId: tenant.empresa.id } }), 0);
  assert.equal(await prisma.negocio.count({ where: { empresaId: tenant.empresa.id } }), 0);
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("H8.2 rollback preserva atomicidade quando conflito inesperado ocorre em regra posterior", async () => {
  const tenant = await seedTenant("h8-atomicity");
  const context = adminContext(tenant);
  const firstRule = await internalEventRule(context, "Primeira regra atomica");
  const secondRule = await internalEventRule(context, "Segunda regra com conflito");
  await service.activateRule(context, firstRule.id);
  await service.activateRule(context, secondRule.id);
  const lead = await seedLead(tenant);
  const marker = "unexpected-idempotency-conflict";
  const key = `LEAD_CREATED:LEAD:${lead.id}:${marker}`;

  await prisma.automacaoExecucao.create({
    data: {
      empresaId: tenant.empresa.id,
      regraId: secondRule.id,
      regraVersao: secondRule.versao,
      regraSnapshotJson: JSON.stringify({ acoes: [] }),
      entidadeTipo: "LEAD",
      entidadeId: lead.id,
      leadId: lead.id,
      occurrenceKey: "different-occurrence",
      idempotencyKey: hashKey(`${tenant.empresa.id}:${secondRule.id}:${key}`),
      status: "PENDENTE",
    },
  });

  await assert.rejects(
    prisma.$transaction((tx) => service.enqueueLeadCreated({
      tx,
      empresaId: tenant.empresa.id,
      leadId: lead.id,
      originalEventId: marker,
      occurredAt: lead.createdAt,
    })),
    /constraint|unique|P2002|P2010|23505|idempotencyKey|already exists/i,
  );

  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: tenant.empresa.id, regraId: firstRule.id, occurrenceKey: key } }), 0);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id, execucao: { regraId: firstRule.id } } }), 0);
});

test("H8.2 idempotencia de produtor e isolada por tenant", async () => {
  const tenantA = await seedTenant("h8-tenant-a");
  const tenantB = await seedTenant("h8-tenant-b");
  const contextA = adminContext(tenantA);
  const contextB = adminContext(tenantB);
  await service.activateRule(contextA, (await internalEventRule(contextA, "Regra tenant A")).id);
  await service.activateRule(contextB, (await internalEventRule(contextB, "Regra tenant B")).id);

  const [createdA, createdB] = await Promise.all([
    service.produceAutomationEvent(pilotEvent(tenantA.empresa.id, "same-business-marker")),
    service.produceAutomationEvent(pilotEvent(tenantB.empresa.id, "same-business-marker")),
  ]);

  assert.equal(createdA.createdJobs, 1);
  assert.equal(createdB.createdJobs, 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenantA.empresa.id } }), 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenantB.empresa.id } }), 1);
});

function adminContext(tenant) {
  return { empresaId: tenant.empresa.id, usuarioId: tenant.admin.id, papel: "ADMIN" };
}

async function seedTenant(label) {
  const slug = `${label}-${process.pid}-${++sequence}`;
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa ${slug}`, slug } });
  const admin = await seedUser(empresa.id, "Admin H7", "ADMIN");
  await prisma.empresaFuncionalidade.create({ data: { empresaId: empresa.id, chave: "AUTOMATIONS", habilitada: true, habilitadoEm: new Date(), habilitadoPorUsuarioId: admin.id } });
  return { empresa, admin };
}

async function seedUser(empresaId, nome, papel) {
  const email = `${nome.toLowerCase().replace(/\s+/g, ".")}.${process.pid}.${++sequence}@h7.test`;
  return prisma.usuario.create({ data: { empresaId, nome, email, senhaHash: "hash-test", papel, ativo: true } });
}

async function seedLead(tenant, overrides = {}) {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Cliente H7 ${++sequence}`,
      telefone: "",
      email: "",
      empresa: "QA H7",
      interesse: "Automacao",
      origem: "QA H7",
    },
  });
  return prisma.lead.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: cliente.id,
      status: "NOVO",
      origem: "SITE",
      interesse: "Automacao",
      ...overrides,
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

async function windowedInternalEventRule(context, nome, janela, timezone = "UTC") {
  return service.createRule(context, {
    nome,
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone,
    janela,
    condicoes: [],
    acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "LEAD_CREATED_TEST", resumo: "Evento tecnico." }],
  });
}

function prismaWithWindowDeferralInterference(interfere) {
  const jobDelegate = prisma.automacaoAcaoJob;
  const wrappedJobDelegate = new Proxy(jobDelegate, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property === "updateMany") {
        return async (args) => {
          if (args?.data?.tentativas?.decrement === 1) await interfere(args);
          return value.call(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "automacaoAcaoJob") return wrappedJobDelegate;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function pilotEvent(empresaId, key) {
  return {
    tenantId: empresaId,
    eventType: "LEAD_CREATED",
    sourceType: "PILOT_SYNTHETIC",
    sourceId: key,
    idempotencyKey: key,
    occurredAt: new Date(),
    payload: { name: "Lead Sintetico H8.2", origin: "PILOT" },
  };
}

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
