const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, afterEach, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { PILOT_ACTION_TYPES, WORKER_ACTION_TYPES } = require("../src/automations/actions");
const { createAutomationService } = require("../src/automations/service");
const { readAutomationWorkerConfig, shouldStartAutomationWorker, startAutomationWorker } = require("../src/automations/worker");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const service = createAutomationService({ prisma, env });
let sequence = 0;

before(cleanDatabase);
afterEach(cleanDatabase);
after(() => prisma.$disconnect());

async function cleanDatabase() {
  await prisma.$transaction([
    prisma.automacaoEventoInterno.deleteMany(),
    prisma.automacaoAcaoJob.deleteMany(),
    prisma.automacaoExecucao.deleteMany(),
    prisma.automacaoRoundRobinEstado.deleteMany(),
    prisma.automacaoRegra.deleteMany(),
    prisma.historicoAcompanhamento.deleteMany(),
    prisma.acompanhamento.deleteMany(),
    prisma.historicoAtribuicao.deleteMany(),
    prisma.negocio.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.cliente.deleteMany(),
    prisma.empresaFuncionalidade.deleteMany(),
    prisma.usuario.deleteMany(),
    prisma.empresa.deleteMany(),
  ]);
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

test("H8.3 cancelamento reconcilia execucao e preserva estados terminais", async () => {
  const tenant = await seedTenant("h8-cancel-reconcile");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Cancelar antes do claim");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  const firstJob = await seedActionJob({
    tenant,
    rule: await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } }),
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-single",
  });

  await service.deactivateRule(context, rule.id);

  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: firstJob.id } })).status,
    "CANCELADO",
  );
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: firstJob.execucaoId } })).status,
    "CANCELADA",
  );

  const multiRule = await internalEventRule(context, "Cancelar execucao com varios jobs");
  await service.activateRule(context, multiRule.id);
  const multiJob = await seedActionJob({
    tenant,
    rule: await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: multiRule.id } }),
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-multiple",
  });
  const completedJob = await prisma.automacaoAcaoJob.create({
    data: {
      empresaId: tenant.empresa.id,
      execucaoId: multiJob.execucaoId,
      indice: 1,
      tipo: "CREATE_INTERNAL_EVENT",
      actionKey: hashKey(`${tenant.empresa.id}:${multiRule.id}:cancel-multiple:1`),
      status: "CONCLUIDO",
      nextAttemptAt: new Date(),
    },
  });

  await service.deactivateRule(context, multiRule.id);

  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: multiJob.id } })).status,
    "CANCELADO",
  );
  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: completedJob.id } })).status,
    "CONCLUIDO",
  );
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: multiJob.execucaoId } })).status,
    "CANCELADA",
  );
});

test("H8.3 cancelamento repetido e concorrente e idempotente", async () => {
  const tenant = await seedTenant("h8-cancel-idempotent");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Cancelar idempotente");
  await service.activateRule(context, rule.id);
  const activeRule = await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } });
  const lead = await seedLead(tenant);
  const job = await seedActionJob({
    tenant,
    rule: activeRule,
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-idempotent",
  });

  await service.deactivateRule(context, rule.id);
  const afterFirst = await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } });
  await service.deactivateRule(context, rule.id);
  const afterSecond = await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } });
  assert.equal(afterSecond.versao, afterFirst.versao);
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: job.execucaoId } })).status,
    "CANCELADA",
  );

  const concurrentRule = await internalEventRule(context, "Cancelar concorrente");
  await service.activateRule(context, concurrentRule.id);
  const concurrentJob = await seedActionJob({
    tenant,
    rule: await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: concurrentRule.id } }),
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-concurrent",
  });
  const concurrentResults = await Promise.allSettled([
    service.deactivateRule(context, concurrentRule.id),
    service.deactivateRule(context, concurrentRule.id),
  ]);

  assert.equal(concurrentResults.every((result) => result.status === "fulfilled"), true);
  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: concurrentJob.id } })).status,
    "CANCELADO",
  );
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: concurrentJob.execucaoId } })).status,
    "CANCELADA",
  );
});

test("H8.3 cancelamento aborta se o job mudar antes do update protegido", async () => {
  const tenant = await seedTenant("h8-cancel-conflict");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Cancelar com conflito");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  const job = await seedActionJob({
    tenant,
    rule: await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } }),
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-conflict",
  });
  const conflictingService = createAutomationService({
    prisma: prismaWithCancellationInterference(job.id),
    env,
  });

  await assert.rejects(
    conflictingService.deactivateRule(context, rule.id),
    (error) => error?.codigo === "JOB_CANCELLATION_CONFLICT",
  );

  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } })).status,
    "PENDENTE",
  );
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: job.execucaoId } })).status,
    "PENDENTE",
  );
  assert.equal((await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } })).ativa, true);
});

