const crypto = require("node:crypto");
const { createChannelService } = require("../channels/channelService");
const { normalizePhone } = require("../channels/phoneNormalizer");
const { calculateConversationSla, slaFilterWhere } = require("./inboxOperations");
const { createInboxCommercialQualificationService } = require("./commercialQualification");
const {
  domainError,
  isManager,
  notFound,
  requireResponsibleOrManager,
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
const SLA_FILTERS = ["ATENCAO", "CRITICO"];
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
  ENCERRADA: new Set(["NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO"]),
};
const DEFAULT_REPLY_LEASE_SECONDS = 120;
const MIN_REPLY_LEASE_SECONDS = 30;
const MAX_REPLY_LEASE_SECONDS = 300;

function createLeadsCommunicationServices({ prisma }) {
  const channelService = createChannelService({ prisma });
  const replyLeaseSeconds = getReplyLeaseSeconds(process.env);

  async function validateResponsible(client, empresaId, responsavelId) {
    if (responsavelId === null) return null;
    const user = await client.usuario.findFirst({ where: { id: responsavelId, empresaId, ativo: true } });
    if (!user) throw notFound("Responsavel nao encontrado.");
    return user;
  }

  async function findLead(context, id, client = prisma) {
    const lead = await client.lead.findFirst({ where: { id, empresaId: context.empresaId } });
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
    const allowed = ["page", "limit", "status", "responsavelId", "clienteId", "origem", "q", "meus", "semResponsavel"];
    rejectUnknown(query, allowed);
    const pageData = pagination(query);
    const where = { empresaId: context.empresaId };
    const status = enumValue(query.status, "status", LEAD_STATUSES, { optional: true });
    if (status) where.status = status;
    const meus = optionalBoolean(query.meus, "meus");
    const semResponsavel = optionalBoolean(query.semResponsavel, "semResponsavel");
    if (meus && semResponsavel) return emptyPage(pageData);
    if (meus) where.responsavelId = context.usuarioId;
    if (semResponsavel) where.responsavelId = null;
    if (query.responsavelId !== undefined && query.responsavelId !== "") {
      const responsible = requiredInteger(query.responsavelId, "responsavelId");
      if ((meus && responsible !== context.usuarioId) || semResponsavel) return emptyPage(pageData);
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
    requireResponsibleOrManager(context, lead);
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

  async function returnLeadToQueue(context, id, input) {
    return returnEntityToQueue(context, { model: "lead", id, contextField: "leadId", input, notFoundMessage: "Lead nao encontrado." });
  }

  async function leadHistory(context, id) {
    await findLead(context, id);
    return prisma.historicoAtribuicao.findMany({
      where: { empresaId: context.empresaId, leadId: id },
      include: assignmentHistoryIncludes(),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async function convertLeadToBusiness(context, id, input, internal = {}) {
    const body = rejectUnknown(input, ["titulo", "valor", "observacao"]);
    rejectEmpresaId(body);
    const requestedTitle = optionalText(body.titulo, "titulo", 200);
    const valor = optionalInteger(body.valor, "valor", { min: 0 });
    const observacao = optionalText(body.observacao, "observacao", 1000);

    const initialLead = await prisma.lead.findFirst({
      where: { id, empresaId: context.empresaId },
      include: conversionLeadIncludes(),
    });
    if (!initialLead) throw notFound("Lead nao encontrado.");
    requireResponsibleOrManager(context, initialLead);
    if (initialLead.negocios[0]) return conversionResult(initialLead, initialLead.negocios[0], false);
    validateLeadForConversion(initialLead);

    try {
      return await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id, empresaId: context.empresaId },
          include: conversionLeadIncludes(),
        });
        if (!lead) throw notFound("Lead nao encontrado.");
        requireResponsibleOrManager(context, lead);
        if (lead.negocios[0]) return conversionResult(lead, lead.negocios[0], false);
        validateLeadForConversion(lead);
        await validateResponsible(tx, context.empresaId, lead.responsavelId);

        const now = new Date();
        const negocio = await tx.negocio.create({
          data: {
            empresaId: context.empresaId,
            clienteId: lead.clienteId,
            leadId: lead.id,
            responsavelId: lead.responsavelId,
            convertidoPorId: context.usuarioId,
            statusLeadAnterior: lead.status,
            titulo: requestedTitle || defaultBusinessTitle(lead),
            ...(valor === undefined ? {} : { valor }),
            ...(observacao === undefined ? {} : { observacao }),
            etapa: "NOVO",
          },
          include: businessIncludes(),
        });
        const updated = await tx.lead.updateMany({
          where: { id: lead.id, empresaId: context.empresaId, status: { not: "CONVERTIDO" } },
          data: { status: "CONVERTIDO", convertidoEm: now },
        });
        if (updated.count !== 1) {
          throw domainError(409, "LEAD_CONVERSION_CONFLICT", "Lead foi alterado por outra operacao.");
        }
        const convertedLead = await tx.lead.findUnique({ where: { id: lead.id }, include: leadIncludes() });
        if (typeof internal.afterConvert === "function") {
          await internal.afterConvert(tx, { lead: convertedLead, negocio });
        }
        return conversionResult(convertedLead, negocio, true);
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const convertedLead = await prisma.lead.findFirst({
        where: { id, empresaId: context.empresaId },
        include: conversionLeadIncludes(),
      });
      if (!convertedLead?.negocios[0]) throw error;
      requireResponsibleOrManager(context, convertedLead);
      return conversionResult(convertedLead, convertedLead.negocios[0], false);
    }
  }

  async function findConversation(context, id, client = prisma) {
    const conversation = await client.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId } });
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
    rejectUnknown(query, ["page", "limit", "estado", "responsavelId", "semResponsavel", "meus", "leadId", "canalIntegracaoId", "q", "sla"]);
    const pageData = pagination(query);
    const where = { empresaId: context.empresaId };
    const status = enumValue(query.estado, "estado", CONVERSATION_STATUSES, { optional: true });
    if (status) where.status = status;
    const slaFilter = enumValue(query.sla, "sla", SLA_FILTERS, { optional: true });
    const slaWhere = slaFilterWhere(slaFilter);
    if (slaWhere) Object.assign(where, slaWhere);
    const semResponsavel = optionalBoolean(query.semResponsavel, "semResponsavel");
    const meus = optionalBoolean(query.meus, "meus");
    if (meus && semResponsavel) return emptyPage(pageData);
    if (meus) where.responsavelId = context.usuarioId;
    if (semResponsavel !== undefined) {
      where.responsavelId = semResponsavel ? null : { not: null };
      if (semResponsavel && !status) where.status = { in: ["NOVA", "AGUARDANDO_ATENDIMENTO"] };
    }
    if (query.responsavelId !== undefined && query.responsavelId !== "") {
      const responsible = requiredInteger(query.responsavelId, "responsavelId");
      if ((meus && responsible !== context.usuarioId) || semResponsavel) return emptyPage(pageData);
      where.responsavelId = responsible;
    }
    const q = optionalText(query.q, "q", 120);
    if (q) {
      where.OR = [
        { contatoCanal: { nome: { contains: q } } },
        { contatoCanal: { externalId: { contains: q } } },
        { lead: { interesse: { contains: q } } },
      ];
    }
    for (const field of ["leadId", "canalIntegracaoId"]) {
      const value = optionalInteger(query[field], field, { min: 1 });
      if (value) where[field] = value;
    }
    const [data, total] = await prisma.$transaction([
      prisma.conversaCanal.findMany({ where, include: conversationIncludes(), orderBy: [{ ultimaMensagemEm: "desc" }, { id: "desc" }], skip: pageData.skip, take: pageData.limit }),
      prisma.conversaCanal.count({ where }),
    ]);
    return pageResult(data.map(presentConversation), total, pageData);
  }

  async function getConversation(context, id) {
    await findConversation(context, id);
    const conversation = await prisma.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() });
    return presentConversation(conversation);
  }

  async function assumeConversation(context, id) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound("Conversa nao encontrada.");
      if (current.status === "ENCERRADA") throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser assumida.");
      if (current.responsavelId !== null) throw domainError(409, "ASSIGNMENT_ALREADY_TAKEN", "Esta conversa acabou de ser assumida por outro atendente.");
      const result = await tx.conversaCanal.updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: null, status: current.status },
        data: { responsavelId: context.usuarioId, status: "EM_ATENDIMENTO" },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "Esta conversa acabou de ser assumida por outro atendente.");
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        conversaCanalId: id,
        responsavelNovoId: context.usuarioId,
        alteradoPorId: context.usuarioId,
        tipo: "ASSUMIR",
        acaoAtendimento: "ASSUMIR",
        estadoAnterior: current.status,
        estadoNovo: "EM_ATENDIMENTO",
      });
      return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
    });
  }

  async function listConversationTeam(context) {
    return prisma.usuario.findMany({
      where: { empresaId: context.empresaId, ativo: true },
      select: { id: true, nome: true, papel: true, ativo: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    });
  }

  async function assignConversation(context, id, input) {
    const body = rejectUnknown(input, ["responsavelId", "motivo"]);
    rejectEmpresaId(body);
    const responsibleId = requiredInteger(body.responsavelId, "responsavelId");
    const motivo = optionalText(body.motivo, "motivo", 240);
    return prisma.$transaction(async (tx) => {
      const current = await tx.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound("Conversa nao encontrada.");
      if (current.status === "ENCERRADA") throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser transferida.");
      if (!isManager(context) && current.responsavelId !== context.usuarioId) {
        throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
      }
      await validateResponsible(tx, context.empresaId, responsibleId);
      if (current.responsavelId === responsibleId && current.status === "EM_ATENDIMENTO") {
        return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
      }
      const result = await tx.conversaCanal.updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: current.responsavelId, status: current.status },
        data: { responsavelId: responsibleId, status: "EM_ATENDIMENTO" },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "A conversa foi alterada por outro atendente.");
      const tipo = current.responsavelId === null ? "ATRIBUIR" : "TRANSFERIR";
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        conversaCanalId: id,
        responsavelAnteriorId: current.responsavelId,
        responsavelNovoId: responsibleId,
        alteradoPorId: context.usuarioId,
        tipo,
        acaoAtendimento: tipo,
        estadoAnterior: current.status,
        estadoNovo: "EM_ATENDIMENTO",
        motivo,
      });
      return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
    });
  }

  async function returnConversationToQueue(context, id, input) {
    const body = rejectUnknown(input, ["motivo"]);
    rejectEmpresaId(body);
    const motivo = optionalText(body.motivo, "motivo", 240);
    return prisma.$transaction(async (tx) => {
      const current = await tx.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound("Conversa nao encontrada.");
      if (current.responsavelId === null) throw domainError(409, "ASSIGNMENT_ALREADY_IN_QUEUE", "Conversa ja esta na fila compartilhada.");
      if (!isManager(context) && current.responsavelId !== context.usuarioId) {
        throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
      }
      if (current.status === "ENCERRADA") throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser devolvida a fila.");
      const now = new Date();
      const result = await tx.conversaCanal.updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: current.responsavelId, status: current.status },
        data: { responsavelId: null, status: "AGUARDANDO_ATENDIMENTO", aguardandoDesde: current.aguardandoDesde || now },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "A conversa foi alterada por outro atendente.");
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        conversaCanalId: id,
        responsavelAnteriorId: current.responsavelId,
        responsavelNovoId: null,
        alteradoPorId: context.usuarioId,
        tipo: "DESATRIBUIR",
        acaoAtendimento: "DEVOLVER_FILA",
        estadoAnterior: current.status,
        estadoNovo: "AGUARDANDO_ATENDIMENTO",
        motivo,
      });
      return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
    });
  }

  async function updateConversationStatus(context, id, input) {
    const body = rejectUnknown(input, ["estado", "motivo"]);
    const next = enumValue(body.estado, "estado", CONVERSATION_STATUSES);
    const motivo = optionalText(body.motivo, "motivo", 240);
    return transitionConversation(context, id, next, motivo);
  }

  async function waitForCustomer(context, id, input = {}) {
    const body = rejectUnknown(input, ["motivo"]);
    return transitionConversation(context, id, "AGUARDANDO_CLIENTE", optionalText(body.motivo, "motivo", 240), "AGUARDAR_CLIENTE");
  }

  async function markConversationPending(context, id, input = {}) {
    const body = rejectUnknown(input, ["motivo"]);
    return transitionConversation(context, id, "PENDENTE", optionalText(body.motivo, "motivo", 240), "MARCAR_PENDENTE");
  }

  async function closeConversation(context, id, input = {}) {
    const body = rejectUnknown(input, ["motivo"]);
    return transitionConversation(context, id, "ENCERRADA", optionalText(body.motivo, "motivo", 240), "ENCERRAR");
  }

  async function reopenConversation(context, id, input = {}) {
    const body = rejectUnknown(input, ["motivo"]);
    const conversation = await findConversation(context, id);
    const next = conversation.responsavelId ? "EM_ATENDIMENTO" : "AGUARDANDO_ATENDIMENTO";
    return transitionConversation(context, id, next, optionalText(body.motivo, "motivo", 240), "REABRIR");
  }

  async function transitionConversation(context, id, next, motivo, actionOverride) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.conversaCanal.findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound("Conversa nao encontrada.");
      requireResponsibleOrManager(context, current);
      if (next === current.status) {
        return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
      }
      if (!CONVERSATION_TRANSITIONS[current.status]?.has(next)) {
        throw domainError(422, "CONVERSATION_TRANSITION_INVALID", "Esta mudanca de estado nao e permitida agora.");
      }
      const now = new Date();
      const data = { status: next };
      if (["NOVA", "AGUARDANDO_ATENDIMENTO"].includes(next)) data.aguardandoDesde = current.aguardandoDesde || now;
      if (next === "AGUARDANDO_CLIENTE") data.aguardandoDesde = null;
      if (next === "ENCERRADA") {
        data.encerradaEm = now;
        data.aguardandoDesde = null;
        data.chaveAberta = null;
        data.respostaReservadaPorId = null;
        data.respostaReservadaAte = null;
      }
      if (current.status === "ENCERRADA") {
        data.reabertaEm = now;
        data.encerradaEm = null;
        data.aguardandoDesde = now;
        data.chaveAberta = `canal:${current.canalIntegracaoId}:contato:${current.contatoCanalId}`;
      }
      const updated = await tx.conversaCanal.updateMany({
        where: { id, empresaId: context.empresaId, status: current.status, responsavelId: current.responsavelId },
        data,
      });
      if (updated.count !== 1) throw domainError(409, "CONVERSATION_CONFLICT", "A conversa foi alterada por outro atendente.");
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        conversaCanalId: id,
        responsavelAnteriorId: current.responsavelId,
        responsavelNovoId: current.responsavelId,
        alteradoPorId: context.usuarioId,
        tipo: "ATRIBUIR",
        acaoAtendimento: actionOverride || actionForState(next),
        estadoAnterior: current.status,
        estadoNovo: next,
        motivo,
      });
      return presentConversation(await tx.conversaCanal.findUnique({ where: { id }, include: conversationIncludes() }));
    });
  }

  async function conversationHistory(context, id) {
    await findConversation(context, id);
    return prisma.historicoAtribuicao.findMany({
      where: { empresaId: context.empresaId, conversaCanalId: id },
      include: assignmentHistoryIncludes(),
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
    const notes = await prisma.notaInternaConversa.findMany({
      where: { empresaId: context.empresaId, conversaCanalId: conversationId },
      include: { autor: { select: { id: true, nome: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return notes.map((note) => note.sistema ? { ...note, autor: { id: 0, nome: "Sistema" }, autorSistema: true } : note);
  }

  async function listMessages(context, conversationId, query = {}) {
    await findConversation(context, conversationId);
    const pageData = pagination(query);
    rejectUnknown(query, ["page", "limit"]);
    const where = { empresaId: context.empresaId, conversaCanalId: conversationId };
    const [data, total] = await prisma.$transaction([
      prisma.mensagemCanal.findMany({ where, include: messageIncludes(), orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: pageData.skip, take: pageData.limit }),
      prisma.mensagemCanal.count({ where }),
    ]);
    return pageResult(data.map(presentMessage), total, pageData);
  }

  async function markConversationRead(context, conversationId) {
    await findConversation(context, conversationId);
    const result = await prisma.mensagemCanal.updateMany({
      where: {
        empresaId: context.empresaId,
        conversaCanalId: conversationId,
        direcao: "ENTRADA",
        lidaEm: null,
      },
      data: { lidaEm: new Date() },
    });
    return { marcadasComoLidas: result.count };
  }

  async function createSimulatedMessage(context, conversationId, input) {
    const body = rejectUnknown(input, ["externalId", "direcao", "texto"]);
    const externalId = requiredText(body.externalId, "externalId", 160);
    const direcao = enumValue(body.direcao, "direcao", ["ENTRADA", "SAIDA"]);
    const texto = requiredText(body.texto, "texto", 4000);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversaCanal.findFirst({
          where: { id: conversationId, empresaId: context.empresaId },
          include: { respostaReservadaPor: { select: { id: true, nome: true } }, canalIntegracao: { select: { tipo: true } } },
        });
        if (!conversation) throw notFound("Conversa nao encontrada.");
        if (conversation.status === "ENCERRADA") {
          throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao aceita novas mensagens nesta release.");
        }
        if (direcao === "SAIDA" && conversation.canalIntegracao.tipo === "SITE_FORM") {
          throw domainError(409, "CHANNEL_DIRECT_REPLY_UNAVAILABLE", "Formulario do Site nao possui resposta direta.");
        }
        if (direcao === "SAIDA") assertReplyLeaseAvailable(conversation, context);
        const existing = await tx.mensagemCanal.findUnique({
          where: { canalIntegracaoId_externalId: { canalIntegracaoId: conversation.canalIntegracaoId, externalId } },
          include: messageIncludes(),
        });
        if (existing) {
          if (existing.conversaCanalId !== conversation.id) {
            throw domainError(409, "MESSAGE_IDEMPOTENCY_CONFLICT", "Identificador de mensagem ja utilizado.");
          }
          return existing;
        }
        const now = new Date();
        const message = await tx.mensagemCanal.create({
          data: {
            empresaId: context.empresaId,
            canalIntegracaoId: conversation.canalIntegracaoId,
            conversaCanalId: conversation.id,
            autorUsuarioId: direcao === "SAIDA" ? context.usuarioId : null,
            externalId,
            direcao,
            tipo: "TEXTO",
            texto,
            status: direcao === "ENTRADA" ? "RECEBIDA" : "PREPARADA",
            statusEntrega: direcao === "ENTRADA" ? "RECEBIDA" : "PENDENTE_ENVIO",
            simulada: true,
          },
          include: messageIncludes(),
        });
        const conversationData = {
          primeiraMensagemEm: conversation.primeiraMensagemEm || now,
          ultimaMensagemEm: now,
        };
        if (direcao === "SAIDA") {
          conversationData.primeiraRespostaHumanaEm = conversation.primeiraRespostaHumanaEm || now;
          if (CONVERSATION_TRANSITIONS[conversation.status]?.has("AGUARDANDO_CLIENTE")) {
            conversationData.status = "AGUARDANDO_CLIENTE";
          }
          if (conversation.respostaReservadaPorId === context.usuarioId || isLeaseExpired(conversation, now)) {
            conversationData.respostaReservadaPorId = null;
            conversationData.respostaReservadaAte = null;
          }
        } else {
          conversationData.aguardandoDesde = now;
          conversationData.status = conversation.responsavelId === null ? "AGUARDANDO_ATENDIMENTO" : "EM_ATENDIMENTO";
        }
        await tx.conversaCanal.update({ where: { id: conversation.id }, data: conversationData });
        return message;
      });
      return presentMessage(result);
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const conversation = await findConversation(context, conversationId);
      const existing = await prisma.mensagemCanal.findUnique({
        where: { canalIntegracaoId_externalId: { canalIntegracaoId: conversation.canalIntegracaoId, externalId } },
        include: messageIncludes(),
      });
      if (!existing || existing.conversaCanalId !== conversation.id) throw error;
      return presentMessage(existing);
    }
  }

  async function acquireReplyLease(context, conversationId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + replyLeaseSeconds * 1000);
    return prisma.$transaction(async (tx) => {
      const conversation = await conversationForLease(tx, context, conversationId);
      if (conversation.status === "ENCERRADA") throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser reservada.");
      if (hasValidLeaseFromOther(conversation, context, now)) throw replyLeaseConflict(conversation);
      const updated = await tx.conversaCanal.updateMany({
        where: {
          id: conversationId,
          empresaId: context.empresaId,
          OR: [
            { respostaReservadaPorId: null },
            { respostaReservadaAte: { lte: now } },
            { respostaReservadaPorId: context.usuarioId },
          ],
        },
        data: { respostaReservadaPorId: context.usuarioId, respostaReservadaAte: expiresAt },
      });
      if (updated.count !== 1) throw replyLeaseConflict(await conversationForLease(tx, context, conversationId));
      return { reservaResposta: replyLeaseView(await conversationForLease(tx, context, conversationId)) };
    });
  }

  async function renewReplyLease(context, conversationId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + replyLeaseSeconds * 1000);
    return prisma.$transaction(async (tx) => {
      await conversationForLease(tx, context, conversationId);
      const updated = await tx.conversaCanal.updateMany({
        where: {
          id: conversationId,
          empresaId: context.empresaId,
          respostaReservadaPorId: context.usuarioId,
          respostaReservadaAte: { gt: now },
        },
        data: { respostaReservadaAte: expiresAt },
      });
      if (updated.count !== 1) throw domainError(409, "REPLY_LEASE_NOT_OWNED", "Reserva de resposta indisponivel para renovacao.");
      return { reservaResposta: replyLeaseView(await conversationForLease(tx, context, conversationId)) };
    });
  }

  async function releaseReplyLease(context, conversationId) {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const conversation = await conversationForLease(tx, context, conversationId);
      if (hasValidLeaseFromOther(conversation, context, now)) throw replyLeaseConflict(conversation);
      await tx.conversaCanal.updateMany({
        where: {
          id: conversationId,
          empresaId: context.empresaId,
          OR: [{ respostaReservadaPorId: context.usuarioId }, { respostaReservadaAte: { lte: now } }],
        },
        data: { respostaReservadaPorId: null, respostaReservadaAte: null },
      });
      return { reservaResposta: null };
    });
  }

  async function conversationForLease(client, context, conversationId) {
    const conversation = await client.conversaCanal.findFirst({
      where: { id: conversationId, empresaId: context.empresaId },
      include: { respostaReservadaPor: { select: { id: true, nome: true } } },
    });
    if (!conversation) throw notFound("Conversa nao encontrada.");
    return conversation;
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
    return prisma.$transaction(async (tx) => {
      const current = await tx[model].findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound(notFoundMessage);
      if (model === "conversaCanal" && current.status === "ENCERRADA") {
        throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser assumida.");
      }
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
    const responsibleId = requiredInteger(body.responsavelId, "responsavelId");
    const motivo = optionalText(body.motivo, "motivo", 240);
    return prisma.$transaction(async (tx) => {
      const current = await tx[model].findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound(notFoundMessage);
      await validateResponsible(tx, context.empresaId, responsibleId);
      if (current.responsavelId === responsibleId) return current;
      const result = await tx[model].updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: current.responsavelId },
        data: { responsavelId: responsibleId },
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "Atribuicao foi alterada por outro usuario.");
      const tipo = current.responsavelId === null ? "ATRIBUIR" : "TRANSFERIR";
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

  async function returnEntityToQueue(context, { model, id, contextField, input, notFoundMessage }) {
    const body = rejectUnknown(input, ["motivo"]);
    rejectEmpresaId(body);
    const motivo = requiredText(body.motivo, "motivo", 240);
    return prisma.$transaction(async (tx) => {
      const current = await tx[model].findFirst({ where: { id, empresaId: context.empresaId } });
      if (!current) throw notFound(notFoundMessage);
      if (current.responsavelId === null) throw domainError(409, "ASSIGNMENT_ALREADY_IN_QUEUE", "Item ja esta sem responsavel.");
      if (!isManager(context) && current.responsavelId !== context.usuarioId) {
        throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
      }
      if (model === "conversaCanal" && current.status === "ENCERRADA") {
        throw domainError(409, "CONVERSATION_CLOSED", "Conversa encerrada nao pode ser devolvida a fila.");
      }
      const data = { responsavelId: null };
      if (model === "conversaCanal") {
        data.status = "AGUARDANDO_ATENDIMENTO";
        data.aguardandoDesde = new Date();
      }
      const result = await tx[model].updateMany({
        where: { id, empresaId: context.empresaId, responsavelId: current.responsavelId },
        data,
      });
      if (result.count !== 1) throw domainError(409, "ASSIGNMENT_CONFLICT", "Atribuicao foi alterada por outra operacao.");
      await createAssignmentHistory(tx, {
        empresaId: context.empresaId,
        [contextField]: id,
        responsavelAnteriorId: current.responsavelId,
        responsavelNovoId: null,
        alteradoPorId: context.usuarioId,
        tipo: "DESATRIBUIR",
        motivo,
      });
      return tx[model].findUnique({ where: { id } });
    });
  }

  const commercialQualification = createInboxCommercialQualificationService({ prisma, convertLeadToBusiness });

  return {
    ...commercialQualification,
    assignConversation,
    assignLead,
    acquireReplyLease,
    assumeConversation,
    assumeLead,
    conversationHistory,
    convertLeadToBusiness,
    createLead,
    createNote,
    createOrFindConversation,
    createSimulatedMessage,
    findContactMatches,
    getConversation,
    getLead,
    leadHistory,
    listConversations,
    listConversationTeam,
    listLeads,
    listMessages,
    listNotes,
    markConversationPending,
    markConversationRead,
    closeConversation,
    reopenConversation,
    releaseReplyLease,
    renewReplyLease,
    registerWebhookEvent,
    returnConversationToQueue,
    returnLeadToQueue,
    updateConversationStatus,
    updateLead,
    updateWebhookEvent,
    validateAssignmentContext: validateAssignmentContext,
    waitForCustomer,
  };
}

function actionForState(next) {
  if (next === "AGUARDANDO_CLIENTE") return "AGUARDAR_CLIENTE";
  if (next === "PENDENTE") return "MARCAR_PENDENTE";
  if (next === "ENCERRADA") return "ENCERRAR";
  return "ALTERAR_ESTADO";
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

function validateLeadForConversion(lead) {
  if (!lead.cliente) throw domainError(409, "LEAD_CLIENT_REQUIRED", "Lead precisa estar vinculado a um Cliente.");
  if (lead.responsavelId === null) {
    throw domainError(409, "LEAD_RESPONSIBLE_REQUIRED", "Assuma o Lead antes de converte-lo em Negocio.");
  }
  if (lead.status === "DESQUALIFICADO") {
    throw domainError(409, "LEAD_STATUS_INCOMPATIBLE", "Lead desqualificado nao pode ser convertido.");
  }
  if (lead.status === "CONVERTIDO") {
    throw domainError(409, "LEAD_CONVERSION_INCONSISTENT", "Lead convertido nao possui Negocio vinculado.");
  }
}

function defaultBusinessTitle(lead) {
  const interest = lead.interesse ? ` - ${lead.interesse}` : "";
  return `Oportunidade - ${lead.cliente.nome}${interest}`.slice(0, 200);
}

function conversionResult(lead, negocio, created) {
  return { lead, negocio, created };
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
    negocios: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      include: businessIncludes(),
    },
  };
}

function conversionLeadIncludes() {
  return leadIncludes();
}

function businessIncludes() {
  return {
    responsavel: { select: { id: true, nome: true, papel: true } },
    convertidoPor: { select: { id: true, nome: true } },
  };
}

function conversationIncludes() {
  return {
    canalIntegracao: { select: { id: true, nome: true, tipo: true, status: true, modoTeste: true } },
    contatoCanal: {
      select: {
        id: true,
        nome: true,
        clienteId: true,
        cliente: { select: { id: true, nome: true, telefone: true, email: true, empresa: true } },
      },
    },
    lead: {
      select: {
        id: true,
        clienteId: true,
        status: true,
        interesse: true,
        origem: true,
        campanha: true,
        paginaOrigem: true,
        responsavel: { select: { id: true, nome: true } },
      },
    },
    responsavel: { select: { id: true, nome: true, papel: true } },
    respostaReservadaPor: { select: { id: true, nome: true } },
    mensagens: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      include: messageIncludes(),
    },
    _count: {
      select: { mensagens: { where: { direcao: "ENTRADA", lidaEm: null } } },
    },
  };
}

