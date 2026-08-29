const { domainError, notFound } = require("../leads-communication/policy");
const { lockActiveClienteRow } = require("../shared/clientLifecycleLock");

const TIMELINE_TYPES = new Set([
  "TODOS",
  "MENSAGEM",
  "LIGACAO",
  "VISITA",
  "PROPOSTA",
  "NEGOCIO",
  "ACOMPANHAMENTO",
  "NOTA",
  "QUALIFICACAO",
  "VENDA",
]);
const ACTIVE_LEAD_STATUSES = new Set(["NOVO", "EM_ATENDIMENTO", "QUALIFICADO"]);
const ACTIVE_BUSINESS_STAGES = new Set(["NOVO", "CONTATO", "PROPOSTA"]);
const ACTIVE_PROPOSAL_STATUSES = new Set(["RASCUNHO", "PRONTA", "ENVIADA"]);
const OPEN_FOLLOW_UP_STATUSES = new Set(["PENDENTE", "EM_ANDAMENTO"]);
const REGISTRATION_FIELDS = new Set(["nome", "telefone", "email", "empresa", "cidade", "estado", "cpfCnpj", "revisao"]);

function createCustomer360Service({ prisma }) {
  async function getOverview(context, clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId: context.empresaId },
      include: {
        leads: {
          include: { responsavel: { select: { id: true, nome: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
        negocios: {
          include: { responsavel: { select: { id: true, nome: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
        propostasComerciais: {
          include: { responsavel: { select: { id: true, nome: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
        vendasCanonicas: {
          where: { status: "ACTIVE", negocio: { etapa: "FECHADO" }, contratosAtivos: { some: { empresaId: context.empresaId } } },
          include: {
            negocio: { include: { responsavel: { select: { id: true, nome: true } } } },
            propostaVencedora: { select: { id: true, codigo: true, titulo: true, status: true } },
          },
          orderBy: [{ fechadoEm: "desc" }, { id: "desc" }],
        },
        acompanhamentos: {
          include: { responsavelUsuario: { select: { id: true, nome: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
        contatosCanal: {
          include: {
            canalIntegracao: { select: { id: true, tipo: true, nome: true } },
            conversas: { select: { id: true, status: true, ultimaMensagemEm: true } },
          },
        },
        notas: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      },
    });
    if (!cliente) throw notFound("Cliente nao encontrado.");

    const conversaIds = cliente.contatosCanal.flatMap((contato) => contato.conversas.map((conversa) => conversa.id));
    const [mensagens, ultimaMensagem] = await Promise.all([
      conversaIds.length ? prisma.mensagemCanal.count({ where: { empresaId: context.empresaId, conversaCanalId: { in: conversaIds } } }) : 0,
      conversaIds.length
        ? prisma.mensagemCanal.findFirst({
          where: { empresaId: context.empresaId, conversaCanalId: { in: conversaIds } },
          select: { createdAt: true, enviadaEm: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
        : null,
    ]);

    const leadsAtivos = cliente.leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status));
    const negociosAtivos = cliente.negocios.filter((negocio) => ACTIVE_BUSINESS_STAGES.has(negocio.etapa));
    const propostasAtivas = cliente.propostasComerciais.filter((proposta) => ACTIVE_PROPOSAL_STATUSES.has(proposta.status));
    const acompanhamentosPendentes = cliente.acompanhamentos.filter((item) => OPEN_FOLLOW_UP_STATUSES.has(item.status));
    const negociosAtivosComValor = negociosAtivos.filter((negocio) => negocio.valor !== null && negocio.valor !== undefined);
    const valorPipeline = negociosAtivosComValor.length > 0
      ? negociosAtivosComValor.reduce((total, negocio) => total + Number(negocio.valor), 0)
      : negociosAtivos.length > 0 ? null : 0;
    const responsavel = negociosAtivos.find((item) => item.responsavel)?.responsavel
      || leadsAtivos.find((item) => item.responsavel)?.responsavel
      || cliente.negocios.find((item) => item.responsavel)?.responsavel
      || cliente.leads.find((item) => item.responsavel)?.responsavel
      || null;
    const ultimaAtividade = latestDate([
      ultimaMensagem?.enviadaEm,
      ultimaMensagem?.createdAt,
      cliente.notas[0]?.createdAt,
      cliente.negocios[0]?.updatedAt,
      cliente.propostasComerciais[0]?.updatedAt,
      cliente.acompanhamentos[0]?.updatedAt,
      cliente.vendasCanonicas[0]?.fechadoEm,
    ]);

    return {
      cliente: presentClient(cliente),
      resumo: {
        leadsAtivos: leadsAtivos.length,
        negociosAtivos: negociosAtivos.length,
        propostasAtivas: propostasAtivas.length,
        acompanhamentosPendentes: acompanhamentosPendentes.length,
        conversas: conversaIds.length,
        mensagens,
        valorPipeline,
        valorPipelineIncompleto: negociosAtivosComValor.length !== negociosAtivos.length,
        totalVendidoCentavos: cliente.vendasCanonicas.reduce((total, sale) => total + Number(sale.totalCentavos), 0),
        ultimaVenda: cliente.vendasCanonicas[0] ? presentSaleSummary(cliente.vendasCanonicas[0]) : null,
        ultimaAtividade,
        responsavelComercial: responsavel,
      },
      comprasAnteriores: cliente.vendasCanonicas.map(presentSaleSummary),
      contexto: {
        lead: leadsAtivos[0] ? presentLead(leadsAtivos[0]) : null,
        negocio: negociosAtivos[0] ? presentBusiness(negociosAtivos[0]) : null,
        proposta: propostasAtivas[0] ? presentProposal(propostasAtivas[0]) : null,
        proximoAcompanhamento: acompanhamentosPendentes
          .slice()
          .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime())
          .map(presentFollowUp)[0] || null,
      },
    };
  }

  async function getTimeline(context, clienteId, query = {}) {
    await assertClient(context, clienteId);
    const tipo = String(query.tipo || "TODOS").trim().toUpperCase();
    if (!TIMELINE_TYPES.has(tipo)) throw domainError(422, "CUSTOMER_TIMELINE_TYPE_INVALID", "Filtro da linha do tempo invalido.");
    const page = boundedInteger(query.page, 1, 1, 100, "page");
    const limit = boundedInteger(query.limit, 20, 1, 50, "limit");
    const take = page * limit;
    const wants = (value) => tipo === "TODOS" || tipo === value;

    const conversaIds = await prisma.conversaCanal.findMany({
      where: { empresaId: context.empresaId, contatoCanal: { clienteId } },
      select: { id: true },
    }).then((items) => items.map((item) => item.id));

    const [messages, followUps, proposals, businesses, notes, qualifications, sales] = await Promise.all([
      wants("MENSAGEM") && conversaIds.length
        ? prisma.mensagemCanal.findMany({
          where: { empresaId: context.empresaId, conversaCanalId: { in: conversaIds } },
          include: {
            autorUsuario: { select: { id: true, nome: true } },
            canalIntegracao: { select: { id: true, tipo: true, nome: true } },
            emailMetadata: { select: { subject: true, attachmentCount: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("LIGACAO") || wants("VISITA") || wants("ACOMPANHAMENTO") || tipo === "TODOS"
        ? prisma.acompanhamento.findMany({
          where: {
            empresaId: context.empresaId,
            clienteId,
            ...(tipo === "LIGACAO" ? { tipo: "LIGACAO" } : {}),
            ...(tipo === "VISITA" ? { tipo: "VISITA" } : {}),
            ...(tipo === "ACOMPANHAMENTO" ? { tipo: { notIn: ["LIGACAO", "VISITA"] } } : {}),
          },
          include: { responsavelUsuario: { select: { id: true, nome: true } } },
          orderBy: [{ dataHora: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("PROPOSTA")
        ? prisma.propostaComercial.findMany({
          where: { empresaId: context.empresaId, clienteId },
          include: { responsavel: { select: { id: true, nome: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("NEGOCIO")
        ? prisma.negocio.findMany({
          where: { empresaId: context.empresaId, clienteId },
          include: { responsavel: { select: { id: true, nome: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("NOTA")
        ? prisma.nota.findMany({
          where: { empresaId: context.empresaId, clienteId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("QUALIFICACAO")
        ? prisma.historicoQualificacaoConversa.findMany({
          where: { empresaId: context.empresaId, clienteId },
          include: { autor: { select: { id: true, nome: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
        : [],
      wants("VENDA")
        ? prisma.vendaCanonica.findMany({
          where: { empresaId: context.empresaId, clienteId },
          include: {
            negocio: { include: { responsavel: { select: { id: true, nome: true } } } },
            propostaVencedora: { select: { id: true, codigo: true, titulo: true } },
          },
          orderBy: [{ fechadoEm: "desc" }, { id: "desc" }],
          take,
        })
        : [],
    ]);

    const events = [
      ...messages.map(messageEvent),
      ...followUps.map(followUpEvent),
      ...proposals.map(proposalEvent),
      ...businesses.map(businessEvent),
      ...notes.map(noteEvent),
      ...qualifications.map(qualificationEvent),
      ...sales.map(saleEvent),
    ].sort(compareEvents);

    const total = await timelineCount({ prisma, context, clienteId, conversaIds, tipo });
    return {
      data: events.slice((page - 1) * limit, page * limit),
      paginacao: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      filtros: [...TIMELINE_TYPES],
    };
  }

  async function updateRegistration(context, clienteId, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw validationError("Dados cadastrais invalidos.");
    const unknown = Object.keys(input).filter((field) => !REGISTRATION_FIELDS.has(field));
    if (unknown.length) throw domainError(422, "CUSTOMER_REGISTRATION_FIELDS_INVALID", "Campos cadastrais invalidos.", { campos: unknown });
    const existing = await assertClient(context, clienteId);
    if (existing.arquivadoEm) {
      throw domainError(409, "CLIENT_ARCHIVED_READ_ONLY", "Restaure o cliente antes de alterar o cadastro.");
    }
    const revisao = requiredRevision(input.revisao);
    const data = registrationPayload(input);
    if (!Object.keys(data).length) throw validationError("Nenhum dado cadastral foi informado.");

    const result = await prisma.$transaction(async (tx) => {
      await lockActiveClienteRow(tx, context.empresaId, clienteId);
      return tx.cliente.updateMany({
        where: { id: clienteId, empresaId: context.empresaId, revisao, arquivadoEm: null },
        data: { ...data, revisao: { increment: 1 } },
      });
    });
    if (result.count !== 1) {
      const current = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: context.empresaId }, select: { revisao: true, arquivadoEm: true } });
      if (!current) throw notFound("Cliente nao encontrado.");
      if (current.arquivadoEm) throw domainError(409, "CLIENT_ARCHIVED_READ_ONLY", "Restaure o cliente antes de alterar o cadastro.");
      throw domainError(409, "CUSTOMER_REGISTRATION_CONFLICT", "O cadastro foi alterado por outra pessoa. Atualize os dados e tente novamente.", { revisaoAtual: current.revisao });
    }
    return prisma.cliente.findFirst({ where: { id: existing.id, empresaId: context.empresaId }, include: { notas: { orderBy: { createdAt: "desc" } } } });
  }

  async function assertClient(context, clienteId) {
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: context.empresaId } });
    if (!cliente) throw notFound("Cliente nao encontrado.");
    return cliente;
  }

  return { getOverview, getTimeline, updateRegistration };
}

async function timelineCount({ prisma, context, clienteId, conversaIds, tipo }) {
  const wants = (value) => tipo === "TODOS" || tipo === value;
  const counts = await Promise.all([
    wants("MENSAGEM") && conversaIds.length ? prisma.mensagemCanal.count({ where: { empresaId: context.empresaId, conversaCanalId: { in: conversaIds } } }) : 0,
    wants("LIGACAO") || wants("VISITA") || wants("ACOMPANHAMENTO") || tipo === "TODOS"
      ? prisma.acompanhamento.count({
        where: {
          empresaId: context.empresaId,
          clienteId,
          ...(tipo === "LIGACAO" ? { tipo: "LIGACAO" } : {}),
          ...(tipo === "VISITA" ? { tipo: "VISITA" } : {}),
          ...(tipo === "ACOMPANHAMENTO" ? { tipo: { notIn: ["LIGACAO", "VISITA"] } } : {}),
        },
      })
      : 0,
    wants("PROPOSTA") ? prisma.propostaComercial.count({ where: { empresaId: context.empresaId, clienteId } }) : 0,
    wants("NEGOCIO") ? prisma.negocio.count({ where: { empresaId: context.empresaId, clienteId } }) : 0,
    wants("NOTA") ? prisma.nota.count({ where: { empresaId: context.empresaId, clienteId } }) : 0,
    wants("QUALIFICACAO") ? prisma.historicoQualificacaoConversa.count({ where: { empresaId: context.empresaId, clienteId } }) : 0,
    wants("VENDA") ? prisma.vendaCanonica.count({ where: { empresaId: context.empresaId, clienteId } }) : 0,
  ]);
  return counts.reduce((total, count) => total + Number(count), 0);
}

function presentClient(cliente) {
  return {
    id: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    empresa: cliente.empresa,
    cidade: cliente.cidade,
    estado: cliente.estado,
    cpfCnpj: cliente.cpfCnpj,
    interesse: cliente.interesse,
    status: cliente.status,
    origem: cliente.origem,
    revisao: cliente.revisao,
    createdAt: cliente.createdAt,
  };
}

function presentLead(item) {
  return { id: item.id, status: item.status, origem: item.origem, interesse: item.interesse, responsavel: item.responsavel };
}

function presentBusiness(item) {
  return { id: item.id, titulo: item.titulo || `Negocio ${item.id}`, etapa: item.etapa, valor: item.valor === null || item.valor === undefined ? null : Number(item.valor), responsavel: item.responsavel };
}

function presentProposal(item) {
  return { id: item.id, negocioId: item.negocioId, codigo: item.codigo, titulo: item.titulo, status: item.status, totalCentavos: item.totalCentavos, responsavel: item.responsavel };
}

function presentFollowUp(item) {
  return { id: item.id, titulo: item.titulo, tipo: item.tipo, status: item.status, dataHora: item.dataHora, responsavel: item.responsavelUsuario };
}

function presentSaleSummary(item) {
  return {
    id: item.id,
    negocioId: item.negocioId,
    titulo: item.negocio?.titulo || `Negocio ${item.negocioId}`,
    totalCentavos: Number(item.totalCentavos),
    moeda: item.moeda,
    origem: item.origem,
    status: item.status,
    revisao: item.revisao,
    fechadoEm: item.fechadoEm,
    responsavel: item.negocio?.responsavel || null,
    proposta: item.propostaVencedora || null,
  };
}

function messageEvent(item) {
  const inbound = item.direcao === "ENTRADA";
  const simulated = !inbound && item.simulada === true;
  const emailSubject = item.canalIntegracao.tipo === "EMAIL" ? item.emailMetadata?.subject : null;
  const attachmentLabel = item.emailMetadata?.attachmentCount
    ? ` (${item.emailMetadata.attachmentCount} anexo${item.emailMetadata.attachmentCount === 1 ? "" : "s"})`
    : "";
  const baseDescription = item.texto || "Mensagem sem conteudo textual.";
  const description = attachmentLabel
    ? `${String(baseDescription).slice(0, Math.max(0, 280 - attachmentLabel.length)).trimEnd()}${attachmentLabel}`
    : baseDescription;
  return event({
    id: `mensagem:${item.id}`,
    tipo: "MENSAGEM",
    data: item.enviadaEm || item.createdAt,
    titulo: inbound
      ? emailSubject ? `E-mail recebido: ${emailSubject}` : "Mensagem recebida"
      : simulated ? "Resposta simulada" : "Mensagem enviada",
    descricao: description,
    status: item.statusEntrega || item.status,
    responsavel: item.autorUsuario,
    origem: { entidade: "MensagemCanal", id: item.id },
    canal: { tipo: item.canalIntegracao.tipo, nome: item.canalIntegracao.nome },
    navegacao: { destino: "INBOX", id: item.conversaCanalId },
  });
}

function followUpEvent(item) {
  const tipo = item.tipo === "LIGACAO" ? "LIGACAO" : item.tipo === "VISITA" ? "VISITA" : "ACOMPANHAMENTO";
  return event({
    id: `acompanhamento:${item.id}`,
    tipo,
    data: item.dataHora,
    titulo: item.titulo,
    descricao: item.descricao || "Acompanhamento comercial.",
    status: item.status,
    responsavel: item.responsavelUsuario,
    origem: { entidade: "Acompanhamento", id: item.id },
    navegacao: { destino: "AGENDA", id: item.id },
  });
}

function proposalEvent(item) {
  return event({
    id: `proposta:${item.id}`,
    tipo: "PROPOSTA",
    data: item.createdAt,
    titulo: `${item.codigo} - ${item.titulo}`,
    descricao: item.descricao || "Proposta comercial registrada.",
    status: item.status,
    valor: Number(item.totalCentavos || 0) / 100,
    responsavel: item.responsavel,
    origem: { entidade: "PropostaComercial", id: item.id },
    navegacao: { destino: "KANBAN", id: item.negocioId },
  });
}

function businessEvent(item) {
  return event({
    id: `negocio:${item.id}`,
    tipo: "NEGOCIO",
    data: item.fechadoEm || item.perdidoEm || item.createdAt,
    titulo: item.titulo || `Negocio ${item.id}`,
    descricao: item.observacao || "Oportunidade comercial registrada.",
    status: item.etapa,
    valor: item.valor === null || item.valor === undefined ? null : Number(item.valor),
    responsavel: item.responsavel,
    origem: { entidade: "Negocio", id: item.id },
    navegacao: { destino: "KANBAN", id: item.id },
  });
}

function saleEvent(item) {
  return event({
    id: `venda:${item.id}`,
    tipo: "VENDA",
    data: item.fechadoEm,
    titulo: item.status === "ACTIVE" ? "Venda realizada" : "Venda invalidada",
    descricao: item.propostaVencedora
      ? `Origem: proposta ${item.propostaVencedora.codigo}.`
      : "Origem: fechamento manual.",
    status: item.status,
    valor: Number(item.totalCentavos) / 100,
    valorCentavos: Number(item.totalCentavos),
    responsavel: item.negocio?.responsavel || null,
    origem: { entidade: "VendaCanonica", id: item.id },
    navegacao: { destino: "KANBAN", id: item.negocioId },
  });
}

function noteEvent(item) {
  return event({
    id: `nota:${item.id}`,
    tipo: "NOTA",
    data: item.createdAt,
    titulo: "Nota comercial",
    descricao: item.texto,
    status: item.tipo,
    origem: { entidade: "Nota", id: item.id },
  });
}

function qualificationEvent(item) {
  return event({
    id: `qualificacao:${item.id}`,
    tipo: "QUALIFICACAO",
    data: item.createdAt,
    titulo: qualificationTitle(item.acao),
    descricao: item.proximaAcao || item.interesse || item.observacao || "Contexto comercial atualizado.",
    status: item.prioridade,
    valor: item.valorEstimado,
    responsavel: item.autor,
    origem: { entidade: "HistoricoQualificacaoConversa", id: item.id },
    navegacao: item.negocioId ? { destino: "KANBAN", id: item.negocioId } : { destino: "INBOX", id: item.conversaCanalId },
  });
}

function event(data) {
  return { ...data, descricao: sanitizeSummary(data.descricao), responsavel: data.responsavel || null, valor: data.valor ?? null, status: data.status || null, canal: data.canal || null, navegacao: data.navegacao || null };
}

function qualificationTitle(action) {
  if (action === "CRIAR_NEGOCIO") return "Negocio criado pela Inbox";
  if (action === "VINCULAR_NEGOCIO") return "Negocio vinculado a conversa";
  return "Atendimento qualificado";
}

function compareEvents(first, second) {
  const difference = new Date(second.data).getTime() - new Date(first.data).getTime();
  return difference || second.id.localeCompare(first.id);
}

function registrationPayload(input) {
  const data = {};
  if (Object.prototype.hasOwnProperty.call(input, "nome")) {
    data.nome = normalizeText(input.nome, 160);
    if (!data.nome) throw validationError("Nome do cliente e obrigatorio.", { nome: "Informe o nome do cliente." });
  }
  if (Object.prototype.hasOwnProperty.call(input, "telefone")) {
    data.telefone = String(input.telefone || "").trim();
    if (data.telefone && data.telefone.replace(/\D/g, "").length < 10) throw validationError("Telefone invalido.", { telefone: "Informe um telefone valido." });
  }
  if (Object.prototype.hasOwnProperty.call(input, "email")) {
    data.email = String(input.email || "").trim().toLowerCase();
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw validationError("E-mail invalido.", { email: "Informe um e-mail valido." });
  }
  if (Object.prototype.hasOwnProperty.call(input, "empresa")) data.empresa = normalizeText(input.empresa, 160);
  if (Object.prototype.hasOwnProperty.call(input, "cidade")) data.cidade = nullableText(input.cidade, 120);
  if (Object.prototype.hasOwnProperty.call(input, "estado")) {
    const estado = nullableText(input.estado, 2)?.toUpperCase() || null;
    if (estado && !/^[A-Z]{2}$/.test(estado)) throw validationError("Estado invalido.", { estado: "Use a sigla do estado com duas letras." });
    data.estado = estado;
  }
  if (Object.prototype.hasOwnProperty.call(input, "cpfCnpj")) {
    const document = String(input.cpfCnpj || "").replace(/\D/g, "");
    if (document && !isValidCpfCnpj(document)) throw validationError("CPF ou CNPJ invalido.", { cpfCnpj: "Informe um CPF ou CNPJ valido." });
    data.cpfCnpj = document || null;
  }
  return data;
}

function isValidCpfCnpj(value) {
  if (value.length === 11) return validCpf(value);
  if (value.length === 14) return validCnpj(value);
  return false;
}

function validCpf(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(value[index]) * (length + 1 - index);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

function validCnpj(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  const calculate = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(value[12]) && calculate(13) === Number(value[13]);
}

function requiredRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw validationError("Revisao do cadastro obrigatoria.", { revisao: "Atualize os dados e tente novamente." });
  return revision;
}

function boundedInteger(value, fallback, min, max, field) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw validationError(`${field} invalido.`, { [field]: `Use um inteiro entre ${min} e ${max}.` });
  return parsed;
}

function normalizeText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function nullableText(value, maxLength) {
  return normalizeText(value, maxLength) || null;
}

function sanitizeSummary(value) {
  return normalizeText(value, 280);
}

function latestDate(values) {
  const dates = values.filter(Boolean).map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((value) => value.getTime()))) : null;
}

function validationError(message, details) {
  return domainError(422, "CUSTOMER_360_VALIDATION_ERROR", message, details);
}

module.exports = { createCustomer360Service, isValidCpfCnpj, TIMELINE_TYPES };
