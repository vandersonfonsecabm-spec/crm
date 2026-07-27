const assert = require("node:assert/strict");
const { before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createAutomationService } = require("../src/automations/service");
const { shouldStartAutomationWorker } = require("../src/automations/worker");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const service = createAutomationService({ prisma, env });
let sequence = 0;

before(async () => {
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
});

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

test("H7 cria execucao idempotente e reprocessa apenas a acao falha elegivel", async () => {
  const tenant = await seedTenant("h7-idempotency");
  const context = adminContext(tenant);
  const rule = await service.createRule(context, {
    nome: "Acompanhar novo Lead",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "CREATE_FOLLOW_UP", titulo: "Retornar contato", delayMinutos: 30, prioridade: "ALTA", tipoAcompanhamento: "RETORNO" }],
  });
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);

  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "idem-1", occurredAt: lead.createdAt });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "idem-1", occurredAt: lead.createdAt });
  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id } }), 1);

  await service.processDueJobs({ now: new Date(), leaseOwner: "test-worker" });
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);
  assert.equal(await prisma.historicoAcompanhamento.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.equal((await prisma.cliente.findUnique({ where: { id: lead.clienteId } })).proximoFollowUp !== "Hoje", true);

  await service.processDueJobs({ now: new Date(), leaseOwner: "test-worker" });
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);

  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  await prisma.automacaoAcaoJob.update({ where: { id: job.id }, data: { status: "FALHA_DEFINITIVA", erroCodigo: "TEST", erroResumo: "Falha sanitizada." } });
  const retried = await service.retryJob(context, job.id);
  assert.equal(retried.status, "PENDENTE");
  assert.equal(retried.erroCodigo, null);
});

test("H7 aplica round-robin deterministico sem avancar quando a entidade ja possui responsavel", async () => {
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

  assert.equal((await prisma.lead.findUnique({ where: { id: firstLead.id } })).responsavelId, sellerA.id);
  assert.equal((await prisma.lead.findUnique({ where: { id: secondLead.id } })).responsavelId, sellerB.id);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id, origem: "AUTOMATICA" } }), 2);

  const assignedLead = await seedLead(tenant, { responsavelId: sellerA.id });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: assignedLead.id, originalEventId: "rr-assigned", occurredAt: assignedLead.createdAt });
  await service.processDueJobs({ now: new Date(), limit: 10, leaseOwner: "rr-worker" });
  assert.equal((await prisma.lead.findUnique({ where: { id: assignedLead.id } })).responsavelId, sellerA.id);
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