function assignmentHistoryIncludes() {
  return {
    responsavelAnterior: { select: { id: true, nome: true } },
    responsavelNovo: { select: { id: true, nome: true } },
    alteradoPor: { select: { id: true, nome: true } },
  };
}

function messageIncludes() {
  return { autorUsuario: { select: { id: true, nome: true } } };
}

function presentConversation(conversation) {
  const { mensagens, respostaReservadaPor, respostaReservadaPorId, respostaReservadaAte, _count, ...data } = conversation;
  return {
    ...data,
    responsavelPrincipal: conversation.responsavel
      ? { id: conversation.responsavel.id, nome: conversation.responsavel.nome }
      : null,
    reservaResposta: replyLeaseView({ ...conversation, respostaReservadaPor, respostaReservadaPorId, respostaReservadaAte }),
    podeResponderDiretamente: conversation.canalIntegracao?.tipo !== "SITE_FORM",
    tipoCanal: conversation.canalIntegracao?.tipo || null,
    ultimaMensagem: mensagens?.[0] ? presentMessage(mensagens[0]) : null,
    naoLidas: _count?.mensagens || 0,
    sla: calculateConversationSla(conversation),
  };
}

function presentMessage(message) {
  const { autorUsuario, ...data } = message;
  return {
    ...data,
    autor: autorUsuario ? { id: autorUsuario.id, nome: autorUsuario.nome } : null,
  };
}

