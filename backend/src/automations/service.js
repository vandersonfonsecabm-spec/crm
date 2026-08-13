const crypto = require("node:crypto");
const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../tenant-features/service");
const { PILOT_ACTION_TYPES, WORKER_ACTION_TYPES, unavailableActionTypes } = require("./actions");
const { createWorkerEventEnvelope, sanitizeError } = require("./worker-observability");
const { withPostgresEnqueueDiagnostics } = require("./postgres-enqueue-diagnostics");
const { lockActiveClienteRow } = require("../shared/clientLifecycleLock");
const { presentRule, safeJson, snapshotRule, validatePilotEventPayload, validateRulePayload } = require("./validation");
const {
  assertProjectionReconciled,
  reconcileNextFollowUpProjection,
} = require("../follow-up-projection");

const TERMINAL_JOB_STATUSES = ["CONCLUIDO", "CANCELADO", "FALHA_DEFINITIVA"];
const TERMINAL_EXECUTION_STATUSES = ["CONCLUIDA", "FALHA_DEFINITIVA", "CANCELADA", "SIMULADA"];
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 60000;
const DEFAULT_LEASE_MS = 60000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;
const ROUND_ROBIN_TRANSACTION_ATTEMPTS = 5;
const ROUND_ROBIN_TRANSACTION_BACKOFF_MS = 5;
const RETRYABLE_JOB_STATUSES = Object.freeze(["PENDENTE", "FALHOU"]);