test("H8.3 cancelamento nao altera job ou execucao ja concluidos", async () => {
  const tenant = await seedTenant("h8-cancel-terminal");
  const context = adminContext(tenant);
  const rule = await internalEventRule(context, "Preservar conclusao");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  const job = await seedActionJob({
    tenant,
    rule: await prisma.automacaoRegra.findUniqueOrThrow({ where: { id: rule.id } }),
    entityType: "LEAD",
    entity: lead,
    marker: "cancel-terminal",
  });
  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: { status: "CONCLUIDO" },
  });
  await prisma.automacaoExecucao.update({
    where: { id: job.execucaoId },
    data: { status: "CONCLUIDA", concluidaEm: new Date() },
  });

  await service.deactivateRule(context, rule.id);

  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } })).status,
    "CONCLUIDO",
  );
  assert.equal(
    (await prisma.automacaoExecucao.findUniqueOrThrow({ where: { id: job.execucaoId } })).status,
    "CONCLUIDA",
  );
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

test("H8.3 usa allowlists canonicas e bloqueia acoes indisponiveis", async () => {
  const tenant = await seedTenant("h8-3-actions");
  const context = adminContext(tenant);
  assert.deepEqual(
    [...WORKER_ACTION_TYPES],
    ["ASSIGN_OWNER", "CREATE_FOLLOW_UP", "CREATE_INTERNAL_EVENT", "UPDATE_NEXT_FOLLOW_UP_PROJECTION"],
  );
  assert.deepEqual([...PILOT_ACTION_TYPES], ["CREATE_INTERNAL_EVENT"]);
  assert.deepEqual((await service.options(context)).actions, [...WORKER_ACTION_TYPES]);

  await assert.rejects(
    service.createRule(context, {
      nome: "Round-robin indisponivel",
      prioridade: 5,
      gatilho: "LEAD_CREATED",
      timezone: "America/Sao_Paulo",
      condicoes: [],
      acoes: [{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds: [tenant.admin.id] }],
    }),
    (error) => error?.codigo === "AUTOMATION_ACTION_UNAVAILABLE",
  );

  const legacyRule = await createLegacyRule(context, "Round-robin legado", {
    tipo: "ASSIGN_ROUND_ROBIN",
    usuarioIds: [tenant.admin.id],
  });
  await assert.rejects(
    service.activateRule(context, legacyRule.id),
    (error) => error?.codigo === "AUTOMATION_ACTION_UNAVAILABLE",
  );

  const ownerRule = await assignOwnerRule(context, tenant.admin.id, "Atribuicao real");
  await service.activateRule(context, ownerRule.id);
  const pilot = await service.produceAutomationEvent(pilotEvent(tenant.empresa.id, "assign-owner-pilot-rejected"));
  assert.equal(pilot.createdExecutions, 0);
  assert.equal(pilot.createdJobs, 0);

  const projectionRule = await service.createRule(context, {
    nome: "Projecao liberada",
    prioridade: 6,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "UPDATE_NEXT_FOLLOW_UP_PROJECTION" }],
  });
  await service.activateRule(context, projectionRule.id);
  const projectionPilot = await service.produceAutomationEvent(
    pilotEvent(tenant.empresa.id, "projection-pilot-rejected"),
  );
  assert.equal(projectionPilot.createdExecutions, 0);
  assert.equal(projectionPilot.createdJobs, 0);

  const followUpRule = await createFollowUpRule(context, "Follow-up liberado");
  await service.activateRule(context, followUpRule.id);
  const followUpPilot = await service.produceAutomationEvent(
    pilotEvent(tenant.empresa.id, "follow-up-pilot-rejected"),
  );
  assert.equal(followUpPilot.createdExecutions, 0);
  assert.equal(followUpPilot.createdJobs, 0);

  for (const externalType of ["WHATSAPP", "EMAIL"]) {
    await assert.rejects(
      service.createRule(context, {
        nome: `Follow-up externo ${externalType}`,
        prioridade: 7,
        gatilho: "LEAD_CREATED",
        timezone: "America/Sao_Paulo",
        condicoes: [],
        acoes: [{ ...followUpAction(), tipoAcompanhamento: externalType }],
      }),
      (error) => error?.codigo === "VALIDATION_ERROR",
    );
  }
});