function getReplyLeaseSeconds(env = process.env) {
  const raw = String(env.LEADS_REPLY_LEASE_SECONDS || "").trim();
  if (!/^\d+$/.test(raw)) return DEFAULT_REPLY_LEASE_SECONDS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_REPLY_LEASE_SECONDS || value > MAX_REPLY_LEASE_SECONDS) {
    return DEFAULT_REPLY_LEASE_SECONDS;
  }
  return value;
}

function isLeaseExpired(conversation, now = new Date()) {
  return !conversation.respostaReservadaPorId ||
    !conversation.respostaReservadaAte ||
    new Date(conversation.respostaReservadaAte).getTime() <= now.getTime();
}

function hasValidLeaseFromOther(conversation, context, now = new Date()) {
  return !isLeaseExpired(conversation, now) && conversation.respostaReservadaPorId !== context.usuarioId;
}

function replyLeaseView(conversation, now = new Date()) {
  if (isLeaseExpired(conversation, now)) return null;
  return {
    usuarioId: conversation.respostaReservadaPorId,
    nome: conversation.respostaReservadaPor?.nome || null,
    expiraEm: conversation.respostaReservadaAte,
  };
}

function replyLeaseConflict(conversation) {
  return domainError(
    409,
    "REPLY_LEASE_CONFLICT",
    "Conversa esta sendo respondida por outro usuario.",
    { reservaResposta: replyLeaseView(conversation) },
  );
}

function assertReplyLeaseAvailable(conversation, context, now = new Date()) {
  if (hasValidLeaseFromOther(conversation, context, now)) throw replyLeaseConflict(conversation);
}

function pageResult(data, total, { page, limit }) {
  return { data, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } };
}

function emptyPage(pageData) {
  return pageResult([], 0, pageData);
}

module.exports = { createLeadsCommunicationServices, getReplyLeaseSeconds, validateAssignmentContext };
