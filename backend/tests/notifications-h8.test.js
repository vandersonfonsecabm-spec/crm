const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createNotificationService, parseTenantAllowlist } = require("../src/notifications/service");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
const now = new Date("2030-06-15T12:00:00.000Z");
const env = { H8_NOTIFICATIONS_ENABLED: "true", H8_NOTIFICATION_TENANT_ALLOWLIST: "", NODE_ENV: "test" };
const service = createNotificationService({ prisma, env, clock: () => now });
const tenantIds = new Set();
let sequence = 0;

before(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  for (const empresaId of tenantIds) {
    await prisma.notificacao.deleteMany({ where: { empresaId } });
    await prisma.auditoriaSeguranca.deleteMany({ where: { empresaId } });
    await prisma.preferenciaNotificacaoUsuario.deleteMany({ where: { empresaId } });
    await prisma.configuracaoNotificacaoEmpresa.deleteMany({ where: { empresaId } });
    await prisma.acompanhamento.deleteMany({ where: { empresaId } });
    await prisma.usuario.deleteMany({ where: { empresaId } });
    await prisma.empresa.deleteMany({ where: { id: empresaId } });
  }
  tenantIds.clear();
  env.H8_NOTIFICATION_TENANT_ALLOWLIST = "";
});

after(() => prisma.$disconnect());

test("allowlist de tenants valida vazio, tokens invalidos, limite INT32 e duplicatas", () => {
  assert.deepEqual(parseTenantAllowlist(""), []);
  assert.deepEqual(parseTenantAllowlist("1,abc"), []);
  assert.deepEqual(parseTenantAllowlist("0"), []);
  assert.deepEqual(parseTenantAllowlist("1,,2"), []);
  assert.deepEqual(parseTenantAllowlist("1,2147483648"), []);
  assert.deepEqual(parseTenantAllowlist("2,1,2"), [2, 1]);
});

test("H8 permanece desligada por padrao e nao projeta nem lista", async () => {
  const tenant = await seedTenant("disabled", { enabled: false });
  const disabled = createNotificationService({ prisma, env, clock: () => now });
  const result = await disabled.projectForTenant(tenant.empresa.id);
  assert.equal(result.disabled, true);
  await assert.rejects(
    disabled.summary(tenant.context),
    (error) => error?.codigo === "NOTIFICATIONS_DISABLED" && error?.status === 404,
  );
});

test("leitura nao materializa notificacoes quando o worker H8 esta desligado", async () => {
  const tenant = await seedTenant("read-no-worker");
  await prisma.acompanhamento.create({
    data: {
      empresaId: tenant.empresa.id,
      responsavelId: tenant.admin.id,
      autorId: tenant.admin.id,
      titulo: "Retornar para cliente",
      descricao: "Acompanhamento de teste.",
      dataHora: new Date(now.getTime() - 5 * 60000),
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
    },
  });
  await service.summary(tenant.context);
  await service.list(tenant.context, { limit: 20 });
  assert.equal(await prisma.notificacao.count({ where: { empresaId: tenant.empresa.id } }), 0);
});

test("projecao de acompanhamento e idempotente, acionavel e isolada", async () => {
  const tenant = await seedTenant("projection");
  const followUp = await prisma.acompanhamento.create({
    data: {
      empresaId: tenant.empresa.id,
      responsavelId: tenant.admin.id,
      autorId: tenant.admin.id,
      titulo: "Retornar para cliente",
      descricao: "Confirmar disponibilidade.",
      dataHora: new Date(now.getTime() - 5 * 60000),
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
    },
  });
  await service.projectForTenant(tenant.empresa.id);
  await service.projectForTenant(tenant.empresa.id);

  assert.equal(await prisma.notificacao.count({ where: { empresaId: tenant.empresa.id } }), 1);
  const listed = await service.list(tenant.context, { limit: 20 });
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.data[0].destino.tipo, "FOLLOW_UP");
  assert.equal(listed.data[0].destino.id, followUp.id);
  assert.equal(listed.data[0].titulo, "Acompanhamento atrasado");
  assert.equal(listed.data[0].nova, true);
  assert.match(listed.data[0].destino.rota, new RegExp(`acompanhamentoId=${followUp.id}`));

  const read = await service.markRead(tenant.context, listed.data[0].id);
  assert.equal(read.nova, false);
  assert.equal(read.resolvidaEm, null);

  const beforeSnooze = await prisma.notificacao.findUniqueOrThrow({ where: { id: listed.data[0].id } });
  await service.snooze(tenant.context, listed.data[0].id, { minutes: 60 });
  const afterSnooze = await prisma.notificacao.findUniqueOrThrow({ where: { id: listed.data[0].id } });
  assert.equal(afterSnooze.venceEm.getTime(), beforeSnooze.venceEm.getTime());
  assert.equal(afterSnooze.lidaEm !== null, true);
  assert.equal((await service.list(tenant.context, { limit: 20 })).pagination.total, 0);
  assert.equal((await service.list(tenant.context, { limit: 20 })).snoozed.length, 1);

  await service.unsnooze(tenant.context, listed.data[0].id);
  assert.equal((await service.list(tenant.context, { limit: 20 })).pagination.total, 1);
  await service.resolve(tenant.context, listed.data[0].id);
  assert.equal((await service.summary(tenant.context)).total, 0);
});