test("H8.3 ASSIGN_OWNER atribui Lead uma vez e preserva idempotencia no retry", async () => {
  const tenant = await seedTenant("h8-3-lead");
  const context = adminContext(tenant);
  const owner = await seedUser(tenant.empresa.id, "Owner Lead", "VENDEDOR");
  const previousOwner = await seedUser(tenant.empresa.id, "Owner Existente", "VENDEDOR");
  const rule = await assignOwnerRule(context, owner.id, "Atribuir Lead");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);

  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "assign-lead-1", occurredAt: lead.createdAt });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "assign-lead-1", occurredAt: lead.createdAt });
  const now = new Date(Date.now() + 1000);
  const [left, right] = await Promise.all([
    service.processDueJobs({ now, limit: 1, leaseOwner: "assign-lead-a" }),
    service.processDueJobs({ now, limit: 1, leaseOwner: "assign-lead-b" }),
  ]);

  assert.equal(left.processed + right.processed, 1);
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).responsavelId, owner.id);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id, responsavelNovoId: owner.id } }), 1);

  const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
  await prisma.automacaoAcaoJob.update({ where: { id: job.id }, data: { status: "FALHA_DEFINITIVA" } });
  await service.retryJob(context, job.id);
  await service.processDueJobs({ now: new Date(now.getTime() + 1000), limit: 1, leaseOwner: "assign-lead-retry" });
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id, leadId: lead.id } }), 1);

  const assignedLead = await seedLead(tenant, { responsavelId: previousOwner.id });
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: assignedLead.id, originalEventId: "assign-lead-existing", occurredAt: assignedLead.createdAt });
  await service.processDueJobs({ now: new Date(Date.now() + 2000), limit: 1, leaseOwner: "assign-lead-existing" });
  assert.equal((await prisma.lead.findUnique({ where: { id: assignedLead.id } })).responsavelId, previousOwner.id);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id, leadId: assignedLead.id } }), 0);
});

test("H8.3 ASSIGN_OWNER atribui Negocio e registra um historico", async () => {
  const tenant = await seedTenant("h8-3-business");
  const context = adminContext(tenant);
  const owner = await seedUser(tenant.empresa.id, "Owner Negocio", "VENDEDOR");
  const rule = await assignOwnerRule(context, owner.id, "Atribuir Negocio", "DEAL_STALLED");
  await service.activateRule(context, rule.id);
  const negocio = await seedNegocio(tenant);
  await seedActionJob({ tenant, rule, entityType: "NEGOCIO", entity: negocio, marker: "assign-business-1" });

  await service.processDueJobs({ now: new Date(Date.now() + 1000), limit: 1, leaseOwner: "assign-business" });

  assert.equal((await prisma.negocio.findUnique({ where: { id: negocio.id } })).responsavelId, owner.id);
  assert.equal(await prisma.historicoAtribuicao.count({
    where: { empresaId: tenant.empresa.id, negocioId: negocio.id, responsavelNovoId: owner.id },
  }), 1);
});

test("H8.3 ASSIGN_OWNER rejeita usuario inativo, inexistente e de outro tenant", async () => {
  const otherTenant = await seedTenant("h8-3-invalid-owner-other");
  const cases = [
    { label: "inactive", setup: async (tenant) => {
      const user = await seedUser(tenant.empresa.id, "Owner Inativo", "VENDEDOR");
      await prisma.usuario.update({ where: { id: user.id }, data: { ativo: false } });
      return user.id;
    } },
    { label: "missing", setup: async () => 2147483000 },
    { label: "cross-tenant", setup: async () => otherTenant.admin.id },
  ];

  for (const item of cases) {
    const tenant = await seedTenant(`h8-3-invalid-owner-${item.label}`);
    const context = adminContext(tenant);
    const ownerId = await item.setup(tenant);
    const rule = await assignOwnerRule(context, ownerId, `Owner invalido ${item.label}`);
    await service.activateRule(context, rule.id);
    const lead = await seedLead(tenant);
    await service.enqueueLeadCreated({
      tx: prisma,
      empresaId: tenant.empresa.id,
      leadId: lead.id,
      originalEventId: `assign-invalid-${item.label}`,
      occurredAt: lead.createdAt,
    });
    await service.processDueJobs({ now: new Date(Date.now() + 1000), limit: 1, leaseOwner: `assign-invalid-${item.label}` });
    const job = await prisma.automacaoAcaoJob.findFirstOrThrow({ where: { empresaId: tenant.empresa.id } });
    assert.equal(job.status, "FALHOU");
    assert.equal(job.erroCodigo, "USER_NOT_FOUND");
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).responsavelId, null);
    assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id } }), 0);
  }
});

