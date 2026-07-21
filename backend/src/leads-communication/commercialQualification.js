const { domainError, isManager, notFound, requireResponsibleOrManager } = require("./policy");

const PRIORITIES = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
const ACTIVE_BUSINESS_STAGES = ["NOVO", "CONTATO", "PROPOSTA"];
const QUALIFIABLE_CONVERSATION_STATES = ["EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE"];

function createInboxCommercialQualificationService({ prisma, convertLeadToBusiness }) {
  async function getCommercialContext(context, conversationId) {
    const conversation = await loadConversation(prisma, context, conversationId);
    return presentContext(conversation, context);
  }

  async function saveCommercialQualification(context, conversationId, input) {
    const qualification = parseQualification(input);
    await prisma.$transaction(async (tx) => {
      const conversation = await loadConversation(tx, context, conversationId);
      requireCommercialWrite(context, conversation);
      const { cliente, lead } = requireCommercialEntities(conversation);
      if (!QUALIFIABLE_CONVERSATION_STATES.includes(conversation.status)) {
        throw domainError(422, "COMMERCIAL_CONVERSATION_STATE_INVALID", "A conversa precisa estar em atendimento para ser qualificada.");
      }
      if (lead.status === "DESQUALIFICADO") {
        throw domainError(409, "COMMERCIAL_LEAD_DISQUALIFIED", "Lead desqualificado nao pode ser qualificado por esta conversa.");
      }
      if (!isManager(context) && lead.responsavelId !== null && lead.responsavelId !== context.usuarioId) {
        throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
      }

      const author = await tx.usuario.findFirst({
        where: { id: context.usuarioId, empresaId: context.empresaId, ativo: true },
        select: { id: true, nome: true },
      });
      if (!author) throw domainError(401, "AUTH_CONTEXT_INVALID", "Sessao invalida.");
      const responsibleId = lead.responsavelId ?? conversation.responsavelId ?? context.usuarioId;
      const leadData = {
        interesse: qualification.interesse,
        ...(lead.status === "CONVERTIDO" ? {} : { status: "QUALIFICADO", qualificadoEm: lead.qualificadoEm ?? new Date() }),
        ...(lead.responsavelId === null ? { responsavelId: responsibleId } : {}),
      };

      await tx.lead.update({ where: { id: lead.id }, data: leadData });
      await tx.cliente.update({
        where: { id: cliente.id },
        data: {
          interesse: qualification.interesse,
          ...(qualification.valorEstimado === null ? {} : { valor: qualification.valorEstimado }),
          proximoFollowUp: qualification.dataRetorno
            ? qualification.dataRetorno.toISOString().slice(0, 10)
            : qualification.proximaAcao,
        },
      });
      await tx.acompanhamento.create({
        data: {
          empresaId: context.empresaId,
          clienteId: cliente.id,
          leadId: lead.id,
          conversaCanalId: conversation.id,
          titulo: qualification.proximaAcao,
          descricao: qualification.observacao,
          dataHora: qualification.dataRetorno ?? new Date(),
          prioridade: qualification.prioridade,
          status: "PENDENTE",
          tipo: followUpType(conversation.canalIntegracao.tipo),
          responsavel: author.nome,
        },
      });
      await createCommercialHistory(tx, context, conversation, {
        acao: "QUALIFICAR",
        ...qualification,
      });
    });
    return getCommercialContext(context, conversationId);
  }

  async function listEligibleBusinesses(context, conversationId, query = {}) {
    rejectTenantAuthority(query);
    const conversation = await loadConversation(prisma, context, conversationId);
    requireCommercialWrite(context, conversation);
    const { cliente, lead } = requireCommercialEntities(conversation);
    const q = cleanOptionalText(query.q, "q", 120);
    const businesses = await prisma.negocio.findMany({
      where: {
        empresaId: context.empresaId,
        clienteId: cliente.id,
        etapa: { in: ACTIVE_BUSINESS_STAGES },
        ...(q ? {
          OR: [
            { titulo: { contains: q } },
            { responsavel: { nome: { contains: q } } },
          ],
        } : {}),
      },
      include: businessIncludes(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 25,
    });
    return {
      data: businesses.map((business) => presentBusinessCandidate(business, lead.id)),
    };
  }

  async function createBusinessFromConversation(context, conversationId, input) {
    const body = parseCreateBusiness(input);
    const before = await loadConversation(prisma, context, conversationId);
    requireCommercialWrite(context, before);
    const { cliente, lead } = requireCommercialEntities(before);
    if (lead.negocios[0]) throw domainError(409, "COMMERCIAL_BUSINESS_ALREADY_LINKED", "A conversa ja possui um Negocio vinculado.");
    const qualification = requireReadyQualification(before);
    const duplicates = await possibleDuplicates(prisma, context.empresaId, cliente.id, lead.id);
    if (duplicates.length && !body.confirmarDuplicidade) {
      throw domainError(409, "COMMERCIAL_BUSINESS_DUPLICATE_CONFIRMATION_REQUIRED", "Existem Negocios ativos para este Cliente.", {
        negocios: duplicates.map((business) => presentBusinessCandidate(business, lead.id)),
      });
    }

    const result = await convertLeadToBusiness(context, lead.id, {
      titulo: body.titulo,
      valor: qualification.valorEstimado ?? undefined,
      observacao: body.observacao ?? qualification.observacao ?? undefined,
    }, {
      afterConvert: async (tx, conversion) => {
        await attachFollowUp(tx, qualification.acompanhamentoId, conversion.negocio.id);
        await createCommercialHistory(tx, context, before, {
          acao: "CRIAR_NEGOCIO",
          negocioId: conversion.negocio.id,
          observacao: body.observacao ?? qualification.observacao,
        });
      },
    });
    if (!result.created) {
      throw domainError(409, "COMMERCIAL_BUSINESS_CREATION_CONFLICT", "Outro usuario concluiu a criacao deste Negocio.", {
        negocio: presentBusinessCandidate(result.negocio, lead.id),
      });
    }
    return { created: true, negocio: result.negocio, contexto: await getCommercialContext(context, conversationId) };
  }

  async function linkExistingBusiness(context, conversationId, input) {
    const businessId = parseBusinessId(input);
    await prisma.$transaction(async (tx) => {
      const conversation = await loadConversation(tx, context, conversationId);
      requireCommercialWrite(context, conversation);
      const { cliente, lead } = requireCommercialEntities(conversation);
      const qualification = requireReadyQualification(conversation);
      const linked = lead.negocios[0];
      if (linked && linked.id !== businessId) {
        throw domainError(409, "COMMERCIAL_BUSINESS_ALREADY_LINKED", "A conversa ja possui outro Negocio vinculado.");
      }

      const business = await tx.negocio.findFirst({
        where: { id: businessId, empresaId: context.empresaId },
        include: businessIncludes(),
      });
      if (!business) throw notFound("Negocio nao encontrado.");
      if (business.clienteId !== cliente.id) {
        throw domainError(409, "COMMERCIAL_BUSINESS_CLIENT_MISMATCH", "Negocio e conversa pertencem a Clientes diferentes.");
      }
      if (!ACTIVE_BUSINESS_STAGES.includes(business.etapa)) {
        throw domainError(422, "COMMERCIAL_BUSINESS_INACTIVE", "Somente Negocios ativos podem ser vinculados.");
      }
      if (business.leadId !== null && business.leadId !== lead.id) {
        throw domainError(409, "COMMERCIAL_BUSINESS_LEAD_CONFLICT", "Negocio ja esta vinculado a outro Lead.");
      }
      if (business.leadId === lead.id && linked?.id === business.id) return;

      const updated = await tx.negocio.updateMany({
        where: { id: business.id, empresaId: context.empresaId, leadId: null },
        data: {
          leadId: lead.id,
          convertidoPorId: context.usuarioId,
          statusLeadAnterior: lead.status,
          ...(business.responsavelId === null && lead.responsavelId !== null ? { responsavelId: lead.responsavelId } : {}),
        },
      });
      if (updated.count !== 1) {
        throw domainError(409, "COMMERCIAL_BUSINESS_LINK_CONFLICT", "Outro usuario alterou este Negocio.");
      }
      const leadUpdate = await tx.lead.updateMany({
        where: { id: lead.id, empresaId: context.empresaId, status: { not: "CONVERTIDO" } },
        data: { status: "CONVERTIDO", convertidoEm: new Date() },
      });
      if (leadUpdate.count !== 1) {
        throw domainError(409, "COMMERCIAL_BUSINESS_LINK_CONFLICT", "Outro usuario alterou este Lead.");
      }
      await attachFollowUp(tx, qualification.acompanhamentoId, business.id);
      await createCommercialHistory(tx, context, conversation, {
        acao: "VINCULAR_NEGOCIO",
        negocioId: business.id,
      });
    });
    return { linked: true, contexto: await getCommercialContext(context, conversationId) };
  }

  return {
    createBusinessFromConversation,
    getCommercialContext,
    linkExistingBusiness,
    listEligibleBusinesses,
    saveCommercialQualification,
  };
}

async function loadConversation(client, context, conversationId) {
  const conversation = await client.conversaCanal.findFirst({
    where: { id: conversationId, empresaId: context.empresaId },
    include: {
      canalIntegracao: { select: { id: true, nome: true, tipo: true } },
      contatoCanal: { include: { cliente: true } },
      responsavel: { select: { id: true, nome: true, papel: true } },
      lead: {
        include: {
          responsavel: { select: { id: true, nome: true, papel: true } },
          negocios: { include: businessIncludes(), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
        },
      },
      acompanhamentos: {
        where: { status: "PENDENTE" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
      historicosQualificacao: {
        include: {
          autor: { select: { id: true, nome: true } },
          negocio: { select: { id: true, titulo: true, etapa: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      },
      mensagens: {
        where: { direcao: "SAIDA", autorUsuarioId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!conversation) throw notFound("Conversa nao encontrada.");
  return conversation;
}

function requireCommercialWrite(context, conversation) {
  requireResponsibleOrManager(context, conversation);
}

function requireCommercialEntities(conversation) {
  const cliente = conversation.contatoCanal?.cliente;
  if (!cliente) throw domainError(409, "COMMERCIAL_CLIENT_REQUIRED", "A conversa precisa estar vinculada a um Cliente.");
  const lead = conversation.lead;
  if (!lead || lead.clienteId !== cliente.id) {
    throw domainError(409, "COMMERCIAL_LEAD_REQUIRED", "A conversa precisa estar vinculada a um Lead valido.");
  }
  return { cliente, lead };
}

function requireReadyQualification(conversation) {
  const { lead } = requireCommercialEntities(conversation);
  if (!QUALIFIABLE_CONVERSATION_STATES.includes(conversation.status)) {
    throw domainError(422, "COMMERCIAL_CONVERSATION_STATE_INVALID", "A conversa precisa estar em atendimento.");
  }
  if (!conversation.mensagens.length) {
    throw domainError(422, "COMMERCIAL_HUMAN_CONTACT_REQUIRED", "Registre um contato humano antes de criar ou vincular um Negocio.");
  }
  const followUp = conversation.acompanhamentos[0];
  if (!lead.interesse || !["QUALIFICADO", "CONVERTIDO"].includes(lead.status) || !followUp) {
    throw domainError(422, "COMMERCIAL_QUALIFICATION_REQUIRED", "Qualifique o atendimento e defina a proxima acao antes de continuar.");
  }
  const qualificationHistory = conversation.historicosQualificacao.find((entry) => entry.acao === "QUALIFICAR");
  return {
    acompanhamentoId: followUp.id,
    interesse: lead.interesse,
    prioridade: followUp.prioridade,
    valorEstimado: qualificationHistory?.valorEstimado ?? null,
    proximaAcao: followUp.titulo,
    dataRetorno: qualificationHistory?.dataRetorno ?? null,
    observacao: qualificationHistory?.observacao ?? followUp.descricao ?? null,
  };
}

async function possibleDuplicates(client, empresaId, clienteId, leadId) {
  return client.negocio.findMany({
    where: {
      empresaId,
      clienteId,
      etapa: { in: ACTIVE_BUSINESS_STAGES },
      OR: [{ leadId: null }, { leadId: { not: leadId } }],
    },
    include: businessIncludes(),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 10,
  });
}

async function createCommercialHistory(tx, context, conversation, data) {
  const { cliente, lead } = requireCommercialEntities(conversation);
  return tx.historicoQualificacaoConversa.create({
    data: {
      empresaId: context.empresaId,
      conversaCanalId: conversation.id,
      clienteId: cliente.id,
      leadId: lead.id,
      negocioId: data.negocioId ?? null,
      autorId: context.usuarioId,
      acao: data.acao,
      interesse: data.interesse ?? null,
      prioridade: data.prioridade ?? null,
      valorEstimado: data.valorEstimado ?? null,
      proximaAcao: data.proximaAcao ?? null,
      dataRetorno: data.dataRetorno ?? null,
      observacao: data.observacao ?? null,
    },
  });
}

async function attachFollowUp(tx, followUpId, negocioId) {
  await tx.acompanhamento.updateMany({ where: { id: followUpId, negocioId: null }, data: { negocioId } });
}

function presentContext(conversation, context) {
  const cliente = conversation.contatoCanal?.cliente ?? null;
  const lead = conversation.lead ?? null;
  const followUp = conversation.acompanhamentos[0] ?? null;
  const negocio = lead?.negocios?.[0] ?? null;
  const latestQualification = conversation.historicosQualificacao.find((entry) => entry.acao === "QUALIFICAR") ?? null;
  const canWrite = isManager(context) || conversation.responsavelId === context.usuarioId;
  const qualified = Boolean(lead && ["QUALIFICADO", "CONVERTIDO"].includes(lead.status) && lead.interesse && followUp);
  return {
    estado: !cliente || !lead ? "SEM_CONTEXTO" : negocio ? "NEGOCIO_VINCULADO" : qualified ? "QUALIFICADO" : "NAO_QUALIFICADO",
    cliente: cliente ? {
      id: cliente.id,
      nome: cliente.nome,
      interesse: cliente.interesse,
      valor: cliente.valor,
      origem: cliente.origem,
    } : null,
    lead: lead ? {
      id: lead.id,
      status: lead.status,
      origem: lead.origem,
      interesse: lead.interesse,
      responsavel: lead.responsavel,
    } : null,
    qualificacao: latestQualification && followUp ? {
      interesse: latestQualification.interesse ?? lead?.interesse ?? null,
      prioridade: latestQualification.prioridade ?? followUp.prioridade,
      valorEstimado: latestQualification.valorEstimado,
      proximaAcao: latestQualification.proximaAcao ?? followUp.titulo,
      dataRetorno: latestQualification.dataRetorno,
      observacao: latestQualification.observacao,
    } : null,
    negocio: negocio ? presentBusinessCandidate(negocio, lead.id) : null,
    historico: conversation.historicosQualificacao.map((entry) => ({
      id: entry.id,
      acao: entry.acao,
      autor: entry.autor,
      negocio: entry.negocio,
      observacao: entry.observacao,
      createdAt: entry.createdAt,
    })),
    permissoes: {
      qualificar: canWrite && Boolean(cliente && lead) && QUALIFIABLE_CONVERSATION_STATES.includes(conversation.status),
      criarOuVincular: canWrite && qualified && conversation.mensagens.length > 0 && !negocio,
    },
  };
}

function presentBusinessCandidate(business, leadId) {
  return {
    id: business.id,
    titulo: business.titulo,
    etapa: business.etapa,
    valor: business.valor,
    cliente: business.cliente ? { id: business.cliente.id, nome: business.cliente.nome } : null,
    responsavel: business.responsavel ? { id: business.responsavel.id, nome: business.responsavel.nome } : null,
    leadId: business.leadId,
    elegivel: business.leadId === null || business.leadId === leadId,
    createdAt: business.createdAt,
  };
}

function businessIncludes() {
  return {
    cliente: { select: { id: true, nome: true } },
    responsavel: { select: { id: true, nome: true } },
  };
}

function parseQualification(input) {
  const body = objectInput(input);
  rejectTenantAuthority(body);
  rejectUnknown(body, ["interesse", "prioridade", "valorEstimado", "proximaAcao", "dataRetorno", "observacao"]);
  return {
    interesse: cleanRequiredText(body.interesse, "interesse", 500),
    prioridade: requiredEnum(body.prioridade, "prioridade", PRIORITIES),
    valorEstimado: optionalNonNegativeInteger(body.valorEstimado, "valorEstimado"),
    proximaAcao: cleanRequiredText(body.proximaAcao, "proximaAcao", 240),
    dataRetorno: optionalDate(body.dataRetorno, "dataRetorno"),
    observacao: cleanOptionalText(body.observacao, "observacao", 500),
  };
}

function parseCreateBusiness(input) {
  const body = objectInput(input);
  rejectTenantAuthority(body);
  rejectUnknown(body, ["titulo", "observacao", "confirmarDuplicidade"]);
  if (body.confirmarDuplicidade !== undefined && typeof body.confirmarDuplicidade !== "boolean") {
    throw commercialInvalid("confirmarDuplicidade deve ser booleano.");
  }
  return {
    titulo: cleanOptionalText(body.titulo, "titulo", 200) ?? undefined,
    observacao: cleanOptionalText(body.observacao, "observacao", 500),
    confirmarDuplicidade: body.confirmarDuplicidade === true,
  };
}

function parseBusinessId(input) {
  const body = objectInput(input);
  rejectTenantAuthority(body);
  rejectUnknown(body, ["negocioId"]);
  const value = Number(body.negocioId);
  if (!Number.isSafeInteger(value) || value < 1) throw commercialInvalid("negocioId invalido.");
  return value;
}

function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw commercialInvalid("Payload invalido.");
  return value;
}

function rejectUnknown(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw commercialInvalid(`Campos nao permitidos: ${unknown.join(", ")}.`);
}

function rejectTenantAuthority(value) {
  if (value && Object.hasOwn(value, "empresaId")) throw commercialInvalid("empresaId nao pode ser informado.");
}

function cleanRequiredText(value, field, max) {
  const text = cleanOptionalText(value, field, max);
  if (!text) throw commercialInvalid(`${field} obrigatorio.`);
  return text;
}

function cleanOptionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw commercialInvalid(`${field} deve ser texto.`);
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (text.length > max) throw commercialInvalid(`${field} excede ${max} caracteres.`);
  return text;
}

function optionalNonNegativeInteger(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) throw commercialInvalid(`${field} deve ser um numero inteiro nao negativo.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw commercialInvalid(`${field} fora do intervalo permitido.`);
  return number;
}

function requiredEnum(value, field, values) {
  if (!values.includes(value)) throw commercialInvalid(`${field} invalida.`);
  return value;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw commercialInvalid(`${field} invalida.`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw commercialInvalid(`${field} invalida.`);
  return date;
}

function followUpType(channelType) {
  if (channelType === "WHATSAPP_META") return "WHATSAPP";
  if (channelType === "EMAIL") return "EMAIL";
  return "LIGACAO";
}

function commercialInvalid(message) {
  return domainError(422, "COMMERCIAL_VALIDATION_ERROR", message);
}

module.exports = {
  ACTIVE_BUSINESS_STAGES,
  createInboxCommercialQualificationService,
};
