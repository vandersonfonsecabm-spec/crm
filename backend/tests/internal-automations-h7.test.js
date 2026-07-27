const assert = require("node:assert/strict");
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