test("H8.3 ASSIGN_OWNER reverte atribuicao se o historico falhar", async () => {
  const tenant = await seedTenant("h8-3-rollback");
  const context = adminContext(tenant);
  const owner = await seedUser(tenant.empresa.id, "Owner Rollback", "VENDEDOR");
  const rule = await assignOwnerRule(context, owner.id, "Atribuicao com rollback");
  await service.activateRule(context, rule.id);
  const lead = await seedLead(tenant);
  await service.enqueueLeadCreated({ tx: prisma, empresaId: tenant.empresa.id, leadId: lead.id, originalEventId: "assign-rollback", occurredAt: lead.createdAt });
  const failingService = createAutomationService({ prisma: prismaWithHistoryFailure(), env });

  const result = await failingService.processDueJobs({ now: new Date(Date.now() + 1000), limit: 1, leaseOwner: "assign-rollback" });

  assert.equal(result.results[0].status, "FALHOU");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).responsavelId, null);
  assert.equal(await prisma.historicoAtribuicao.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("H8.3 projecao standalone e CREATE_FOLLOW_UP usam o helper compartilhado", async () => {
  const tenant = await seedTenant("h8-3-follow-up-projection");
  const context = adminContext(tenant);
  const lead = await seedLead(tenant);
  const client = await prisma.cliente.findUniqueOrThrow({ where: { id: lead.clienteId } });
  const projectionRule = await createLegacyRule(context, "Projecao legada", {
    tipo: "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
  }, { active: true });
  await prisma.acompanhamento.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: client.id,
      leadId: lead.id,
      titulo: "Fonte canonica",
      dataHora: new Date("2030-08-05T12:00:00.000Z"),
      status: "PENDENTE",
    },
  });
  await seedActionJob({
    tenant,
    rule: projectionRule,
    entityType: "LEAD",
    entity: lead,
    marker: "projection-standalone",
  });
  await service.processDueJobs({
    now: new Date(),
    limit: 1,
    leaseOwner: "projection-worker",
    supportedActions: ["UPDATE_NEXT_FOLLOW_UP_PROJECTION"],
  });
  assert.equal(
    (await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } })).proximoFollowUp,
    "2030-08-05T12:00:00.000Z",
  );

  const secondLead = await seedLead(tenant);
  const createRule = await createLegacyRule(context, "Follow-up legado", {
    tipo: "CREATE_FOLLOW_UP",
    delayMinutos: 30,
    titulo: "Acompanhamento criado pela automacao",
    descricao: "Acompanhamento interno.",
    prioridade: "MEDIA",
    tipoAcompanhamento: "RETORNO",
  }, { active: true });
  await seedActionJob({
    tenant,
    rule: createRule,
    entityType: "LEAD",
    entity: secondLead,
    marker: "projection-create-follow-up",
  });
  const creation = await service.processDueJobs({
    now: new Date(),
    limit: 1,
    leaseOwner: "follow-up-worker",
    supportedActions: ["CREATE_FOLLOW_UP"],
  });
  assert.equal(creation.processed, 1, JSON.stringify(creation));
  assert.equal(creation.results[0].status, "CONCLUIDO", JSON.stringify(creation));
  const createdFollowUp = await prisma.acompanhamento.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id, leadId: secondLead.id },
    orderBy: { id: "desc" },
  });
  assert.equal(
    (await prisma.cliente.findUniqueOrThrow({ where: { id: secondLead.clienteId } })).proximoFollowUp,
    createdFollowUp.dataHora.toISOString(),
  );
  assert.equal(WORKER_ACTION_TYPES.includes("UPDATE_NEXT_FOLLOW_UP_PROJECTION"), true);
  assert.equal(PILOT_ACTION_TYPES.includes("UPDATE_NEXT_FOLLOW_UP_PROJECTION"), false);
});