function createAutomationService({ prisma, env = process.env, logger = console }) {
  const isPostgresRuntime = () => {
    const mergedEnv = { ...process.env, ...env };
    if (String(mergedEnv.CRM_TEST_DATABASE_PROVIDER || "").trim().toLowerCase() === "postgresql") return true;
    return /^postgres(ql)?:\/\//i.test(String(mergedEnv.CRM_TEST_DATABASE_URL || mergedEnv.DATABASE_URL || ""));
  };

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
    requireAvailableActions(data.acoes);
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
    const rule = await findRule(context, id);
    const data = validateRulePayload(input, { partial: true });
    if (!Object.keys(data).length) throw domainError(422, "VALIDATION_ERROR", "Informe ao menos um campo para atualizar.");
    if (Object.hasOwn(data, "acoes")) requireAvailableActions(data.acoes);
    const update = { updatedById: context.usuarioId, versao: { increment: 1 } };
    for (const field of ["nome", "descricao", "prioridade", "gatilho", "timezone"]) if (Object.hasOwn(data, field)) update[field] = data[field];
    if (Object.hasOwn(data, "condicoes")) update.condicoesJson = JSON.stringify(data.condicoes);
    if (Object.hasOwn(data, "acoes")) update.acoesJson = JSON.stringify(data.acoes);
    if (Object.hasOwn(data, "janela")) update.janelaJson = data.janela ? JSON.stringify(data.janela) : null;
    const row = await prisma.automacaoRegra.update({ where: { id: rule.id }, data: update });
    return presentRule(row);
  }

  async function activateRule(context, id) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const rule = await findRule(context, id);
    if (rule.ativa) return presentRule(rule);
    requireAvailableActions(safeJson(rule.acoesJson, null));
    const row = await prisma.automacaoRegra.update({
      where: { id: rule.id },
      data: { ativa: true, activatedAt: new Date(), updatedById: context.usuarioId, versao: { increment: 1 } },
    });
    return presentRule(row);
  }

  async function deactivateRule(context, id) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const parsed = positiveInteger(id, null);
    if (!parsed) throw domainError(422, "VALIDATION_ERROR", "ID invalido.");
    const row = await prisma.$transaction(async (tx) => {
      const rule = await tx.automacaoRegra.findFirst({ where: { id: parsed, empresaId: context.empresaId } });
      if (!rule) throw notFound("Regra nao encontrada.");
      const candidates = await tx.automacaoAcaoJob.findMany({
        where: {
          empresaId: context.empresaId,
          execucao: { regraId: rule.id },
          status: { in: ["PENDENTE", "CANCELADO"] },
        },
        select: { id: true, execucaoId: true, status: true },
      });
      const pendingIds = candidates.filter((job) => job.status === "PENDENTE").map((job) => job.id);
      if (pendingIds.length) {
        const canceled = await tx.automacaoAcaoJob.updateMany({
          where: {
            id: { in: pendingIds },
            empresaId: context.empresaId,
            status: "PENDENTE",
          },
          data: { status: "CANCELADO", erroCodigo: "RULE_DISABLED", erroResumo: "Regra desativada antes da execucao." },
        });
        if (canceled.count !== pendingIds.length) {
          const current = await tx.automacaoAcaoJob.findMany({
            where: { id: { in: pendingIds }, empresaId: context.empresaId },
            select: { status: true },
          });
          if (current.length !== pendingIds.length || current.some((job) => job.status !== "CANCELADO")) {
            throw domainError(409, "JOB_CANCELLATION_CONFLICT", "Uma acao mudou durante o cancelamento.");
          }
        }
      }
      for (const execucaoId of [...new Set(candidates.map((job) => job.execucaoId))].sort((left, right) => left - right)) {
        await refreshExecutionStatus(tx, context.empresaId, execucaoId);
      }
      if (rule.ativa) {
        const deactivated = await tx.automacaoRegra.updateMany({
          where: { id: rule.id, empresaId: context.empresaId, ativa: true },
          data: { ativa: false, updatedById: context.usuarioId, versao: { increment: 1 } },
        });
        if (deactivated.count !== 1) {
          const current = await tx.automacaoRegra.findFirst({
            where: { id: rule.id, empresaId: context.empresaId },
            select: { ativa: true },
          });
          if (!current || current.ativa) {
            throw domainError(409, "RULE_DEACTIVATION_CONFLICT", "A regra mudou durante a desativacao.");
          }
        }
      }
      return tx.automacaoRegra.findFirstOrThrow({ where: { id: rule.id, empresaId: context.empresaId } });
    });
    return presentRule(row);
  }

  async function enqueueLeadCreated({ tx, empresaId, leadId, originalEventId = null, occurredAt = new Date() }) {
    return enqueueOccurrence(tx, { empresaId, trigger: "LEAD_CREATED", entityType: "LEAD", entityId: leadId, leadId, originalEventId, occurredAt });
  }

  async function producePilotEvent(context, input) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const data = validatePilotEventPayload(input);
    const result = await produceAutomationEvent({
      tenantId: context.empresaId,
      eventType: data.eventType,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      idempotencyKey: data.idempotencyKey,
      occurredAt: data.occurredAt,
      payload: data.payload,
    });
    if (result.duplicate) throw domainError(409, "PILOT_EVENT_DUPLICATE", "Evento piloto ja registrado.");
    return result;
  }

  async function produceAutomationEvent({ tenantId, eventType, sourceType, sourceId, idempotencyKey, occurredAt = new Date(), payload = {} }) {
    if (!Number.isInteger(tenantId) || tenantId < 1) throw domainError(422, "VALIDATION_ERROR", "Tenant invalido.");
    const data = validatePilotEventPayload({ eventType, sourceType, sourceId, idempotencyKey, occurredAt, payload });
    const entityId = syntheticEntityId(data.sourceId);
    const sourcePayload = {
      name: data.payload.name,
      origin: data.payload.origin,
    };
    const entity = syntheticLeadEntity({ empresaId: tenantId, entityId, sourcePayload, occurredAt: data.occurredAt });
    const result = await prisma.$transaction(async (tx) => enqueueOccurrence(tx, {
      empresaId: tenantId,
      trigger: data.eventType,
      entityType: "LEAD",
      entityId,
      originalEventId: data.idempotencyKey,
      occurredAt: data.occurredAt,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      entity,
      supportedActionTypes: PILOT_ACTION_TYPES,
      resumoJson: {
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        idempotencyKey: data.idempotencyKey,
        synthetic: true,
        payload: sourcePayload,
      },
    }));
    return {
      accepted: true,
      eventType: data.eventType,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      createdExecutions: result.created,
      createdJobs: result.createdJobs,
      evaluatedRules: result.evaluatedRules,
      duplicate: result.duplicates > 0 && result.created === 0,
    };
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
        where: { empresaId, cliente: { arquivadoEm: null }, createdAt: { gte: rule.activatedAt, lte: cutoff }, status: { in: ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"] } },
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
        where: { empresaId, cliente: { arquivadoEm: null }, etapa: { notIn: ["FECHADO", "PERDIDO"] }, etapaEntrouEm: { gte: rule.activatedAt, lte: cutoff } },
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
    if (!featureEnabled) return { created: 0, createdJobs: 0, duplicates: 0, evaluatedRules: 0 };

    const rules = occurrence.onlyRuleId
      ? await client.automacaoRegra.findMany({ where: { id: occurrence.onlyRuleId, empresaId: occurrence.empresaId, ativa: true } })
      : await client.automacaoRegra.findMany({ where: { empresaId: occurrence.empresaId, gatilho: occurrence.trigger, ativa: true }, orderBy: [{ prioridade: "asc" }, { id: "asc" }] });
    let created = 0;
    let createdJobs = 0;
    let duplicates = 0;
    let evaluatedRules = 0;
    for (const rule of rules) {
      if (!rule.activatedAt || new Date(occurrence.occurredAt) < new Date(rule.activatedAt)) continue;
      evaluatedRules += 1;
      const entity = occurrence.entity || await loadEntity(client, occurrence.empresaId, occurrence.entityType, occurrence.entityId);
      if (!entity || !conditionsPass(rule, entity, { ...occurrence, timezone: rule.timezone })) continue;
      const key = occurrenceKey(rule, occurrence);
      const snapshot = snapshotRule(rule);
      if (Array.isArray(occurrence.supportedActionTypes) && !snapshot.acoes.every((action) => occurrence.supportedActionTypes.includes(action.tipo))) {
        continue;
      }
      const execution = await upsertExecution(client, rule, occurrence, key, snapshot);
      if (execution.created) {
        created += 1;
        createdJobs += execution.execution.jobs.length;
      } else {
        duplicates += 1;
      }
    }
    return { created, createdJobs, duplicates, evaluatedRules };
  }

  async function upsertExecution(client, rule, occurrence, key, snapshot) {
    const idempotencyKey = hashKey(`${occurrence.empresaId}:${rule.id}:${key}`);
    const now = new Date();
    const inserted = isPostgresRuntime()
      ? await insertExecutionPostgres(client, { rule, occurrence, key, snapshot, idempotencyKey, now })
      : await insertExecutionSqlite(client, { rule, occurrence, key, snapshot, idempotencyKey, now });
    const exec = await client.automacaoExecucao.findUnique({
      where: { empresaId_regraId_occurrenceKey: { empresaId: occurrence.empresaId, regraId: rule.id, occurrenceKey: key } },
      include: { jobs: true },
    });
    if (inserted === 0) {
      if (!exec) throw new Error("Conflito de idempotencia sem execucao correspondente.");
      return { execution: exec, created: false };
    }
    if (!exec) throw new Error("Execucao de automacao criada nao encontrada.");
    for (const [index, action] of snapshot.acoes.entries()) {
      const jobInserted = isPostgresRuntime()
        ? await insertJobPostgres(client, {
          empresaId: occurrence.empresaId,
          execucaoId: exec.id,
          indice: index,
          tipo: action.tipo,
          entityType: occurrence.entityType,
          actionKey: hashKey(`${occurrence.empresaId}:${rule.id}:${key}:${index}:${action.tipo}`),
          now,
        })
        : await insertJobSqlite(client, {
          empresaId: occurrence.empresaId,
          execucaoId: exec.id,
          indice: index,
          tipo: action.tipo,
          actionKey: hashKey(`${occurrence.empresaId}:${rule.id}:${key}:${index}:${action.tipo}`),
          now,
        });
      if (jobInserted !== 1) throw new Error("Conflito inesperado de actionKey ao criar job de automacao.");
    }
    const created = await client.automacaoExecucao.findUnique({
      where: { id: exec.id },
      include: { jobs: { orderBy: { indice: "asc" } } },
    });
    return { execution: created, created: true };
  }

  async function insertExecutionSqlite(client, { rule, occurrence, key, snapshot, idempotencyKey, now }) {
    return client.$executeRaw`
      INSERT INTO "AutomacaoExecucao" (
        "empresaId",
        "regraId",
        "regraVersao",
        "regraSnapshotJson",
        "entidadeTipo",
        "entidadeId",
        "leadId",
        "negocioId",
        "occurrenceKey",
        "idempotencyKey",
        "status",
        "tentativas",
        "resumoJson",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${occurrence.empresaId},
        ${rule.id},
        ${rule.versao},
        ${JSON.stringify(snapshot)},
        ${occurrence.entityType},
        ${occurrence.entityId},
        ${occurrence.leadId || null},
        ${occurrence.negocioId || null},
        ${key},
        ${idempotencyKey},
        ${"PENDENTE"},
        ${0},
        ${occurrence.resumoJson ? JSON.stringify(occurrence.resumoJson) : null},
        ${now},
        ${now}
      )
      ON CONFLICT("empresaId", "regraId", "occurrenceKey") DO NOTHING
    `;
  }

  async function insertExecutionPostgres(client, { rule, occurrence, key, snapshot, idempotencyKey, now }) {
    return withPostgresEnqueueDiagnostics({
      operation: "INSERT_AUTOMATION_EXECUTION",
      context: {
        actionType: snapshot.acoes.length === 1 ? snapshot.acoes[0]?.tipo : undefined,
        entityType: occurrence.entityType,
        tenantId: occurrence.empresaId,
        occurrenceKey: key,
      },
      logger,
    }, () => client.$executeRaw`
      INSERT INTO "AutomacaoExecucao" (
        "empresaId",
        "regraId",
        "regraVersao",
        "regraSnapshotJson",
        "entidadeTipo",
        "entidadeId",
        "leadId",
        "negocioId",
        "occurrenceKey",
        "idempotencyKey",
        "status",
        "tentativas",
        "resumoJson",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${occurrence.empresaId},
        ${rule.id},
        ${rule.versao},
        ${JSON.stringify(snapshot)},
        CAST(${occurrence.entityType} AS "EntidadeAutomacao"),
        ${occurrence.entityId},
        ${occurrence.leadId || null},
        ${occurrence.negocioId || null},
        ${key},
        ${idempotencyKey},
        CAST(${"PENDENTE"} AS "StatusExecucaoAutomacao"),
        ${0},
        ${occurrence.resumoJson ? JSON.stringify(occurrence.resumoJson) : null},
        ${now},
        ${now}
      )
      ON CONFLICT("empresaId", "regraId", "occurrenceKey") DO NOTHING
    `);
  }

  async function insertJobSqlite(client, { empresaId, execucaoId, indice, tipo, actionKey, now }) {
    return client.$executeRaw`
      INSERT INTO "AutomacaoAcaoJob" (
        "empresaId",
        "execucaoId",
        "indice",
        "tipo",
        "actionKey",
        "status",
        "tentativas",
        "nextAttemptAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${empresaId},
        ${execucaoId},
        ${indice},
        ${tipo},
        ${actionKey},
        ${"PENDENTE"},
        ${0},
        ${now},
        ${now},
        ${now}
      )
      ON CONFLICT("empresaId", "actionKey") DO NOTHING
    `;
  }

  async function insertJobPostgres(client, { empresaId, execucaoId, indice, tipo, entityType, actionKey, now }) {
    return withPostgresEnqueueDiagnostics({
      operation: "INSERT_AUTOMATION_JOB",
      context: {
        actionType: tipo,
        entityType,
        tenantId: empresaId,
        actionKey,
      },
      logger,
    }, () => client.$executeRaw`
      INSERT INTO "AutomacaoAcaoJob" (
        "empresaId",
        "execucaoId",
        "indice",
        "tipo",
        "actionKey",
        "status",
        "tentativas",
        "nextAttemptAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${empresaId},
        ${execucaoId},
        ${indice},
        CAST(${tipo} AS "AcaoAutomacao"),
        ${actionKey},
        CAST(${"PENDENTE"} AS "StatusJobAutomacao"),
        ${0},
        ${now},
        ${now},
        ${now}
      )
      ON CONFLICT("empresaId", "actionKey") DO NOTHING
    `);
  }

  async function processDueJobs({
    now = new Date(),
    limit = 5,
    leaseOwner = `worker-${process.pid}`,
    leaseMs = DEFAULT_LEASE_MS,
    executionTimeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS,
    maxAttempts = MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    supportedActions = WORKER_ACTION_TYPES,
    onEvent = null,
  } = {}) {
    const config = workerConfig({ limit, leaseMs, executionTimeoutMs, maxAttempts, retryDelayMs, supportedActions });
    const results = [];
    for (let index = 0; index < config.limit; index += 1) {
      const job = await claimDueJob({ now, leaseOwner, config, onEvent });
      if (!job) break;
      results.push(await processJob(job, { now, leaseOwner, config, onEvent }));
    }
    return { processed: results.length, results };
  }

  async function claimDueJob({ now, leaseOwner, config, onEvent }) {
    const candidates = await prisma.automacaoAcaoJob.findMany({
      where: dueJobWhere(now, config.maxAttempts),
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: config.limit,
      select: {
        id: true,
        empresaId: true,
        execucaoId: true,
        indice: true,
        tipo: true,
        status: true,
        tentativas: true,
        leaseExpiresAt: true,
        execucao: { select: { regraId: true, regra: { select: { gatilho: true } } } },
      },
    });
    for (const candidate of candidates) {
      const leaseUntil = new Date(now.getTime() + config.leaseMs);
      const claimStartedAt = Date.now();
      const claimed = await prisma.automacaoAcaoJob.updateMany({
        where: { id: candidate.id, empresaId: candidate.empresaId, ...dueJobWhere(now, config.maxAttempts) },
        data: { status: "PROCESSANDO", leaseOwner, leaseExpiresAt: leaseUntil, tentativas: { increment: 1 } },
      });
      if (claimed.count === 1) {
        const job = await prisma.automacaoAcaoJob.findFirst({
          where: { id: candidate.id, empresaId: candidate.empresaId },
          include: { execucao: { include: { regra: true } } },
        });
        if (!job) return null;
        const fields = jobLogFields(job, {
          attempt: job.tentativas,
          maxAttempts: config.maxAttempts,
          durationMs: elapsedMs(claimStartedAt),
          leaseUntil,
          status: job.status,
        });
        if (candidate.status === "PROCESSANDO" && candidate.leaseExpiresAt && candidate.leaseExpiresAt <= now) {
          notifyWorkerEvent(onEvent, "job_lease_recovered", fields);
        }
        notifyWorkerEvent(onEvent, "job_claimed", fields);
        return job;
      }
    }
    return null;
  }

  async function processJob(job, { now, leaseOwner, config, onEvent }) {
    const attempt = job.tentativas;
    const snapshot = safeJson(job.execucao.regraSnapshotJson, null);
    const baseFields = jobLogFields(job, { attempt, maxAttempts: config.maxAttempts });
    const jobStartedAt = Date.now();
    if (snapshot?.janela && !isWithinWindow(now, snapshot.timezone, snapshot.janela)) {
      const retryAt = new Date(now.getTime() + 15 * 60000);
      const deferred = await prisma.automacaoAcaoJob.updateMany({
        where: {
          id: job.id,
          empresaId: job.empresaId,
          leaseOwner,
          leaseExpiresAt: { gt: now },
          status: "PROCESSANDO",
          tentativas: { gt: 0 },
        },
        data: {
          status: "PENDENTE",
          tentativas: { decrement: 1 },
          nextAttemptAt: retryAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (deferred.count !== 1) {
        throw domainError(409, "JOB_WINDOW_DEFERRAL_CONFLICT", "Nao foi possivel adiar o job com o lease atual.");
      }
      return { id: job.id, status: "AGUARDANDO_JANELA" };
    }
    let actionStartedAt = null;
    try {
      const executionStarted = await prisma.automacaoExecucao.updateMany({
        where: { id: job.execucaoId, empresaId: job.empresaId, status: { in: ["PENDENTE", "PROCESSANDO", "FALHOU"] } },
        data: { status: "PROCESSANDO", iniciadaEm: job.execucao.iniciadaEm || now, tentativas: { increment: 1 } },
      });
      if (executionStarted.count === 1) {
        notifyWorkerEvent(onEvent, "execution_started", {
          ...baseFields,
          durationMs: elapsedMs(jobStartedAt),
          status: "PROCESSANDO",
        });
      }
      actionStartedAt = Date.now();
      notifyWorkerEvent(onEvent, "action_started", {
        ...baseFields,
        durationMs: 0,
        status: "PROCESSANDO",
      });
      const actionResult = await withTimeout(executeAction(job, { supportedActions: config.supportedActions }), config.executionTimeoutMs);
      const eventId = baseFields.actionType === "CREATE_INTERNAL_EVENT" ? actionResult?.id : undefined;
      notifyWorkerEvent(onEvent, "action_succeeded", {
        ...baseFields,
        eventId,
        durationMs: elapsedMs(actionStartedAt),
        status: "SUCCEEDED",
      });
      const succeeded = await prisma.automacaoAcaoJob.updateMany({
        where: { id: job.id, empresaId: job.empresaId, leaseOwner, status: "PROCESSANDO" },
        data: { status: "CONCLUIDO", leaseOwner: null, leaseExpiresAt: null, erroCodigo: null, erroResumo: null },
      });
      await refreshExecutionStatus(prisma, job.empresaId, job.execucaoId);
      if (succeeded.count === 1) {
        notifyWorkerEvent(onEvent, "job_succeeded", {
          ...baseFields,
          eventId,
          durationMs: elapsedMs(jobStartedAt),
          status: "CONCLUIDO",
        });
      }
      return { id: job.id, status: "CONCLUIDO" };
    } catch (error) {
      const safeError = sanitizeError(error);
      const permanent = error.permanent === true;
      const attemptsExhausted = attempt >= config.maxAttempts;
      const final = permanent || attemptsExhausted;
      const willRetry = !final;
      const failureReason = permanent
        ? "PERMANENT_ERROR"
        : attemptsExhausted ? "ATTEMPTS_EXHAUSTED" : "RETRYABLE_ERROR";
      const retryAt = willRetry ? new Date(now.getTime() + config.retryDelayMs) : null;
      if (actionStartedAt !== null) {
        notifyWorkerEvent(onEvent, "action_failed", {
          ...baseFields,
          durationMs: elapsedMs(actionStartedAt),
          status: "FAILED",
        }, error);
      }
      const failed = await prisma.automacaoAcaoJob.updateMany({
        where: { id: job.id, empresaId: job.empresaId, leaseOwner, status: "PROCESSANDO" },
        data: {
          status: final ? "FALHA_DEFINITIVA" : "FALHOU",
          nextAttemptAt: retryAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          erroCodigo: safeError.errorCode,
          erroResumo: safeError.errorMessage,
        },
      });
      await refreshExecutionStatus(prisma, job.empresaId, job.execucaoId);
      if (failed.count === 1) {
        const failureFields = {
          ...baseFields,
          durationMs: elapsedMs(jobStartedAt),
          status: final ? "FALHA_DEFINITIVA" : "FALHOU",
          final,
          permanent,
          retryable: !permanent,
          willRetry,
          failureReason,
          retryAt,
        };
        if (final) {
          if (permanent) {
            notifyWorkerEvent(onEvent, "job_permanent_failure", failureFields, error);
          } else {
            notifyWorkerEvent(onEvent, "job_attempt_failed", failureFields, error);
            notifyWorkerEvent(onEvent, "job_attempts_exhausted", failureFields, error);
          }
          notifyWorkerEvent(onEvent, "job_failed", failureFields, error);
        } else {
          notifyWorkerEvent(onEvent, "job_attempt_failed", failureFields, error);
          notifyWorkerEvent(onEvent, "job_retry_scheduled", failureFields);
        }
      }
      return { id: job.id, status: final ? "FALHA_DEFINITIVA" : "FALHOU" };
    }
  }

  async function executeAction(job, { supportedActions = WORKER_ACTION_TYPES } = {}) {
    if (job.execucao.empresaId !== job.empresaId || job.execucao.regra.empresaId !== job.empresaId) {
      throw domainError(409, "AUTOMATION_TENANT_CONFLICT", "Contexto da automacao inconsistente.", { permanent: true });
    }
    const snapshot = safeJson(job.execucao.regraSnapshotJson, null);
    const action = snapshot?.acoes?.[job.indice];
    if (!action) throw domainError(422, "ACTION_CONFIG_MISSING", "Acao inexistente.", { permanent: true });
    if (!supportedActions.includes(action.tipo)) throw domainError(409, "ACTION_NOT_SUPPORTED", "Acao nao suportada pelo worker.", { permanent: true });
    if (!job.execucao.regra.ativa) throw domainError(409, "RULE_DISABLED", "Regra desativada.", { permanent: true });
    if (!(await isFeatureEnabledForTenant({ prisma, empresaId: job.empresaId, featureKey: FEATURE_KEYS.AUTOMATIONS, env }))) {
      throw domainError(404, "FEATURE_DISABLED", "Recurso nao encontrado.", { permanent: true });
    }
    const transactionAttempts = action.tipo === "ASSIGN_ROUND_ROBIN" ? ROUND_ROBIN_TRANSACTION_ATTEMPTS : 1;
    for (let transactionAttempt = 1; transactionAttempt <= transactionAttempts; transactionAttempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const entity = await loadExecutionEntity(tx, job);
          if (!entity) throw notFound("Entidade da automacao nao encontrada.", { permanent: true });
          if (Number.isSafeInteger(Number(entity.clienteId)) && entity.clienteId > 0) {
            await lockActiveClienteRow(tx, job.empresaId, entity.clienteId);
          }
          if (action.tipo === "ASSIGN_OWNER") return assignOwner(tx, job, entity, action.usuarioId);
          if (action.tipo === "ASSIGN_ROUND_ROBIN") return assignRoundRobin(tx, job, entity, action.usuarioIds);
          if (action.tipo === "CREATE_FOLLOW_UP") return createFollowUp(tx, job, entity, action);
          if (action.tipo === "CREATE_INTERNAL_EVENT") return createInternalEvent(tx, job, entity, action);
          if (action.tipo === "UPDATE_NEXT_FOLLOW_UP_PROJECTION") return updateNextFollowUpProjection(tx, entity);
          throw domainError(409, "ACTION_NOT_SUPPORTED", "Acao nao suportada pelo worker.", { permanent: true });
        });
      } catch (error) {
        if (transactionAttempt >= transactionAttempts || !isRoundRobinTransactionConflict(action.tipo, error)) throw error;
        await wait(ROUND_ROBIN_TRANSACTION_BACKOFF_MS * transactionAttempt);
      }
    }
    throw domainError(409, "ROUND_ROBIN_STATE_CONFLICT", "Conflito ao atualizar o estado do round-robin.");
  }

  async function assignOwner(tx, job, entity, usuarioId) {
    await validateResponsible(tx, job.empresaId, usuarioId);
    if (entity.responsavelId === usuarioId) return entity;
    if (entity.responsavelId !== null) return entity;
    const model = job.execucao.entidadeTipo === "LEAD" ? "lead" : "negocio";
    const updated = await tx[model].updateMany({ where: { id: entity.id, empresaId: job.empresaId, responsavelId: null, cliente: { arquivadoEm: null } }, data: { responsavelId: usuarioId } });
    if (updated.count !== 1) return entity;
    await tx.historicoAtribuicao.create({ data: historyData(job, entity, null, usuarioId, "ATRIBUIR") });
    return { ...entity, responsavelId: usuarioId };
  }

  async function assignRoundRobin(tx, job, entity, usuarioIds) {
    if (entity.responsavelId !== null) return entity;
    const configuredIds = normalizeRoundRobinUserIds(usuarioIds);
    const eligible = (await tx.usuario.findMany({
      where: { id: { in: configuredIds }, empresaId: job.empresaId, ativo: true },
      orderBy: { id: "asc" },
      select: { id: true },
    })).map((user) => user.id);
    if (!eligible.length) {
      throw domainError(409, "NO_ELIGIBLE_USER", "Nenhum usuario elegivel.", { permanent: true });
    }
    const state = await tx.automacaoRoundRobinEstado.upsert({
      where: { empresaId_regraId: { empresaId: job.empresaId, regraId: job.execucao.regraId } },
      create: { empresaId: job.empresaId, regraId: job.execucao.regraId, updatedAt: new Date() },
      update: {},
    });
    const currentIndex = eligible.indexOf(state.ultimoResponsavelId);
    const nextUser = eligible[(currentIndex + 1) % eligible.length];
    const assigned = await assignOwner(tx, job, entity, nextUser);
    if (assigned.responsavelId !== nextUser) return assigned;
    const cursor = await tx.automacaoRoundRobinEstado.updateMany({
      where: {
        id: state.id,
        empresaId: job.empresaId,
        regraId: job.execucao.regraId,
        revisao: state.revisao,
      },
      data: { ultimoResponsavelId: nextUser, revisao: { increment: 1 } },
    });
    if (cursor.count !== 1) {
      throw domainError(409, "ROUND_ROBIN_STATE_CONFLICT", "Conflito ao atualizar o estado do round-robin.");
    }
    return assigned;
  }

  async function createFollowUp(tx, job, entity, action) {
    const existing = await tx.automacaoEventoInterno.findUnique({ where: { empresaId_idempotencyKey: { empresaId: job.empresaId, idempotencyKey: `followup:${job.actionKey}` } } });
    if (existing?.acompanhamentoId) {
      await updateNextFollowUpProjection(tx, entity);
      return existing;
    }
    const clienteId = await validateFollowUpClient(tx, job.empresaId, entity.clienteId);
    const dataHora = new Date(Date.now() + action.delayMinutos * 60000);
    const responsavelId = entity.responsavelId || null;
    const autorId = await resolveFollowUpAuthor(tx, job.empresaId, responsavelId);
    const acompanhamento = await tx.acompanhamento.create({
      data: {
        empresaId: job.empresaId,
        clienteId,
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
    return assertProjectionReconciled(await reconcileNextFollowUpProjection({
      tx,
      empresaId: entity.empresaId,
      clienteId: entity.clienteId,
    }));
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
    const updated = await prisma.automacaoAcaoJob.updateMany({
      where: { id: job.id, empresaId: context.empresaId, status: { in: ["FALHOU", "FALHA_DEFINITIVA"] } },
      data: { status: "PENDENTE", tentativas: 0, nextAttemptAt: new Date(), leaseOwner: null, leaseExpiresAt: null, erroCodigo: null, erroResumo: null },
    });
    if (updated.count !== 1) throw domainError(409, "JOB_RETRY_CONFLICT", "A acao mudou durante o reprocessamento.");
    return prisma.automacaoAcaoJob.findFirstOrThrow({ where: { id: job.id, empresaId: context.empresaId } });
  }

  async function summary(context) {
    requireAutomationAdmin(context);
    await requireTenantFeature(context);
    const [rules, activeRulesCount, jobs, pendingJobs, processingJobs, succeededJobs, executions, succeededExecutions, failedJobs, internalEvents] = await Promise.all([
      prisma.automacaoRegra.count({ where: { empresaId: context.empresaId } }),
      prisma.automacaoRegra.count({ where: { empresaId: context.empresaId, ativa: true } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId, status: "PENDENTE" } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId, status: "PROCESSANDO" } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId, status: "CONCLUIDO" } }),
      prisma.automacaoExecucao.count({ where: { empresaId: context.empresaId } }),
      prisma.automacaoExecucao.count({ where: { empresaId: context.empresaId, status: "CONCLUIDA" } }),
      prisma.automacaoAcaoJob.count({ where: { empresaId: context.empresaId, status: { in: ["FALHOU", "FALHA_DEFINITIVA"] } } }),
      prisma.automacaoEventoInterno.count({ where: { empresaId: context.empresaId } }),
    ]);
    return { rules, activeRules: activeRulesCount, jobs, pendingJobs, processingJobs, succeededJobs, executions, succeededExecutions, failedJobs, internalEvents };
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
      actions: WORKER_ACTION_TYPES,
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

  async function refreshExecutionStatus(client, empresaId, execucaoId) {
    const execution = await client.automacaoExecucao.findFirst({
      where: { id: execucaoId, empresaId },
      select: { id: true, status: true },
    });
    if (!execution) throw notFound("Execucao de automacao nao encontrada.");
    if (TERMINAL_EXECUTION_STATUSES.includes(execution.status)) return execution.status;

    const jobs = await client.automacaoAcaoJob.findMany({
      where: { execucaoId, empresaId },
      select: { status: true },
    });
    if (!jobs.length) throw domainError(409, "EXECUTION_RECONCILIATION_CONFLICT", "Execucao sem acoes para reconciliar.");
    const status = jobs.some((job) => job.status === "FALHA_DEFINITIVA") ? "FALHA_DEFINITIVA"
      : jobs.some((job) => job.status === "FALHOU") ? "FALHOU"
        : jobs.every((job) => job.status === "CONCLUIDO") ? "CONCLUIDA"
          : jobs.every((job) => TERMINAL_JOB_STATUSES.includes(job.status))
            && jobs.some((job) => job.status === "CANCELADO") ? "CANCELADA"
            : jobs.some((job) => job.status === "PROCESSANDO") ? "PROCESSANDO" : "PENDENTE";
    if (status === execution.status) return status;

    const updated = await client.automacaoExecucao.updateMany({
      where: { id: execucaoId, empresaId, status: execution.status },
      data: { status, concluidaEm: status === "CONCLUIDA" ? new Date() : null },
    });
    if (updated.count === 1) return status;

    const current = await client.automacaoExecucao.findFirst({
      where: { id: execucaoId, empresaId },
      select: { status: true },
    });
    if (current && (current.status === status || TERMINAL_EXECUTION_STATUSES.includes(current.status))) {
      return current.status;
    }
    throw domainError(409, "EXECUTION_RECONCILIATION_CONFLICT", "A execucao mudou durante a reconciliacao.");
  }

  return { activateRule, createRule, deactivateRule, enqueueLeadCreated, getRule, listExecutions, listFailures, listRules, options, processDueJobs, produceAutomationEvent, producePilotEvent, retryJob, scanTemporalTriggers, simulate, summary, updateRule };
}

async function loadEntity(client, empresaId, entityType, entityId) {
  if (entityType === "LEAD") return client.lead.findFirst({ where: { id: entityId, empresaId, cliente: { arquivadoEm: null } } });
  if (entityType === "NEGOCIO") return client.negocio.findFirst({ where: { id: entityId, empresaId, cliente: { arquivadoEm: null } } });
  return null;
}

async function loadExecutionEntity(client, job) {
  const entity = await loadEntity(client, job.empresaId, job.execucao.entidadeTipo, job.execucao.entidadeId);
  if (entity) return entity;
  const meta = safeJson(job.execucao.resumoJson, null);
  if (job.execucao.entidadeTipo === "LEAD" && meta?.sourceType === "PILOT_SYNTHETIC" && meta?.synthetic === true) {
    return syntheticLeadEntity({
      empresaId: job.empresaId,
      entityId: job.execucao.entidadeId,
      sourcePayload: meta.payload || {},
      occurredAt: job.execucao.createdAt,
    });
  }
  return null;
}

function syntheticLeadEntity({ empresaId, entityId, sourcePayload, occurredAt }) {
  return {
    __automationSynthetic: true,
    id: entityId,
    empresaId,
    clienteId: null,
    leadId: null,
    status: "NOVO",
    origem: String(sourcePayload?.origin || "PILOT").trim(),
    interesse: String(sourcePayload?.name || "Lead sintetico").trim(),
    responsavelId: null,
    createdAt: occurredAt,
  };
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

async function validateFollowUpClient(tx, empresaId, clienteId) {
  if (!Number.isInteger(clienteId) || clienteId < 1) {
    throw domainError(404, "AUTOMATION_CLIENT_NOT_FOUND", "Cliente da automacao nao encontrado.", { permanent: true });
  }
  const client = await tx.cliente.findFirst({
    where: { id: clienteId, empresaId, arquivadoEm: null },
    select: { id: true },
  });
  if (!client) {
    throw domainError(404, "AUTOMATION_CLIENT_NOT_FOUND", "Cliente da automacao nao encontrado.", { permanent: true });
  }
  return client.id;
}

async function resolveFollowUpAuthor(tx, empresaId, responsavelId) {
  const user = await tx.usuario.findFirst({
    where: responsavelId
      ? { id: responsavelId, empresaId, ativo: true }
      : { empresaId, ativo: true, papel: "ADMIN" },
    orderBy: responsavelId ? undefined : { id: "asc" },
    select: { id: true },
  });
  if (!user) {
    throw domainError(409, "AUTOMATION_AUTHOR_UNAVAILABLE", "Autor da automacao indisponivel.", { permanent: true });
  }
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
  const synthetic = entity.__automationSynthetic === true;
  return {
    empresaId: job.empresaId,
    execucaoId: job.execucaoId,
    leadId: synthetic ? null : job.execucao.entidadeTipo === "LEAD" ? entity.id : entity.leadId,
    negocioId: job.execucao.entidadeTipo === "NEGOCIO" ? entity.id : null,
    tipo,
    resumo,
    idempotencyKey,
    payloadJson: JSON.stringify(extra),
    ...extra,
  };
}

function jobLogFields(job, extra = {}) {
  const snapshot = safeJson(job.execucao?.regraSnapshotJson, null);
  const action = snapshot?.acoes?.[job.indice];
  return {
    tenantId: job.empresaId,
    ruleId: job.execucao?.regraId,
    jobId: job.id,
    executionId: job.execucaoId,
    actionType: action?.tipo || job.tipo,
    triggerType: job.execucao?.regra?.gatilho,
    ...extra,
  };
}

function notifyWorkerEvent(onEvent, event, fields, error) {
  if (typeof onEvent !== "function") return;
  try {
    onEvent(createWorkerEventEnvelope(event, fields, error));
  } catch {
    // Observability must not alter job processing.
  }
}

function syntheticEntityId(sourceId) {
  const hash = crypto.createHash("sha256").update(String(sourceId)).digest("hex");
  return (parseInt(hash.slice(0, 8), 16) % 2147480000) + 1;
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

function requireAvailableActions(actions) {
  const unavailable = unavailableActionTypes(actions);
  if (unavailable.length) {
    throw domainError(409, "AUTOMATION_ACTION_UNAVAILABLE", "A regra possui acao ainda nao liberada para execucao.");
  }
}

function normalizeRoundRobinUserIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((left, right) => left - right);
}

function isRoundRobinTransactionConflict(actionType, error) {
  if (actionType !== "ASSIGN_ROUND_ROBIN") return false;
  if (error?.codigo === "ROUND_ROBIN_STATE_CONFLICT") return true;
  return ["P1008", "P2002", "P2028", "P2034"].includes(error?.code);
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function workerConfig({ limit, leaseMs, executionTimeoutMs, maxAttempts, retryDelayMs, supportedActions }) {
  return {
    limit: boundedInteger(limit, 5, 1, 50),
    leaseMs: boundedInteger(leaseMs, DEFAULT_LEASE_MS, 5000, 10 * 60 * 1000),
    executionTimeoutMs: boundedInteger(executionTimeoutMs, DEFAULT_EXECUTION_TIMEOUT_MS, 1000, 2 * 60 * 1000),
    maxAttempts: boundedInteger(maxAttempts, MAX_ATTEMPTS, 1, 10),
    retryDelayMs: boundedInteger(retryDelayMs, DEFAULT_RETRY_DELAY_MS, 1000, 60 * 60 * 1000),
    supportedActions: Array.isArray(supportedActions) && supportedActions.length ? supportedActions : WORKER_ACTION_TYPES,
  };
}

function boundedInteger(raw, fallback, min, max) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
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
