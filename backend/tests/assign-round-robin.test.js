const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { WORKER_ACTION_TYPES } = require("../src/automations/actions");
const { createAutomationService } = require("../src/automations/service");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const env = { AUTOMATIONS_ENABLED: "true", NODE_ENV: "test" };
const roundRobinActions = [...WORKER_ACTION_TYPES, "ASSIGN_ROUND_ROBIN"];
let sequence = 0;

before(cleanDatabase);
afterEach(cleanDatabase);
after(() => prisma.$disconnect());

test("round-robin permanece indisponivel e normaliza a ordem configurada", async () => {
  const tenant = await seedTenant("round-robin-order");
  const users = await Promise.all([
    seedUser(tenant.empresa.id, "Usuario 3"),
    seedUser(tenant.empresa.id, "Usuario 1"),
    seedUser(tenant.empresa.id, "Usuario 2"),
  ]);
  const service = createAutomationService({ prisma, env });

  assert.equal(WORKER_ACTION_TYPES.includes("ASSIGN_ROUND_ROBIN"), false);
  await assert.rejects(
    service.createRule(adminContext(tenant), rulePayload([users[2].id, users[0].id, users[1].id])),
    (error) => error?.codigo === "AUTOMATION_ACTION_UNAVAILABLE",
  );

  const rule = await seedRule(tenant, [users[2].id, users[0].id, users[1].id, users[0].id]);
  const lead = await seedLead(tenant);
  await seedJob(tenant, rule, "LEAD", lead, "stable-order");
  await processOne(service, "stable-order");

  assert.equal(
    (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).responsavelId,
    Math.min(...users.map((user) => user.id)),
  );
});

test("round-robin percorre a ordem, reinicia cursor ausente e nao avanca em no-op", async () => {
  const tenant = await seedTenant("round-robin-cycle");
  const first = await seedUser(tenant.empresa.id, "Primeiro");
  const second = await seedUser(tenant.empresa.id, "Segundo");
  const third = await seedUser(tenant.empresa.id, "Terceiro");
  const rule = await seedRule(tenant, [third.id, first.id, second.id]);
  const service = createAutomationService({ prisma, env });
  const leads = [];

  for (let index = 0; index < 4; index += 1) {
    const lead = await seedLead(tenant);
    leads.push(lead);
    await seedJob(tenant, rule, "LEAD", lead, `cycle-${index}`);
    await processOne(service, `cycle-${index}`);
  }

  const assigned = await prisma.lead.findMany({
    where: { id: { in: leads.map((lead) => lead.id) } },
    orderBy: { id: "asc" },
    select: { responsavelId: true },
  });
  assert.deepEqual(assigned.map((lead) => lead.responsavelId), [first.id, second.id, third.id, first.id]);
  const state = await roundRobinState(tenant, rule);
  assert.equal(state.ultimoResponsavelId, first.id);
  assert.equal(state.revisao, 5);

  const alreadyAssigned = await seedLead(tenant, { responsavelId: third.id });
  await seedJob(tenant, rule, "LEAD", alreadyAssigned, "already-assigned");
  await processOne(service, "already-assigned");
  assert.deepEqual(await roundRobinState(tenant, rule), state);
  assert.equal(await historyCount(tenant, alreadyAssigned.id), 0);

  await prisma.automacaoRoundRobinEstado.update({
    where: { id: state.id },
    data: { ultimoResponsavelId: tenant.admin.id },
  });
  const cursorOutside = await seedLead(tenant);
  await seedJob(tenant, rule, "LEAD", cursorOutside, "cursor-outside");
  await processOne(service, "cursor-outside");
  assert.equal(
    (await prisma.lead.findUniqueOrThrow({ where: { id: cursorOutside.id } })).responsavelId,
    first.id,
  );
});

test("round-robin atribui Negocio e cria exatamente um historico", async () => {
  const tenant = await seedTenant("round-robin-business");
  const owner = await seedUser(tenant.empresa.id, "Responsavel Negocio");
  const rule = await seedRule(tenant, [owner.id], "DEAL_STALLED");
  const negocio = await seedNegocio(tenant);
  const job = await seedJob(tenant, rule, "NEGOCIO", negocio, "business");
  const service = createAutomationService({ prisma, env });

  await processOne(service, "business");

  assert.equal((await prisma.negocio.findUniqueOrThrow({ where: { id: negocio.id } })).responsavelId, owner.id);
  assert.equal(await prisma.historicoAtribuicao.count({
    where: { empresaId: tenant.empresa.id, negocioId: negocio.id, responsavelNovoId: owner.id },
  }), 1);
  assert.equal((await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } })).status, "CONCLUIDO");
});