test("H8.3 CREATE_FOLLOW_UP cria uma vez para Lead e Negocio e reconcilia a projecao", async () => {
  const tenant = await seedTenant("h8-3-create-follow-up");
  const context = adminContext(tenant);
  const owner = await seedUser(tenant.empresa.id, "Autor Follow-up", "VENDEDOR");
  const leadRule = await createFollowUpRule(context, "Follow-up Lead");
  await service.activateRule(context, leadRule.id);
  const lead = await seedLead(tenant, { responsavelId: owner.id });
  await service.enqueueLeadCreated({
    tx: prisma,
    empresaId: tenant.empresa.id,
    leadId: lead.id,
    originalEventId: "create-follow-up-lead",
    occurredAt: lead.createdAt,
  });

  const now = new Date(Date.now() + 1000);
  const [left, right] = await Promise.all([
    service.processDueJobs({ now, limit: 1, leaseOwner: "follow-up-lead-a" }),
    service.processDueJobs({ now, limit: 1, leaseOwner: "follow-up-lead-b" }),
  ]);
  assert.equal(left.processed + right.processed, 1);

  const leadFollowUp = await prisma.acompanhamento.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id, leadId: lead.id },
  });
  assert.equal(leadFollowUp.clienteId, lead.clienteId);
  assert.equal(leadFollowUp.responsavelId, owner.id);
  assert.equal(leadFollowUp.autorId, owner.id);
  assert.equal(leadFollowUp.tipo, "RETORNO");
  assert.equal(await prisma.historicoAcompanhamento.count({
    where: { empresaId: tenant.empresa.id, acompanhamentoId: leadFollowUp.id },
  }), 1);
  assert.equal(await prisma.automacaoEventoInterno.count({
    where: { empresaId: tenant.empresa.id, acompanhamentoId: leadFollowUp.id },
  }), 1);
  assert.equal(
    (await prisma.cliente.findUniqueOrThrow({ where: { id: lead.clienteId } })).proximoFollowUp,
    leadFollowUp.dataHora.toISOString(),
  );

  const leadJob = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id, execucao: { leadId: lead.id } },
  });
  await prisma.automacaoAcaoJob.update({
    where: { id: leadJob.id },
    data: { status: "FALHA_DEFINITIVA" },
  });
  await service.retryJob(context, leadJob.id);
  await service.processDueJobs({
    now: new Date(Date.now() + 1000),
    limit: 1,
    leaseOwner: "follow-up-lead-retry",
  });
  assert.equal(await prisma.acompanhamento.count({
    where: { empresaId: tenant.empresa.id, leadId: lead.id },
  }), 1);
  assert.equal(await prisma.historicoAcompanhamento.count({
    where: { empresaId: tenant.empresa.id, acompanhamentoId: leadFollowUp.id },
  }), 1);

  const negocio = await seedNegocio(tenant);
  const negocioRule = await createLegacyRule(context, "Follow-up Negocio", followUpAction(), { active: true });
  const negocioJob = await seedActionJob({
    tenant,
    rule: negocioRule,
    entityType: "NEGOCIO",
    entity: negocio,
    marker: "create-follow-up-negocio",
  });
  const negocioCreation = await service.processDueJobs({
    now: new Date(Date.now() + 3000),
    limit: 1,
    leaseOwner: "follow-up-negocio",
  });
  assert.equal(negocioCreation.processed, 1, JSON.stringify(negocioCreation));
  assert.equal(negocioCreation.results[0].status, "CONCLUIDO", JSON.stringify(negocioCreation));
  assert.equal(
    (await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: negocioJob.id } })).status,
    "CONCLUIDO",
    JSON.stringify(negocioCreation),
  );

  const negocioFollowUp = await prisma.acompanhamento.findFirstOrThrow({
    where: { empresaId: tenant.empresa.id, negocioId: negocio.id },
  });
  assert.equal(negocioFollowUp.clienteId, negocio.clienteId);
  assert.equal(negocioFollowUp.autorId, tenant.admin.id);
  assert.equal(await prisma.historicoAcompanhamento.count({
    where: { empresaId: tenant.empresa.id, acompanhamentoId: negocioFollowUp.id },
  }), 1);
});

