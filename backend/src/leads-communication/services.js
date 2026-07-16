const crypto = require("node:crypto");
const { createChannelService } = require("../channels/channelService");
const { normalizePhone } = require("../channels/phoneNormalizer");
const {
  assertItemAccess,
  domainError,
  isManager,
  notFound,
  ownedScope,
  requireManager,
} = require("./policy");
const {
  enumValue,
  invalid,
  optionalBoolean,
  optionalInteger,
  optionalText,
  pagination,
  rejectEmpresaId,
  rejectUnknown,
  requiredInteger,
  requiredText,
} = require("./validation");

const LEAD_STATUSES = ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO", "DESQUALIFICADO", "CONVERTIDO"];
const CONVERSATION_STATUSES = ["ABERTA", "NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"];
const LEAD_TRANSITIONS = {
  NOVO: new Set(["EM_ATENDIMENTO", "QUALIFICADO", "DESQUALIFICADO"]),
  EM_ATENDIMENTO: new Set(["QUALIFICADO", "DESQUALIFICADO"]),
  QUALIFICADO: new Set(["DESQUALIFICADO"]),
  DESQUALIFICADO: new Set(),
  CONVERTIDO: new Set(),
};
const CONVERSATION_TRANSITIONS = {
  ABERTA: new Set(["NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"]),
  NOVA: new Set(["AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "ENCERRADA"]),
  AGUARDANDO_ATENDIMENTO: new Set(["EM_ATENDIMENTO", "ENCERRADA"]),
  EM_ATENDIMENTO: new Set(["AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"]),
  AGUARDANDO_CLIENTE: new Set(["EM_ATENDIMENTO", "PENDENTE", "ENCERRADA"]),
  PENDENTE: new Set(["EM_ATENDIMENTO", "ENCERRADA"]),
  ENCERRADA: new Set(["NOVA", "AGUARDANDO_ATENDIMENTO"]),
};

function createLeadsCommunicationServices({ prisma }) {
  const channelService = createChannelService({ prisma });

  async function validateResponsible(client, empresaId, responsavelId) {
    if (responsavelId === null) return null;
    const user = await client.usuario.findFirst({ where: { id: responsavelId, empresaId, ativo: true } });
    if (!user) throw notFound("Responsavel nao encontrado.");
    return user;
  }

  async function findLead(context, id, client = prisma) {
    const lead = await client.lead.findFirst({ where: { id, empresaId: context.empresaId, ...ownedScope(context) } });
    if (!lead) throw notFound("Lead nao encontrado.");
    return lead;
  }

  async function createLead(context, input) {
    requireManager(context);
    const body = rejectUnknown(input, ["clienteId", "origem", "campanha", "interesse", "responsavelId"]);
    rejectEmpresaId(body);
    const clienteId = requiredInteger(body.clienteId, "clienteId");
    const responsavelId = body.responsavelId === undefined || body.responsavelId === null
      ? null
      : requiredInteger(body.responsavelId, "responsavelId");
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: context.empresaId } });
    if (!cliente) throw notFound("Cliente nao encontrado.");
    if (responsavelId !== null) await validateResponsible(prisma, context.empresaId, responsavelId);
    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          empresaId: context.empresaId,
          clienteId,
          responsavelId,
          status: "NOVO",
          origem: optionalText(body.origem, "origem", 160),
          campanha: optionalText(body.campanha, "campanha", 160),
          interesse: optionalText(body.interesse, "interesse", 500),
        },
      });
      if (responsavelId !== null) {
        await createAssignmentHistory(tx, {
          empresaId: context.empresaId,
          leadId: lead.id,
          responsavelNovoId: responsavelId,
          alteradoPorId: context.usuarioId,
          tipo: "ATRIBUIR",
        });
      }
      return lead;
    });
  }

  async function listLeads(context, query = {}) {
    rejectEmpresaId(query);
    const allowed = ["page", "limit", "status", "responsavelId", "clienteId", "origem", "q"];
    rejectUnknown(query, allowed);
    const pageData = pagination(query);
    const where = { empresaId: context.empresaId, ...ownedScope(context) };
    const status = enumValue(query.status, "status", LEAD_STATUSES, { optional: true });
    if (status) where.status = status;
    if (query.responsavelId !== undefined && query.responsavelId !== "") {
      const responsible = requiredInteger(query.responsavelId, "responsavelId");
      if (!isManager(context) && responsible !== context.usuarioId) return emptyPage(pageData);
      where.responsavelId = responsible;
    }
    const clienteId = optionalInteger(query.clienteId, "clienteId", { min: 1 });
    if (clienteId) where.clienteId = clienteId;
    const origem = optionalText(query.origem, "origem", 160);
    if (origem) where.origem = origem;
    const q = optionalText(query.q, "q", 120);
    if (q) {
      where.OR = [
        { origem: { contains: q } },
        { campanha: { contains: q } },
        { interesse: { contains: q } },
        { cliente: { nome: { contains: q } } },
      ];
    }
    const [data, total] = await prisma.$transaction([
      prisma.lead.findMany({ where, include: leadIncludes(), orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: pageData.skip, take: pageData.limit }),
      prisma.lead.count({ where }),
    ]);
    return pageResult(data, total, pageData);
  }

  async function updateLead(context, id, input) {
    const body = rejectUnknown(input, ["origem", "campanha", "interesse", "motivoDesqualificacao", "status"]);
    rejectEmpresaId(body);
    if (!Object.keys(body).length) throw invalid("Informe ao menos um campo para atualizar.");
    const lead = await findLead(context, id);
    const data = {};
    for (const field of ["origem", "campanha", "interesse", "motivoDesqualificacao"]) {
      if (Object.hasOwn(body, field)) data[field] = optionalText(body[field], field, field === "interesse" ? 500 : 240);
    }
    if (Object.hasOwn(body, "status")) Object.assign(data, leadStatusData(lead, body.status));
    return prisma.lead.update({ where: { id: lead.id }, data });
  }

  async function getLead(context, id) {
    await findLead(context, id);
    return prisma.lead.findUnique({ where: { id }, include: leadIncludes() });
  }

  async function assumeLead(context, id) {
    return assumeEntity(context, { model: "lead", id, contextField: "leadId", notFoundMessage: "Lead nao encontrado." });
  }

  async function assignLead(context, id, input) {
    return assignEntity(context, { model: "lead", id, contextField: "leadId", input, notFoundMessage: "Lead nao encontrado." });
  }

  async function leadHistory(context, id) {
    await findLead(context, id);
    return prisma.historicoAtribuicao.findMany({
      where: { empresaId: context.empresaId, leadId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async function findConversation(context, id, client = prisma) {
    const conversation = await client.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId, ...ownedScope(context) } });
    if (!conversation) throw notFound("Conversa nao encontrada.");
    return conversation;
  }

  async function createOrFindConversation(context, input) {
    requireManager(context);
    const body = rejectUnknown(input, ["canalIntegracaoId", "contatoCanalId", "leadId"]);
    rejectEmpresaId(body);
    const canalIntegracaoId = requiredInteger(body.canalIntegracaoId, "canalIntegracaoId");
    const contatoCanalId = requiredInteger(body.contatoCanalId, "contatoCanalId");
    const leadId = body.leadId === undefined || body.leadId === null ? null : requiredInteger(body.leadId, "leadId");
    const [channel, contact, lead] = await Promise.all([
      prisma.canalIntegracao.findFirst({ where: { id: canalIntegracaoId, empresaId: context.empresaId } }),
      prisma.contatoCanal.findFirst({ where: { id: contatoCanalId, empresaId: context.empresaId, canalIntegracaoId } }),
      leadId ? prisma.lead.findFirst({ where: { id: leadId, empresaId: context.empresaId } }) : Promise.resolve(null),
    ]);
    if (!channel) throw notFound("Canal nao encontrado.");
    if (!contact) throw notFound("Contato do canal nao encontrado.");
    if (leadId && !lead) throw notFound("Lead nao encontrado.");
    if (lead && contact.clienteId && lead.clienteId !== contact.clienteId) {
      throw domainError(409, "LEAD_CONTACT_MISMATCH", "Lead e contato pertencem a clientes diferentes.");
    }
    const conversation = await channelService.createOrFindOpenConversation({ empresaId: context.empresaId, canalIntegracaoId, contatoCanalId });
    if (leadId && conversation.leadId && conversation.leadId !== leadId) {
      throw domainError(409, "CONVERSATION_LEAD_CONFLICT", "Conversa ja vinculada a outro Lead.");
    }
    const data = {};
    if (leadId && conversation.leadId !== leadId) data.leadId = leadId;
    if (conversation.status === "ABERTA") {
      data.status = "NOVA";
      data.aguardandoDesde = new Date();
    }
    return Object.keys(data).length
      ? prisma.conversaCanal.update({ where: { id: conversation.id }, data })
      : conversation;
  }

  async function listConversations(context, query = {}) {
    rejectEmpresaId(query);
    rejectUnknown(query, ["page", "limit", "estado", "responsavelId", "semResponsavel", "leadId", "canalIntegracaoId"]);
    const pageData = pagination(query);
    const where = { empresaId: context.empresaId, ...ownedScope(context) };
    const status = enumValue(query.estado, "estado", CONVERSATION_STATUSES, { optional: true });
    if (status) where.status = status;
    const semResponsavel = optionalBoolean(query.semResponsavel, "semResponsavel");
    if (semResponsavel !== undefined) {
      if (!isManager(context) && semResponsavel) return emptyPage(pageData);
      where.responsavelId = semResponsavel ? null : { not: null };
      if (semResponsavel && !status) where.status = { in: ["NOVA", "AGUARDANDO_ATENDIMENTO"] };
    }
    if (query.responsavelId !== undefined && query.responsavelId !== "") {
      const responsible = requiredInteger(query.responsavelId, "responsavelId");
      if (!isManager(context) && responsible !== context.usuarioId) return emptyPage(pageData);
      where.responsavelId = responsible;
    }
    for (const field of ["leadId", "canalIntegracaoId"]) {
      const value = optionalInteger(query[field], field, { min: 1 });
      if (value) where[field] = value;
    }
    const [data, total] = await prisma.$transaction([
      prisma.conversaCanal.findMany({ where, include: conversationIncludes(), orderBy: [{ ultimaMensagemEm: "desc" }, { id: "desc" }], skip: pageData.skip, take: pageData.limit }),
      prisma.conversaCanal.count({ where }),
    ]);
    return pageResult(data, total, pageData);
  }

  async function getConversation(context, id) {
    await findConversation(context, id);
    return prisma.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() });
  }

  async function assumeConversation(context, id) {
    return assumeEntity(context, { model: "conversaCanal", id, contextField: "conversaCanalId", notFoundMessage: "Conversa nao encontrada." });
  }

  async function assignConversation(context, id, input) {
    return assignEntity(context, { model: "conversaCanal", id, contextField: "conversaCanalId", input, notFoundMessage: "Conversa nao encontrada." });
  }

  async function updateConversationStatus(context, id, input) {
    const body = rejectUnknown(input, ["estado"]);
    const next = enumValue(body.estado, "estado", CONVERSATION_STATUSES);
    const conversation = await findConversation(context, id);
    if (next === conversation.status) return conversation;
    if (!CONVERSATION_TRANSITIONS[conversation.status]?.has(next)) {
      throw domainError(409, "CONVERSATION_TRANSITION_INVALID", "Transicao de conversa invalida.");
    }
    const now = new Date();
    const data = { status: next };
    if (["NOVA", "AGUARDANDO_ATENDIMENTO"].includes(next)) data.aguardandoDesde = now;
    if (next === "ENCERRADA") {
      data.encerradaEm = now;
      data.chaveAberta = null;
    }
    if (conversation.status === "ENCERRADA") {
      data.reabertaEm = now;
      data.encerradaEm = null;
      data.chaveAberta = `canal:${conversation.canalIntegracaoId}:contato:${conversation.contatoCanalId}`;
    }
    return prisma.conversaCanal.update({ where: { id }, data });
  }

  async function conversationHistory(context, id) {
    await findConversation(context, id);
    return prisma.historicoAtribuicao.findMany({
      where: { empresaId: context.empresaId, conversaCanalId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async function createNote(context, conversationId, input) {
    const body = rejectUnknown(input, ["conteudo"]);
    const conteudo = requiredText(body.conteudo, "conteudo", 4000);
    await findConversation(context, conversationId);
    return prisma.notaInternaConversa.create({
      data: { empresaId: context.empresaId, conversaCanalId: conversationId, autorId: context.usuarioId, conteudo },
    });
  }

  async function listNotes(context, conversationId) {
    await findConversation(context, conversationId);
    return prisma.notaInternaConversa.findMany({
      where: { empresaId: context.empresaId, conversaCanalId: conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async function listMessages(context, conversationId, query = {}) {
    await findConversation(context, conversationId);
    const pageData = pagination(query);
    rejectUnknown(query, ["page", "limit"]);
    const where = { empresaId: context.empresaId, conversaCanalId: conversationId };
    const [data, total] = await prisma.$transaction([
      prisma.mensagemCanal.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: pageData.skip, take: pageData.limit }),
      prisma.mensagemCanal.count({ where }),
    ]);
    return pageResult(data, total, pageData);
  }

  async function createSimulatedMessage(context, conversationId, input) {
    const body = rejectUnknown(input, ["externalId", "direcao", "texto"]);
    const conversation = await findConversation(context, conversationId);
    if (conversation.status === "ENCERRADA") {
      throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao aceita novas mensagens nesta release.");
    }
    const externalId = requiredText(body.externalId, "externalId", 160);
    const direcao = enumValue(body.direcao, "direcao", ["ENTRADA", "SAIDA"]);
    const texto = requiredText(body.texto, "texto", 4000);
    const message = await channelService.registerSimulatedMessage({
      empresaId: context.empresaId,
      canalIntegracaoId: conversation.canalIntegracaoId,
      conversaCanalId: conversation.id,
      externalId,
      direcao,
      tipo: "TEXTO",
      texto,
    });
    return message;
  }

  async function registerWebhookEvent(context, input) {
    const body = rejectUnknown(input, ["canalIntegracaoId", "provedor", "externalEventId", "tipoEvento", "payload", "payloadHash"]);
    rejectEmpresaId(body);
    const canalIntegracaoId = requiredInteger(body.canalIntegracaoId, "canalIntegracaoId");
    const channel = await prisma.canalIntegracao.findFirst({ where: { id: canalIntegracaoId, empresaId: context.empresaId } });
    if (!channel) throw notFound("Canal nao encontrado.");
    const data = {
      empresaId: context.empresaId,
      canalIntegracaoId,
      provedor: requiredText(body.provedor, "provedor", 80),
      externalEventId: requiredText(body.externalEventId, "externalEventId", 180),
      tipoEvento: optionalText(body.tipoEvento, "tipoEvento", 120),
      payloadHash: body.payloadHash
        ? requiredText(body.payloadHash, "payloadHash", 128)
        : body.payload === undefined ? null : crypto.createHash("sha256").update(JSON.stringify(body.payload)).digest("hex"),
    };
    try {
      const evento = await prisma.eventoWebhook.create({ data });
      return { evento, duplicado: false, statusDuplicata: null };
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const evento = await prisma.eventoWebhook.findUnique({
        where: {
          empresaId_canalIntegracaoId_provedor_externalEventId: {
            empresaId: data.empresaId,
            canalIntegracaoId: data.canalIntegracaoId,
            provedor: data.provedor,
            externalEventId: data.externalEventId,
          },
        },
      });
      return { evento, duplicado: true, statusDuplicata: "IGNORADO_DUPLICADO" };
    }
  }

  async function updateWebhookEvent(context, id, status, errorData = {}) {
    const next = enumValue(status, "status", ["PROCESSANDO", "PROCESSADO", "FALHOU"]);
    const event = await prisma.eventoWebhook.findFirst({ where: { id, empresaId: context.empresaId } });
    if (!event) throw notFound("Evento nao encontrado.");
    const allowed = next === "PROCESSANDO"
      ? ["RECEBIDO", "FALHOU"]
      : ["PROCESSANDO"];
    if (!allowed.includes(event.statusProcessamento)) {
      throw domainError(409, "WEBHOOK_TRANSITION_INVALID", "Transicao de evento invalida.");
    }
    const data = { statusProcessamento: next };
    if (next === "PROCESSANDO") data.tentativas = { increment: 1 };
    if (next === "PROCESSADO") {
      data.processadoEm = new Date();
      data.erroCodigo = null;
      data.erroResumo = null;
    }
    if (next === "FALHOU") {
      data.erroCodigo = optionalText(errorData.erroCodigo, "erroCodigo", 80);
      data.erroResumo = optionalText(errorData.erroResumo, "erroResumo", 240);
    }
    return prisma.eventoWebhook.update({ where: { id }, data });
  }

  async function findContactMatches(context, input) {
    const body = rejectUnknown(input, ["telefone", "email", "canalIntegracaoId", "externalId"]);
    const phone = body.telefone ? normalizePhone(body.telefone, { defaultCountryCode: "55" }) : null;
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const canalIntegracaoId = optionalInteger(body.canalIntegracaoId, "canalIntegracaoId", { min: 1 });
    const externalId = optionalText(body.externalId, "externalId", 180);
    if (!phone && !email && !(canalIntegracaoId && externalId)) return { tipo: "NENHUM", candidatos: [] };
    const candidates = new Map();
    if (phone || email) {
      const clients = await prisma.cliente.findMany({ where: { empresaId: context.empresaId }, orderBy: { id: "asc" } });
      for (const client of clients) {
        if ((phone && client.telefone === phone) || (email && String(client.email || "").trim().toLowerCase() === email)) {
          candidates.set(client.id, client);
        }
      }
    }
    if (canalIntegracaoId && externalId) {
      const contact = await prisma.contatoCanal.findFirst({
        where: { empresaId: context.empresaId, canalIntegracaoId, externalId },
        include: { cliente: true },
      });
      if (contact?.cliente) candidates.set(contact.cliente.id, contact.cliente);
    }
    const values = [...candidates.values()];
    return { tipo: values.length === 0 ? "NENHUM" : values.length === 1 ? "CORRESPONDENCIA" : "AMBIGUO", candidatos: values };
  }

  async function assumeEntity(context, { model, id, contextField, notFoundMessage }) {
    requireManager(context);
    return prisma.$transaction(async (tx) => {
      const current = await tx[model].findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound(notFoundMessage);
      if (current.responsavelId !== null) throw domainError(409, "ASSIGNMENT_ALREADY_TAKEN", "Item ja possui responsavel.");
      const result = await tx[model].updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: null },
        data: { responsavelId: context.usuarioId },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "Item foi assumido por outro usuario.");
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        [contextField]: id,
        responsavelNovoId: context.usuarioId,
        alteradoPorId: context.usuarioId,
        tipo: "ASSUMIR",
      });
      return tx[model].findUnique({ where: { id } });
    });
  }

  async function assignEntity(context, { model, id, contextField, input, notFoundMessage }) {
    requireManager(context);
    const body = rejectUnknown(input, ["responsavelId", "motivo"]);
    rejectEmpresaId(body);
    const responsibleId = body.responsavelId === null ? null : requiredInteger(body.responsavelId, "responsavelId");
    const motivo = optionalText(body.motivo, "motivo", 240);
    return prisma.$transaction(async (tx) => {
      const current = await tx[model].findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound(notFoundMessage);
      if (responsibleId !== null) await validateResponsible(tx, context.empresaId, responsibleId);
      if (current.responsavelId === responsibleId) return current;
      const result = await tx[model].updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: current.responsavelId },
        data: { responsavelId: responsibleId },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "Atribuicao foi alterada por outro usuario.");
      const tipo = responsibleId === null ? "DESATRIBUIR" : current.responsavelId === null ? "ATRIBUIR" : "TRANSFERIR";
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        [contextField]: id,
        responsavelAnteriorId: current.responsavelId,
        responsavelNovoId: responsibleId,
        alteradoPorId: context.usuarioId,
        tipo,
        motivo,
      });
      return tx[model].findUnique({ where: { id } });
    });
  }

  return {
    assignConversation,
    assignLead,
    assumeConversation,
    assumeLead,
    conversationHistory,
    createLead,
    createNote,
    createOrFindConversation,
    createSimulatedMessage,
    findContactMatches,
    getConversation,
    getLead,
    leadHistory,
    listConversations,
    listLeads,
    listMessages,
    listNotes,
    registerWebhookEvent,
    updateConversationStatus,
    updateLead,
    updateWebhookEvent,
    validateAssignmentContext: validateAssignmentContext,
  };
}

