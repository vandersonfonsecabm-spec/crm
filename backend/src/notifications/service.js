const { SYSTEM_ACTOR_EMAIL } = require("../system-actor");

const ACTIVE_FOLLOW_UP_STATUSES = ["PENDENTE", "EM_ANDAMENTO"];
const MANAGER_ROLES = ["ADMIN", "GERENTE"];
const PRIORITY_RANK = Object.freeze({ CRITICA: 0, ATENCAO: 1, NORMAL: 2 });
const VALID_PRIORITIES = new Set(Object.keys(PRIORITY_RANK));
const NOTIFICATION_TYPES = Object.freeze({
  MESSAGE: "NOVA_MENSAGEM",
  FOLLOW_UP: "ACOMPANHAMENTO",
  FOLLOW_UP_REMINDER: "LEMBRETE_ACOMPANHAMENTO",
});
const TARGET_KINDS = new Set(["CONVERSATION", "FOLLOW_UP", "DEAL"]);
const SOURCE_KINDS = new Set(["CONVERSATION", "FOLLOW_UP"]);
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const EFFECTIVE_TIME_ZONE = "America/Sao_Paulo";

function createNotificationService({ prisma, env = process.env, clock = () => new Date() } = {}) {
  function globallyEnabled() {
    const raw = String(env.H8_NOTIFICATIONS_ENABLED || "").trim().toLowerCase();
    return raw === "true" || raw === "1";
  }

  async function assertEnabled(empresaId) {
    if (!globallyEnabled()) throw domainError(404, "NOTIFICATIONS_DISABLED", "Recurso nao encontrado.");
    const settings = await prisma.configuracaoNotificacaoEmpresa.findUnique({ where: { empresaId } });
    if (!settings?.habilitada) throw domainError(404, "NOTIFICATIONS_DISABLED", "Notificacoes desativadas para esta empresa.");
    return settings;
  }

  async function projectForTenant(empresaId, { now = clock(), limit = 100 } = {}) {
    if (!globallyEnabled()) return { created: 0, updated: 0, resolved: 0 };
    const settings = await prisma.configuracaoNotificacaoEmpresa.findUnique({ where: { empresaId } });
    if (!settings?.habilitada) return { created: 0, updated: 0, resolved: 0, disabled: true };
    const [followUps, conversations] = await Promise.all([
      prisma.acompanhamento.findMany({
        where: { empresaId, status: { in: ACTIVE_FOLLOW_UP_STATUSES }, dataHora: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } },
        include: { responsavelUsuario: { select: { id: true, ativo: true, email: true } }, autor: { select: { id: true, ativo: true, email: true } }, negocio: { select: { id: true, responsavelId: true } }, conversaCanal: { select: { id: true, responsavelId: true } } },
        orderBy: [{ dataHora: "asc" }, { id: "asc" }],
        take: Math.min(Math.max(Number(limit) || 100, 1), 200),
      }),
      prisma.conversaCanal.findMany({
        where: { empresaId, ...pendingConversationWhere(now) },
        select: {
          id: true,
          empresaId: true,
          responsavelId: true,
          status: true,
          aguardandoDesde: true,
          ultimaMensagemEm: true,
          contatoCanal: { select: { nome: true, cliente: { select: { nome: true } } } },
        },
        orderBy: [{ aguardandoDesde: "asc" }, { id: "asc" }],
        take: Math.min(Math.max(Number(limit) || 100, 1), 200),
      }),
    ]);
    const userIds = new Set();
    followUps.forEach((item) => { if (Number.isInteger(item.responsavelId)) userIds.add(item.responsavelId); if (Number.isInteger(item.autorId)) userIds.add(item.autorId); });
    conversations.forEach((item) => { if (Number.isInteger(item.responsavelId)) userIds.add(item.responsavelId); });
    const users = await prisma.usuario.findMany({
      where: { empresaId, ativo: true, email: { not: SYSTEM_ACTOR_EMAIL } },
      select: { id: true, papel: true, email: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const managers = users.filter((user) => MANAGER_ROLES.includes(user.papel)).map((user) => user.id);
    const prefs = await prisma.preferenciaNotificacaoUsuario.findMany({ where: { empresaId, usuarioId: { in: [...userIds, ...managers] } }, select: { usuarioId: true, antecedenciaPadraoMinutos: true, habilitada: true } });
    const prefByUser = new Map(prefs.map((pref) => [pref.usuarioId, pref]));
    const result = { created: 0, updated: 0, resolved: 0 };

    for (const item of followUps) {
      const recipients = recipientIdsForFollowUp(item, userById, managers);
      for (const recipientId of recipients) {
        const pref = prefByUser.get(recipientId);
        if (pref?.habilitada === false) continue;
        const leadMinutes = Number.isInteger(item.notificacaoAntecedenciaMinutos) && item.notificacaoAntecedenciaMinutos >= 0
          ? item.notificacaoAntecedenciaMinutos
          : Number.isInteger(pref?.antecedenciaPadraoMinutos) ? pref.antecedenciaPadraoMinutos : settings.antecedenciaPadraoMinutos;
        const dueAt = new Date(item.dataHora);
        const prealertAt = new Date(dueAt.getTime() - leadMinutes * 60000);
        if (now < prealertAt) continue;
        const overdue = now >= dueAt;
        const outcome = await upsertProjection({
          prisma,
          empresaId,
          destinatarioId: recipientId,
          tipo: item.titulo === "Lembrar conversa" ? NOTIFICATION_TYPES.FOLLOW_UP_REMINDER : NOTIFICATION_TYPES.FOLLOW_UP,
          prioridade: overdue || item.prioridade === "CRITICA" ? (overdue ? "ATENCAO" : "CRITICA") : "NORMAL",
          origemTipo: "FOLLOW_UP",
          origemId: item.id,
          occurrenceKey: `follow-up:${item.id}:${dueAt.toISOString()}`,
          dedupeKey: `follow-up:${item.id}:${dueAt.toISOString()}`,
          titulo: overdue ? "Acompanhamento atrasado" : item.titulo || "Acompanhamento próximo",
          corpo: overdue ? "Esse acompanhamento precisa de atenção." : "Um acompanhamento está próximo do horário definido.",
          alvoTipo: "FOLLOW_UP",
          alvoId: item.id,
          ocorridoEm: overdue ? dueAt : prealertAt,
          venceEm: dueAt,
          now,
        });
        result.created += outcome.created;
        result.updated += outcome.updated;
      }
    }

    for (const item of conversations) {
      const recipients = recipientIdsForConversation(item, userById, managers);
      for (const recipientId of recipients) {
        const waitingSince = item.aguardandoDesde || item.ultimaMensagemEm || now;
        const attention = now.getTime() - new Date(waitingSince).getTime() >= 30 * 60000;
        const name = item.contatoCanal?.cliente?.nome || item.contatoCanal?.nome || "um contato";
        const outcome = await upsertProjection({
          prisma,
          empresaId,
          destinatarioId: recipientId,
          tipo: NOTIFICATION_TYPES.MESSAGE,
          prioridade: attention ? "ATENCAO" : "NORMAL",
          origemTipo: "CONVERSATION",
          origemId: item.id,
          occurrenceKey: `conversation:${item.id}`,
          dedupeKey: `conversation:${item.id}`,
          titulo: "Nova mensagem",
          corpo: `${name} aguarda uma resposta.`,
          alvoTipo: "CONVERSATION",
          alvoId: item.id,
          ocorridoEm: new Date(waitingSince),
          now,
        });
        result.created += outcome.created;
        result.updated += outcome.updated;
      }
    }

    result.resolved += await resolveCompletedFollowUps(empresaId, now, prisma);
    result.resolved += await resolveCompletedConversations(empresaId, now, prisma);
    return result;
  }

  async function processDue({ now = clock(), limit = 20 } = {}) {
    if (!globallyEnabled()) return { tenants: 0, created: 0, updated: 0, resolved: 0 };
    const tenants = await prisma.configuracaoNotificacaoEmpresa.findMany({
      where: { habilitada: true },
      orderBy: { empresaId: "asc" },
      take: Math.min(Math.max(Number(limit) || 20, 1), 100),
      select: { empresaId: true },
    });
    const total = { tenants: tenants.length, created: 0, updated: 0, resolved: 0 };
    for (const tenant of tenants) {
      const result = await projectForTenant(tenant.empresaId, { now, limit: 100 });
      total.created += result.created || 0;
      total.updated += result.updated || 0;
      total.resolved += result.resolved || 0;
    }
    return total;
  }

  async function list(context, query = {}) {
    await assertEnabled(context.empresaId);
    await projectForTenant(context.empresaId, { now: clock(), limit: 120 });
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(positiveInteger(query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const now = clock();
    await resolveMissingTargets(prisma, context, now);
    const where = visibleWhere(context, now, { includeSnoozed: false });
    const rows = await prisma.notificacao.findMany({ where, orderBy: [{ lidaEm: "asc" }, { ocorridoEm: "desc" }, { id: "desc" }], take: Math.min(page * limit, 200) });
    rows.sort(compareNotifications);
    const pageRows = rows.slice((page - 1) * limit, page * limit);
    const total = await prisma.notificacao.count({ where });
    const snoozed = await prisma.notificacao.findMany({ where: visibleWhere(context, now, { includeSnoozed: true, onlySnoozed: true }), orderBy: [{ ocorridoEm: "desc" }, { id: "desc" }], take: limit });
    return { data: pageRows.map(presentNotification), snoozed: snoozed.map(presentNotification), pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 } };
  }

  async function summary(context) {
    await assertEnabled(context.empresaId);
    await projectForTenant(context.empresaId, { now: clock(), limit: 120 });
    const now = clock();
    await resolveMissingTargets(prisma, context, now);
    const where = visibleWhere(context, now, { includeSnoozed: false });
    const [unread, total] = await prisma.$transaction([
      prisma.notificacao.count({ where: { ...where, lidaEm: null } }),
      prisma.notificacao.count({ where }),
    ]);
    return { unread, total, loadedAt: now.toISOString() };
  }

  async function markRead(context, id) {
    await assertEnabled(context.empresaId);
    const now = clock();
    const result = await prisma.notificacao.updateMany({ where: { id: parseId(id), ...visibleWhere(context, now, { includeSnoozed: true }) }, data: { lidaEm: now, versao: { increment: 1 } } });
    if (result.count !== 1) throw domainError(404, "NOTIFICATION_NOT_FOUND", "Notificacao nao encontrada.");
    return getById(context, id);
  }

  async function markAllRead(context, input = {}) {
    await assertEnabled(context.empresaId);
    const cutoffAt = parseCutoff(input.cutoffAt, clock());
    const where = { ...visibleWhere(context, cutoffAt, { includeSnoozed: true }), lidaEm: null, createdAt: { lte: cutoffAt } };
    const result = await prisma.notificacao.updateMany({ where, data: { lidaEm: cutoffAt, versao: { increment: 1 } } });
    return { marked: result.count, cutoffAt: cutoffAt.toISOString() };
  }

  async function snooze(context, id, input = {}) {
    await assertEnabled(context.empresaId);
    const now = clock();
    const until = parseSnooze(input, now);
    const result = await prisma.notificacao.updateMany({ where: { id: parseId(id), ...visibleWhere(context, now, { includeSnoozed: true }) }, data: { adiadaAte: until, lidaEm: now, versao: { increment: 1 } } });
    if (result.count !== 1) throw domainError(404, "NOTIFICATION_NOT_FOUND", "Notificacao nao encontrada.");
    return getById(context, id);
  }

  async function unsnooze(context, id) {
    await assertEnabled(context.empresaId);
    const result = await prisma.notificacao.updateMany({ where: { id: parseId(id), ...visibleWhere(context, clock(), { includeSnoozed: true }) }, data: { adiadaAte: null, versao: { increment: 1 } } });
    if (result.count !== 1) throw domainError(404, "NOTIFICATION_NOT_FOUND", "Notificacao nao encontrada.");
    return getById(context, id);
  }

  async function resolve(context, id) {
    await assertEnabled(context.empresaId);
    const result = await prisma.notificacao.updateMany({ where: { id: parseId(id), empresaId: context.empresaId, destinatarioId: context.usuarioId, resolvidaEm: null }, data: { resolvidaEm: clock(), versao: { increment: 1 } } });
    if (result.count !== 1) throw domainError(404, "NOTIFICATION_NOT_FOUND", "Notificacao nao encontrada.");
    return getById(context, id);
  }

  async function getById(context, id) {
    const row = await prisma.notificacao.findFirst({ where: { id: parseId(id), empresaId: context.empresaId, destinatarioId: context.usuarioId } });
    if (!row) throw domainError(404, "NOTIFICATION_NOT_FOUND", "Notificacao nao encontrada.");
    return presentNotification(row);
  }

  async function getSettings(context) {
    if (!globallyEnabled()) throw domainError(404, "NOTIFICATIONS_DISABLED", "Recurso nao encontrado.");
    const [empresa, usuario] = await prisma.$transaction([
      prisma.configuracaoNotificacaoEmpresa.findUnique({ where: { empresaId: context.empresaId } }),
      prisma.preferenciaNotificacaoUsuario.findUnique({ where: { empresaId_usuarioId: { empresaId: context.empresaId, usuarioId: context.usuarioId } } }),
    ]);
    if (!empresa?.habilitada && !MANAGER_ROLES.includes(context.papel)) {
      throw domainError(404, "NOTIFICATIONS_DISABLED", "Notificacoes desativadas para esta empresa.");
    }
    return { empresa, usuario: usuario || { antecedenciaPadraoMinutos: empresa?.antecedenciaPadraoMinutos ?? 30, habilitada: true } };
  }

  async function getPreferences(context) {
    await assertEnabled(context.empresaId);
    const empresa = await prisma.configuracaoNotificacaoEmpresa.findUnique({ where: { empresaId: context.empresaId }, select: { antecedenciaPadraoMinutos: true } });
    const usuario = await prisma.preferenciaNotificacaoUsuario.findUnique({ where: { empresaId_usuarioId: { empresaId: context.empresaId, usuarioId: context.usuarioId } } });
    return { usuario: usuario || { antecedenciaPadraoMinutos: empresa?.antecedenciaPadraoMinutos ?? 30, habilitada: true } };
  }

  async function updateSettings(context, input = {}) {
    await assertManager(context);
    if (!globallyEnabled()) throw domainError(404, "NOTIFICATIONS_DISABLED", "Recurso nao encontrado.");
    const values = validateSettings(input);
    const empresa = await prisma.configuracaoNotificacaoEmpresa.upsert({
      where: { empresaId: context.empresaId },
      create: { empresaId: context.empresaId, ...values },
      update: values,
    });
    return { empresa };
  }

  async function updatePreferences(context, input = {}) {
    await assertEnabled(context.empresaId);
    const values = validatePreferences(input);
    const usuario = await prisma.preferenciaNotificacaoUsuario.upsert({
      where: { empresaId_usuarioId: { empresaId: context.empresaId, usuarioId: context.usuarioId } },
      create: { empresaId: context.empresaId, usuarioId: context.usuarioId, ...values },
      update: values,
    });
    return { usuario };
  }

  return { getById, getPreferences, getSettings, list, markAllRead, markRead, processDue, projectForTenant, resolve, snooze, summary, unsnooze, updatePreferences, updateSettings };
}

async function upsertProjection({ prisma, empresaId, destinatarioId, tipo, prioridade, origemTipo, origemId, occurrenceKey, dedupeKey, titulo, corpo, alvoTipo, alvoId, ocorridoEm, venceEm = null, now }) {
  assertSourceAndTarget({ origemTipo, alvoTipo, origemId, alvoId });
  if (!VALID_PRIORITIES.has(prioridade)) throw domainError(422, "NOTIFICATION_PRIORITY_INVALID", "Prioridade de notificacao invalida.");
  const existing = await prisma.notificacao.findUnique({ where: { empresaId_destinatarioId_occurrenceKey: { empresaId, destinatarioId, occurrenceKey } } });
  const next = { tipo, prioridade, origemTipo, origemId, occurrenceKey, dedupeKey, titulo: boundedText(titulo, 120), corpo: boundedText(corpo, 280), alvoTipo, alvoId, ocorridoEm, venceEm };
  if (!existing) {
    await prisma.notificacao.create({ data: { empresaId, destinatarioId, ...next } });
    return { created: 1, updated: 0 };
  }
  const materialChanged = existing.tipo !== tipo || existing.ocorridoEm.getTime() !== new Date(ocorridoEm).getTime() || existing.titulo !== next.titulo;
  await prisma.notificacao.update({ where: { id: existing.id }, data: { ...next, ...(materialChanged && existing.resolvidaEm ? { resolvidaEm: null, lidaEm: null } : {}), ...(materialChanged && !existing.resolvidaEm && existing.lidaEm ? { lidaEm: null } : {}), versao: { increment: 1 } } });
  return { created: 0, updated: 1 };
}

async function resolveCompletedFollowUps(empresaId, now, prismaArg) {
  if (!prismaArg) return 0;
  const rows = await prismaArg.notificacao.findMany({ where: { empresaId, origemTipo: "FOLLOW_UP", resolvidaEm: null }, select: { id: true, origemId: true } });
  if (!rows.length) return 0;
  const ids = rows.map((row) => row.origemId).filter(Number.isInteger);
  const active = await prismaArg.acompanhamento.findMany({ where: { empresaId, id: { in: ids }, status: { in: ACTIVE_FOLLOW_UP_STATUSES } }, select: { id: true } });
  const activeIds = new Set(active.map((row) => row.id));
  const done = rows.filter((row) => !activeIds.has(row.origemId)).map((row) => row.id);
  if (!done.length) return 0;
  const result = await prismaArg.notificacao.updateMany({ where: { empresaId, id: { in: done }, resolvidaEm: null }, data: { resolvidaEm: now, versao: { increment: 1 } } });
  return result.count;
}

async function resolveCompletedConversations(empresaId, now, prismaArg) {
  const rows = await prismaArg.notificacao.findMany({ where: { empresaId, origemTipo: "CONVERSATION", resolvidaEm: null }, select: { id: true, origemId: true } });
  if (!rows.length) return 0;
  const ids = rows.map((row) => row.origemId).filter(Number.isInteger);
  const active = await prismaArg.conversaCanal.findMany({ where: { empresaId, id: { in: ids }, ...pendingConversationWhere(now) }, select: { id: true } });
  const activeIds = new Set(active.map((row) => row.id));
  const done = rows.filter((row) => !activeIds.has(row.origemId)).map((row) => row.id);
  if (!done.length) return 0;
  const result = await prismaArg.notificacao.updateMany({ where: { empresaId, id: { in: done }, resolvidaEm: null }, data: { resolvidaEm: now, versao: { increment: 1 } } });
  return result.count;
}

async function resolveMissingTargets(prisma, context, now) {
  const rows = await prisma.notificacao.findMany({
    where: { empresaId: context.empresaId, destinatarioId: context.usuarioId, resolvidaEm: null },
    select: { id: true, alvoTipo: true, alvoId: true },
  });
  if (!rows.length) return 0;
  const idsByKind = new Map();
  const invalidTargetNotificationIds = [];
  for (const row of rows) {
    if (!Number.isInteger(row.alvoId)) { invalidTargetNotificationIds.push(row.id); continue; }
    const list = idsByKind.get(row.alvoTipo) || [];
    list.push(row.alvoId);
    idsByKind.set(row.alvoTipo, list);
  }
  const [conversations, followUps, deals] = await Promise.all([
    prisma.conversaCanal.findMany({ where: { empresaId: context.empresaId, id: { in: idsByKind.get("CONVERSATION") || [] } }, select: { id: true } }),
    prisma.acompanhamento.findMany({ where: { empresaId: context.empresaId, id: { in: idsByKind.get("FOLLOW_UP") || [] } }, select: { id: true } }),
    prisma.negocio.findMany({ where: { empresaId: context.empresaId, id: { in: idsByKind.get("DEAL") || [] } }, select: { id: true } }),
  ]);
  const existing = new Map([
    ["CONVERSATION", new Set(conversations.map((row) => row.id))],
    ["FOLLOW_UP", new Set(followUps.map((row) => row.id))],
    ["DEAL", new Set(deals.map((row) => row.id))],
  ]);
  const missing = [
    ...invalidTargetNotificationIds,
    ...rows.filter((row) => Number.isInteger(row.alvoId) && !existing.get(row.alvoTipo)?.has(row.alvoId)).map((row) => row.id),
  ];
  if (!missing.length) return 0;
  const result = await prisma.notificacao.updateMany({ where: { empresaId: context.empresaId, destinatarioId: context.usuarioId, id: { in: missing }, resolvidaEm: null }, data: { resolvidaEm: now, adiadaAte: null, versao: { increment: 1 } } });
  return result.count;
}

function recipientIdsForFollowUp(item, userById, managers) {
  const direct = [item.responsavelId, item.autorId, item.negocio?.responsavelId, item.conversaCanal?.responsavelId].find((id) => Number.isInteger(id) && userById.get(id));
  return direct ? [direct] : managers;
}

function recipientIdsForConversation(item, userById, managers) {
  return Number.isInteger(item.responsavelId) && userById.get(item.responsavelId) ? [item.responsavelId] : managers;
}

function pendingConversationWhere(now) {
  return {
    OR: [
      { status: { in: ["NOVA", "AGUARDANDO_ATENDIMENTO"] }, encerradaEm: null, ultimaMensagemEm: { not: null } },
      { status: "EM_ATENDIMENTO", encerradaEm: null, aguardandoDesde: { not: null }, ultimaMensagemEm: { not: null } },
      { status: "PENDENTE", acompanhamentos: { some: { status: { in: ACTIVE_FOLLOW_UP_STATUSES }, titulo: "Lembrar conversa", tipo: "RETORNO", dataHora: { lte: now } } } },
    ],
  };
}

function visibleWhere(context, now, { includeSnoozed = false, onlySnoozed = false } = {}) {
  const visibility = { empresaId: context.empresaId, destinatarioId: context.usuarioId, resolvidaEm: null };
  if (onlySnoozed) return { ...visibility, adiadaAte: { gt: now } };
  if (!includeSnoozed) visibility.OR = [{ adiadaAte: null }, { adiadaAte: { lte: now } }];
  return visibility;
}

function presentNotification(row) {
  const route = routeForTarget(row.alvoTipo, row.alvoId);
  return {
    id: row.id,
    tipo: row.tipo,
    prioridade: row.prioridade,
    titulo: row.titulo,
    corpo: row.corpo,
    ocorridoEm: row.ocorridoEm,
    venceEm: row.venceEm,
    lidaEm: row.lidaEm,
    resolvidaEm: row.resolvidaEm,
    adiadaAte: row.adiadaAte,
    nova: row.lidaEm === null,
    adiada: row.adiadaAte !== null && new Date(row.adiadaAte) > new Date(),
    destino: route ? { tipo: row.alvoTipo, id: row.alvoId, rota: route } : null,
  };
}

function routeForTarget(kind, id) {
  if (!TARGET_KINDS.has(kind) || !Number.isInteger(id) || id < 1) return null;
  if (kind === "CONVERSATION") return `/caixa-de-entrada?conversationId=${encodeURIComponent(id)}`;
  if (kind === "FOLLOW_UP") return `/agenda?acompanhamentoId=${encodeURIComponent(id)}`;
  if (kind === "DEAL") return `/negocios?negocioId=${encodeURIComponent(id)}`;
  return null;
}

function assertSourceAndTarget({ origemTipo, alvoTipo, origemId, alvoId }) {
  const targetMatchesSource = (origemTipo === "CONVERSATION" && alvoTipo === "CONVERSATION")
    || (origemTipo === "FOLLOW_UP" && alvoTipo === "FOLLOW_UP");
  if (!SOURCE_KINDS.has(origemTipo) || !TARGET_KINDS.has(alvoTipo) || !targetMatchesSource || !Number.isInteger(origemId) || origemId < 1 || !Number.isInteger(alvoId) || alvoId < 1 || origemId !== alvoId) {
    throw domainError(422, "NOTIFICATION_TARGET_INVALID", "Destino de notificacao invalido.");
  }
}

function compareNotifications(left, right) {
  const priority = (PRIORITY_RANK[left.prioridade] ?? PRIORITY_RANK.NORMAL) - (PRIORITY_RANK[right.prioridade] ?? PRIORITY_RANK.NORMAL);
  if (priority !== 0) return priority;
  if ((left.lidaEm === null) !== (right.lidaEm === null)) return left.lidaEm === null ? -1 : 1;
  const occurred = new Date(right.ocorridoEm).getTime() - new Date(left.ocorridoEm).getTime();
  return occurred || right.id - left.id;
}

function validateSettings(input) {
  const values = {};
  if (Object.hasOwn(input, "diasSemContato")) values.diasSemContato = boundedInt(input.diasSemContato, 1, 365);
  if (Object.hasOwn(input, "diasProdutoDesatualizado")) values.diasProdutoDesatualizado = boundedInt(input.diasProdutoDesatualizado, 1, 3650);
  if (Object.hasOwn(input, "diasAntesVencimento")) values.diasAntesVencimento = boundedInt(input.diasAntesVencimento, 0, 365);
  if (Object.hasOwn(input, "antecedenciaPadraoMinutos")) values.antecedenciaPadraoMinutos = boundedInt(input.antecedenciaPadraoMinutos, 0, 10080);
  if (Object.hasOwn(input, "habilitada")) { if (typeof input.habilitada !== "boolean") throw domainError(422, "VALIDATION_ERROR", "Habilitacao invalida."); values.habilitada = input.habilitada; }
  if (!Object.keys(values).length) throw domainError(422, "VALIDATION_ERROR", "Informe ao menos uma configuracao.");
  return values;
}

function validatePreferences(input) {
  const values = { };
  if (Object.hasOwn(input, "antecedenciaPadraoMinutos")) values.antecedenciaPadraoMinutos = boundedInt(input.antecedenciaPadraoMinutos, 0, 10080);
  if (Object.hasOwn(input, "habilitada")) { if (typeof input.habilitada !== "boolean") throw domainError(422, "VALIDATION_ERROR", "Habilitacao invalida."); values.habilitada = input.habilitada; }
  if (!Object.keys(values).length) throw domainError(422, "VALIDATION_ERROR", "Informe ao menos uma preferencia.");
  return values;
}

function boundedInt(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw domainError(422, "VALIDATION_ERROR", "Valor de notificacao fora do limite.");
  return parsed;
}

function parseSnooze(input, now) {
  if (typeof input?.snoozedUntil === "string") {
    const parsed = new Date(input.snoozedUntil);
    if (!Number.isFinite(parsed.getTime()) || parsed <= now || parsed.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) throw domainError(422, "SNOOZE_INVALID", "Horario de adiamento invalido.");
    return parsed;
  }
  const minutes = input?.minutes === undefined ? 60 : Number(input.minutes);
  if (!Number.isInteger(minutes) || ![30, 60, 1440].includes(minutes)) throw domainError(422, "SNOOZE_INVALID", "Escolha um intervalo de adiamento valido.");
  if (minutes === 1440) {
    return nextDayAtNine(now, EFFECTIVE_TIME_ZONE);
  }
  return new Date(now.getTime() + minutes * 60000);
}

function nextDayAtNine(now, timeZone) {
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce((result, part) => { if (part.type !== "literal") result[part.type] = Number(part.value); return result; }, {});
  const next = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + 1, 9, 0, 0, 0));
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  let guess = next.getTime();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess)).reduce((result, part) => { if (part.type !== "literal") result[part.type] = Number(part.value); return result; }, {});
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess = next.getTime() - (zonedAsUtc - guess);
  }
  return new Date(guess);
}

function parseCutoff(value, now) {
  if (value === undefined || value === null || value === "") return now;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed > now) throw domainError(422, "CUTOFF_INVALID", "Corte de leitura invalido.");
  return parsed;
}

function boundedText(value, max) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw domainError(422, "NOTIFICATION_ID_INVALID", "Identificador invalido.");
  return parsed;
}

async function assertManager(context) {
  if (!MANAGER_ROLES.includes(context.papel)) throw domainError(403, "NOTIFICATION_SETTINGS_FORBIDDEN", "Acesso negado.");
}

function domainError(status, codigo, message) {
  const error = new Error(message);
  error.status = status;
  error.codigo = codigo;
  return error;
}

module.exports = {
  ACTIVE_FOLLOW_UP_STATUSES,
  NOTIFICATION_TYPES,
  createNotificationService,
  pendingConversationWhere,
  presentNotification,
  routeForTarget,
};