test("H8.3 CREATE_FOLLOW_UP rejeita cliente e autor invalidos como erro permanente", async () => {
  const otherTenant = await seedTenant("h8-3-follow-up-other");
  const otherLead = await seedLead(otherTenant);
  const cases = [
    {
      label: "cliente-ausente",
      mutate: (entity) => ({ ...entity, clienteId: null }),
      expectedCode: "AUTOMATION_CLIENT_NOT_FOUND",
    },
    {
      label: "autor-inexistente",
      mutate: (entity) => ({ ...entity, responsavelId: 2147483000 }),
      expectedCode: "AUTOMATION_AUTHOR_UNAVAILABLE",
    },
  ];

  for (const item of cases) {
    const tenant = await seedTenant(`h8-3-follow-up-${item.label}`);
    const context = adminContext(tenant);
    const rule = await createLegacyRule(context, `Follow-up ${item.label}`, followUpAction(), { active: true });
    const lead = await seedLead(tenant);
    await seedActionJob({
      tenant,
      rule,
      entityType: "LEAD",
      entity: lead,
      marker: `follow-up-${item.label}`,
    });
    const invalidService = createAutomationService({
      prisma: prismaWithEntityMutation(item.mutate),
      env,
    });
    await invalidService.processDueJobs({
      now: new Date(Date.now() + 1000),
      limit: 1,
      leaseOwner: `follow-up-${item.label}`,
      supportedActions: ["CREATE_FOLLOW_UP"],
    });
    const job = await prisma.automacaoAcaoJob.findFirstOrThrow({
      where: { empresaId: tenant.empresa.id },
    });
    assert.equal(job.status, "FALHA_DEFINITIVA");
    assert.equal(job.erroCodigo, item.expectedCode);
    assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id } }), 0);
  }

  const crossTenant = await seedTenant("h8-3-follow-up-cross-client");
  const context = adminContext(crossTenant);
  const rule = await createLegacyRule(context, "Follow-up cliente externo", followUpAction(), { active: true });
  const lead = await seedLead(crossTenant);
  const otherClient = await prisma.cliente.findUniqueOrThrow({ where: { id: otherLead.clienteId } });
  await prisma.lead.update({ where: { id: lead.id }, data: { clienteId: otherClient.id } });
  await seedActionJob({
    tenant: crossTenant,
    rule,
    entityType: "LEAD",
    entity: { ...lead, clienteId: otherClient.id },
    marker: "follow-up-cross-client",
  });
  await service.processDueJobs({
    now: new Date(Date.now() + 2000),
    limit: 1,
    leaseOwner: "follow-up-cross-client",
    supportedActions: ["CREATE_FOLLOW_UP"],
  });
  const crossTenantJob = await prisma.automacaoAcaoJob.findFirstOrThrow({
    where: { empresaId: crossTenant.empresa.id },
  });
  assert.equal(crossTenantJob.status, "FALHA_DEFINITIVA");
  assert.equal(crossTenantJob.erroCodigo, "AUTOMATION_CLIENT_NOT_FOUND");
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: crossTenant.empresa.id } }), 0);
});

test("H8.3 CREATE_FOLLOW_UP rejeita autor inativo ou de outro tenant e reverte falha intermediaria", async () => {
  const otherTenant = await seedTenant("h8-3-follow-up-author-other");
  const cases = [
    {
      label: "inativo",
      setup: async (tenant) => {
        const user = await seedUser(tenant.empresa.id, "Autor Inativo", "VENDEDOR");
        await prisma.usuario.update({ where: { id: user.id }, data: { ativo: false } });
        return user.id;
      },
    },
    {
      label: "outro-tenant",
      setup: async () => otherTenant.admin.id,
    },
  ];

  for (const item of cases) {
    const tenant = await seedTenant(`h8-3-follow-up-author-${item.label}`);
    const context = adminContext(tenant);
    const rule = await createLegacyRule(context, `Follow-up autor ${item.label}`, followUpAction(), { active: true });
    const responsavelId = await item.setup(tenant);
    const lead = await seedLead(tenant, { responsavelId });
    await seedActionJob({
      tenant,
      rule,
      entityType: "LEAD",
      entity: lead,
      marker: `follow-up-author-${item.label}`,
    });
    await service.processDueJobs({
      now: new Date(Date.now() + 1000),
      limit: 1,
      leaseOwner: `follow-up-author-${item.label}`,
      supportedActions: ["CREATE_FOLLOW_UP"],
    });
    const job = await prisma.automacaoAcaoJob.findFirstOrThrow({
      where: { empresaId: tenant.empresa.id },
    });
    assert.equal(job.status, "FALHA_DEFINITIVA");
    assert.equal(job.erroCodigo, "AUTOMATION_AUTHOR_UNAVAILABLE");
    assert.equal(await prisma.acompanhamento.count({ where: { empresaId: tenant.empresa.id } }), 0);
  }

  const rollbackTenant = await seedTenant("h8-3-follow-up-rollback");
  const rollbackContext = adminContext(rollbackTenant);
  const rollbackRule = await createLegacyRule(
    rollbackContext,
    "Follow-up rollback",
    followUpAction(),
    { active: true },
  );
  const rollbackLead = await seedLead(rollbackTenant);
  await seedActionJob({
    tenant: rollbackTenant,
    rule: rollbackRule,
    entityType: "LEAD",
    entity: rollbackLead,
    marker: "follow-up-rollback",
  });
  const beforeClient = await prisma.cliente.findUniqueOrThrow({ where: { id: rollbackLead.clienteId } });
  const failingService = createAutomationService({
    prisma: prismaWithFollowUpHistoryFailure(),
    env,
  });
  await failingService.processDueJobs({
    now: new Date(Date.now() + 2000),
    limit: 1,
    leaseOwner: "follow-up-rollback",
    supportedActions: ["CREATE_FOLLOW_UP"],
  });
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: rollbackTenant.empresa.id } }), 0);
  assert.equal(await prisma.historicoAcompanhamento.count({ where: { empresaId: rollbackTenant.empresa.id } }), 0);
  assert.equal(await prisma.automacaoEventoInterno.count({ where: { empresaId: rollbackTenant.empresa.id } }), 0);
  const afterClient = await prisma.cliente.findUniqueOrThrow({ where: { id: rollbackLead.clienteId } });
  assert.equal(afterClient.proximoFollowUp, beforeClient.proximoFollowUp);
  assert.equal(afterClient.revisao, beforeClient.revisao);
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
    acoes: [{ tipo: "ASSIGN_OWNER", usuarioId: 2147483000 }],
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
      supportedActions: ["ASSIGN_OWNER"],
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
      supportedActions: ["ASSIGN_OWNER"],
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
    supportedActions: ["ASSIGN_OWNER"],
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

