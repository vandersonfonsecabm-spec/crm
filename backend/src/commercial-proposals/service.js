const { Prisma } = require("@prisma/client");
const { domainError, isManager, notFound } = require("../leads-communication/policy");
const { generateProposalPdf } = require("./pdf");

const STATUSES = ["RASCUNHO", "PRONTA", "ENVIADA", "ACEITA", "RECUSADA", "VENCIDA", "CANCELADA"];
const EDITABLE_STATUSES = new Set(["RASCUNHO"]);
const TRANSITIONS = {
  RASCUNHO: new Set(["PRONTA", "CANCELADA"]),
  PRONTA: new Set(["RASCUNHO", "ENVIADA", "ACEITA", "RECUSADA", "CANCELADA"]),
  ENVIADA: new Set(["ACEITA", "RECUSADA", "VENCIDA", "CANCELADA"]),
  ACEITA: new Set(),
  RECUSADA: new Set(),
  VENCIDA: new Set(),
  CANCELADA: new Set(),
};

function createCommercialProposalService({ prisma }) {
  async function listProposals(context, query = {}) {
    rejectTenantAuthority(query);
    const page = positiveInteger(query.page, "page", 1, 100000, 1);
    const limit = positiveInteger(query.limit, "limit", 1, 100, 20);
    const negocioId = optionalPositiveInteger(query.negocioId, "negocioId");
    const status = optionalEnum(query.status, "status", STATUSES);
    const q = optionalText(query.q, "q", 120);
    if (negocioId) await loadBusiness(prisma, context, negocioId, false);
    const where = {
      empresaId: context.empresaId,
      ...(negocioId ? { negocioId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ codigo: { contains: q } }, { titulo: { contains: q } }, { cliente: { nome: { contains: q } } }] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.propostaComercial.findMany({ where, include: proposalIncludes(false), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
      prisma.propostaComercial.count({ where }),
    ]);
    return { data: rows.map((row) => presentProposal(context, row)), pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 } };
  }

  async function getProposal(context, id) {
    const proposal = await loadProposal(prisma, context, id, true);
    return presentProposal(context, proposal);
  }

  async function createDraft(context, negocioId, input) {
    const body = parseProposalInput(input, { create: true });
    const business = await loadBusiness(prisma, context, negocioId, true);
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const sequence = await tx.propostaComercial.count({ where: { empresaId: context.empresaId } }) + 1;
        const codigo = `PROP-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
        const totals = calculateTotals(body.itens, body.descontoGeralCentavos);
        const proposal = await tx.propostaComercial.create({
          data: {
            empresaId: context.empresaId,
            clienteId: business.clienteId,
            negocioId: business.id,
            leadId: business.leadId,
            responsavelId: business.responsavelId,
            autorId: context.usuarioId,
            codigo,
            titulo: body.titulo,
            descricao: body.descricao,
            descontoGeralCentavos: body.descontoGeralCentavos,
            subtotalCentavos: totals.subtotalCentavos,
            totalCentavos: totals.totalCentavos,
            validade: body.validade,
            observacoes: body.observacoes,
            condicoesComerciais: body.condicoesComerciais,
            itens: { create: totals.itens },
          },
        });
        await history(tx, context, proposal, "CRIAR", null, "RASCUNHO", null);
        return proposal;
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw conflict("PROPOSAL_CODE_CONFLICT", "Outra proposta foi criada ao mesmo tempo. Atualize e tente novamente.");
      throw error;
    }
    return getProposal(context, created.id);
  }

  async function updateDraft(context, id, input) {
    const body = parseProposalInput(input, { create: false });
    const current = await loadProposal(prisma, context, id, false);
    requireProposalWrite(context, current.negocio);
    if (!EDITABLE_STATUSES.has(current.status)) throw conflict("PROPOSAL_IMMUTABLE", "Crie uma nova versao para editar esta proposta.");
    if (body.revisao !== current.revisao) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
    const totals = calculateTotals(body.itens, body.descontoGeralCentavos);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.propostaComercial.updateMany({
        where: { id, empresaId: context.empresaId, revisao: body.revisao, status: "RASCUNHO" },
        data: {
          titulo: body.titulo,
          descricao: body.descricao,
          descontoGeralCentavos: body.descontoGeralCentavos,
          subtotalCentavos: totals.subtotalCentavos,
          totalCentavos: totals.totalCentavos,
          validade: body.validade,
          observacoes: body.observacoes,
          condicoesComerciais: body.condicoesComerciais,
          revisao: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
      await tx.itemPropostaComercial.deleteMany({ where: { propostaId: id } });
      await tx.itemPropostaComercial.createMany({ data: totals.itens.map((item) => ({ propostaId: id, ...item })) });
      await history(tx, context, { ...current, revisao: current.revisao + 1 }, "ATUALIZAR", current.status, current.status, body.observacaoHistorico);
    });
    return getProposal(context, id);
  }

  async function changeStatus(context, id, input) {
    const body = objectInput(input);
    rejectTenantAuthority(body);
    rejectUnknown(body, ["status", "revisao", "observacao"]);
    const nextStatus = requiredEnum(body.status, "status", STATUSES);
    const revisao = positiveInteger(body.revisao, "revisao", 1, Number.MAX_SAFE_INTEGER);
    const observacao = optionalText(body.observacao, "observacao", 500);
    const current = await loadProposal(prisma, context, id, false);
    requireProposalWrite(context, current.negocio);
    if (revisao !== current.revisao) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
    if (current.status === nextStatus) return getProposal(context, id);
    if (!TRANSITIONS[current.status]?.has(nextStatus)) throw invalid("Transicao de status invalida.", "PROPOSAL_STATUS_INVALID");
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.propostaComercial.updateMany({
        where: { id, empresaId: context.empresaId, revisao, status: current.status },
        data: { status: nextStatus, revisao: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
      await history(tx, context, current, "ALTERAR_STATUS", current.status, nextStatus, observacao);
      return true;
    });
    if (!result) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
    return getProposal(context, id);
  }

  async function duplicateVersion(context, id, input = {}) {
    const body = objectInput(input);
    rejectTenantAuthority(body);
    rejectUnknown(body, ["observacao"]);
    const observacao = optionalText(body.observacao, "observacao", 500);
    const source = await loadProposal(prisma, context, id, true);
    requireProposalWrite(context, source.negocio);
    const rootId = source.propostaOrigemId ?? source.id;
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const latest = await tx.propostaComercial.findFirst({ where: { empresaId: context.empresaId, OR: [{ id: rootId }, { propostaOrigemId: rootId }] }, orderBy: [{ versao: "desc" }, { id: "desc" }] });
        const version = (latest?.versao ?? source.versao) + 1;
        const root = source.codigo.replace(/-V\d+$/, "");
        const proposal = await tx.propostaComercial.create({
          data: {
            empresaId: context.empresaId,
            clienteId: source.clienteId,
            negocioId: source.negocioId,
            leadId: source.leadId,
            responsavelId: source.responsavelId,
            autorId: context.usuarioId,
            propostaOrigemId: rootId,
            codigo: `${root}-V${version}`,
            titulo: source.titulo,
            descricao: source.descricao,
            descontoGeralCentavos: source.descontoGeralCentavos,
            subtotalCentavos: source.subtotalCentavos,
            totalCentavos: source.totalCentavos,
            validade: source.validade,
            observacoes: source.observacoes,
            condicoesComerciais: source.condicoesComerciais,
            versao: version,
            itens: { create: source.itens.map((item) => ({ descricao: item.descricao, quantidade: item.quantidade, valorUnitarioCentavos: item.valorUnitarioCentavos, descontoCentavos: item.descontoCentavos, subtotalCentavos: item.subtotalCentavos, totalCentavos: item.totalCentavos, ordem: item.ordem })) },
          },
        });
        await history(tx, context, proposal, "DUPLICAR_VERSAO", source.status, "RASCUNHO", observacao);
        return proposal;
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw conflict("PROPOSAL_VERSION_CONFLICT", "Outra versao foi criada ao mesmo tempo.");
      throw error;
    }
    return getProposal(context, created.id);
  }

  async function getHistory(context, id) {
    await loadProposal(prisma, context, id, false);
    const rows = await prisma.historicoPropostaComercial.findMany({
      where: { empresaId: context.empresaId, propostaId: id },
      include: { autor: { select: { id: true, nome: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { data: rows };
  }

  async function getPdf(context, id) {
    const proposal = await loadProposal(prisma, context, id, true);
    return { buffer: generateProposalPdf(presentProposal(context, proposal)), filename: `${proposal.codigo}.pdf` };
  }

  return { changeStatus, createDraft, duplicateVersion, getHistory, getPdf, getProposal, listProposals, updateDraft };
}

async function loadBusiness(client, context, id, requireWrite) {
  const business = await client.negocio.findFirst({
    where: { id, empresaId: context.empresaId },
    include: { cliente: true, lead: true, responsavel: { select: { id: true, nome: true } } },
  });
  if (!business) throw notFound("Negocio nao encontrado.");
  if (business.clienteId !== business.cliente.id || (business.lead && business.lead.empresaId !== context.empresaId)) throw conflict("PROPOSAL_CONTEXT_CONFLICT", "Contexto comercial inconsistente.");
  if (requireWrite) requireProposalWrite(context, business);
  return business;
}

async function loadProposal(client, context, id, withDetails) {
  const proposal = await client.propostaComercial.findFirst({ where: { id, empresaId: context.empresaId }, include: proposalIncludes(withDetails) });
  if (!proposal) throw notFound("Proposta nao encontrada.");
  return proposal;
}

function proposalIncludes(withDetails) {
  return {
    empresa: { select: { id: true, nome: true } },
    cliente: { select: { id: true, nome: true, empresa: true, email: true, telefone: true } },
    negocio: { select: { id: true, titulo: true, etapa: true, responsavelId: true } },
    lead: { select: { id: true, status: true, interesse: true } },
    responsavel: { select: { id: true, nome: true } },
    autor: { select: { id: true, nome: true } },
    itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
    ...(withDetails ? { historico: { include: { autor: { select: { id: true, nome: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 } } : {}),
  };
}

function requireProposalWrite(context, business) {
  if (!isManager(context) && business.responsavelId !== context.usuarioId) throw domainError(403, "PROPOSAL_FORBIDDEN", "Acesso negado.");
}

function presentProposal(context, proposal) {
  return {
    ...proposal,
    itens: proposal.itens.map((item) => ({ ...item, quantidade: item.quantidade.toString() })),
    permissoes: {
      editar: EDITABLE_STATUSES.has(proposal.status) && (isManager(context) || proposal.negocio.responsavelId === context.usuarioId),
      alterarStatus: isManager(context) || proposal.negocio.responsavelId === context.usuarioId,
      duplicar: isManager(context) || proposal.negocio.responsavelId === context.usuarioId,
    },
  };
}

function parseProposalInput(input, { create }) {
  const body = objectInput(input);
  rejectTenantAuthority(body);
  rejectUnknown(body, ["titulo", "descricao", "validade", "observacoes", "condicoesComerciais", "descontoGeralCentavos", "itens", "revisao", "observacaoHistorico"]);
  const itens = Array.isArray(body.itens) ? body.itens : invalid("Informe ao menos um item.");
  if (!itens.length || itens.length > 100) invalid("A proposta deve possuir entre 1 e 100 itens.");
  return {
    titulo: requiredText(body.titulo, "titulo", 160),
    descricao: optionalText(body.descricao, "descricao", 500),
    validade: requiredDate(body.validade, "validade"),
    observacoes: optionalText(body.observacoes, "observacoes", 1500),
    condicoesComerciais: optionalText(body.condicoesComerciais, "condicoesComerciais", 1500),
    descontoGeralCentavos: nonNegativeInteger(body.descontoGeralCentavos ?? 0, "descontoGeralCentavos"),
    itens: itens.map(parseItem),
    revisao: create ? 1 : positiveInteger(body.revisao, "revisao", 1, Number.MAX_SAFE_INTEGER),
    observacaoHistorico: optionalText(body.observacaoHistorico, "observacaoHistorico", 500),
  };
}

function parseItem(value, index) {
  const body = objectInput(value);
  rejectUnknown(body, ["descricao", "quantidade", "valorUnitarioCentavos", "descontoCentavos"]);
  const quantidade = decimalQuantity(body.quantidade, `itens[${index}].quantidade`);
  return {
    descricao: requiredText(body.descricao, `itens[${index}].descricao`, 240),
    quantidade,
    valorUnitarioCentavos: nonNegativeInteger(body.valorUnitarioCentavos, `itens[${index}].valorUnitarioCentavos`),
    descontoCentavos: nonNegativeInteger(body.descontoCentavos ?? 0, `itens[${index}].descontoCentavos`),
    ordem: index,
  };
}

function calculateTotals(items, generalDiscount) {
  let subtotalCentavos = 0;
  const calculated = items.map((item) => {
    const quantityMilli = quantityToMilli(item.quantidade);
    const subtotal = Number((BigInt(item.valorUnitarioCentavos) * quantityMilli + 500n) / 1000n);
    if (item.descontoCentavos > subtotal) invalid("O desconto do item nao pode superar seu subtotal.");
    const total = subtotal - item.descontoCentavos;
    subtotalCentavos = safeMoneyAdd(subtotalCentavos, total);
    return { ...item, subtotalCentavos: subtotal, totalCentavos: total };
  });
  if (generalDiscount > subtotalCentavos) invalid("O desconto geral nao pode superar o subtotal.");
  return { itens: calculated, subtotalCentavos, totalCentavos: subtotalCentavos - generalDiscount };
}

async function history(tx, context, proposal, acao, statusAnterior, statusNovo, observacao) {
  await tx.historicoPropostaComercial.create({ data: { empresaId: context.empresaId, propostaId: proposal.id, autorId: context.usuarioId, acao, statusAnterior, statusNovo, versao: proposal.versao, observacao } });
}

function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Payload invalido.");
  return value;
}

function rejectUnknown(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`Campos nao permitidos: ${unknown.join(", ")}.`);
}

function rejectTenantAuthority(value) {
  if (Object.hasOwn(value || {}, "empresaId")) invalid("empresaId nao pode ser informado.");
}

function requiredText(value, field, max) {
  const text = optionalText(value, field, max);
  if (!text) invalid(`${field} obrigatorio.`);
  return text;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") invalid(`${field} deve ser texto.`);
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > max) invalid(`${field} excede ${max} caracteres.`);
  return text || null;
}

function positiveInteger(value, field, min, max, fallback) {
  if ((value === undefined || value === "") && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) invalid(`${field} invalido.`);
  return parsed;
}

function optionalPositiveInteger(value, field) {
  if (value === undefined || value === "") return undefined;
  return positiveInteger(value, field, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegativeInteger(value, field) {
  return positiveInteger(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function decimalQuantity(value, field) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text) || Number(text) <= 0) invalid(`${field} deve ser positiva e possuir no maximo tres casas decimais.`);
  return new Prisma.Decimal(text);
}

function quantityToMilli(value) {
  const [whole, fraction = ""] = value.toString().split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0").slice(0, 3));
}

function safeMoneyAdd(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) invalid("Total da proposta fora do limite permitido.");
  return total;
}

function requiredDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${field} invalida.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(`${field} invalida.`);
  return date;
}

function requiredEnum(value, field, values) {
  if (!values.includes(value)) invalid(`${field} invalido.`);
  return value;
}

function optionalEnum(value, field, values) {
  if (value === undefined || value === "") return undefined;
  return requiredEnum(value, field, values);
}

function invalid(message, code = "PROPOSAL_VALIDATION_ERROR") {
  throw domainError(422, code, message);
}

function conflict(code, message) {
  return domainError(409, code, message);
}

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

module.exports = { STATUSES, calculateTotals, createCommercialProposalService };