test("round-robin filtra usuarios invalidos e falha permanentemente sem elegiveis", async () => {
  const tenant = await seedTenant("round-robin-invalid");
  const other = await seedTenant("round-robin-other");
  const inactive = await seedUser(tenant.empresa.id, "Inativo");
  await prisma.usuario.update({ where: { id: inactive.id }, data: { ativo: false } });
  const rule = await seedRule(tenant, [inactive.id, other.admin.id, 2147483000]);
  const lead = await seedLead(tenant);
  const job = await seedJob(tenant, rule, "LEAD", lead, "no-eligible");
  const service = createAutomationService({ prisma, env });

  await processOne(service, "no-eligible");

  const persisted = await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(persisted.status, "FALHA_DEFINITIVA");
  assert.equal(persisted.erroCodigo, "NO_ELIGIBLE_USER");
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).responsavelId, null);
  assert.equal(await prisma.automacaoRoundRobinEstado.count({ where: { empresaId: tenant.empresa.id } }), 0);
  assert.equal(await historyCount(tenant, lead.id), 0);
});

test("CAS perdedor reverte e repete a transacao antes de concluir", async () => {
  const tenant = await seedTenant("round-robin-cas");
  const first = await seedUser(tenant.empresa.id, "CAS Primeiro");
  const second = await seedUser(tenant.empresa.id, "CAS Segundo");
  const rule = await seedRule(tenant, [first.id, second.id]);
  const lead = await seedLead(tenant);
  const job = await seedJob(tenant, rule, "LEAD", lead, "cas-retry");
  const controlled = prismaWithRoundRobinFaults({ cursorConflicts: 1 });
  const service = createAutomationService({ prisma: controlled.prisma, env });

  await processOne(service, "cas-retry");

  assert.equal(controlled.stats.cursorConflicts, 1);
  assert.equal(controlled.stats.actionTransactions, 2);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).responsavelId, first.id);
  assert.equal(await historyCount(tenant, lead.id), 1);
  const state = await roundRobinState(tenant, rule);
  assert.equal(state.ultimoResponsavelId, first.id);
  assert.equal(state.revisao, 2);
  assert.equal((await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } })).tentativas, 1);
});

test("conflito persistente volta ao retry do worker sem efeito parcial", async () => {
  const tenant = await seedTenant("round-robin-cas-exhausted");
  const owner = await seedUser(tenant.empresa.id, "CAS Exhausted");
  const rule = await seedRule(tenant, [owner.id]);
  const lead = await seedLead(tenant);
  const job = await seedJob(tenant, rule, "LEAD", lead, "cas-exhausted");
  const controlled = prismaWithRoundRobinFaults({ cursorConflicts: 5 });
  const service = createAutomationService({ prisma: controlled.prisma, env });

  await processOne(service, "cas-exhausted");

  assert.equal(controlled.stats.actionTransactions, 5);
  assert.equal(controlled.stats.cursorConflicts, 5);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).responsavelId, null);
  assert.equal(await historyCount(tenant, lead.id), 0);
  assert.equal(await prisma.automacaoRoundRobinEstado.count({
    where: { empresaId: tenant.empresa.id, regraId: rule.id },
  }), 0);
  const persisted = await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(persisted.status, "FALHOU");
  assert.equal(persisted.erroCodigo, "ROUND_ROBIN_STATE_CONFLICT");
});

test("usuario invalidado entre selecao e atribuicao nao avanca o cursor", async () => {
  const tenant = await seedTenant("round-robin-revalidate");
  const owner = await seedUser(tenant.empresa.id, "Revalidate Owner");
  const rule = await seedRule(tenant, [owner.id]);
  const lead = await seedLead(tenant);
  const job = await seedJob(tenant, rule, "LEAD", lead, "revalidate-owner");
  const controlled = prismaWithRoundRobinFaults({ responsibleValidationFailures: 1 });
  const service = createAutomationService({ prisma: controlled.prisma, env });

  await processOne(service, "revalidate-owner");

  assert.equal(controlled.stats.responsibleValidationFailures, 1);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).responsavelId, null);
  assert.equal(await historyCount(tenant, lead.id), 0);
  assert.equal(await prisma.automacaoRoundRobinEstado.count({
    where: { empresaId: tenant.empresa.id, regraId: rule.id },
  }), 0);
  const persisted = await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(persisted.status, "FALHOU");
  assert.equal(persisted.erroCodigo, "USER_NOT_FOUND");
});

