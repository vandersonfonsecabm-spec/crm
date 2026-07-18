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

function createNegociosKanbanServices({ prisma }) {
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
        include: listIncludes(),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: pageData.skip,
        take: pageData.limit,
      }),
      prisma.negocio.count({ where }),
      prisma.negocio.groupBy({ by: ["etapa"], where: { empresaId: context.empresaId }, _count: { _all: true } }),
    ]);

    return {
      data: data.map((business) => businessView(context, business)),
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
      include: detailIncludes(),
    });
    if (!business) throw notFound("Negocio nao encontrado.");
    return businessView(context, business);
  }

  async function updateBusinessStage(context, id, input) {
    const body = rejectUnknown(input, ["etapa", "etapaAnterior"]);
    rejectEmpresaId(body);
    const etapa = enumValue(body.etapa, "etapa", BUSINESS_STAGES);
    const etapaAnterior = enumValue(body.etapaAnterior, "etapaAnterior", BUSINESS_STAGES);
    const current = await prisma.negocio.findFirst({ where: { id, empresaId: context.empresaId } });
    if (!current) throw notFound("Negocio nao encontrado.");
    if (!isManager(context) && current.responsavelId !== context.usuarioId) {
      throw domainError(403, "NEGOCIO_FORBIDDEN", "Acesso negado.");
    }
    if (current.etapa !== etapaAnterior) {
      throw domainError(409, "NEGOCIO_STAGE_CONFLICT", "O Negocio foi alterado por outra operacao.", { etapaAtual: current.etapa });
    }
    if (current.etapa === etapa) return getBusiness(context, id);

    const result = await prisma.negocio.updateMany({
      where: { id, empresaId: context.empresaId, etapa: etapaAnterior },
      data: { etapa },
    });
    if (result.count !== 1) {
      throw domainError(409, "NEGOCIO_STAGE_CONFLICT", "O Negocio foi alterado por outra operacao.");
    }
    return getBusiness(context, id);
  }

  return { getBusiness, listBusinesses, updateBusinessStage };
}

function listIncludes() {
  return {
    cliente: { select: { id: true, nome: true, empresa: true, telefone: true, email: true } },
    lead: { select: { id: true, origem: true, campanha: true, interesse: true, status: true } },
    responsavel: { select: { id: true, nome: true } },
    convertidoPor: { select: { id: true, nome: true } },
  };
}

function detailIncludes() {
  return {
    ...listIncludes(),
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

function businessView(context, business) {
  return {
    ...business,
    permissoes: {
      movimentar: isManager(context) || business.responsavelId === context.usuarioId,
    },
  };
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

module.exports = { BUSINESS_STAGES, createNegociosKanbanServices };