test("marcar todas usa cutoff e nao captura notificacao criada depois", async () => {
  const tenant = await seedTenant("cutoff");
  const first = await createNotification(tenant, 1, new Date(now.getTime() - 1000), new Date(now.getTime() - 1000));
  const cutoff = now.toISOString();
  const second = await createNotification(tenant, 2, new Date(now.getTime() + 1000), new Date(now.getTime() + 1000));
  const result = await service.markAllRead(tenant.context, { cutoffAt: cutoff });
  assert.equal(result.marked, 1);
  const rows = await prisma.notificacao.findMany({ where: { empresaId: tenant.empresa.id }, orderBy: { id: "asc" } });
  assert.equal(rows.find((row) => row.id === first.id).lidaEm !== null, true);
  assert.equal(rows.find((row) => row.id === second.id).lidaEm, null);
});

test("destino removido e resolvido sem permanecer acionavel", async () => {
  const tenant = await seedTenant("removed-target");
  const row = await createNotification(tenant, 999999, new Date(now.getTime() - 1000));
  await service.projectForTenant(tenant.empresa.id);
  assert.equal((await service.summary(tenant.context)).total, 0);
  const stored = await prisma.notificacao.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(stored.resolvidaEm !== null, true);
});

test("preferencias validam limites e nunca atravessam tenant", async () => {
  const tenant = await seedTenant("preferences");
  const other = await seedTenant("preferences-other");
  await service.updatePreferences(tenant.context, { antecedenciaPadraoMinutos: 120 });
  assert.equal((await service.getPreferences(tenant.context)).usuario.antecedenciaPadraoMinutos, 120);
  await assert.rejects(
    service.updatePreferences(tenant.context, { antecedenciaPadraoMinutos: -1 }),
    (error) => error?.codigo === "VALIDATION_ERROR",
  );
  const foreignContext = { ...tenant.context, empresaId: other.empresa.id };
  assert.equal((await service.summary(foreignContext)).total, 0);
});

test("allowlist fail-closed impede outro tenant e audita habilitacao e reversao", async () => {
  const tenant = await seedTenant("activation-audit", { enabled: false });
  const other = await seedTenant("activation-other", { enabled: false, allowlist: false });

  await assert.rejects(
    service.updateSettings(other.context, { habilitada: true }),
    (error) => error?.codigo === "NOTIFICATIONS_DISABLED" && error?.status === 404,
  );
  assert.equal((await prisma.configuracaoNotificacaoEmpresa.findUniqueOrThrow({ where: { empresaId: other.empresa.id } })).habilitada, false);

  await service.updateSettings(tenant.context, { habilitada: true });
  await service.updateSettings(tenant.context, { habilitada: false });
  const audits = await prisma.auditoriaSeguranca.findMany({ where: { empresaId: tenant.empresa.id, acao: "H8_NOTIFICATION_SETTINGS" }, orderBy: { id: "asc" } });
  assert.equal(audits.length, 2);
  assert.equal(audits.every((audit) => audit.actorUsuarioId === tenant.admin.id && audit.resultado === "APLICADA" && typeof audit.correlationId === "string"), true);
  assert.match(audits[0].motivo, /habilitada=false->true/);
  assert.match(audits[1].motivo, /habilitada=true->false/);
});