test("corrida na criacao do estado e falha de historico preservam atomicidade", async () => {
  const tenant = await seedTenant("round-robin-atomic");
  const owner = await seedUser(tenant.empresa.id, "Atomic Owner");
  const rule = await seedRule(tenant, [owner.id]);
  const firstLead = await seedLead(tenant);
  await seedJob(tenant, rule, "LEAD", firstLead, "initial-state-race");
  const initialRace = prismaWithRoundRobinFaults({ initialStateConflicts: 1 });
  await processOne(createAutomationService({ prisma: initialRace.prisma, env }), "initial-state-race");
  assert.equal(initialRace.stats.initialStateConflicts, 1);
  assert.equal(initialRace.stats.actionTransactions, 2);
  assert.equal(await historyCount(tenant, firstLead.id), 1);

  const stateBefore = await roundRobinState(tenant, rule);
  const secondLead = await seedLead(tenant);
  await seedJob(tenant, rule, "LEAD", secondLead, "history-rollback");
  const historyFailure = prismaWithRoundRobinFaults({ historyFailures: 1, transactionAttempts: 1 });
  await processOne(createAutomationService({ prisma: historyFailure.prisma, env }), "history-rollback");
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: secondLead.id } })).responsavelId, null);
  assert.equal(await historyCount(tenant, secondLead.id), 0);
  assert.deepEqual(await roundRobinState(tenant, rule), stateBefore);
});

test("retry depois do commit vira no-op sem novo historico ou cursor", async () => {
  const tenant = await seedTenant("round-robin-idempotent");
  const owner = await seedUser(tenant.empresa.id, "Idempotent Owner");
  const rule = await seedRule(tenant, [owner.id]);
  const lead = await seedLead(tenant);
  const job = await seedJob(tenant, rule, "LEAD", lead, "after-commit");
  const service = createAutomationService({ prisma, env });
  await processOne(service, "after-commit");
  const state = await roundRobinState(tenant, rule);

  await prisma.automacaoAcaoJob.update({
    where: { id: job.id },
    data: { status: "FALHOU", nextAttemptAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
  });
  await processOne(service, "after-commit-retry");

  assert.equal(await historyCount(tenant, lead.id), 1);
  assert.deepEqual(await roundRobinState(tenant, rule), state);
  const persisted = await prisma.automacaoAcaoJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(persisted.status, "CONCLUIDO");
  await assert.rejects(
    prisma.automacaoAcaoJob.create({
      data: {
        empresaId: tenant.empresa.id,
        execucaoId: persisted.execucaoId,
        indice: persisted.indice + 1,
        tipo: persisted.tipo,
        actionKey: persisted.actionKey,
        status: "PENDENTE",
        nextAttemptAt: new Date(),
      },
    }),
    (error) => error?.code === "P2002",
  );
});

test("quatro jobs concorrentes mantem uma atribuicao e um avanco por entidade", async () => {
  const tenant = await seedTenant("round-robin-concurrent");
  const owners = await Promise.all([
    seedUser(tenant.empresa.id, "Concorrente 1"),
    seedUser(tenant.empresa.id, "Concorrente 2"),
    seedUser(tenant.empresa.id, "Concorrente 3"),
    seedUser(tenant.empresa.id, "Concorrente 4"),
  ]);
  const rule = await seedRule(tenant, owners.map((owner) => owner.id).reverse());
  const leads = [];
  for (let index = 0; index < 4; index += 1) {
    const lead = await seedLead(tenant);
    leads.push(lead);
    await seedJob(tenant, rule, "LEAD", lead, `concurrent-${index}`);
  }

  const services = Array.from({ length: 4 }, () => createAutomationService({ prisma, env }));
  const now = new Date(Date.now() + 1000);
  await Promise.all(services.map((service, index) => service.processDueJobs({
    now,
    limit: 1,
    leaseOwner: `round-robin-worker-${index}`,
    supportedActions: roundRobinActions,
  })));
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const remaining = await prisma.automacaoAcaoJob.count({
      where: { empresaId: tenant.empresa.id, status: { in: ["PENDENTE", "FALHOU"] } },
    });
    if (remaining === 0) break;
    await processOne(services[cycle % services.length], `concurrent-drain-${cycle}`, new Date(now.getTime() + 120000 + cycle * 120000));
  }

  const assigned = await prisma.lead.findMany({
    where: { id: { in: leads.map((lead) => lead.id) } },
    select: { responsavelId: true },
  });
  assert.equal(new Set(assigned.map((lead) => lead.responsavelId)).size, 4);
  assert.equal(await prisma.historicoAtribuicao.count({
    where: { empresaId: tenant.empresa.id, leadId: { in: leads.map((lead) => lead.id) } },
  }), 4);
  const state = await roundRobinState(tenant, rule);
  assert.equal(state.revisao, 5);
  assert.equal(await prisma.automacaoAcaoJob.count({
    where: { empresaId: tenant.empresa.id, status: { not: "CONCLUIDO" } },
  }), 0);
});

