const crypto = require("node:crypto");
const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../tenant-features/service");
const { presentRule, safeJson, snapshotRule, validateRulePayload } = require("./validation");

const ACTIVE_FOLLOW_UP_STATUSES = ["PENDENTE", "EM_ANDAMENTO"];
const TERMINAL_JOB_STATUSES = ["CONCLUIDO", "CANCELADO", "FALHA_DEFINITIVA"];
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 60000;
const DEFAULT_LEASE_MS = 60000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;
const DEFAULT_WORKER_ACTIONS = Object.freeze(["CREATE_INTERNAL_EVENT"]);
const RETRYABLE_JOB_STATUSES = Object.freeze(["PENDENTE", "FALHOU"]);

function createAutomationService({ prisma, env = process.env }) {
  async function listRules(context, query = {}) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(positiveInteger(query.limit, 20), 100);
    const where = { empresaId: context.empresaId };
    if (query.ativa === "true") where.ativa = true;
    if (query.ativa === "false") where.ativa = false;
    if (query.gatilho) where.gatilho = String(query.gatilho).trim().toUpperCase();
    const [data, total] = await prisma.$transaction([
      prisma.automacaoRegra.findMany({ where, orderBy: [{ prioridade: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.automacaoRegra.count({ where }),
    ]);
    return pageResult(data.map(presentRule), total, page, limit);
  }

  async function getRule(context, id) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const rule = await findRule(context, id);
    return presentRule(rule);
  }

  async function createRule(context, input) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const data = validateRulePayload(input);
    const row = await prisma.automacaoRegra.create({
      data: {
        empresaId: context.empresaId,
        nome: data.nome,
        descricao: data.descricao,
        prioridade: data.prioridade,
        gatilho: data.gatilho,
        condicoesJson: JSON.stringify(data.condicoes),
        acoesJson: JSON.stringify(data.acoes),
        timezone: data.timezone,
        janelaJson: data.janela ? JSON.stringify(data.janela) : null,
        createdById: context.usuarioId,
        updatedById: context.usuarioId,
      },
    });
    return presentRule(row);
  }

  async function updateRule(context, id, input) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    await findRule(context, id);
    const data = validateRulePayload(input, { partial: true });
    if (!Object.keys(data).length) throw domainError(422, "VALIDATION_ERROR", "Informe ao menos um campo para atualizar.");
    const update = { updatedById: context.usuarioId, versao: { increment: 1 } };
    for (const field of ["nome", "descricao", "prioridade", "gatilho", "timezone"]) if (Object.hasOwn(data, field)) update[field] = data[field];
    if (Object.hasOwn(data, "condicoes")) update.condicoesJson = JSON.stringify(data.condicoes);
    if (Object.hasOwn(data, "acoes")) update.acoesJson = JSON.stringify(data.acoes);
    if (Object.hasOwn(data, "janela")) update.janelaJson = data.janela ? JSON.stringify(data.janela) : null;
    const row = await prisma.automacaoRegra.update({ where: { id }, data: update });
    return presentRule(row);
  }

  async function activateRule(context, id) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const rule = await findRule(context, id);
    if (rule.ativa) return presentRule(rule);
    const row = await prisma.automacaoRegra.update({
      where: { id },
      data: { ativa: true, activatedAt: new Date(), updatedById: context.usuarioId, versao: { increment: 1 } },
    });
    return presentRule(row);
  }

  async function deactivateRule(context, id) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const row = await prisma.$transaction(async (tx) => {
      const rule = await tx.automacaoRegra.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!rule) throw notFound("Regra nao encontrada.");
      await tx.automacaoAcaoJob.updateMany({
        where: { empresaId: context.empresaId, execucao: { regraId: id }, status: "PENDENTE" },
        data: { status: "CANCELADO", erroCodigo: "RULE_DISABLED", erroResumo: "Regra desativada antes da execucao." },
      });
      return tx.automacaoRegra.update({ where: { id }, data: { ativa: false, updatedById: context.usuarioId, versao: { increment: 1 } } });
    });
    return presentRule(row);
  }

  async function enqueueLeadCreated({ tx, empresaId, leadId, originalEventId = null, occurredAt = new Date() }) {
    return enqueueOccurrence(tx, { empresaId, trigger: "LEAD_CREATED", entityType: "LEAD", entityId: leadId, leadId, originalEventId, occurredAt });
  }

  async function scanTemporalTriggers({ now = new Date(), limit = 50 } = {}) {
    const tenants = await prisma.empresaFuncionalidade.findMany({
      where: { chave: FEATURE_KEYS.AUTOMATIONS, habilitada: true },
      select: { empresaId: true },
      take: Math.min(limit, 100),
    });
    let created = 0;
    for (const tenant of tenants) {
      if (!(await isFeatureEnabledForTenant({ prisma, empresaId: tenant.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS, env }))) continue;
      created += await scanLeadWithoutFollowUp(tenant.empresaId, now, limit);
      created += await scanDealStalled(tenant.empresaId, now, limit);
    }
    return { created };
  }

  async function scanLeadWithoutFollowUp(empresaId, now, limit) {
    const rules = await activeRules(empresaId, "LEAD_WITHOUT_FOLLOW_UP");
    let count = 0;
    for (const rule of rules) {
      const threshold = thresholdMinutes(rule, "tempoSemAcompanhamentoMinutos");
      if (!threshold || !rule.activatedAt) continue;
      const cutoff = new Date(now.getTime() - threshold * 60000);
      const leads = await prisma.lead.findMany({
        where: { empresaId, createdAt: { gte: rule.activatedAt, lte: cutoff }, status: { in: ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit,
      });
      for (const lead of leads) {
        const existing = await prisma.acompanhamento.count({ where: { empresaId, leadId: lead.id, createdAt: { gte: lead.createdAt } } });
        if (existing === 0) {
          count += (await enqueueOccurrence(prisma, {
            empresaId,
            trigger: rule.gatilho,
            entityType: "LEAD",
            entityId: lead.id,
            leadId: lead.id,
            occurredAt: lead.createdAt,
            elapsedMinutes: Math.floor((now.getTime() - lead.createdAt.getTime()) / 60000),
            onlyRuleId: rule.id,
          })).created;
        }
      }
    }
    return count;
  }

  async function scanDealStalled(empresaId, now, limit) {
    const rules = await activeRules(empresaId, "DEAL_STALLED");
    let count = 0;
    for (const rule of rules) {
      const threshold = thresholdMinutes(rule, "tempoParadoMinutos");
      if (!threshold || !rule.activatedAt) continue;
      const cutoff = new Date(now.getTime() - threshold * 60000);
      const negocios = await prisma.negocio.findMany({
        where: { empresaId, etapa: { notIn: ["FECHADO", "PERDIDO"] }, etapaEntrouEm: { gte: rule.activatedAt, lte: cutoff } },
        orderBy: [{ etapaEntrouEm: "asc" }, { id: "asc" }],
        take: limit,
      });
      for (const negocio of negocios) {
        count += (await enqueueOccurrence(prisma, {
          empresaId,
          trigger: rule.gatilho,
          entityType: "NEGOCIO",
          entityId: negocio.id,
          negocioId: negocio.id,
          occurredAt: negocio.etapaEntrouEm,
          elapsedMinutes: Math.floor((now.getTime() - negocio.etapaEntrouEm.getTime()) / 60000),
          onlyRuleId: rule.id,
        })).created;
      }
    }
    return count;
  }

  async function enqueueOccurrence(client, occurrence) {
    const featureEnabled = await isFeatureEnabledForTenant({
      prisma: client,
      empresaId: occurrence.empresaId,
      featureKey: FEATURE_KEYS.AUTOMATIONS,
      env,
    });
    if (!featureEnabled) return { created: 0 };

    const rules = occurrence.onlyRuleId
      ? await client.automacaoRegra.findMany({ where: { id: occurrence.onlyRuleId, empresaId: occurrence.empresaId, ativa: true } })
      : await client.automacaoRegra.findMany({ where: { empresaId: occurrence.empresaId, gatilho: occurrence.trigger, ativa: true }, orderBy: [{ prioridade: "asc" }, { id: "asc" }] });
    let created = 0;
    for (const rule of rules) {
      if (!rule.activatedAt || new Date(occurrence.occurredAt) < new Date(rule.activatedAt)) continue;
      const entity = await loadEntity(client, occurrence.empresaId, occurrence.entityType, occurrence.entityId);
      if (!entity || !conditionsPass(rule, entity, { ...occurrence, timezone: rule.timezone })) continue;
      const key = occurrenceKey(rule, occurrence);
      const snapshot = snapshotRule(rule);
      const execution = await upsertExecution(client, rule, occurrence, key, snapshot);
      if (execution.created) created += 1;
    }
    return { created };
  }

  async function upsertExecution(client, rule, occurrence, key, snapshot) {
    try {
      const exec = await client.automacaoExecucao.create({
        data: {
          empresaId: occurrence.empresaId,
          regraId: rule.id,
          regraVersao: rule.versao,
          regraSnapshotJson: JSON.stringify(snapshot),
          entidadeTipo: occurrence.entityType,
          entidadeId: occurrence.entityId,
          leadId: occurrence.leadId || null,
          negocioId: occurrence.negocioId || null,
          occurrenceKey: key,
          idempotencyKey: hashKey(`${occurrence.empresaId}:${rule.id}:${key}`),
          status: "PENDENTE",
          jobs: { create: snapshot.acoes.map((action, index) => ({ empresaId: occurrence.empresaId, indice: index, tipo: action.tipo, actionKey: hashKey(`${occurrence.empresaId}:${rule.id}:${key}:${index}:${action.tipo}`), status: "PENDENTE", nextAttemptAt: new Date() })) },
        },
        include: { jobs: true },
      });
      return { execution: exec, created: true };
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const exec = await client.automacaoExecucao.findUnique({ where: { empresaId_regraId_occurrenceKey: { empresaId: occurrence.empresaId, regraId: rule.id, occurrenceKey: key } } });
      return { execution: exec, created: false };
    }
  }

  async function processDueJobs({
    now = new Date(),
    limit = 5,
    leaseOwner = `worker-${process.pid}`,
    leaseMs = DEFAULT_LEASE_MS,
    executionTimeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS,
    maxAttempts = MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    supportedActions = DEFAULT_WORKER_ACTIONS,
  } = {}) {
    const config = workerConfig({ limit, leaseMs, executionTimeoutMs, maxAttempts, retryDelayMs, supportedActions });
    const results = [];
    for (let index = 0; index < config.limit; index += 1) {
      const job = await claimDueJob({ now, leaseOwner, config });
      if (!job) break;
      results.push(await processJob(job, { now, leaseOwner, config }));
    }
    return { processed: results.length, results };
  }

  async function claimDueJob({ now, leaseOwner, config }) {
    const candidates = await prisma.automacaoAcaoJob.findMany({
      where: dueJobWhere(now, config.maxAttempts),
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: config.limit,
      select: { id: true },
    });
    for (const candidate of candidates) {
      const leaseUntil = new Date(now.getTime() + config.leaseMs);
      const claimed = await prisma.automacaoAcaoJob.updateMany({
        where: { id: candidate.id, ...dueJobWhere(now, config.maxAttempts) },
        data: { status: "PROCESSANDO", leaseOwner, leaseExpiresAt: leaseUntil, tentativas: { increment: 1 } },
      });
      if (claimed.count === 1) {
        return prisma.automacaoAcaoJob.findUnique({
          where: { id: candidate.id },
          include: { execucao: { include: { regra: true } } },
        });
      }
    }
    return null;
  }

  async function processJob(job, { now, leaseOwner, config }) {
    const attempt = job.tentativas;
    const snapshot = safeJson(job.execucao.regraSnapshotJson, null);
    if (snapshot?.janela && !isWithinWindow(now, snapshot.timezone, snapshot.janela)) {
      await prisma.automacaoAcaoJob.updateMany({
        where: { id: job.id, leaseOwner, status: "PROCESSANDO" },
        data: { status: "PENDENTE", nextAttemptAt: new Date(now.getTime() + 15 * 60000), leaseOwner: null, leaseExpiresAt: null },
      });
      return { id: job.id, status: "AGUARDANDO_JANELA" };
    }
    try {
      await prisma.automacaoExecucao.updateMany({
        where: { id: job.execucaoId, status: { in: ["PENDENTE", "PROCESSANDO", "FALHOU"] } },
        data: { status: "PROCESSANDO", iniciadaEm: job.execucao.iniciadaEm || now, tentativas: { increment: 1 } },
      });
      await withTimeout(executeAction(job, { supportedActions: config.supportedActions }), config.executionTimeoutMs);
      await prisma.automacaoAcaoJob.updateMany({
        where: { id: job.id, leaseOwner, status: "PROCESSANDO" },
        data: { status: "CONCLUIDO", leaseOwner: null, leaseExpiresAt: null, erroCodigo: null, erroResumo: null },
      });
      await refreshExecutionStatus(job.execucaoId);
      return { id: job.id, status: "CONCLUIDO" };
    } catch (error) {
      const final = error.permanent === true || attempt >= config.maxAttempts;
      await prisma.automacaoAcaoJob.updateMany({
        where: { id: job.id, leaseOwner, status: "PROCESSANDO" },
        data: {
          status: final ? "FALHA_DEFINITIVA" : "FALHOU",
          nextAttemptAt: final ? null : new Date(now.getTime() + config.retryDelayMs),
          leaseOwner: null,
          leaseExpiresAt: null,
          erroCodigo: String(error.codigo || error.code || "ACTION_FAILED").slice(0, 80),
          erroResumo: "Acao de automacao nao concluida.",
        },
      });
      await refreshExecutionStatus(job.execucaoId);
      return { id: job.id, status: final ? "FALHA_DEFINITIVA" : "FALHOU" };
    }
  }

  async function executeAction(job, { supportedActions = DEFAULT_WORKER_ACTIONS } = {}) {
    const snapshot = safeJson(job.execucao.regraSnapshotJson, null);
    const action = snapshot?.acoes?.[job.indice];
    if (!action) throw domainError(422, "ACTION_CONFIG_MISSING", "Acao inexistente.", { permanent: true });
    if (!supportedActions.includes(action.tipo)) throw domainError(409, "ACTION_NOT_SUPPORTED", "Acao nao suportada pelo worker.", { permanent: true });
    if (!job.execucao.regra.ativa) throw domainError(409, "RULE_DISABLED", "Regra desativada.", { permanent: true });
    if (!(await isFeatureEnabledForTenant({ prisma, empresaId: job.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS, env }))) {
      throw domainError(404, "FEATURE_DISABLED", "Recurso nao encontrado.", { permanent: true });
    }
    return prisma.$transaction(async (tx) => {
      const entity = await loadEntity(tx, job.empresaId, job.execucao.entidadeTipo, job.execucao.entidadeId);
      if (!entity) throw notFound("Entidade da automacao nao encontrada.", { permanent: true });
      if (action.tipo === "ASSIGN_OWNER") return assignOwner(tx, job, entity, action.usuarioId);
      if (action.tipo === "ASSIGN_ROUND_ROBIN") return assignRoundRobin(tx, job, entity, action.usuarioIds);
      if (action.tipo === "CREATE_FOLLOW_UP") return createFollowUp(tx, job, entity, action);
      if (action.tipo === "CREATE_INTERNAL_EVENT") return createInternalEvent(tx, job, entity, action);
      if (action.tipo === "UPDATE_NEXT_FOLLOW_UP_PROJECTION") return updateNextFollowUpProjection(tx, entity);
      throw domainError(409, "ACTION_NOT_SUPPORTED", "Acao nao suportada pelo worker.", { permanent: true });
    });
  }

  async function assignOwner(tx, job, entity, usuarioId) {
    await validateResponsible(tx, job.empresaId, usuarioId);
    if (entity.responsavelId === usuarioId) return entity;
    if (entity.responsavelId !== null) return entity;
    const model = job.execucao.entidadeTipo === "LEAD" ? "lead" : "negocio";
    const updated = await tx[model].updateMany({ where: { id: entity.id, empresaId: job.empresaId, responsavelId: null }, data: { responsavelId: usuarioId } });
    if (updated.count !== 1) return entity;
    await tx.historicoAtribuicao.create({ data: historyData(job, entity, null, usuarioId, "ATRIBUIR") });
    return { ...entity, responsavelId: usuarioId };
  }

  async function assignRoundRobin(tx, job, entity, usuarioIds) {
    if (entity.responsavelId !== null) return entity;
    const eligible = [];
    for (const id of usuarioIds) {
      const user = await tx.usuario.findFirst({ where: { id, empresaId: job.empresaId, ativo: true }, select: { id: true } });
      if (user) eligible.push(user.id);
    }
    if (!eligible.length) throw domainError(409, "NO_ELIGIBLE_USER", "Nenhum usuario elegivel.");
    const state = await tx.automacaoRoundRobinEstado.upsert({
      where: { empresaId_regraId: { empresaId: job.empresaId, regraId: job.execucao.regraId } },
      create: { empresaId: job.empresaId, regraId: job.execucao.regraId, updatedAt: new Date() },
      update: {},
    });
    const currentIndex = eligible.indexOf(state.ultimoResponsavelId);
    const nextUser = eligible[(currentIndex + 1) % eligible.length];
    const assigned = await assignOwner(tx, job, entity, nextUser);
    if (assigned.responsavelId === nextUser) {
      await tx.automacaoRoundRobinEstado.updateMany({ where: { id: state.id, revisao: state.revisao }, data: { ultimoResponsavelId: nextUser, revisao: { increment: 1 } } });
    }
    return assigned;
  }

  async function createFollowUp(tx, job, entity, action) {
    const existing = await tx.automacaoEventoInterno.findUnique({ where: { empresaId_idempotencyKey: { empresaId: job.empresaId, idempotencyKey: `followup:${job.actionKey}` } } });
    if (existing?.acompanhamentoId) return existing;
    const dataHora = new Date(Date.now() + action.delayMinutos * 60000);
    const responsavelId = entity.responsavelId || null;
    if (responsavelId) await validateResponsible(tx, job.empresaId, responsavelId);
    const autorId = responsavelId || (await firstAdminId(tx, job.empresaId));
    const acompanhamento = await tx.acompanhamento.create({
      data: {
        empresaId: job.empresaId,
        clienteId: entity.clienteId,
        leadId: job.execucao.entidadeTipo === "LEAD" ? entity.id : entity.leadId,
        negocioId: job.execucao.entidadeTipo === "NEGOCIO" ? entity.id : null,
        responsavelId,
        autorId,
        titulo: action.titulo,
        descricao: action.descricao,
        dataHora,
        prioridade: action.prioridade,
        tipo: action.tipoAcompanhamento,
      },
    });
    await tx.historicoAcompanhamento.create({ data: { empresaId: job.empresaId, acompanhamentoId: acompanhamento.id, autorId, acao: "CRIAR", statusNovo: "PENDENTE", observacao: "Criado por automacao interna." } });
    await tx.automacaoEventoInterno.create({ data: eventData(job, entity, "FOLLOW_UP_CREATED", "Acompanhamento criado por automacao.", `followup:${job.actionKey}`, { acompanhamentoId: acompanhamento.id }) });
    await updateNextFollowUpProjection(tx, entity);
    return acompanhamento;
  }

  async function createInternalEvent(tx, job, entity, action) {
    return tx.automacaoEventoInterno.upsert({
      where: { empresaId_idempotencyKey: { empresaId: job.empresaId, idempotencyKey: `event:${job.actionKey}` } },
      create: eventData(job, entity, action.eventoTipo, action.resumo, `event:${job.actionKey}`),
      update: {},
    });
  }

  async function updateNextFollowUpProjection(tx, entity) {
    const next = await tx.acompanhamento.findFirst({
      where: { empresaId: entity.empresaId, clienteId: entity.clienteId, status: { in: ACTIVE_FOLLOW_UP_STATUSES } },
      orderBy: [{ dataHora: "asc" }, { id: "asc" }],
      select: { dataHora: true },
    });
    await tx.cliente.update({ where: { id: entity.clienteId }, data: { proximoFollowUp: next ? next.dataHora.toISOString() : "Hoje", revisao: { increment: 1 } } });
  }

  async function simulate(context, input) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const draft = input.regraId ? presentRule(await findRule(context, Number(input.regraId))) : { ...validateRulePayload(input.regra || {}), ativa: false };
    const entityType = String(input.entidadeTipo || "").toUpperCase();
    const entityId = positiveInteger(input.entidadeId, 0);
    const entity = entityType && entityId ? await loadEntity(prisma, context.empresaId, entityType, entityId) : null;
    return {
      efetivada: false,
      entidadeEncontrada: Boolean(entity),
      condicoes: (draft.condicoes || []).map((condition) => ({ condition, aprovada: entity ? conditionPass(condition, entity, {}) : false })),
      acoesPrevistas: draft.acoes || [],
      incompatibilidades: entity ? [] : ["Entidade nao encontrada no tenant."],
    };
  }

  async function listExecutions(context, query = {}) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(positiveInteger(query.limit, 20), 100);
    const where = { empresaId: context.empresaId };
    if (query.status) where.status = String(query.status).toUpperCase();
    const [data, total] = await prisma.$transaction([
      prisma.automacaoExecucao.findMany({ where, include: { regra: { select: { id: true, nome: true, gatilho: true } }, jobs: { orderBy: { indice: "asc" } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.automacaoExecucao.count({ where }),
    ]);
    return pageResult(data, total, page, limit);
  }

  async function listFailures(context, query = {}) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(positiveInteger(query.limit, 20), 100);
    const where = { empresaId: context.empresaId, status: { in: ["FALHOU", "FALHA_DEFINITIVA"] } };
    const [data, total] = await prisma.$transaction([
      prisma.automacaoAcaoJob.findMany({
        where,
        include: { execucao: { include: { regra: { select: { id: true, nome: true, gatilho: true } } } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.automacaoAcaoJob.count({ where }),
    ]);
    return pageResult(data, total, page, limit);
  }

  async function retryJob(context, jobId) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const job = await prisma.automacaoAcaoJob.findFirst({ where: { id: jobId, empresaId: context.empresaId }, include: { execucao: true } });
    if (!job) throw notFound("Acao nao encontrada.");
    if (!["FALHOU", "FALHA_DEFINITIVA"].includes(job.status)) throw domainError(409, "JOB_RETRY_UNAVAILABLE", "Acao nao esta elegivel para reprocessamento.");
    return prisma.automacaoAcaoJob.update({
      where: { id: job.id },
      data: { status: "PENDENTE", tentativas: 0, nextAttemptAt: new Date(), leaseOwner: null, leaseExpiresAt: null, erroCodigo: null, erroResumo: null },
    });
  }

  async function summary(context) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const [rules, activeRulesCount, failedJobs] = await Promise.all([
      prisma.automacaoRegra.count({ where: { empresaId: context.empresaId } }),
      prisma.automacaoRegra.count({ where: { empresaId: context.empresaId, ativa: true } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId, status: { in: ["FALHOU", "FALHA_DEFINITIVA"] } } }),
    ]);
    return { rules, activeRules: activeRulesCount, failedJobs };
  }

  async function options(context) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const users = await prisma.usuario.findMany({
      where: { empresaId: context.empresaId, ativo: true },
      select: { id: true, nome: true, papel: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    });
    return {
      triggers: ["LEAD_CREATED", "LEAD_WITHOUT_FOLLOW_UP", "DEAL_STALLED"],
      conditions: ["origem", "responsavelId", "semResponsavel", "tempoSemAcompanhamentoMinutos", "tempoParadoMinutos", "diaSemana", "janela", "timezone", "etapa"],
      actions: ["ASSIGN_OWNER", "ASSIGN_ROUND_ROBIN", "CREATE_FOLLOW_UP", "CREATE_INTERNAL_EVENT", "UPDATE_NEXT_FOLLOW_UP_PROJECTION"],
      users,
      unavailableConditions: ["regiao", "produto"],
      priorityConvention: "Menor numero = maior prioridade.",
    };
  }

  async function requireTenantFeature(context) {
    const enabled = await isFeatureEnabledForTenant({ prisma, empresaId: context.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS, env });
    if (!enabled) throw notFound("Recurso nao encontrado.");
  }

  async function activeRules(empresaId, trigger) {
    return prisma.automacaoRegra.findMany({
      where: { empresaId, gatilho: trigger, ativa: true },
      orderBy: [{ prioridade: "asc" }, { id: "asc" }],
    });
  }

  async function findRule(context, id) {
    const parsed = positiveInteger(id, null);
    if (!parsed) throw domainError(422, "VALIDATION_ERROR", "ID invalido.");
    const rule = await prisma.automacaoRegra.findFirst({ where: { id: parsed, empresaId: context.empresaId } });
    if (!rule) throw notFound("Regra nao encontrada.");
    return rule;
  }

  async function refreshExecutionStatus(execucaoId) {
    const jobs = await prisma.automacaoAcaoJob.findMany({ where: { execucaoId } });
    const status = jobs.every((job) => job.status === "CONCLUIDO") ? "CONCLUIDA"
      : jobs.some((job) => job.status === "FALHA_DEFINITIVA") ? "FALHA_DEFINITIVA"
        : jobs.some((job) => job.status === "FALHOU") ? "FALHOU" : "PROCESSANDO";
    await prisma.automacaoExecucao.update({
      where: { id: execucaoId },
      data: { status, concluidaEm: status === "CONCLUIDA" ? new Date() : null },
    });
  }

  return { activateRule, createRule, deactivateRule, enqueueLeadCreated, getRule, listExecutions, listFailures, listRules, options, processDueJobs, retryJob, scanTemporalTriggers, simulate, summary, updateRule };
}

async function loadEntity(client, empresaId, entityType, entityId) {
  if (entityType === "LEAD") return client.lead.findFirst({ where: { id: entityId, empresaId } });
  if (entityType === "NEGOCIO") return client.negocio.findFirst({ where: { id: entityId, empresaId } });
  return null;
}

function conditionsPass(rule, entity, occurrence) {
  return safeJson(rule.condicoesJson, []).every((condition) => conditionPass(condition, entity, occurrence));
}

function conditionPass(condition, entity, occurrence = {}) {
  if (condition.campo === "janela") {
    return condition.operador === "EQUALS" && isWithinWindow(occurrence.occurredAt || new Date(), occurrence.timezone || "UTC", condition.valor);
  }
  const value = conditionValue(condition.campo, entity, occurrence);
  if (condition.operador === "EQUALS") return value === condition.valor;
  if (condition.operador === "NOT_EQUALS") return value !== condition.valor;
  if (condition.operador === "IN") return Array.isArray(condition.valor) && condition.valor.includes(value);
  if (condition.operador === "GTE") return Number(value || 0) >= Number(condition.valor);
  return false;
}

function conditionValue(field, entity, occurrence = {}) {
  if (field === "etapa") return entity.etapa;
  if (field === "origem") return entity.origem;
  if (field === "responsavelId") return entity.responsavelId;
  if (field === "semResponsavel") return entity.responsavelId === null;
  if (field === "tempoSemAcompanhamentoMinutos" || field === "tempoParadoMinutos") return occurrence.elapsedMinutes || 0;
  if (field === "diaSemana") return weekdayInTimezone(occurrence.occurredAt || new Date(), occurrence.timezone || "UTC");
  if (field === "timezone") return occurrence.timezone || null;
  return null;
}

function occurrenceKey(rule, occurrence) {
  const marker = occurrence.originalEventId || occurrence.occurredAt?.toISOString?.() || occurrence.entityId;
  return `${rule.gatilho}:${occurrence.entityType}:${occurrence.entityId}:${marker}`;
}

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function thresholdMinutes(rule, field) {
  const found = safeJson(rule.condicoesJson, []).find((condition) => condition.campo === field && condition.operador === "GTE");
  return found ? Number(found.valor) : null;
}

function weekdayInTimezone(date, timezone) {
  const parts = datePartsInTimezone(date, timezone);
  return parts.weekday;
}

function isWithinWindow(date, timezone, window) {
  if (!window) return true;
  const parts = datePartsInTimezone(date, timezone);
  if (Array.isArray(window.diasSemana) && !window.diasSemana.includes(parts.weekday)) return false;
  const current = parts.hour * 60 + parts.minute;
  const start = minutesFromTime(window.inicio);
  const end = minutesFromTime(window.fim);
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function datePartsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[values.weekday] ?? 0,
    hour: Number(values.hour === "24" ? "0" : values.hour),
    minute: Number(values.minute || 0),
  };
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

async function validateResponsible(tx, empresaId, usuarioId) {
  const user = await tx.usuario.findFirst({ where: { id: usuarioId, empresaId, ativo: true }, select: { id: true } });
  if (!user) throw domainError(404, "USER_NOT_FOUND", "Usuario nao encontrado.");
}

async function firstAdminId(tx, empresaId) {
  const user = await tx.usuario.findFirst({ where: { empresaId, ativo: true, papel: "ADMIN" }, orderBy: { id: "asc" }, select: { id: true } });
  if (!user) throw domainError(409, "AUTOMATION_AUTHOR_UNAVAILABLE", "Nenhum administrador ativo.");
  return user.id;
}

function historyData(job, entity, previousId, nextId, tipo) {
  return {
    empresaId: job.empresaId,
    leadId: job.execucao.entidadeTipo === "LEAD" ? entity.id : entity.leadId,
    negocioId: job.execucao.entidadeTipo === "NEGOCIO" ? entity.id : null,
    responsavelAnteriorId: previousId,
    responsavelNovoId: nextId,
    tipo,
    origem: "AUTOMATICA",
    motivo: "Automacao interna.",
  };
}

function eventData(job, entity, tipo, resumo, idempotencyKey, extra = {}) {
  return {
    empresaId: job.empresaId,
    execucaoId: job.execucaoId,
    leadId: job.execucao.entidadeTipo === "LEAD" ? entity.id : entity.leadId,
    negocioId: job.execucao.entidadeTipo === "NEGOCIO" ? entity.id : null,
    tipo,
    resumo,
    idempotencyKey,
    payloadJson: JSON.stringify(extra),
    ...extra,
  };
}

function requireAutomationAdmin(context) {
  if (!["ADMIN", "GERENTE"].includes(context.papel)) throw domainError(403, "AUTOMATION_FORBIDDEN", "Acesso negado.");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pageResult(data, total, page, limit) {
  return { data, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } };
}

function notFound(message, options) {
  return domainError(404, "NOT_FOUND", message, options);
}

function domainError(status, codigo, message, options = {}) {
  const error = new Error(message);
  error.status = status;
  error.codigo = codigo;
  if (options.permanent) error.permanent = true;
  return error;
}

function workerConfig({ limit, leaseMs, executionTimeoutMs, maxAttempts, retryDelayMs, supportedActions }) {
  return {
    limit: boundedInteger(limit, 5, 1, 50),
    leaseMs: boundedInteger(leaseMs, DEFAULT_LEASE_MS, 5000, 10 * 60 * 1000),
    executionTimeoutMs: boundedInteger(executionTimeoutMs, DEFAULT_EXECUTION_TIMEOUT_MS, 1000, 2 * 60 * 1000),
    maxAttempts: boundedInteger(maxAttempts, MAX_ATTEMPTS, 1, 10),
    retryDelayMs: boundedInteger(retryDelayMs, DEFAULT_RETRY_DELAY_MS, 1000, 60 * 60 * 1000),
    supportedActions: Array.isArray(supportedActions) && supportedActions.length ? supportedActions : DEFAULT_WORKER_ACTIONS,
  };
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function dueJobWhere(now, maxAttempts) {
  return {
    nextAttemptAt: { lte: now },
    tentativas: { lt: maxAttempts },
    OR: [
      {
        status: { in: RETRYABLE_JOB_STATUSES },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      {
        status: "PROCESSANDO",
        leaseExpiresAt: { lte: now },
      },
    ],
  };
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(domainError(408, "ACTION_TIMEOUT", "Tempo limite da acao excedido.")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { createAutomationService, MAX_ATTEMPTS };