async function seedNegocio(tenant, overrides = {}) {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Cliente Negocio H8.3 ${++sequence}`,
      telefone: "",
      email: "",
      empresa: "QA H8.3",
      interesse: "Automacao",
      origem: "QA H8.3",
    },
  });
  return prisma.negocio.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: cliente.id,
      etapa: "NOVO",
      titulo: "Negocio H8.3",
      ...overrides,
    },
  });
}

async function assignOwnerRule(context, usuarioId, nome, gatilho = "LEAD_CREATED") {
  return service.createRule(context, {
    nome,
    prioridade: 20,
    gatilho,
    timezone: "America/Sao_Paulo",
    condicoes: gatilho === "DEAL_STALLED"
      ? [{ campo: "tempoParadoMinutos", operador: "GTE", valor: 1 }]
      : [],
    acoes: [{ tipo: "ASSIGN_OWNER", usuarioId }],
  });
}

async function createFollowUpRule(context, nome) {
  return service.createRule(context, {
    nome,
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [followUpAction()],
  });
}

function followUpAction() {
  return {
    tipo: "CREATE_FOLLOW_UP",
    delayMinutos: 30,
    titulo: "Acompanhamento interno",
    descricao: "Criado por automacao tecnica.",
    prioridade: "MEDIA",
    tipoAcompanhamento: "RETORNO",
  };
}

async function createLegacyRule(context, nome, action, { active = false } = {}) {
  return prisma.automacaoRegra.create({
    data: {
      empresaId: context.empresaId,
      nome,
      ativa: active,
      prioridade: 20,
      gatilho: "LEAD_CREATED",
      condicoesJson: "[]",
      acoesJson: JSON.stringify([action]),
      timezone: "America/Sao_Paulo",
      activatedAt: active ? new Date(Date.now() - 1000) : null,
      createdById: context.usuarioId,
      updatedById: context.usuarioId,
    },
  });
}

async function seedActionJob({ tenant, rule, entityType, entity, marker }) {
  const conditions = rule.condicoes || JSON.parse(rule.condicoesJson);
  const actions = rule.acoes || JSON.parse(rule.acoesJson);
  const snapshot = {
    id: rule.id,
    nome: rule.nome,
    gatilho: rule.gatilho,
    prioridade: rule.prioridade,
    timezone: rule.timezone,
    condicoes: conditions,
    acoes: actions,
    janela: null,
    versao: rule.versao,
  };
  const execution = await prisma.automacaoExecucao.create({
    data: {
      empresaId: tenant.empresa.id,
      regraId: rule.id,
      regraVersao: rule.versao,
      regraSnapshotJson: JSON.stringify(snapshot),
      entidadeTipo: entityType,
      entidadeId: entity.id,
      leadId: entityType === "LEAD" ? entity.id : null,
      negocioId: entityType === "NEGOCIO" ? entity.id : null,
      occurrenceKey: marker,
      idempotencyKey: hashKey(`${tenant.empresa.id}:${rule.id}:${marker}`),
      status: "PENDENTE",
    },
  });
  return prisma.automacaoAcaoJob.create({
    data: {
      empresaId: tenant.empresa.id,
      execucaoId: execution.id,
      indice: 0,
      tipo: snapshot.acoes[0].tipo,
      actionKey: hashKey(`${tenant.empresa.id}:${rule.id}:${marker}:0:${snapshot.acoes[0].tipo}`),
      status: "PENDENTE",
      nextAttemptAt: new Date(),
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

function prismaWithCancellationInterference(jobId) {
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return async (callback, options) => target.$transaction(async (tx) => {
          let interfered = false;
          const wrappedJobs = new Proxy(tx.automacaoAcaoJob, {
            get(jobTarget, jobProperty) {
              if (jobProperty === "updateMany") {
                return async (args) => {
                  if (!interfered && args?.data?.status === "CANCELADO") {
                    interfered = true;
                    await tx.automacaoAcaoJob.update({
                      where: { id: jobId },
                      data: {
                        status: "PROCESSANDO",
                        leaseOwner: "concurrent-worker",
                        leaseExpiresAt: new Date(Date.now() + 60000),
                      },
                    });
                  }
                  return jobTarget.updateMany(args);
                };
              }
              const value = Reflect.get(jobTarget, jobProperty);
              return typeof value === "function" ? value.bind(jobTarget) : value;
            },
          });
          const wrappedTx = new Proxy(tx, {
            get(txTarget, txProperty) {
              if (txProperty === "automacaoAcaoJob") return wrappedJobs;
              const value = Reflect.get(txTarget, txProperty);
              return typeof value === "function" ? value.bind(txTarget) : value;
            },
          });
          return callback(wrappedTx);
        }, options);
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function prismaWithHistoryFailure() {
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return async (callback, options) => target.$transaction(async (tx) => {
          const wrappedHistory = new Proxy(tx.historicoAtribuicao, {
            get(historyTarget, historyProperty) {
              if (historyProperty === "create") return async () => {
                throw new Error("Falha intermediaria controlada.");
              };
              const value = Reflect.get(historyTarget, historyProperty);
              return typeof value === "function" ? value.bind(historyTarget) : value;
            },
          });
          const wrappedTx = new Proxy(tx, {
            get(txTarget, txProperty) {
              if (txProperty === "historicoAtribuicao") return wrappedHistory;
              const value = Reflect.get(txTarget, txProperty);
              return typeof value === "function" ? value.bind(txTarget) : value;
            },
          });
          return callback(wrappedTx);
        }, options);
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function prismaWithEntityMutation(mutate) {
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return async (callback, options) => target.$transaction(async (tx) => {
          const wrappedLead = new Proxy(tx.lead, {
            get(leadTarget, leadProperty) {
              if (leadProperty === "findFirst") {
                return async (args) => {
                  const entity = await leadTarget.findFirst(args);
                  return entity ? mutate(entity) : entity;
                };
              }
              const value = Reflect.get(leadTarget, leadProperty);
              return typeof value === "function" ? value.bind(leadTarget) : value;
            },
          });
          const wrappedTx = new Proxy(tx, {
            get(txTarget, txProperty) {
              if (txProperty === "lead") return wrappedLead;
              const value = Reflect.get(txTarget, txProperty);
              return typeof value === "function" ? value.bind(txTarget) : value;
            },
          });
          return callback(wrappedTx);
        }, options);
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function prismaWithFollowUpHistoryFailure() {
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return async (callback, options) => target.$transaction(async (tx) => {
          const wrappedHistory = new Proxy(tx.historicoAcompanhamento, {
            get(historyTarget, historyProperty) {
              if (historyProperty === "create") return async () => {
                throw new Error("Falha intermediaria controlada.");
              };
              const value = Reflect.get(historyTarget, historyProperty);
              return typeof value === "function" ? value.bind(historyTarget) : value;
            },
          });
          const wrappedTx = new Proxy(tx, {
            get(txTarget, txProperty) {
              if (txProperty === "historicoAcompanhamento") return wrappedHistory;
              const value = Reflect.get(txTarget, txProperty);
              return typeof value === "function" ? value.bind(txTarget) : value;
            },
          });
          return callback(wrappedTx);
        }, options);
      }
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