test("cursores sao independentes por regra e tenant", async () => {
  const tenantA = await seedTenant("round-robin-tenant-a");
  const tenantB = await seedTenant("round-robin-tenant-b");
  const a1 = await seedUser(tenantA.empresa.id, "A1");
  const a2 = await seedUser(tenantA.empresa.id, "A2");
  const b1 = await seedUser(tenantB.empresa.id, "B1");
  const ruleA1 = await seedRule(tenantA, [a1.id, a2.id]);
  const ruleA2 = await seedRule(tenantA, [a2.id]);
  const ruleB = await seedRule(tenantB, [b1.id]);
  const service = createAutomationService({ prisma, env });

  for (const [tenant, rule, marker] of [
    [tenantA, ruleA1, "tenant-a-rule-1"],
    [tenantA, ruleA2, "tenant-a-rule-2"],
    [tenantB, ruleB, "tenant-b-rule-1"],
  ]) {
    const lead = await seedLead(tenant);
    await seedJob(tenant, rule, "LEAD", lead, marker);
  }
  for (let index = 0; index < 3; index += 1) await processOne(service, `tenant-isolation-${index}`);

  assert.equal(await prisma.automacaoRoundRobinEstado.count(), 3);
  assert.equal((await roundRobinState(tenantA, ruleA1)).ultimoResponsavelId, a1.id);
  assert.equal((await roundRobinState(tenantA, ruleA2)).ultimoResponsavelId, a2.id);
  assert.equal((await roundRobinState(tenantB, ruleB)).ultimoResponsavelId, b1.id);
});

async function cleanDatabase() {
  await prisma.$transaction([
    prisma.automacaoEventoInterno.deleteMany(),
    prisma.automacaoAcaoJob.deleteMany(),
    prisma.automacaoExecucao.deleteMany(),
    prisma.automacaoRoundRobinEstado.deleteMany(),
    prisma.automacaoRegra.deleteMany(),
    prisma.historicoAtribuicao.deleteMany(),
    prisma.negocio.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.cliente.deleteMany(),
    prisma.empresaFuncionalidade.deleteMany(),
    prisma.usuario.deleteMany(),
    prisma.empresa.deleteMany(),
  ]);
}

async function seedTenant(label) {
  const slug = `${label}-${process.pid}-${++sequence}`;
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa ${slug}`, slug } });
  const admin = await seedUser(empresa.id, "Admin");
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

async function seedUser(empresaId, nome) {
  return prisma.usuario.create({
    data: {
      empresaId,
      nome,
      email: `round-robin-${process.pid}-${++sequence}@test.invalid`,
      senhaHash: "test-hash",
      papel: "VENDEDOR",
      ativo: true,
    },
  });
}

async function seedLead(tenant, overrides = {}) {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Cliente ${++sequence}`,
      telefone: "",
      email: "",
      empresa: "Teste",
      interesse: "Round robin",
      origem: "TESTE",
    },
  });
  return prisma.lead.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: cliente.id,
      status: "NOVO",
      origem: "SITE",
      interesse: "Round robin",
      ...overrides,
    },
  });
}