test("worker H8 processa somente tenants presentes na allowlist", async () => {
  const tenant = await seedTenant("worker-allowlisted", { enabled: true });
  const other = await seedTenant("worker-unallowlisted", { enabled: true, allowlist: false });
  for (const current of [tenant, other]) {
    await prisma.acompanhamento.create({
      data: {
        empresaId: current.empresa.id,
        responsavelId: current.admin.id,
        autorId: current.admin.id,
        titulo: "Retornar para QA",
        descricao: "Acompanhamento sintético.",
        dataHora: new Date(now.getTime() - 5 * 60000),
        prioridade: "ALTA",
        status: "PENDENTE",
        tipo: "RETORNO",
      },
    });
  }
  const workerService = createNotificationService({ prisma, env: { ...env, NOTIFICATIONS_WORKER_ENABLED: "true" }, clock: () => now });
  const result = await workerService.processDue({ limit: 20 });
  assert.equal(result.tenants, 1);
  assert.equal(await prisma.notificacao.count({ where: { empresaId: tenant.empresa.id } }), 1);
  assert.equal(await prisma.notificacao.count({ where: { empresaId: other.empresa.id } }), 0);
});

test("reagendamento e transferencia encerram a ocorrencia e o destinatario anteriores", async () => {
  const tenant = await seedTenant("reconcile");
  const manager = await prisma.usuario.create({ data: { empresaId: tenant.empresa.id, nome: "Gerente H8", email: `manager-${tenant.empresa.id}@h8.test`, senhaHash: "hash-test", papel: "GERENTE", ativo: true } });
  const followUp = await prisma.acompanhamento.create({
    data: {
      empresaId: tenant.empresa.id,
      responsavelId: tenant.admin.id,
      autorId: tenant.admin.id,
      titulo: "Retornar para cliente",
      descricao: "Acompanhamento de transferência.",
      dataHora: new Date(now.getTime() - 5 * 60000),
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
    },
  });
  await service.projectForTenant(tenant.empresa.id);
  await prisma.acompanhamento.update({ where: { id: followUp.id }, data: { responsavelId: manager.id, dataHora: new Date(now.getTime() + 5 * 60000) } });
  await service.projectForTenant(tenant.empresa.id);
  const rows = await prisma.notificacao.findMany({ where: { empresaId: tenant.empresa.id }, orderBy: { id: "asc" } });
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.resolvidaEm === null).length, 1);
  assert.equal(rows.find((row) => row.responsavelId === undefined && row.destinatarioId === manager.id)?.resolvidaEm, null);
  assert.equal(rows.find((row) => row.destinatarioId === tenant.admin.id)?.resolvidaEm !== null, true);
});

async function seedTenant(label, { enabled = true, allowlist = true } = {}) {
  const slug = `h8-${label}-${process.pid}-${++sequence}`;
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa ${slug}`, slug } });
  const admin = await prisma.usuario.create({
    data: { empresaId: empresa.id, nome: "Admin H8", email: `${slug}@h8.test`, senhaHash: "hash-test", papel: "ADMIN", ativo: true },
  });
  await prisma.configuracaoNotificacaoEmpresa.create({ data: { empresaId: empresa.id, habilitada: enabled } });
  if (allowlist) {
    env.H8_NOTIFICATION_TENANT_ALLOWLIST = [env.H8_NOTIFICATION_TENANT_ALLOWLIST, String(empresa.id)].filter(Boolean).join(",");
  }
  tenantIds.add(empresa.id);
  return { empresa, admin, context: { empresaId: empresa.id, usuarioId: admin.id, papel: "ADMIN" } };
}

async function createNotification(tenant, idSuffix, occurredAt, createdAt = occurredAt) {
  return prisma.notificacao.create({
    data: {
      empresaId: tenant.empresa.id,
      destinatarioId: tenant.admin.id,
      tipo: "NOVA_MENSAGEM",
      prioridade: "NORMAL",
      origemTipo: "CONVERSATION",
      origemId: idSuffix,
      occurrenceKey: `cutoff:${idSuffix}`,
      dedupeKey: `cutoff:${idSuffix}`,
      titulo: "Nova mensagem",
      corpo: "Uma conversa aguarda resposta.",
      alvoTipo: "CONVERSATION",
      alvoId: idSuffix,
      ocorridoEm: occurredAt,
      createdAt,
    },
  });
}
