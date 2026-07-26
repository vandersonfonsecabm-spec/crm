const { domainError, isManager, notFound } = require("../leads-communication/policy");
const {
  enumValue,
  optionalInteger,
  optionalText,
  pagination,
  rejectEmpresaId,
  rejectUnknown,
} = require("../leads-communication/validation");

const BUSINESS_STAGES = ["NOVO", "CONTATO", "PROPOSTA", "FECHADO", "PERDIDO"];
const ACTIVE_FOLLOW_UP_STATUSES = ["PENDENTE", "EM_ANDAMENTO"];
const TERMINAL_BUSINESS_STAGES = new Set(["FECHADO", "PERDIDO"]);

function createNegociosKanbanServices({ prisma, clock = () => new Date() }) {
  async function listBusinesses(context, query = {}) {
    rejectEmpresaId(query);
    rejectUnknown(query, ["page", "limit", "etapa", "responsavelId", "q"]);
    const pageData = pagination(query);
    const where = { empresaId: context.empresaId };
    const etapa = enumValue(query.etapa, "etapa", BUSINESS_STAGES, { optional: true });
    if (etapa) where.etapa = etapa;
    const responsavelId = optionalInteger(query.responsavelId, "responsavelId", { min: 1 });
    if (responsavelId) where.responsavelId = responsavelId;
    const q = optionalText(query.q, "q", 120);
    if (q) {
      where.OR = [
        { titulo: { contains: q } },
        { cliente: { nome: { contains: q } } },
        { cliente: { empresa: { contains: q } } },
      ];
    }

    const [data, total, grouped] = await prisma.$transaction([
      prisma.negocio.findMany({
        where,
        include: listIncludes(context.empresaId),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: pageData.skip,
        take: pageData.limit,
      }),
      prisma.negocio.count({ where }),
      prisma.negocio.groupBy({ by: ["etapa"], where: { empresaId: context.empresaId }, _count: { _all: true } }),
    ]);

    const now = clock();
    return {
      data: data.map((business) => businessView(context, business, now)),
      pagination: {
        total,
        page: pageData.page,
        limit: pageData.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageData.limit),
      },
      resumo: summary(grouped),
    };
  }

  async function getBusiness(context, id) {
    const business = await prisma.negocio.findFirst({
      where: { id, empresaId: context.empresaId },
      include: detailIncludes(context.empresaId),
    });
    if (!business) throw notFound("Negocio nao encontrado.");
    return businessView(context, business, clock());
  }

  async function listBusinessStageHistory(context, id) {
    const business = await prisma.negocio.findFirst({
      where: { id, empresaId: context.empresaId },
      select: { id: true },
    });
    if (!business) throw notFound("Negocio nao encontrado.");
    const data = await prisma.historicoAtribuicao.findMany({
      where: {
        empresaId: context.empresaId,
        negocioId: id,
        tipo: "MOVIMENTAR_ETAPA",
      },
      include: {
        alteradoPor: { select: { id: true, nome: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      data: data.map((entry) => ({
        id: entry.id,
        etapaAnterior: entry.etapaAnterior,
        etapaNova: entry.etapaNova,
        etapaEntrouEm: entry.etapaEntrouEm,
        etapaSaiuEm: entry.etapaSaiuEm,
        duracaoEtapaSegundos: entry.duracaoEtapaSegundos,
        duracaoEtapaEstimada: entry.duracaoEtapaEstimada === true,
        autor: entry.alteradoPor,
        createdAt: entry.createdAt,
      })),
    };
  }

  async function updateBusinessStage(context, id, input) {
    const body = rejectUnknown(input, ["etapa", "etapaAnterior"]);
    rejectEmpresaId(body);
    const etapa = enumValue(body.etapa, "etapa", BUSINESS_STAGES);
    const etapaAnterior = enumValue(body.etapaAnterior, "etapaAnterior", BUSINESS_STAGES);
    await prisma.$transaction(async (tx) => {
      const current = await tx.negocio.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound("Negocio nao encontrado.");
      if (!isManager(context) && current.responsavelId !== context.usuarioId) {
        throw domainError(403, "NEGOCIO_FORBIDDEN", "Acesso negado.");
      }
      if (current.etapa !== etapaAnterior) {
        throw domainError(409, "NEGOCIO_STAGE_CONFLICT", "O Negocio foi alterado por outra operacao.", { etapaAtual: current.etapa });
      }
      if (current.etapa === etapa) return;

      const now = clock();
      const persistedEntry = current.etapaEntrouEm;
      const effectiveEntry = persistedEntry || current.updatedAt || current.createdAt;
      const duration = elapsedSeconds(effectiveEntry, now);
      const result = await tx.negocio.updateMany({
        where: { id, empresaId: context.empresaId, etapa: etapaAnterior },
        data: {
          etapa,
          etapaEntrouEm: now,
          ultimaMovimentacaoEm: now,
          fechadoEm: etapa === "FECHADO" ? now : null,
          perdidoEm: etapa === "PERDIDO" ? now : null,
        },
      });
      if (result.count !== 1) {
        throw domainError(409, "NEGOCIO_STAGE_CONFLICT", "O Negocio foi alterado por outra operacao.");
      }
      await tx.historicoAtribuicao.create({
        data: {
          empresaId: context.empresaId,
          negocioId: id,
          alteradoPorId: context.usuarioId,
          tipo: "MOVIMENTAR_ETAPA",
          origem: "MANUAL",
          etapaAnterior,
          etapaNova: etapa,
          etapaEntrouEm: effectiveEntry,
          etapaSaiuEm: now,
          duracaoEtapaSegundos: duration,
          duracaoEtapaEstimada: persistedEntry === null || persistedEntry === undefined,
        },
      });
    });
    return getBusiness(context, id);
  }

  return { getBusiness, listBusinesses, listBusinessStageHistory, updateBusinessStage };
}

function listIncludes(empresaId) {
  return {
    cliente: { select: { id: true, nome: true, empresa: true, telefone: true, email: true } },
    lead: { select: { id: true, origem: true, campanha: true, interesse: true, status: true } },
    responsavel: { select: { id: true, nome: true } },
    convertidoPor: { select: { id: true, nome: true } },
    acompanhamentos: {
      where: { empresaId, status: { in: ACTIVE_FOLLOW_UP_STATUSES } },
      select: {
        id: true,
        titulo: true,
        dataHora: true,
        prioridade: true,
        status: true,
        tipo: true,
        responsavelUsuario: { select: { id: true, nome: true } },
      },
      orderBy: [{ dataHora: "asc" }, { id: "asc" }],
      take: 1,
    },
    historicoAtribuicoes: {
      where: { empresaId, tipo: "MOVIMENTAR_ETAPA" },
      select: { duracaoEtapaSegundos: true },
    },
  };
}

function detailIncludes(empresaId) {
  return {
    ...listIncludes(empresaId),
    lead: {
      select: {
        id: true,
        origem: true,
        campanha: true,
        interesse: true,
        status: true,
        conversas: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
            canalIntegracao: { select: { id: true, tipo: true, nome: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
      },
    },
  };
}

function businessView(context, business, now) {
  const { acompanhamentos, historicoAtribuicoes, ...data } = business;
  const nextAction = acompanhamentos?.[0] || null;
  const stageTiming = stageTimingView(business, historicoAtribuicoes || [], now);
  const stalled = stalledBusinessView(business.etapa, nextAction, now);
  return {
    ...data,
    proximaAcao: nextAction ? {
      ...nextAction,
      atrasada: new Date(nextAction.dataHora).getTime() < now.getTime(),
    } : null,
    tempoEtapa: stageTiming,
    negocioParado: stalled.parado,
    motivoParado: stalled.motivo,
    permissoes: {
      movimentar: isManager(context) || business.responsavelId === context.usuarioId,
    },
  };
}

function stageTimingView(business, history, now) {
  const persistedEntry = business.etapaEntrouEm;
  const effectiveEntry = persistedEntry || business.updatedAt || business.createdAt;
  const currentDuration = elapsedSeconds(effectiveEntry, now);
  const closedDuration = history.reduce(
    (total, entry) => total + safeDuration(entry.duracaoEtapaSegundos),
    0,
  );
  return {
    entrouEm: effectiveEntry,
    ultimaMovimentacaoEm: business.ultimaMovimentacaoEm,
    atualSegundos: currentDuration,
    acumuladoSegundos: closedDuration + currentDuration,
    estimado: persistedEntry === null || persistedEntry === undefined,
  };
}

function stalledBusinessView(stage, nextAction, now) {
  if (TERMINAL_BUSINESS_STAGES.has(stage)) return { parado: false, motivo: null };
  if (!nextAction) return { parado: true, motivo: "SEM_PROXIMA_ACAO" };
  if (new Date(nextAction.dataHora).getTime() < now.getTime()) {
    return { parado: true, motivo: "PROXIMA_ACAO_ATRASADA" };
  }
  return { parado: false, motivo: null };
}

function elapsedSeconds(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 1000));
}

function safeDuration(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function summary(grouped) {
  const porEtapa = Object.fromEntries(BUSINESS_STAGES.map((stage) => [stage, 0]));
  for (const item of grouped) porEtapa[item.etapa] = item._count._all;
  return {
    total: Object.values(porEtapa).reduce((sum, count) => sum + count, 0),
    porEtapa,
    fechados: porEtapa.FECHADO,
    perdidos: porEtapa.PERDIDO,
  };
}

module.exports = {
  BUSINESS_STAGES,
  createNegociosKanbanServices,
  elapsedSeconds,
  stageTimingView,
  stalledBusinessView,
};