async function seedNegocio(tenant) {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Cliente Negocio ${++sequence}`,
      telefone: "",
      email: "",
      empresa: "Teste",
      interesse: "Round robin",
      origem: "TESTE",
    },
  });
  return prisma.negocio.create({
    data: {
      empresaId: tenant.empresa.id,
      clienteId: cliente.id,
      etapa: "NOVO",
      titulo: "Negocio round robin",
    },
  });
}

async function seedRule(tenant, usuarioIds, gatilho = "LEAD_CREATED") {
  return prisma.automacaoRegra.create({
    data: {
      empresaId: tenant.empresa.id,
      nome: `Round robin ${++sequence}`,
      ativa: true,
      prioridade: 20,
      gatilho,
      condicoesJson: "[]",
      acoesJson: JSON.stringify([{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds }]),
      timezone: "America/Sao_Paulo",
      activatedAt: new Date(Date.now() - 1000),
      createdById: tenant.admin.id,
      updatedById: tenant.admin.id,
    },
  });
}

async function seedJob(tenant, rule, entityType, entity, marker) {
  const snapshot = {
    id: rule.id,
    nome: rule.nome,
    gatilho: rule.gatilho,
    prioridade: rule.prioridade,
    timezone: rule.timezone,
    condicoes: [],
    acoes: JSON.parse(rule.acoesJson),
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
      tipo: "ASSIGN_ROUND_ROBIN",
      actionKey: hashKey(`${tenant.empresa.id}:${rule.id}:${marker}:0:ASSIGN_ROUND_ROBIN`),
      status: "PENDENTE",
      nextAttemptAt: new Date(),
    },
  });
}

async function processOne(service, leaseOwner, now = new Date(Date.now() + 1000)) {
  return service.processDueJobs({
    now,
    limit: 1,
    leaseOwner,
    supportedActions: roundRobinActions,
  });
}

async function roundRobinState(tenant, rule) {
  return prisma.automacaoRoundRobinEstado.findUniqueOrThrow({
    where: {
      empresaId_regraId: {
        empresaId: tenant.empresa.id,
        regraId: rule.id,
      },
    },
  });
}

async function historyCount(tenant, leadId) {
  return prisma.historicoAtribuicao.count({
    where: { empresaId: tenant.empresa.id, leadId },
  });
}

function adminContext(tenant) {
  return {
    empresaId: tenant.empresa.id,
    usuarioId: tenant.admin.id,
    papel: "ADMIN",
  };
}

function rulePayload(usuarioIds) {
  return {
    nome: "Round robin indisponivel",
    prioridade: 20,
    gatilho: "LEAD_CREATED",
    timezone: "America/Sao_Paulo",
    condicoes: [],
    acoes: [{ tipo: "ASSIGN_ROUND_ROBIN", usuarioIds }],
  };
}

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function prismaWithRoundRobinFaults({
  cursorConflicts = 0,
  initialStateConflicts = 0,
  historyFailures = 0,
  responsibleValidationFailures = 0,
} = {}) {
  const stats = {
    actionTransactions: 0,
    cursorConflicts: 0,
    initialStateConflicts: 0,
    historyFailures: 0,
    responsibleValidationFailures: 0,
  };
  const wrapped = new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return async (callback, options) => {
          if (Array.isArray(callback)) return target.$transaction(callback, options);
          stats.actionTransactions += 1;
          return target.$transaction(async (tx) => {
            const roundRobin = new Proxy(tx.automacaoRoundRobinEstado, {
              get(model, method) {
                if (method === "upsert" && stats.initialStateConflicts < initialStateConflicts) {
                  return async () => {
                    stats.initialStateConflicts += 1;
                    const error = new Error("Conflito controlado ao criar estado.");
                    error.code = "P2002";
                    throw error;
                  };
                }
                if (method === "updateMany" && stats.cursorConflicts < cursorConflicts) {
                  return async (args) => {
                    const result = await model.updateMany(args);
                    stats.cursorConflicts += 1;
                    return { ...result, count: 0 };
                  };
                }
                const value = Reflect.get(model, method);
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const history = new Proxy(tx.historicoAtribuicao, {
              get(model, method) {
                if (method === "create" && stats.historyFailures < historyFailures) {
                  return async () => {
                    stats.historyFailures += 1;
                    throw new Error("Falha controlada no historico.");
                  };
                }
                const value = Reflect.get(model, method);
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const users = new Proxy(tx.usuario, {
              get(model, method) {
                if (method === "findFirst" && stats.responsibleValidationFailures < responsibleValidationFailures) {
                  return async () => {
                    stats.responsibleValidationFailures += 1;
                    return null;
                  };
                }
                const value = Reflect.get(model, method);
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const wrappedTx = new Proxy(tx, {
              get(txTarget, txProperty) {
                if (txProperty === "automacaoRoundRobinEstado") return roundRobin;
                if (txProperty === "historicoAtribuicao") return history;
                if (txProperty === "usuario") return users;
                const value = Reflect.get(txTarget, txProperty);
                return typeof value === "function" ? value.bind(txTarget) : value;
              },
            });
            return callback(wrappedTx);
          }, options);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { prisma: wrapped, stats };
}