function leadStatusData(lead, nextStatus) {
  const next = enumValue(nextStatus, "status", LEAD_STATUSES);
  if (next === "CONVERTIDO") throw domainError(409, "LEAD_CONVERSION_UNAVAILABLE", "Conversao para Negocio ainda nao esta disponivel.");
  if (next === lead.status) return {};
  if (!LEAD_TRANSITIONS[lead.status]?.has(next)) throw domainError(409, "LEAD_TRANSITION_INVALID", "Transicao de Lead invalida.");
  const data = { status: next };
  if (next === "QUALIFICADO") data.qualificadoEm = new Date();
  if (next === "DESQUALIFICADO") data.desqualificadoEm = new Date();
  return data;
}

async function createAssignmentHistory(tx, data) {
  validateAssignmentContext(data);
  return tx.historicoAtribuicao.create({ data: { origem: "MANUAL", ...data } });
}

function validateAssignmentContext(data) {
  const contexts = [data.leadId, data.conversaCanalId, data.negocioId].filter((value) => value !== undefined && value !== null);
  if (contexts.length !== 1) throw invalid("Historico de atribuicao exige exatamente um contexto.");
}

function leadIncludes() {
  return {
    cliente: { select: { id: true, nome: true } },
    responsavel: { select: { id: true, nome: true, papel: true } },
  };
}

function conversationIncludes() {
  return {
    canalIntegracao: { select: { id: true, nome: true, tipo: true } },
    contatoCanal: { select: { id: true, nome: true, clienteId: true } },
    lead: { select: { id: true, clienteId: true, status: true } },
    responsavel: { select: { id: true, nome: true, papel: true } },
  };
}

function pageResult(data, total, { page, limit }) {
  return { data, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } };
}

function emptyPage(pageData) {
  return pageResult([], 0, pageData);
}

module.exports = { createLeadsCommunicationServices, validateAssignmentContext };
