const { Prisma } = require("@prisma/client");
const { domainError, isManager, notFound } = require("../leads-communication/policy");
const { generateProposalPdf } = require("./pdf");
const { lockActiveClienteRows } = require("../shared/clientLifecycleLock");
const {
  MAX_PRISMA_INT,
  decimalToCentsRoundHalfUp: parseDecimalToCentsRoundHalfUp,
  parseNonNegativePrismaInt,
} = require("../shared/commercial-money");

const STATUSES = ["RASCUNHO", "PRONTA", "ENVIADA", "ACEITA", "RECUSADA", "VENCIDA", "CANCELADA", "SUBSTITUIDA"];
const EDITABLE_STATUSES = new Set(["RASCUNHO"]);
const ITEM_TYPES = Object.freeze(["CATALOG_ITEM", "LEGACY_ITEM"]);
const MATERIAL_STATUSES = new Set(["PRONTA", "ENVIADA", "ACEITA"]);
const TRANSITIONS = {
  RASCUNHO: new Set(["PRONTA", "CANCELADA"]),
  PRONTA: new Set(["RASCUNHO", "ENVIADA", "RECUSADA", "CANCELADA"]),
  ENVIADA: new Set(["RECUSADA", "VENCIDA", "CANCELADA"]),
  ACEITA: new Set(),
  RECUSADA: new Set(),
  VENCIDA: new Set(),
  CANCELADA: new Set(),
  SUBSTITUIDA: new Set(),
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
      cliente: { arquivadoEm: null },
      ...(negocioId ? { negocioId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ codigo: { contains: q } }, { titulo: { contains: q } }, { cliente: { nome: { contains: q } } }] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.propostaComercial.findMany({ where, include: proposalIncludes(false), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
      prisma.propostaComercial.count({ where }),
    ]);
    return {
      data: rows.map((row) => {
        assertProposalMoneyIntegrity(row);
        return presentProposal(context, row);
      }),
      pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 },
    };
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
        await lockActiveClienteRows(tx, context.empresaId, [business.clienteId]);
        const sequence = await tx.propostaComercial.count({ where: { empresaId: context.empresaId } }) + 1;
        const codigo = `PROP-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
        const items = await resolveProposalItems(tx, context, body.itens, {
          clienteId: business.clienteId,
          now: new Date(),
        });
        const totals = calculateTotals(items, body.descontoGeralCentavos);
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
          },
        });
        await tx.itemPropostaComercial.createMany({
          data: totals.itens.map((item) => itemStorageData(tx, proposal.id, context, item)),
        });
        await history(tx, context, proposal, "CRIAR", null, "RASCUNHO", null);
        if (totals.itens.some((item) => item.itemType === "CATALOG_ITEM")) {
          await history(tx, context, proposal, "ADICIONAR_ITEM_CATALOGADO", null, "RASCUNHO", catalogAuditObservation(totals.itens));
        }
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
    await prisma.$transaction(async (tx) => {
      await lockActiveClienteRows(tx, context.empresaId, [current.clienteId, current.negocio?.clienteId]);
      const items = await resolveProposalItems(tx, context, body.itens, {
        clienteId: current.clienteId,
        now: new Date(),
      });
      const totals = calculateTotals(items, body.descontoGeralCentavos);
      const updated = await tx.propostaComercial.updateMany({
        where: { id, empresaId: context.empresaId, revisao: body.revisao, status: "RASCUNHO", cliente: { arquivadoEm: null }, negocio: { cliente: { arquivadoEm: null } } },
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
      await tx.itemPropostaComercial.deleteMany({ where: { empresaId: context.empresaId, propostaId: id } });
      await tx.itemPropostaComercial.createMany({
        data: totals.itens.map((item) => itemStorageData(tx, id, context, item)),
      });
      await history(tx, context, { ...current, revisao: current.revisao + 1 }, "ATUALIZAR", current.status, current.status, body.observacaoHistorico);
      if (totals.itens.some((item) => item.itemType === "CATALOG_ITEM")) {
        await history(tx, context, { ...current, revisao: current.revisao + 1 }, "ADICIONAR_ITEM_CATALOGADO", current.status, current.status, catalogAuditObservation(totals.itens));
      }
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
    if (nextStatus === "ACEITA") throw invalid("Use a acao dedicada para aceitar e definir a proposta vencedora.", "PROPOSAL_ACCEPT_REQUIRES_WINNER_ACTION");
    if (!TRANSITIONS[current.status]?.has(nextStatus)) throw invalid("Transicao de status invalida.", "PROPOSAL_STATUS_INVALID");
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        await lockActiveClienteRows(tx, context.empresaId, [current.clienteId, current.negocio?.clienteId]);
        const transactional = await loadProposal(tx, context, id, false);
        if (transactional.revisao !== revisao || transactional.status !== current.status) {
          throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
        }
        if (MATERIAL_STATUSES.has(nextStatus)) {
          const revalidation = await revalidateProposalCatalogItems(tx, context, transactional, new Date());
          if (!revalidation.valid) throw proposalRevalidationError(revalidation, transactional.revisao);
        }
        const updated = await tx.propostaComercial.updateMany({
          where: { id, empresaId: context.empresaId, revisao, status: current.status, cliente: { arquivadoEm: null }, negocio: { cliente: { arquivadoEm: null } } },
          data: { status: nextStatus, revisao: { increment: 1 } },
        });
        if (updated.count !== 1) throw conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outro usuario.");
        if (MATERIAL_STATUSES.has(nextStatus) && (transactional.itens || []).some((item) => item.itemType === "CATALOG_ITEM")) {
          await history(tx, context, transactional, "REVALIDAR", current.status, nextStatus, null);
        }
        if (["RECUSADA", "VENCIDA", "CANCELADA", "SUBSTITUIDA"].includes(nextStatus)) {
          const contract = await tx.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: context.empresaId, negocioId: transactional.negocioId } } });
          if (contract?.propostaPrincipalId === transactional.id) {
            const cleared = await tx.negocioContratoVenda.updateMany({
              where: { empresaId: context.empresaId, negocioId: transactional.negocioId, revisao: contract.revisao, propostaPrincipalId: transactional.id },
              data: { propostaPrincipalId: null, revisao: { increment: 1 } },
            });
            if (cleared.count !== 1) throw conflict("SALE_CONTRACT_REVISION_CONFLICT", "O contrato comercial foi alterado por outra operacao.");
            await history(tx, context, transactional, "REMOVER_PRINCIPAL", current.status, nextStatus, "Proposta deixou de ser elegivel como principal.");
          }
        }
        await history(tx, context, transactional, "ALTERAR_STATUS", current.status, nextStatus, observacao);
        return true;
      });
    } catch (error) {
      if (error?.codigo === "PROPOSAL_REVALIDATION_REQUIRED") {
        await recordRevalidationRejection(prisma, context, current, error.details);
      }
      throw error;
    }
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
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        await lockActiveClienteRows(tx, context.empresaId, [source.clienteId, source.negocio?.clienteId]);
        const transactionalSource = await loadProposal(tx, context, id, true);
        requireProposalWrite(context, transactionalSource.negocio);
        const rootId = transactionalSource.propostaOrigemId ?? transactionalSource.id;
        const latest = await tx.propostaComercial.findFirst({ where: { empresaId: context.empresaId, OR: [{ id: rootId }, { propostaOrigemId: rootId }] }, orderBy: [{ versao: "desc" }, { id: "desc" }] });
        const version = (latest?.versao ?? transactionalSource.versao) + 1;
        const root = transactionalSource.codigo.replace(/-V\d+$/, "");
        const proposal = await tx.propostaComercial.create({
          data: {
            empresaId: context.empresaId,
            clienteId: transactionalSource.clienteId,
            negocioId: transactionalSource.negocioId,
            leadId: transactionalSource.leadId,
            responsavelId: transactionalSource.responsavelId,
            autorId: context.usuarioId,
            propostaOrigemId: rootId,
            codigo: `${root}-V${version}`,
            titulo: transactionalSource.titulo,
            descricao: transactionalSource.descricao,
            descontoGeralCentavos: transactionalSource.descontoGeralCentavos,
            subtotalCentavos: transactionalSource.subtotalCentavos,
            totalCentavos: transactionalSource.totalCentavos,
            validade: transactionalSource.validade,
            observacoes: transactionalSource.observacoes,
            condicoesComerciais: transactionalSource.condicoesComerciais,
            versao: version,
          },
        });
        await tx.itemPropostaComercial.createMany({
          data: transactionalSource.itens.map((item) => itemStorageData(tx, proposal.id, context, item)),
        });
        await history(tx, context, proposal, "DUPLICAR_VERSAO", transactionalSource.status, "RASCUNHO", observacao);
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
    return {
      data: rows.map((row) => {
        const { empresaId: _empresaId, ...safe } = row;
        return { ...safe, autor: withoutTenantContext(row.autor) };
      }),
    };
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
    include: { cliente: true, lead: true, responsavel: { select: { id: true, empresaId: true, nome: true } } },
  });
  if (!business) throw notFound("Negocio nao encontrado.");
  if (
    business.empresaId !== context.empresaId
    || business.cliente.empresaId !== context.empresaId
    || (business.lead && business.lead.empresaId !== context.empresaId)
    || (business.lead && business.lead.clienteId !== business.clienteId)
    || (business.responsavel && business.responsavel.empresaId !== context.empresaId)
  ) throw conflict("PROPOSAL_CONTEXT_CONFLICT", "Contexto comercial inconsistente.");
  if (requireWrite) requireProposalWrite(context, business);
  return business;
}

async function loadProposal(client, context, id, withDetails) {
  const proposal = await client.propostaComercial.findFirst({ where: { id, empresaId: context.empresaId }, include: proposalIncludes(withDetails) });
  if (!proposal) throw notFound("Proposta nao encontrada.");
  assertProposalTenantContext(context.empresaId, proposal);
  assertProposalMoneyIntegrity(proposal);
  return proposal;
}

function proposalIncludes(withDetails) {
  return {
    empresa: { select: { id: true, nome: true } },
    cliente: { select: { id: true, empresaId: true, nome: true, empresa: true, email: true, telefone: true, arquivadoEm: true } },
    negocio: { select: { id: true, empresaId: true, clienteId: true, leadId: true, titulo: true, etapa: true, responsavelId: true, cliente: { select: { arquivadoEm: true } }, contratoVenda: { select: { revisao: true, propostaPrincipalId: true, propostaVencedoraId: true, vendaAtivaId: true } } } },
    lead: { select: { id: true, empresaId: true, status: true, interesse: true } },
    responsavel: { select: { id: true, empresaId: true, nome: true } },
    autor: { select: { id: true, empresaId: true, nome: true } },
    itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
    ...(withDetails ? { historico: { include: { autor: { select: { id: true, empresaId: true, nome: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 } } : {}),
  };
}

function assertProposalTenantContext(empresaId, proposal) {
  const tenantRows = [proposal, proposal.cliente, proposal.negocio, proposal.lead, proposal.responsavel, proposal.autor]
    .filter(Boolean);
  const itemRows = (proposal.itens || []).filter((row) => row && row.empresaId !== undefined);
  const historyRows = (proposal.historico || []).flatMap((row) => [row, row.autor]).filter(Boolean);
  const mismatchedBusinessContext = proposal.negocio
    && (proposal.clienteId !== proposal.negocio.clienteId
      || (proposal.leadId ?? null) !== (proposal.negocio.leadId ?? null));
  if (mismatchedBusinessContext || [...tenantRows, ...itemRows, ...historyRows].some((row) => row.empresaId !== empresaId)) {
    throw conflict("PROPOSAL_CONTEXT_CONFLICT", "Contexto comercial inconsistente.");
  }
}

function requireProposalWrite(context, business) {
  if (business?.cliente?.arquivadoEm || business?.negocio?.cliente?.arquivadoEm) throw domainError(409, "CLIENT_ARCHIVED_READ_ONLY", "Restaure o cliente antes de operar propostas.");
  if (!isManager(context) && business.responsavelId !== context.usuarioId) throw domainError(403, "PROPOSAL_FORBIDDEN", "Acesso negado.");
  if (!["NOVO", "CONTATO", "PROPOSTA"].includes(business.etapa)) {
    throw domainError(409, "PROPOSAL_DEAL_NOT_OPEN", "Reabra o Negocio antes de alterar suas propostas.");
  }
}

function presentProposal(context, proposal) {
  const { empresaId: _empresaId, itens: rawItems, ...safeProposal } = proposal;
  const negocioAberto = ["NOVO", "CONTATO", "PROPOSTA"].includes(proposal.negocio.etapa);
  const podeOperar = negocioAberto && (isManager(context) || proposal.negocio.responsavelId === context.usuarioId);
  const safeRelations = {
    cliente: withoutTenantContext(proposal.cliente),
    negocio: withoutTenantContext(proposal.negocio),
    lead: withoutTenantContext(proposal.lead),
    responsavel: withoutTenantContext(proposal.responsavel),
    autor: withoutTenantContext(proposal.autor),
    ...(proposal.historico ? {
      historico: proposal.historico.map((row) => ({
        ...withoutTenantContext(row),
        autor: withoutTenantContext(row.autor),
      })),
    } : {}),
  };
  return {
    ...safeProposal,
    ...safeRelations,
    itens: (rawItems || []).map(presentItem),
    contratoComercial: {
      revisao: proposal.negocio?.contratoVenda?.revisao || 1,
      principal: proposal.negocio?.contratoVenda?.propostaPrincipalId === proposal.id,
      vencedora: proposal.negocio?.contratoVenda?.propostaVencedoraId === proposal.id,
      vendaAtivaId: proposal.negocio?.contratoVenda?.vendaAtivaId || null,
    },
    permissoes: {
      editar: podeOperar && EDITABLE_STATUSES.has(proposal.status),
      alterarStatus: podeOperar,
      duplicar: podeOperar,
      aceitar: podeOperar && ["PRONTA", "ENVIADA"].includes(proposal.status),
      definirPrincipal: podeOperar && ["RASCUNHO", "PRONTA", "ENVIADA", "ACEITA"].includes(proposal.status),
      substituirVencedora: negocioAberto && isManager(context),
      reconciliarVencedora: negocioAberto && isManager(context),
      removerVencedora: negocioAberto && isManager(context),
    },
  };
}

function presentItem(item) {
  const {
    empresaId: _empresaId,
    propostaId: _propostaId,
    productOffer: _productOffer,
    catalogProduct: _catalogProduct,
    stockProduct: _stockProduct,
    ...safe
  } = item;
  return {
    ...safe,
    quantidade: item.quantidade?.toString ? item.quantidade.toString() : String(item.quantidade),
  };
}

function withoutTenantContext(row) {
  if (!row) return row;
  const { empresaId: _empresaId, ...safe } = row;
  return safe;
}

function parseProposalInput(input, { create }) {
  const body = objectInput(input);
  rejectTenantAuthority(body);
  rejectUnknown(body, ["titulo", "descricao", "validade", "observacoes", "condicoesComerciais", "descontoGeralCentavos", "itens", "revisao", "observacaoHistorico"]);
  const itens = Array.isArray(body.itens) ? body.itens : invalid("Informe ao menos um item.");
  if (!itens.length || itens.length > 100) invalid("A proposta deve possuir entre 1 e 100 itens.");
  const parsedItems = itens.map(parseItem);
  if (parsedItems.some((item) => item.itemType === "CATALOG_ITEM" && item.descontoCentavos > 0) || (body.descontoGeralCentavos !== undefined && nonNegativeMoneyInteger(body.descontoGeralCentavos, "descontoGeralCentavos") > 0 && parsedItems.some((item) => item.itemType === "CATALOG_ITEM"))) {
    invalid("Desconto ainda nao esta disponivel para itens catalogados.", "CATALOG_ITEM_DISCOUNT_UNSUPPORTED");
  }
  return {
    titulo: requiredText(body.titulo, "titulo", 160),
    descricao: optionalText(body.descricao, "descricao", 500),
    validade: requiredDate(body.validade, "validade"),
    observacoes: optionalText(body.observacoes, "observacoes", 1500),
    condicoesComerciais: optionalText(body.condicoesComerciais, "condicoesComerciais", 1500),
    descontoGeralCentavos: nonNegativeMoneyInteger(body.descontoGeralCentavos ?? 0, "descontoGeralCentavos"),
    itens: parsedItems,
    revisao: create ? 1 : positiveInteger(body.revisao, "revisao", 1, Number.MAX_SAFE_INTEGER),
    observacaoHistorico: optionalText(body.observacaoHistorico, "observacaoHistorico", 500),
  };
}

function parseItem(value, index) {
  const body = objectInput(value);
  rejectUnknown(body, [
    "itemType", "productOfferId", "catalogProductId", "stockProductId",
    "descricao", "quantidade", "valorUnitarioCentavos", "unitPriceSnapshot", "descontoCentavos",
    "currency", "currencySnapshot", "productNameSnapshot", "skuSnapshot", "unitSnapshot",
    "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion",
  ]);
  const quantidade = decimalQuantity(body.quantidade, `itens[${index}].quantidade`);
  const hasOffer = body.productOfferId !== undefined && body.productOfferId !== null && body.productOfferId !== "";
  if (hasOffer) {
    if (body.itemType !== undefined && body.itemType !== "CATALOG_ITEM") invalid("itemType invalido para item catalogado.", "CATALOG_ITEM_TYPE_INVALID");
    const forbidden = [
      "valorUnitarioCentavos", "unitPriceSnapshot", "currency", "currencySnapshot", "productNameSnapshot", "skuSnapshot",
      "unitSnapshot", "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion",
      "catalogProductId", "stockProductId", "descricao",
    ].filter((field) => Object.hasOwn(body, field));
    if (forbidden.length) invalid("O item catalogado deve usar somente os dados server-side da oferta.", "CATALOG_ITEM_CLIENT_AUTHORITY_FORBIDDEN");
    return {
      itemType: "CATALOG_ITEM",
      productOfferId: boundedOfferId(body.productOfferId, `itens[${index}].productOfferId`),
      catalogProductId: null,
      stockProductId: null,
      productNameSnapshot: null,
      skuSnapshot: null,
      unitSnapshot: null,
      currencySnapshot: null,
      priceStatusSnapshot: null,
      offerExpiresAt: null,
      catalogRevision: null,
      stockMaterialVersion: null,
      descricao: null,
      quantidade,
      valorUnitarioCentavos: null,
      descontoCentavos: nonNegativeMoneyInteger(body.descontoCentavos ?? 0, `itens[${index}].descontoCentavos`),
      ordem: index,
    };
  }
  if (body.itemType === "CATALOG_ITEM") invalid("Item catalogado exige productOfferId.", "CATALOG_OFFER_REQUIRED");
  if (body.itemType !== undefined && body.itemType !== "LEGACY_ITEM") invalid("itemType invalido para item legado.", "LEGACY_ITEM_TYPE_INVALID");
  const forbidden = [
    "catalogProductId", "stockProductId", "currency", "currencySnapshot", "productNameSnapshot", "skuSnapshot", "unitPriceSnapshot",
    "unitSnapshot", "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion",
  ].filter((field) => Object.hasOwn(body, field));
  if (forbidden.length) invalid("Campos de catalogo exigem productOfferId.", "CATALOG_ITEM_CLIENT_AUTHORITY_FORBIDDEN");
  return {
    itemType: "LEGACY_ITEM",
    productOfferId: null,
    catalogProductId: null,
    stockProductId: null,
    productNameSnapshot: null,
    skuSnapshot: null,
    unitSnapshot: null,
    currencySnapshot: null,
    priceStatusSnapshot: null,
    offerExpiresAt: null,
    catalogRevision: null,
    stockMaterialVersion: null,
    descricao: requiredText(body.descricao, `itens[${index}].descricao`, 240),
    quantidade,
    valorUnitarioCentavos: nonNegativeMoneyInteger(body.valorUnitarioCentavos, `itens[${index}].valorUnitarioCentavos`),
    descontoCentavos: nonNegativeMoneyInteger(body.descontoCentavos ?? 0, `itens[${index}].descontoCentavos`),
    ordem: index,
  };
}

function calculateTotals(items, generalDiscount) {
  if (!Number.isSafeInteger(generalDiscount) || generalDiscount < 0 || generalDiscount > MAX_PRISMA_INT) invalid("Desconto geral invalido.");
  let subtotalCentavos = 0;
  const calculated = items.map((item) => {
    if (!Number.isSafeInteger(item.valorUnitarioCentavos) || item.valorUnitarioCentavos < 0 || item.valorUnitarioCentavos > MAX_PRISMA_INT) invalid("Valor unitario invalido.");
    if (!Number.isSafeInteger(item.descontoCentavos) || item.descontoCentavos < 0 || item.descontoCentavos > MAX_PRISMA_INT) invalid("Desconto do item invalido.");
    const quantityMilli = quantityToMilli(item.quantidade);
    const subtotalBigInt = (BigInt(item.valorUnitarioCentavos) * quantityMilli + 500n) / 1000n;
    if (subtotalBigInt > BigInt(MAX_PRISMA_INT)) invalid("Subtotal do item fora do limite permitido.");
    const subtotal = Number(subtotalBigInt);
    if (item.descontoCentavos > subtotal) invalid("O desconto do item nao pode superar seu subtotal.");
    const total = subtotal - item.descontoCentavos;
    subtotalCentavos = safeMoneyAdd(subtotalCentavos, total);
    return { ...item, subtotalCentavos: subtotal, totalCentavos: total };
  });
  if (generalDiscount > subtotalCentavos) invalid("O desconto geral nao pode superar o subtotal.");
  return { itens: calculated, subtotalCentavos, totalCentavos: subtotalCentavos - generalDiscount };
}

function supportsCatalogSchema(client) {
  return Boolean(client?.productOffer && client?.commercialCatalogProduct && client?.produtoEstoque);
}

function modelHasField(client, modelName, fieldName) {
  const model = client?._runtimeDataModel?.models?.[modelName]
    || client?._dmmf?.modelMap?.[modelName]
    || client?._dmmf?.datamodel?.models?.find((entry) => entry.name === modelName);
  if (!model?.fields) return false;
  return model.fields.some((field) => field.name === fieldName);
}

function itemSupportsCatalogFields(client) {
  return supportsCatalogSchema(client) || modelHasField(client, "ItemPropostaComercial", "itemType");
}

function itemStorageData(client, propostaId, context, item) {
  const data = {
    propostaId,
    descricao: item.descricao,
    quantidade: item.quantidade,
    valorUnitarioCentavos: item.valorUnitarioCentavos,
    descontoCentavos: item.descontoCentavos,
    subtotalCentavos: item.subtotalCentavos,
    totalCentavos: item.totalCentavos,
    ordem: item.ordem,
  };
  if (itemSupportsCatalogFields(client)) {
    Object.assign(data, {
      empresaId: context.empresaId,
      itemType: item.itemType || "LEGACY_ITEM",
      productOfferId: item.productOfferId || null,
      catalogProductId: item.catalogProductId || null,
      stockProductId: item.stockProductId || null,
      productNameSnapshot: item.productNameSnapshot || null,
      skuSnapshot: item.skuSnapshot || null,
      unitSnapshot: item.unitSnapshot || null,
      currencySnapshot: item.currencySnapshot || null,
      priceStatusSnapshot: item.priceStatusSnapshot || null,
      offerExpiresAt: item.offerExpiresAt || null,
      catalogRevision: item.catalogRevision ?? null,
      stockMaterialVersion: item.stockMaterialVersion ?? null,
    });
  }
  return data;
}

function catalogAuditObservation(items) {
  const offers = items.filter((item) => item.itemType === "CATALOG_ITEM").slice(0, 100).map((item) => ({
    ordem: item.ordem,
    productOfferId: boundedForObservation(item.productOfferId),
  }));
  return JSON.stringify({ catalogItems: offers });
}

function boundedForObservation(value) {
  return typeof value === "string" ? value.slice(0, 128) : null;
}

async function resolveProposalItems(client, context, items, { clienteId, now }) {
  const resolved = [];
  for (const item of items) {
    if (item.itemType !== "CATALOG_ITEM") {
      resolved.push(item);
      continue;
    }
    if (!supportsCatalogSchema(client)) {
      throw conflict("PROPOSAL_CATALOG_UNAVAILABLE", "O catalogo comercial ainda nao esta disponivel.");
    }
    resolved.push(await materializeCatalogItem(client, context, item, { clienteId, now }));
  }
  return resolved;
}

async function materializeCatalogItem(client, context, item, { clienteId, now }) {
  await lockCatalogSnapshotRows(client, context.empresaId, item);
  const offer = await loadProductOffer(client, context.empresaId, item.productOfferId);
  if (!offer) throw domainError(404, "PROPOSAL_OFFER_NOT_FOUND", "Oferta de produto nao encontrada.");
  if (offer.customerId !== null && offer.customerId !== undefined && Number(offer.customerId) !== Number(clienteId)) {
    throw conflict("PROPOSAL_OFFER_CONTEXT_CONFLICT", "A oferta nao pertence ao Cliente da proposta.");
  }
  if (String(offer.status || "ACTIVE") !== "ACTIVE") {
    throw conflict(offer.status === "EXPIRED" ? "PROPOSAL_OFFER_EXPIRED" : "PROPOSAL_OFFER_NOT_ACTIVE", "A oferta de produto nao esta mais ativa.");
  }
  const expiresAt = asDate(offer.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) throw conflict("PROPOSAL_OFFER_EXPIRED", "A oferta de produto expirou.");
  const catalog = offer.catalogProduct || await client.commercialCatalogProduct.findFirst({
    where: { id: offer.catalogProductId, empresaId: context.empresaId },
    include: { stockProduct: true },
  });
  const stock = offer.stockProduct || catalog?.stockProduct || await client.produtoEstoque.findFirst({
    where: { id: offer.stockProductId, empresaId: context.empresaId },
  });
  if (!catalog || catalog.empresaId !== context.empresaId || !stock || stock.empresaId !== context.empresaId) {
    throw conflict("PROPOSAL_OFFER_CONTEXT_CONFLICT", "A oferta nao possui contexto comercial consistente.");
  }
  if (Number(catalog.stockProductId) !== Number(offer.stockProductId) || Number(stock.id) !== Number(offer.stockProductId)) {
    throw conflict("PROPOSAL_OFFER_CONTEXT_CONFLICT", "A oferta nao possui produto de estoque consistente.");
  }
  if (stock.ativo === false) throw conflict("PRODUCT_UNAVAILABLE", "O produto de estoque nao esta ativo.");
  if (catalog.visibility !== "PUBLISHED" || catalog.archivedAt) throw conflict("PROPOSAL_CATALOG_CHANGED", "O produto catalogado nao esta publicado.");
  if (Number(catalog.revision) !== Number(offer.catalogRevision)) throw conflict("PROPOSAL_CATALOG_CHANGED", "O catalogo mudou desde a oferta.");
  const priceStatus = resolvePriceStatus(catalog, offer);
  if (!["AVAILABLE", "ON_REQUEST", "UNAVAILABLE", "STALE"].includes(priceStatus)) throw conflict("PROPOSAL_CATALOG_PRICE_STATUS_INVALID", "O estado do preco catalogado e invalido.");
  const offerPrice = offer.price === null || offer.price === undefined ? null : decimalToCentsRoundHalfUp(offer.price);
  const catalogPrice = catalog.commercialPrice === null || catalog.commercialPrice === undefined ? null : decimalToCentsRoundHalfUp(catalog.commercialPrice);
  if (priceStatus !== "AVAILABLE" || offerPrice === null || catalogPrice === null) throw conflict("PROPOSAL_CATALOG_PRICE_UNAVAILABLE", "O produto catalogado nao possui preco confirmado.");
  if (offerPrice !== catalogPrice) throw conflict("PROPOSAL_OFFER_PRICE_CHANGED", "O preco da oferta nao coincide com o catalogo atual.");
  const currency = normalizeCurrencyValue(catalog.currency || offer.currency);
  if (!currency || currency !== "BRL" || normalizeCurrencyValue(offer.currency) !== currency) invalid("Somente ofertas em BRL podem compor uma proposta.", "PROPOSAL_CATALOG_CURRENCY_UNSUPPORTED");
  const title = requiredText(offer.title || stock.nomeExibicao, "produto catalogado", 240);
  const unit = optionalSnapshotText(stock.unidadeCanonica, 40);
  if (!unit) invalid("A unidade do produto catalogado nao esta disponivel.", "PROPOSAL_UNIT_UNAVAILABLE");
  const catalogRevision = Number(offer.catalogRevision);
  if (!Number.isSafeInteger(catalogRevision) || catalogRevision < 1) throw conflict("PROPOSAL_CATALOG_CHANGED", "A revisao do catalogo e invalida.");
  return {
    ...item,
    itemType: "CATALOG_ITEM",
    productOfferId: offer.id,
    catalogProductId: catalog.id,
    stockProductId: stock.id,
    descricao: title,
    productNameSnapshot: title,
    skuSnapshot: optionalSnapshotText(stock.skuCanonico, 120),
    unitSnapshot: unit,
    currencySnapshot: currency,
    priceStatusSnapshot: priceStatus,
    offerExpiresAt: expiresAt,
    catalogRevision,
    stockMaterialVersion: offer.stockMaterialVersion === null || offer.stockMaterialVersion === undefined ? null : Number(offer.stockMaterialVersion),
    valorUnitarioCentavos: offerPrice,
  };
}

async function loadProductOffer(client, empresaId, offerId) {
  if (!client?.productOffer?.findFirst) return null;
  return client.productOffer.findFirst({
    where: { id: offerId, empresaId },
    include: { catalogProduct: { include: { stockProduct: true } }, stockProduct: true },
  });
}

function resolvePriceStatus(catalog, offer) {
  const direct = typeof catalog?.priceStatus === "string" ? catalog.priceStatus.toUpperCase() : null;
  if (direct) return direct;
  const terms = parseSafeJson(offer?.commercialTermsJson);
  return typeof terms?.priceStatus === "string" ? terms.priceStatus.toUpperCase() : "UNAVAILABLE";
}

function parseSafeJson(value) {
  if (typeof value !== "string" || value.length > 16000) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeCurrencyValue(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function optionalSnapshotText(value, max) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim().slice(0, max) || null;
}

async function revalidateProposalCatalogItems(client, context, proposal, now = new Date()) {
  const items = Array.isArray(proposal?.itens) ? proposal.itens : [];
  const catalogItems = items.filter((item) => item.itemType === "CATALOG_ITEM");
  if (!catalogItems.length) return { valid: true, reasons: [] };
  const reasons = [];
  if (!supportsCatalogSchema(client)) return { valid: false, reasons: [{ code: "CATALOG_SCHEMA_UNAVAILABLE", itemIndex: null }] };
  await lockCatalogSnapshotRowsBatch(client, context.empresaId, catalogItems);
  for (const [itemIndex, item] of items.entries()) {
    if (item.itemType !== "CATALOG_ITEM") continue;
    await revalidateCatalogItem(client, context, item, itemIndex, now, reasons, proposal.clienteId);
    if (reasons.length >= 100) break;
  }
  return { valid: reasons.length === 0, reasons: boundRevalidationReasons(reasons) };
}

async function revalidateCatalogItem(client, context, item, itemIndex, now, reasons, clienteId) {
  await lockCatalogSnapshotRows(client, context.empresaId, item);
  const offer = await loadProductOffer(client, context.empresaId, item.productOfferId);
  if (!offer) {
    addRevalidationReason(reasons, "OFFER_NOT_FOUND", itemIndex);
    return;
  }
  if (offer.empresaId !== context.empresaId) {
    addRevalidationReason(reasons, "OFFER_TENANT_MISMATCH", itemIndex);
    return;
  }
  if (clienteId !== undefined && offer.customerId !== null && offer.customerId !== undefined && Number(offer.customerId) !== Number(clienteId)) addRevalidationReason(reasons, "OFFER_CONTEXT_CHANGED", itemIndex, clienteId, offer.customerId);
  const expiresAt = asDate(offer.expiresAt);
  if (String(offer.status || "ACTIVE") !== "ACTIVE") addRevalidationReason(reasons, "OFFER_STATUS_CHANGED", itemIndex, "ACTIVE", offer.status);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) addRevalidationReason(reasons, "OFFER_EXPIRED", itemIndex, item.offerExpiresAt, offer.expiresAt);
  if (expiresAt && asDate(item.offerExpiresAt) && expiresAt.getTime() !== asDate(item.offerExpiresAt).getTime()) addRevalidationReason(reasons, "OFFER_SNAPSHOT_CHANGED", itemIndex, item.offerExpiresAt, offer.expiresAt);
  if (Number(offer.catalogProductId) !== Number(item.catalogProductId) || Number(offer.stockProductId) !== Number(item.stockProductId)) {
    addRevalidationReason(reasons, "OFFER_CONTEXT_CHANGED", itemIndex);
  }
  const catalog = offer.catalogProduct || await client.commercialCatalogProduct.findFirst({
    where: { id: item.catalogProductId, empresaId: context.empresaId },
    include: { stockProduct: true },
  });
  if (!catalog) {
    addRevalidationReason(reasons, "CATALOG_NOT_FOUND", itemIndex);
    return;
  }
  if (Number(catalog.stockProductId) !== Number(offer.stockProductId)) addRevalidationReason(reasons, "OFFER_CONTEXT_CHANGED", itemIndex, offer.stockProductId, catalog.stockProductId);
  if (catalog.visibility !== "PUBLISHED" || catalog.archivedAt) addRevalidationReason(reasons, "PRODUCT_UNAVAILABLE", itemIndex, "PUBLISHED", catalog.visibility);
  if (Number(catalog.revision) !== Number(item.catalogRevision) || Number(catalog.revision) !== Number(offer.catalogRevision)) {
    addRevalidationReason(reasons, "CATALOG_REVISION_CHANGED", itemIndex, item.catalogRevision, catalog.revision);
  }
  const priceStatus = resolvePriceStatus(catalog, offer);
  if (priceStatus !== item.priceStatusSnapshot) addRevalidationReason(reasons, "PRICE_STATUS_CHANGED", itemIndex, item.priceStatusSnapshot, priceStatus);
  if (priceStatus !== "AVAILABLE") addRevalidationReason(reasons, "PRICE_UNAVAILABLE", itemIndex, "AVAILABLE", priceStatus);
  const currency = normalizeCurrencyValue(catalog.currency);
  if (!currency || currency !== "BRL" || currency !== normalizeCurrencyValue(item.currencySnapshot) || currency !== normalizeCurrencyValue(offer.currency)) {
    addRevalidationReason(reasons, "CURRENCY_MISMATCH", itemIndex, item.currencySnapshot, currency);
  }
  const currentPrice = catalog.commercialPrice === null || catalog.commercialPrice === undefined ? null : decimalToCentsRoundHalfUp(catalog.commercialPrice);
  if (currentPrice === null || currentPrice !== Number(item.valorUnitarioCentavos)) addRevalidationReason(reasons, "PRICE_CHANGED", itemIndex, item.valorUnitarioCentavos, currentPrice);
  const offerPrice = offer.price === null || offer.price === undefined ? null : decimalToCentsRoundHalfUp(offer.price);
  if (offerPrice === null || offerPrice !== Number(item.valorUnitarioCentavos)) addRevalidationReason(reasons, "OFFER_PRICE_CHANGED", itemIndex, item.valorUnitarioCentavos, offerPrice);
  if (optionalSnapshotText(offer.title, 240) !== optionalSnapshotText(item.productNameSnapshot, 240)) addRevalidationReason(reasons, "OFFER_NAME_CHANGED", itemIndex, item.productNameSnapshot, offer.title);
  if (optionalSnapshotText(catalog.title, 240) !== optionalSnapshotText(item.productNameSnapshot, 240)) addRevalidationReason(reasons, "PRODUCT_NAME_CHANGED", itemIndex, item.productNameSnapshot, catalog.title);
  const stock = offer.stockProduct || catalog.stockProduct || await client.produtoEstoque.findFirst({
    where: { id: item.stockProductId, empresaId: context.empresaId },
  });
  if (!stock || stock.ativo === false) {
    addRevalidationReason(reasons, "PRODUCT_UNAVAILABLE", itemIndex, "ACTIVE", stock?.ativo === false ? "INACTIVE" : "MISSING");
    return;
  }
  if (Number(stock.id) !== Number(item.stockProductId)) addRevalidationReason(reasons, "PRODUCT_UNAVAILABLE", itemIndex, item.stockProductId, stock.id);
  if (optionalSnapshotText(stock.skuCanonico, 120) !== optionalSnapshotText(item.skuSnapshot, 120)) addRevalidationReason(reasons, "SKU_MISMATCH", itemIndex, item.skuSnapshot, stock.skuCanonico);
  if (optionalSnapshotText(stock.unidadeCanonica, 40) !== optionalSnapshotText(item.unitSnapshot, 40)) addRevalidationReason(reasons, "UNIT_MISMATCH", itemIndex, item.unitSnapshot, stock.unidadeCanonica);
  const availability = await readCurrentAvailability(client, context.empresaId, catalog.id, now);
  if (!availability) {
    addRevalidationReason(reasons, "STOCK_REVALIDATION_UNAVAILABLE", itemIndex);
    return;
  }
  if (availability.stockMaterialVersion !== null && Number(availability.stockMaterialVersion) !== Number(item.stockMaterialVersion || 0)) {
    addRevalidationReason(reasons, "STOCK_MATERIAL_CHANGED", itemIndex, item.stockMaterialVersion, availability.stockMaterialVersion);
  }
  if (offer.stockMaterialVersion !== null && offer.stockMaterialVersion !== undefined && Number(offer.stockMaterialVersion) !== Number(item.stockMaterialVersion || 0)) addRevalidationReason(reasons, "STOCK_MATERIAL_CHANGED", itemIndex, item.stockMaterialVersion, offer.stockMaterialVersion);
  if (availability.status && availability.status !== offer.availabilityStatus) addRevalidationReason(reasons, "STOCK_AVAILABILITY_CHANGED", itemIndex, offer.availabilityStatus, availability.status);
  if (availability.status === "OUT_OF_STOCK") addRevalidationReason(reasons, "OUT_OF_STOCK", itemIndex, "AVAILABLE_OR_LOW_AVAILABILITY", availability.status);
  if (availability.status === "NOT_SELLABLE") addRevalidationReason(reasons, "PRODUCT_UNAVAILABLE", itemIndex, "SELLABLE", availability.status);
  if (availability.status === "NEEDS_CONFIRMATION") addRevalidationReason(reasons, "UNKNOWN_AVAILABILITY", itemIndex, "AVAILABLE_OR_LOW_AVAILABILITY", availability.status);
  if (availability.status === "DATA_STALE" || availability.freshness === "STALE" || availability.freshness === "SYNC_FAILED" || availability.freshness === "PARTIAL") addRevalidationReason(reasons, "STALE_AVAILABILITY", itemIndex, "FRESH", availability.status || availability.freshness);
  if (availability.status === "UNKNOWN" || availability.freshness === "UNKNOWN") addRevalidationReason(reasons, "UNKNOWN_AVAILABILITY", itemIndex, "FRESH", availability.status || availability.freshness);
  if (availability.freshness && availability.freshness !== offer.sourceFreshness) addRevalidationReason(reasons, "STOCK_FRESHNESS_CHANGED", itemIndex, offer.sourceFreshness, availability.freshness);
  if (availability.unit && optionalSnapshotText(availability.unit, 40) !== optionalSnapshotText(item.unitSnapshot, 40)) addRevalidationReason(reasons, "UNIT_MISMATCH", itemIndex, item.unitSnapshot, availability.unit);
  if (availability.quantity !== null && quantityToNumber(item.quantidade) > availability.quantity) addRevalidationReason(reasons, "QUANTITY_UNAVAILABLE", itemIndex, item.quantidade, availability.quantity);
}

async function lockCatalogSnapshotRows(client, empresaId, item) {
  if (!isPostgresRuntime() || typeof client?.$queryRaw !== "function") return;
  if (item.productOfferId) {
    await client.$queryRaw`SELECT id FROM "ProductOffer" WHERE "empresaId" = ${Number(empresaId)} AND id = ${item.productOfferId} FOR UPDATE`;
  }
  if (item.catalogProductId) {
    await client.$queryRaw`SELECT id FROM "CommercialCatalogProduct" WHERE "empresaId" = ${Number(empresaId)} AND id = ${Number(item.catalogProductId)} FOR UPDATE`;
  }
  if (item.stockProductId) {
    await client.$queryRaw`SELECT id FROM "ProdutoEstoque" WHERE "empresaId" = ${Number(empresaId)} AND id = ${Number(item.stockProductId)} FOR UPDATE`;
    await client.$queryRaw`SELECT id FROM "SaldoEstoque" WHERE "empresaId" = ${Number(empresaId)} AND "produtoEstoqueId" = ${Number(item.stockProductId)} FOR UPDATE`;
  }
}

async function lockCatalogSnapshotRowsBatch(client, empresaId, items) {
  if (!isPostgresRuntime() || typeof client?.$queryRaw !== "function") return;
  const offers = [...new Set(items.map((item) => item.productOfferId).filter(Boolean))].sort();
  const catalogs = [...new Set(items.map((item) => Number(item.catalogProductId)).filter(Number.isSafeInteger))].sort((a, b) => a - b);
  const stocks = [...new Set(items.map((item) => Number(item.stockProductId)).filter(Number.isSafeInteger))].sort((a, b) => a - b);
  for (const offerId of offers) await client.$queryRaw`SELECT id FROM "ProductOffer" WHERE "empresaId" = ${Number(empresaId)} AND id = ${offerId} FOR UPDATE`;
  for (const catalogId of catalogs) await client.$queryRaw`SELECT id FROM "CommercialCatalogProduct" WHERE "empresaId" = ${Number(empresaId)} AND id = ${catalogId} FOR UPDATE`;
  for (const stockId of stocks) {
    await client.$queryRaw`SELECT id FROM "ProdutoEstoque" WHERE "empresaId" = ${Number(empresaId)} AND id = ${stockId} FOR UPDATE`;
    await client.$queryRaw`SELECT id FROM "SaldoEstoque" WHERE "empresaId" = ${Number(empresaId)} AND "produtoEstoqueId" = ${stockId} FOR UPDATE`;
  }
}

function isPostgresRuntime() {
  const url = process.env.CRM_TEST_DATABASE_URL || process.env.DATABASE_URL || "";
  return /^postgres(?:ql)?:/i.test(url);
}

async function readCurrentAvailability(client, empresaId, catalogProductId, now) {
  if (!client?.saldoEstoque?.findMany || !client?.commercialCatalogProduct?.findFirst) return null;
  try {
    // Lazy load keeps legacy proposal tests independent from the E6A schema.
    const { createSellableAvailabilityService } = require("../ai-commerce/availability");
    const service = createSellableAvailabilityService({ prisma: client, clock: () => now });
    const result = await service.getSellableAvailability({ empresaId, catalogProductId, now, internal: true });
    return {
      status: result.status || null,
      freshness: result.freshness || null,
      stockMaterialVersion: result.stockMaterialVersion === undefined || result.stockMaterialVersion === null ? null : Number(result.stockMaterialVersion),
      quantity: result.exactQuantity !== undefined && result.exactQuantity !== null ? Number(result.exactQuantity) : result.quantity === undefined || result.quantity === null ? null : Number(result.quantity),
      unit: result.unit || null,
    };
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") return readCurrentAvailabilityFallback(client, empresaId, catalogProductId);
    if (error?.code === "COMMERCE_CATALOG_PRODUCT_NOT_FOUND" || error?.code === "COMMERCE_CATALOG_UNAVAILABLE" || error?.code === "COMMERCE_STOCK_UNAVAILABLE") return null;
    throw error;
  }
}

async function readCurrentAvailabilityFallback(client, empresaId, catalogProductId) {
  if (!client?.commercialCatalogProduct?.findFirst || !client?.saldoEstoque?.findMany) return null;
  const catalog = await client.commercialCatalogProduct.findFirst({ where: { id: catalogProductId, empresaId } });
  if (!catalog) return null;
  const balances = await client.saldoEstoque.findMany({ where: { empresaId, produtoEstoqueId: catalog.stockProductId }, take: 200 });
  if (!Array.isArray(balances) || !balances.length) return { status: "UNKNOWN", freshness: "UNKNOWN", stockMaterialVersion: 0, quantity: null, unit: null };
  const versions = balances.map((row) => Number(row.revision) || 0);
  const freshnesses = balances.map((row) => String(row.freshnessEstado || "UNKNOWN").toUpperCase());
  const unit = balances.find((row) => row.unidade)?.unidade || null;
  const fresh = freshnesses.every((value) => value === "FRESH");
  const quantityKnown = balances.every((row) => ["EXPLICIT", "DERIVED_ON_HAND_MINUS_RESERVED"].includes(String(row.semanticaDisponivel || "UNKNOWN").toUpperCase()));
  if (!quantityKnown) return { status: "UNKNOWN", freshness: fresh ? "FRESH" : "STALE", stockMaterialVersion: Math.max(...versions, 0), quantity: null, unit };
  const quantity = balances.reduce((sum, row) => {
    const available = row.available !== null && row.available !== undefined ? Number(row.available) : null;
    return available !== null && Number.isFinite(available) && available >= 0 ? sum + available : sum;
  }, 0);
  const status = fresh ? (quantity > 0 ? "AVAILABLE" : "OUT_OF_STOCK") : "DATA_STALE";
  return { status, freshness: fresh ? "FRESH" : "STALE", stockMaterialVersion: Math.max(...versions, 0), quantity, unit };
}

function quantityToNumber(value) {
  const text = String(value ?? "0");
  const [whole, fraction = ""] = text.split(".");
  return Number(`${whole}.${fraction.padEnd(3, "0").slice(0, 3)}`);
}

function addRevalidationReason(reasons, code, itemIndex, expected, observed) {
  if (reasons.length >= 100) return;
  reasons.push({ code: String(code).slice(0, 64), itemIndex: Number.isInteger(itemIndex) ? itemIndex : null, expected: boundedReasonValue(expected), observed: boundedReasonValue(observed) });
}

function boundRevalidationReasons(reasons) {
  return reasons.slice(0, 20).map((reason) => ({
    code: reason.code,
    itemIndex: reason.itemIndex,
    ...(reason.expected === undefined ? {} : { expected: reason.expected }),
    ...(reason.observed === undefined ? {} : { observed: reason.observed }),
  }));
}

function boundedReasonValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 30);
  const text = typeof value === "string" ? value : String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
function proposalRevalidationError(revalidation, proposalRevision) {
  return domainError(409, "PROPOSAL_REVALIDATION_REQUIRED", "Os itens catalogados precisam ser atualizados antes de continuar.", {
    reasons: boundRevalidationReasons(revalidation.reasons).map((reason) => reason.code),
    proposalRevision,
  });
}

async function recordRevalidationRejection(client, context, proposal, details) {
  if (!itemSupportsCatalogFields(client) || typeof client?.$transaction !== "function" || !proposal?.itens?.some((item) => item.itemType === "CATALOG_ITEM")) return;
  try {
    await client.$transaction(async (tx) => {
      const current = await tx.propostaComercial.findFirst({ where: { id: proposal.id, empresaId: context.empresaId } });
      if (!current) return;
      if (details?.proposalRevision !== undefined && Number(current.revisao) !== Number(details.proposalRevision)) return;
      await history(tx, context, current, "REVALIDACAO_RECUSADA", current.status, current.status, JSON.stringify({ reasons: (details?.reasons || []).slice(0, 20), proposalRevision: current.revisao }));
    });
  } catch (error) {
    // A revalidation failure must remain the user-visible result. Audit is best effort
    // only when a concurrent delete/rollback makes its append impossible.
    if (error?.code === "P2025" || error?.codigo === "PROPOSAL_NOT_FOUND") return;
    throw error;
  }
}

function decimalToCentsRoundHalfUp(value) {
  if (typeof value === "number") invalid("Preco catalogado deve ser Decimal ou texto decimal.", "CATALOG_PRICE_DECIMAL_REQUIRED");
  const cents = parseDecimalToCentsRoundHalfUp(value);
  if (cents === null) invalid("Preco catalogado invalido ou fora do limite permitido.", "CATALOG_PRICE_INVALID");
  return cents;
}

function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function boundedOfferId(value, field = "productOfferId") {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    invalid(`${field} invalido.`, "CATALOG_OFFER_ID_INVALID");
  }
  return value;
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

function nonNegativeMoneyInteger(value, field) {
  const parsed = parseNonNegativePrismaInt(value);
  if (parsed === null) invalid(`${field} invalido ou fora do limite permitido.`);
  return parsed;
}

function assertProposalMoneyIntegrity(proposal) {
  const findings = proposalMoneyIntegrityFindings(proposal);
  if (!findings.length) return;
  const error = conflict("PROPOSAL_MONEY_INTEGRITY_CONFLICT", "Os valores persistidos da proposta estao inconsistentes.");
  error.details = { findings };
  throw error;
}

function proposalMoneyIntegrityFindings(proposal) {
  const findings = [];
  const items = Array.isArray(proposal?.itens) ? proposal.itens : [];
  if (!items.length) findings.push("ITEMS_MISSING");
  let expectedProposalSubtotal = 0n;
  items.forEach((item, index) => {
    const prefix = `ITEM_${index + 1}`;
    const unitCents = parseNonNegativePrismaInt(item?.valorUnitarioCentavos);
    const discountCents = parseNonNegativePrismaInt(item?.descontoCentavos);
    const storedSubtotal = parseNonNegativePrismaInt(item?.subtotalCentavos);
    const storedTotal = parseNonNegativePrismaInt(item?.totalCentavos);
    const quantityText = String(item?.quantidade ?? "").trim();
    const quantityMatch = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(quantityText);
    if (unitCents === null || discountCents === null || storedSubtotal === null || storedTotal === null || !quantityMatch) {
      findings.push(`${prefix}_INVALID`);
      return;
    }
    const quantityMilli = BigInt(quantityMatch[1]) * 1000n + BigInt((quantityMatch[2] || "").padEnd(3, "0"));
    if (quantityMilli <= 0n) {
      findings.push(`${prefix}_QUANTITY_INVALID`);
      return;
    }
    const expectedSubtotal = (BigInt(unitCents) * quantityMilli + 500n) / 1000n;
    if (expectedSubtotal > BigInt(MAX_PRISMA_INT)) {
      findings.push(`${prefix}_SUBTOTAL_OVERFLOW`);
      return;
    }
    if (BigInt(storedSubtotal) !== expectedSubtotal) findings.push(`${prefix}_SUBTOTAL_MISMATCH`);
    if (BigInt(discountCents) > expectedSubtotal) {
      findings.push(`${prefix}_DISCOUNT_INVALID`);
      return;
    }
    const expectedTotal = expectedSubtotal - BigInt(discountCents);
    if (BigInt(storedTotal) !== expectedTotal) findings.push(`${prefix}_TOTAL_MISMATCH`);
    expectedProposalSubtotal += expectedTotal;
  });
  const generalDiscount = parseNonNegativePrismaInt(proposal?.descontoGeralCentavos);
  const storedProposalSubtotal = parseNonNegativePrismaInt(proposal?.subtotalCentavos);
  const storedProposalTotal = parseNonNegativePrismaInt(proposal?.totalCentavos);
  if (expectedProposalSubtotal > BigInt(MAX_PRISMA_INT)) findings.push("PROPOSAL_SUBTOTAL_OVERFLOW");
  if (generalDiscount === null || storedProposalSubtotal === null || storedProposalTotal === null) {
    findings.push("PROPOSAL_TOTALS_INVALID");
    return [...new Set(findings)];
  }
  if (BigInt(storedProposalSubtotal) !== expectedProposalSubtotal) findings.push("PROPOSAL_SUBTOTAL_MISMATCH");
  if (BigInt(generalDiscount) > expectedProposalSubtotal) {
    findings.push("PROPOSAL_DISCOUNT_INVALID");
  } else if (BigInt(storedProposalTotal) !== expectedProposalSubtotal - BigInt(generalDiscount)) {
    findings.push("PROPOSAL_TOTAL_MISMATCH");
  }
  return [...new Set(findings)];
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
  if (!Number.isSafeInteger(total) || total > MAX_PRISMA_INT) invalid("Total da proposta fora do limite permitido.");
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

module.exports = {
  ITEM_TYPES,
  MATERIAL_STATUSES,
  STATUSES,
  assertProposalMoneyIntegrity,
  calculateTotals,
  createCommercialProposalService,
  decimalToCentsRoundHalfUp,
  proposalMoneyIntegrityFindings,
  revalidateProposalCatalogItems,
};
