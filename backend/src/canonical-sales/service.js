const crypto = require("node:crypto");
const { domainError, isManager, notFound, requireManager } = require("../leads-communication/policy");
const {
  enumValue,
  optionalInteger,
  pagination,
  rejectEmpresaId,
  rejectUnknown,
  requiredInteger,
  requiredText,
} = require("../leads-communication/validation");
const { lockActiveClienteRow } = require("../shared/clientLifecycleLock");
const { parseNonNegativePrismaInt } = require("../shared/commercial-money");
const {
  assertProposalMoneyIntegrity,
  revalidateProposalCatalogItems,
} = require("../commercial-proposals/service");

const OPEN_STAGES = Object.freeze(["NOVO", "CONTATO", "PROPOSTA"]);
const PRIMARY_PROPOSAL_STATUSES = new Set(["RASCUNHO", "PRONTA", "ENVIADA", "ACEITA"]);
const ACCEPTABLE_PROPOSAL_STATUSES = new Set(["PRONTA", "ENVIADA"]);
const SALE_SOURCES = Object.freeze(["ACCEPTED_PROPOSAL", "MANUAL_CLOSE"]);
const CANONICAL_TRANSACTION_OPTIONS = Object.freeze({ maxWait: 5000, timeout: 30000 });

function createCanonicalSaleService({ prisma, clock = () => new Date() }) {
  async function getCommercialState(context, negocioId) {
    const business = await loadBusiness(prisma, context, negocioId, { details: true });
    return presentCommercialState(business);
  }

  async function listSales(context, negocioId) {
    await loadBusiness(prisma, context, negocioId);
    const rows = await prisma.vendaCanonica.findMany({
      where: { empresaId: context.empresaId, negocioId },
      include: saleIncludes(),
      orderBy: [{ revisao: "desc" }, { id: "desc" }],
    });
    return { data: rows.map(presentSale) };
  }

  async function listCanonicalSales(context, query = {}) {
    const body = rejectUnknown(query, ["page", "limit", "status", "clienteId", "negocioId"]);
    rejectEmpresaId(body);
    const pageData = pagination(body);
    const status = enumValue(body.status, "status", ["ACTIVE", "INVALIDATED"], { optional: true });
    const clienteId = optionalInteger(body.clienteId, "clienteId", { min: 1 });
    const negocioId = optionalInteger(body.negocioId, "negocioId", { min: 1 });
    const where = { empresaId: context.empresaId, ...(status ? { status } : {}), ...(clienteId ? { clienteId } : {}), ...(negocioId ? { negocioId } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.vendaCanonica.findMany({
        where,
        include: { ...saleIncludes(), cliente: { select: { id: true, nome: true } }, negocio: { select: { id: true, titulo: true } } },
        orderBy: [{ fechadoEm: "desc" }, { id: "desc" }],
        skip: pageData.skip,
        take: pageData.limit,
      }),
      prisma.vendaCanonica.count({ where }),
    ]);
    return { data: rows.map(presentSale), pagination: { page: pageData.page, limit: pageData.limit, total, totalPages: total ? Math.ceil(total / pageData.limit) : 0 } };
  }

  async function setPrimaryProposal(context, negocioId, input) {
    const body = rejectUnknown(input, ["propostaId", "revisao"]);
    rejectEmpresaId(body);
    const propostaId = body.propostaId === null ? null : requiredInteger(body.propostaId, "propostaId");
    const revisao = requiredInteger(body.revisao, "revisao");

    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, revisao);
      if (contract.propostaPrincipalId === propostaId) return;
      if (contract.propostaVencedoraId && contract.propostaVencedoraId !== propostaId) {
        throw conflict("WINNING_PROPOSAL_PRIMARY_LOCKED", "A proposta vencedora permanece principal ate uma substituicao explicita.");
      }

      let proposal = null;
      if (propostaId !== null) {
        proposal = await loadProposal(tx, context, propostaId, negocioId);
        if (!PRIMARY_PROPOSAL_STATUSES.has(proposal.status)) {
          throw conflict("PRIMARY_PROPOSAL_STATUS_INVALID", "A proposta nao pode ser definida como principal neste estado.");
        }
      }

      const updated = await tx.negocioContratoVenda.updateMany({
        where: { empresaId: context.empresaId, negocioId, revisao },
        data: { propostaPrincipalId: propostaId, revisao: { increment: 1 } },
      });
      if (updated.count !== 1) throw contractConflict();
      if (contract.propostaPrincipalId) {
        const previous = await tx.propostaComercial.findFirst({ where: { id: contract.propostaPrincipalId, empresaId: context.empresaId } });
        if (previous) await proposalHistory(tx, context, previous, "REMOVER_PRINCIPAL", previous.status, previous.status, null);
      }
      if (proposal) await proposalHistory(tx, context, proposal, "DEFINIR_PRINCIPAL", proposal.status, proposal.status, null);
    });
    return getCommercialState(context, negocioId);
  }

  async function acceptProposal(context, propostaId, input) {
    const body = rejectUnknown(input, ["revisao", "contratoRevisao"]);
    rejectEmpresaId(body);
    const propostaRevisao = requiredInteger(body.revisao, "revisao");
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    let negocioId;

    await canonicalTransaction(prisma, async (tx) => {
      let proposal = await loadProposal(tx, context, propostaId);
      negocioId = proposal.negocioId;
      let business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      requireOpenBusiness(business);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      proposal = await loadProposal(tx, context, propostaId, negocioId);
      business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      if (contract.propostaVencedoraId === propostaId && proposal.status === "ACEITA") return;
      requireContractRevision(contract, contratoRevisao);
      if (proposal.revisao !== propostaRevisao) throw proposalConflict();
      if (contract.propostaVencedoraId) {
        throw conflict("WINNING_PROPOSAL_EXISTS", "Ja existe uma proposta vencedora. Use a substituicao explicita.");
      }
      if (!ACCEPTABLE_PROPOSAL_STATUSES.has(proposal.status)) {
        throw conflict("PROPOSAL_ACCEPT_STATUS_INVALID", "A proposta nao pode ser aceita neste estado.");
      }
      const acceptedLegacy = await tx.propostaComercial.count({
        where: { empresaId: context.empresaId, negocioId, status: "ACEITA", id: { not: propostaId } },
      });
      if (acceptedLegacy > 0) {
        throw conflict("WINNER_RECONCILIATION_REQUIRED", "Existem propostas aceitas legadas. Reconcilie a vencedora antes de continuar.");
      }
      assertProposalMoneyIntegrity(proposal);
      const revalidation = await revalidateProposalCatalogItems(tx, context, proposal, clock());
      if (!revalidation.valid) throw conflict("PROPOSAL_REVALIDATION_REQUIRED", "A proposta precisa ser revalidada antes do aceite.", { reasons: revalidation.reasons });

      const proposalUpdated = await tx.propostaComercial.updateMany({
        where: { id: propostaId, empresaId: context.empresaId, revisao: propostaRevisao, status: proposal.status },
        data: { status: "ACEITA", revisao: { increment: 1 } },
      });
      if (proposalUpdated.count !== 1) throw proposalConflict();
      const contractUpdated = await tx.negocioContratoVenda.updateMany({
        where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, propostaVencedoraId: null },
        data: { propostaPrincipalId: propostaId, propostaVencedoraId: propostaId, revisao: { increment: 1 } },
      });
      if (contractUpdated.count !== 1) throw contractConflict();
      await proposalHistory(tx, context, proposal, "ACEITAR_COMO_VENCEDORA", proposal.status, "ACEITA", null);
    });
    return getCommercialState(context, negocioId);
  }

  async function replaceWinningProposal(context, negocioId, input) {
    const body = rejectUnknown(input, ["propostaId", "propostaRevisao", "contratoRevisao", "motivo"]);
    rejectEmpresaId(body);
    requireManager(context);
    const propostaId = requiredInteger(body.propostaId, "propostaId");
    const propostaRevisao = requiredInteger(body.propostaRevisao, "propostaRevisao");
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const motivo = requiredText(body.motivo, "motivo", 500);

    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, contratoRevisao);
      if (!contract.propostaVencedoraId) throw conflict("WINNING_PROPOSAL_MISSING", "Nao existe proposta vencedora para substituir.");
      if (contract.propostaVencedoraId === propostaId) return;
      const previous = await loadProposal(tx, context, contract.propostaVencedoraId, negocioId);
      const next = await loadProposal(tx, context, propostaId, negocioId);
      if (previous.status !== "ACEITA") throw conflict("WINNING_PROPOSAL_STATE_INVALID", "A proposta vencedora atual esta inconsistente.");
      if (next.revisao !== propostaRevisao) throw proposalConflict();
      if (!ACCEPTABLE_PROPOSAL_STATUSES.has(next.status)) throw conflict("PROPOSAL_ACCEPT_STATUS_INVALID", "A nova proposta vencedora nao pode ser aceita neste estado.");
      assertProposalMoneyIntegrity(next);
      const revalidation = await revalidateProposalCatalogItems(tx, context, next, clock());
      if (!revalidation.valid) throw conflict("PROPOSAL_REVALIDATION_REQUIRED", "A proposta precisa ser revalidada antes da substituicao.", { reasons: revalidation.reasons });

      if ((await tx.propostaComercial.updateMany({ where: { id: previous.id, empresaId: context.empresaId, status: "ACEITA", revisao: previous.revisao }, data: { status: "SUBSTITUIDA", revisao: { increment: 1 } } })).count !== 1) throw proposalConflict();
      if ((await tx.propostaComercial.updateMany({ where: { id: next.id, empresaId: context.empresaId, status: next.status, revisao: propostaRevisao }, data: { status: "ACEITA", revisao: { increment: 1 } } })).count !== 1) throw proposalConflict();
      if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, propostaVencedoraId: previous.id }, data: { propostaPrincipalId: next.id, propostaVencedoraId: next.id, revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
      await proposalHistory(tx, context, previous, "SUBSTITUIR_VENCEDORA", "ACEITA", "SUBSTITUIDA", motivo);
      await proposalHistory(tx, context, next, "SUBSTITUIR_VENCEDORA", next.status, "ACEITA", motivo);
    });
    return getCommercialState(context, negocioId);
  }

  async function reconcileLegacyWinner(context, negocioId, input) {
    const body = rejectUnknown(input, ["propostaId", "contratoRevisao", "motivo"]);
    rejectEmpresaId(body);
    requireManager(context);
    const propostaId = requiredInteger(body.propostaId, "propostaId");
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const motivo = requiredText(body.motivo, "motivo", 500);

    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, contratoRevisao);
      const target = await loadProposal(tx, context, propostaId, negocioId);
      if (target.status !== "ACEITA") throw conflict("LEGACY_WINNER_STATUS_INVALID", "A reconciliacao exige uma proposta aceita.");
      const accepted = await tx.propostaComercial.findMany({ where: { empresaId: context.empresaId, negocioId, status: "ACEITA" }, orderBy: { id: "asc" } });
      if (!accepted.some((proposal) => proposal.id === propostaId)) throw proposalConflict();
      if (contract.propostaVencedoraId === propostaId && accepted.length === 1) {
        throw conflict("WINNER_RECONCILIATION_NOT_REQUIRED", "A proposta escolhida ja e a unica vencedora ativa.");
      }
      for (const proposal of accepted.filter((item) => item.id !== propostaId)) {
        if ((await tx.propostaComercial.updateMany({ where: { id: proposal.id, empresaId: context.empresaId, status: "ACEITA", revisao: proposal.revisao }, data: { status: "SUBSTITUIDA", revisao: { increment: 1 } } })).count !== 1) throw proposalConflict();
        await proposalHistory(tx, context, proposal, "RECONCILIAR_VENCEDORA", "ACEITA", "SUBSTITUIDA", motivo);
      }
      if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, propostaVencedoraId: contract.propostaVencedoraId }, data: { propostaPrincipalId: propostaId, propostaVencedoraId: propostaId, revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
      await proposalHistory(tx, context, target, "RECONCILIAR_VENCEDORA", "ACEITA", "ACEITA", motivo);
    });
    return getCommercialState(context, negocioId);
  }

  async function removeWinningProposal(context, negocioId, input) {
    const body = rejectUnknown(input, ["contratoRevisao", "motivo"]);
    rejectEmpresaId(body);
    requireManager(context);
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const motivo = requiredText(body.motivo, "motivo", 500);

    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, contratoRevisao);
      if (!contract.propostaVencedoraId) return;
      const proposal = await loadProposal(tx, context, contract.propostaVencedoraId, negocioId);
      if (proposal.status !== "ACEITA") throw conflict("WINNING_PROPOSAL_STATE_INVALID", "A proposta vencedora atual esta inconsistente.");
      if ((await tx.propostaComercial.updateMany({ where: { id: proposal.id, empresaId: context.empresaId, status: "ACEITA", revisao: proposal.revisao }, data: { status: "SUBSTITUIDA", revisao: { increment: 1 } } })).count !== 1) throw proposalConflict();
      if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, propostaVencedoraId: proposal.id }, data: { propostaVencedoraId: null, ...(contract.propostaPrincipalId === proposal.id ? { propostaPrincipalId: null } : {}), revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
      await proposalHistory(tx, context, proposal, "REMOVER_VENCEDORA", "ACEITA", "SUBSTITUIDA", motivo);
    });
    return getCommercialState(context, negocioId);
  }

  async function closeDealAsWon(context, negocioId, input) {
    const body = rejectUnknown(input, ["origem", "idempotencyKey", "contratoRevisao", "valorFinalCentavos"]);
    rejectEmpresaId(body);
    const origem = enumValue(body.origem, "origem", SALE_SOURCES);
    const idempotencyKey = idempotencyText(body.idempotencyKey);
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const manualValue = origem === "MANUAL_CLOSE" ? requiredMoney(body.valorFinalCentavos, "valorFinalCentavos") : null;
    let replayed = false;

    try {
      await canonicalTransaction(prisma, async (tx) => {
        let business = await loadBusiness(tx, context, negocioId);
        requireBusinessWrite(context, business);
        await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
        business = await loadBusiness(tx, context, negocioId);
        requireBusinessWrite(context, business);
        const existing = await tx.vendaCanonica.findFirst({ where: { empresaId: context.empresaId, idempotencyKey } });
        if (existing) {
          assertIdempotentReplay(existing, { negocioId, origem, contratoRevisao, manualValue });
          if (existing.status !== "ACTIVE") {
            throw conflict("IDEMPOTENCY_KEY_REPLAY_INVALIDATED", "A venda associada a esta chave foi invalidada; use uma nova chave para um novo fechamento.");
          }
          replayed = true;
          return;
        }
        requireOpenBusiness(business);
        const contract = await ensureContract(tx, business);
        requireContractRevision(contract, contratoRevisao);
        if (contract.vendaAtivaId) throw conflict("ACTIVE_SALE_EXISTS", "O Negocio ja possui venda ativa.");

        let winner = null;
        let totals;
        if (origem === "ACCEPTED_PROPOSAL") {
          if (!contract.propostaVencedoraId) throw conflict("WINNING_PROPOSAL_REQUIRED", "Defina uma proposta vencedora antes do fechamento.");
          winner = await loadProposal(tx, context, contract.propostaVencedoraId, negocioId);
          if (winner.status !== "ACEITA") throw conflict("WINNING_PROPOSAL_STATE_INVALID", "A proposta vencedora precisa estar aceita.");
          await requireNoOtherAcceptedProposal(tx, context.empresaId, negocioId, winner.id);
          if (winner.moeda !== "BRL") throw conflict("SALE_CURRENCY_INVALID", "A Venda Canônica V1 aceita somente BRL.");
          assertProposalMoneyIntegrity(winner);
          totals = { subtotalCentavos: winner.subtotalCentavos, descontoCentavos: winner.descontoGeralCentavos, totalCentavos: winner.totalCentavos };
        } else {
          if (contract.propostaVencedoraId) throw conflict("MANUAL_CLOSE_WINNER_CONFLICT", "Remova a proposta vencedora antes do fechamento manual.");
          await requireNoUnreconciledAcceptedProposal(tx, context.empresaId, negocioId);
          totals = { subtotalCentavos: manualValue, descontoCentavos: 0, totalCentavos: manualValue };
        }
        const lastSale = await tx.vendaCanonica.aggregate({ where: { empresaId: context.empresaId, negocioId }, _max: { revisao: true } });
        const saleRevision = Number(lastSale._max.revisao || 0) + 1;
        const fingerprint = saleFingerprint({ negocioId, origem, contratoRevisao, manualValue, winningProposalId: winner?.id || null });
        const now = clock();
        const sale = await tx.vendaCanonica.create({
          data: {
            empresaId: context.empresaId,
            negocioId,
            clienteId: business.clienteId,
            origem,
            propostaVencedoraId: winner?.id || null,
            subtotalCentavos: totals.subtotalCentavos,
            descontoCentavos: totals.descontoCentavos,
            totalCentavos: totals.totalCentavos,
            propostaRevisao: winner?.revisao || null,
            etapaAbertaAnterior: business.etapa,
            revisao: saleRevision,
            idempotencyKey,
            requestFingerprint: fingerprint,
            fechadoEm: now,
            fechadoPorId: context.usuarioId,
          },
        });
        if (winner?.itens?.length) {
          await tx.itemVendaCanonica.createMany({ data: winner.itens.map((item) => saleItemData(context.empresaId, sale.id, item)) });
        }
        await tx.historicoVendaCanonica.create({ data: { empresaId: context.empresaId, vendaId: sale.id, negocioId, autorId: context.usuarioId, acao: "CREATE", statusNovo: "ACTIVE" } });
        if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, vendaAtivaId: null }, data: { vendaAtivaId: sale.id, revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
        const effectiveEntry = business.etapaEntrouEm || business.updatedAt || business.createdAt;
        if ((await tx.negocio.updateMany({ where: { id: negocioId, empresaId: context.empresaId, etapa: business.etapa, cliente: { arquivadoEm: null } }, data: { etapa: "FECHADO", etapaEntrouEm: now, ultimaMovimentacaoEm: now, fechadoEm: now, perdidoEm: null } })).count !== 1) throw businessConflict();
        await stageHistory(tx, context, business, "FECHADO", effectiveEntry, now, null);
      });
    } catch (error) {
      if (error?.code === "P2002" || error?.code === "P2028" || error?.code === "P2034") {
        const existing = await prisma.vendaCanonica.findFirst({ where: { empresaId: context.empresaId, idempotencyKey } });
        if (existing) {
          assertIdempotentReplay(existing, { negocioId, origem, contratoRevisao, manualValue });
          if (existing.status !== "ACTIVE") {
            throw conflict("IDEMPOTENCY_KEY_REPLAY_INVALIDATED", "A venda associada a esta chave foi invalidada; use uma nova chave para um novo fechamento.");
          }
          replayed = true;
        } else {
          throw conflict("CONCURRENT_DEAL_CLOSE", "Outra operacao concluiu este Negocio primeiro.");
        }
      } else {
        throw error;
      }
    }
    return { ...(await getCommercialState(context, negocioId)), idempotentReplay: replayed };
  }

  async function markDealAsLost(context, negocioId, input) {
    const body = rejectUnknown(input, ["contratoRevisao", "motivo"]);
    rejectEmpresaId(body);
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const motivo = requiredText(body.motivo, "motivo", 500);
    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      requireBusinessWrite(context, business);
      requireOpenBusiness(business);
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, contratoRevisao);
      if (contract.vendaAtivaId) throw conflict("ACTIVE_SALE_EXISTS", "Um Negocio com venda ativa nao pode ser marcado como perdido.");
      if (contract.propostaVencedoraId) throw conflict("WINNING_PROPOSAL_ACTIVE", "Remova a proposta vencedora antes de marcar o Negocio como perdido.");
      await requireNoUnreconciledAcceptedProposal(tx, context.empresaId, negocioId);
      const now = clock();
      const effectiveEntry = business.etapaEntrouEm || business.updatedAt || business.createdAt;
      if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao }, data: { revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
      if ((await tx.negocio.updateMany({ where: { id: negocioId, empresaId: context.empresaId, etapa: business.etapa, cliente: { arquivadoEm: null } }, data: { etapa: "PERDIDO", etapaEntrouEm: now, ultimaMovimentacaoEm: now, perdidoEm: now, fechadoEm: null, motivoPerda: motivo } })).count !== 1) throw businessConflict();
      await stageHistory(tx, context, business, "PERDIDO", effectiveEntry, now, motivo);
    });
    return getCommercialState(context, negocioId);
  }

  async function reopenDeal(context, negocioId, input) {
    const body = rejectUnknown(input, ["contratoRevisao", "motivo"]);
    rejectEmpresaId(body);
    requireManager(context);
    const contratoRevisao = requiredInteger(body.contratoRevisao, "contratoRevisao");
    const motivo = requiredText(body.motivo, "motivo", 500);
    await canonicalTransaction(prisma, async (tx) => {
      let business = await loadBusiness(tx, context, negocioId);
      if (!["FECHADO", "PERDIDO"].includes(business.etapa)) throw conflict("DEAL_NOT_TERMINAL", "Somente Negocios ganhos ou perdidos podem ser reabertos.");
      await lockActiveClienteRow(tx, context.empresaId, business.clienteId);
      business = await loadBusiness(tx, context, negocioId);
      if (!["FECHADO", "PERDIDO"].includes(business.etapa)) throw conflict("DEAL_NOT_TERMINAL", "Somente Negocios ganhos ou perdidos podem ser reabertos.");
      const contract = await ensureContract(tx, business);
      requireContractRevision(contract, contratoRevisao);
      const now = clock();
      let targetStage;
      if (business.etapa === "FECHADO") {
        if (!contract.vendaAtivaId) throw conflict("ACTIVE_SALE_MISSING", "O Negocio ganho nao possui venda ativa.");
        const sale = await tx.vendaCanonica.findFirst({ where: { id: contract.vendaAtivaId, empresaId: context.empresaId, negocioId, status: "ACTIVE" } });
        if (!sale) throw conflict("ACTIVE_SALE_MISSING", "A venda ativa nao foi encontrada.");
        targetStage = sale.etapaAbertaAnterior;
        if ((await tx.vendaCanonica.updateMany({ where: { id: sale.id, empresaId: context.empresaId, negocioId, status: "ACTIVE", invalidadoEm: null }, data: { status: "INVALIDATED", invalidadoEm: now, invalidadoPorId: context.usuarioId, motivoInvalidacao: motivo } })).count !== 1) throw conflict("SALE_REOPEN_CONFLICT", "A venda foi alterada por outra operacao.");
        await tx.historicoVendaCanonica.create({ data: { empresaId: context.empresaId, vendaId: sale.id, negocioId, autorId: context.usuarioId, acao: "INVALIDATE", statusAnterior: "ACTIVE", statusNovo: "INVALIDATED", motivo } });
      } else {
        if (contract.vendaAtivaId) throw conflict("ACTIVE_SALE_LOST_CONFLICT", "Negocio perdido nao pode possuir venda ativa.");
        const lastLoss = await tx.historicoAtribuicao.findFirst({ where: { empresaId: context.empresaId, negocioId, tipo: "MOVIMENTAR_ETAPA", etapaNova: "PERDIDO" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        const currentLossAt = business.etapaEntrouEm || business.perdidoEm;
        const recordedLossAt = lastLoss?.etapaSaiuEm;
        if (!OPEN_STAGES.includes(lastLoss?.etapaAnterior)
          || !currentLossAt
          || !recordedLossAt
          || new Date(recordedLossAt).getTime() !== new Date(currentLossAt).getTime()) {
          throw conflict("LOST_REOPEN_HISTORY_INVALID", "O Negocio perdido nao possui historico valido da etapa aberta anterior.");
        }
        targetStage = lastLoss.etapaAnterior;
      }
      if ((await tx.negocioContratoVenda.updateMany({ where: { empresaId: context.empresaId, negocioId, revisao: contratoRevisao, vendaAtivaId: contract.vendaAtivaId }, data: { vendaAtivaId: null, revisao: { increment: 1 } } })).count !== 1) throw contractConflict();
      const effectiveEntry = business.etapaEntrouEm || business.updatedAt || business.createdAt;
      if ((await tx.negocio.updateMany({ where: { id: negocioId, empresaId: context.empresaId, etapa: business.etapa, cliente: { arquivadoEm: null } }, data: { etapa: targetStage, etapaEntrouEm: now, ultimaMovimentacaoEm: now, fechadoEm: null, perdidoEm: null, motivoPerda: null } })).count !== 1) throw businessConflict();
      await stageHistory(tx, context, business, targetStage, effectiveEntry, now, motivo);
    });
    return getCommercialState(context, negocioId);
  }

  return {
    acceptProposal,
    closeDealAsWon,
    getCommercialState,
    listSales,
    listCanonicalSales,
    markDealAsLost,
    reconcileLegacyWinner,
    removeWinningProposal,
    reopenDeal,
    replaceWinningProposal,
    setPrimaryProposal,
  };
}

async function loadBusiness(client, context, id, { details = false } = {}) {
  const business = await client.negocio.findFirst({
    where: { id, empresaId: context.empresaId, cliente: { arquivadoEm: null } },
    include: {
      cliente: { select: { id: true, empresaId: true, nome: true, arquivadoEm: true } },
      responsavel: { select: { id: true, empresaId: true, nome: true } },
      contratoVenda: details ? {
        include: {
          propostaPrincipal: { select: proposalSummarySelect() },
          propostaVencedora: { select: proposalSummarySelect() },
          vendaAtiva: { include: saleIncludes() },
        },
      } : true,
      ...(details ? { vendasCanonicas: { include: saleIncludes(), orderBy: [{ revisao: "desc" }, { id: "desc" }], take: 20 } } : {}),
      ...(details ? { propostasComerciais: { where: { status: "ACEITA" }, select: { id: true } } } : {}),
    },
  });
  if (!business) throw notFound("Negocio nao encontrado.");
  if (business.empresaId !== context.empresaId || business.cliente.empresaId !== context.empresaId || (business.responsavel && business.responsavel.empresaId !== context.empresaId)) {
    throw conflict("DEAL_CONTEXT_CONFLICT", "Contexto comercial inconsistente.");
  }
  return business;
}

async function loadProposal(client, context, id, negocioId) {
  const proposal = await client.propostaComercial.findFirst({
    where: { id, empresaId: context.empresaId },
    include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] }, cliente: { select: { id: true, empresaId: true, arquivadoEm: true } }, negocio: { select: { id: true, empresaId: true, clienteId: true, responsavelId: true } } },
  });
  if (!proposal || (negocioId !== undefined && proposal.negocioId !== negocioId)) throw notFound("Proposta nao encontrada.");
  if (proposal.empresaId !== context.empresaId || proposal.cliente.empresaId !== context.empresaId || proposal.negocio.empresaId !== context.empresaId || proposal.clienteId !== proposal.negocio.clienteId || proposal.cliente.arquivadoEm) {
    throw conflict("PROPOSAL_CONTEXT_CONFLICT", "Contexto comercial inconsistente.");
  }
  return proposal;
}

async function ensureContract(client, business) {
  await client.negocioContratoVenda.upsert({
    where: { empresaId_negocioId: { empresaId: business.empresaId, negocioId: business.id } },
    create: { empresaId: business.empresaId, negocioId: business.id },
    update: {},
  });
  return client.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: business.empresaId, negocioId: business.id } } });
}

function canonicalTransaction(prisma, operation) {
  return prisma.$transaction(operation, CANONICAL_TRANSACTION_OPTIONS);
}

async function requireNoUnreconciledAcceptedProposal(client, empresaId, negocioId) {
  const accepted = await client.propostaComercial.count({ where: { empresaId, negocioId, status: "ACEITA" } });
  if (accepted > 0) {
    throw conflict("WINNER_RECONCILIATION_REQUIRED", "Existe proposta aceita sem vencedora reconciliada.");
  }
}

async function requireNoOtherAcceptedProposal(client, empresaId, negocioId, winnerId) {
  const acceptedOthers = await client.propostaComercial.count({
    where: { empresaId, negocioId, status: "ACEITA", id: { not: winnerId } },
  });
  if (acceptedOthers > 0) {
    throw conflict("WINNER_RECONCILIATION_REQUIRED", "Existem propostas aceitas concorrentes. Reconcilie a vencedora antes do fechamento.");
  }
}

function requireBusinessWrite(context, business) {
  if (!isManager(context) && business.responsavelId !== context.usuarioId) {
    throw domainError(403, "CANONICAL_SALE_FORBIDDEN", "Acesso negado.");
  }
}

function requireOpenBusiness(business) {
  if (!OPEN_STAGES.includes(business.etapa)) throw conflict("DEAL_NOT_OPEN", "O Negocio precisa estar aberto.");
}

function requireContractRevision(contract, revision) {
  if (contract.revisao !== revision) throw contractConflict();
}

async function proposalHistory(tx, context, proposal, acao, statusAnterior, statusNovo, observacao) {
  await tx.historicoPropostaComercial.create({ data: { empresaId: context.empresaId, propostaId: proposal.id, autorId: context.usuarioId, acao, statusAnterior, statusNovo, versao: proposal.versao, observacao } });
}

async function stageHistory(tx, context, business, nextStage, effectiveEntry, now, motivo) {
  await tx.historicoAtribuicao.create({
    data: {
      empresaId: context.empresaId,
      negocioId: business.id,
      alteradoPorId: context.usuarioId,
      tipo: "MOVIMENTAR_ETAPA",
      origem: "MANUAL",
      etapaAnterior: business.etapa,
      etapaNova: nextStage,
      etapaEntrouEm: effectiveEntry,
      etapaSaiuEm: now,
      duracaoEtapaSegundos: elapsedSeconds(effectiveEntry, now),
      duracaoEtapaEstimada: !business.etapaEntrouEm,
      motivo,
    },
  });
}

function saleItemData(empresaId, vendaId, item) {
  return {
    empresaId,
    vendaId,
    propostaIdOriginal: item.propostaId,
    propostaItemId: item.id,
    itemTypeOriginal: item.itemType,
    productOfferIdOriginal: item.productOfferId,
    catalogProductIdOriginal: item.catalogProductId,
    stockProductIdOriginal: item.stockProductId,
    descricao: item.descricao,
    productNameSnapshot: item.productNameSnapshot,
    skuSnapshot: item.skuSnapshot,
    unitSnapshot: item.unitSnapshot,
    quantidade: item.quantidade,
    valorUnitarioCentavos: item.valorUnitarioCentavos,
    descontoCentavos: item.descontoCentavos,
    subtotalCentavos: item.subtotalCentavos,
    totalCentavos: item.totalCentavos,
    catalogRevision: item.catalogRevision,
    stockMaterialVersion: item.stockMaterialVersion,
    ordem: item.ordem,
  };
}

function assertIdempotentReplay(existing, input) {
  const expected = saleFingerprint({
    negocioId: input.negocioId,
    origem: input.origem,
    contratoRevisao: input.contratoRevisao,
    manualValue: input.manualValue,
    winningProposalId: existing.propostaVencedoraId,
  });
  if (existing.negocioId !== input.negocioId || existing.origem !== input.origem || existing.requestFingerprint !== expected) {
    throw conflict("IDEMPOTENCY_KEY_REUSED", "A chave de idempotencia ja foi usada por outra operacao.");
  }
}

function saleFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify({
    negocioId: value.negocioId,
    origem: value.origem,
    contratoRevisao: value.contratoRevisao,
    propostaVencedoraId: value.winningProposalId,
    valorFinalCentavos: value.manualValue,
  })).digest("hex");
}

function idempotencyText(value) {
  if (typeof value !== "string") throw validation("idempotencyKey obrigatoria.");
  const text = value.trim();
  if (text.length < 8 || text.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(text)) throw validation("idempotencyKey invalida.");
  return text;
}

function requiredMoney(value, field) {
  const parsed = parseNonNegativePrismaInt(value);
  if (parsed === null) throw validation(`${field} invalido ou fora do limite permitido.`);
  return parsed;
}

function presentCommercialState(business) {
  const integridade = assertCommercialPointers(business);
  const contract = business.contratoVenda || null;
  return {
    negocio: {
      id: business.id,
      clienteId: business.clienteId,
      titulo: business.titulo,
      etapa: business.etapa,
      valorEstimadoLegado: business.valor === null || business.valor === undefined ? null : Number(business.valor),
      fechadoEm: business.fechadoEm,
      perdidoEm: business.perdidoEm,
      motivoPerda: business.motivoPerda,
      responsavel: business.responsavel ? { id: business.responsavel.id, nome: business.responsavel.nome } : null,
      integridadeComercial: integridade,
    },
    contrato: {
      revisao: contract?.revisao || 1,
      propostaPrincipalId: contract?.propostaPrincipalId || null,
      propostaVencedoraId: contract?.propostaVencedoraId || null,
      vendaAtivaId: contract?.vendaAtivaId || null,
      propostaPrincipal: contract?.propostaPrincipal ? withoutTenant(contract.propostaPrincipal) : null,
      propostaVencedora: contract?.propostaVencedora ? withoutTenant(contract.propostaVencedora) : null,
      vendaAtiva: contract?.vendaAtiva ? presentSale(contract.vendaAtiva) : null,
      propostasAceitasCount: business.propostasComerciais?.length || 0,
    },
    vendas: (business.vendasCanonicas || []).map(presentSale),
  };
}

function presentSale(sale) {
  assertSaleSnapshotIntegrity(sale);
  const { empresaId: _empresaId, idempotencyKey: _idempotencyKey, requestFingerprint: _requestFingerprint, ...safe } = sale;
  return {
    ...safe,
    itens: (sale.itens || []).map(withoutTenant),
    historico: (sale.historico || []).map((entry) => ({ ...withoutTenant(entry), autor: entry.autor ? withoutTenant(entry.autor) : null })),
    fechadoPor: sale.fechadoPor ? withoutTenant(sale.fechadoPor) : null,
    invalidadoPor: sale.invalidadoPor ? withoutTenant(sale.invalidadoPor) : null,
    propostaVencedora: sale.propostaVencedora ? withoutTenant(sale.propostaVencedora) : null,
  };
}

function proposalSummarySelect() {
  return { id: true, codigo: true, titulo: true, status: true, totalCentavos: true, moeda: true, revisao: true, versao: true, clienteId: true };
}

function saleIncludes() {
  return {
    itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
    historico: { include: { autor: { select: { id: true, nome: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    fechadoPor: { select: { id: true, nome: true } },
    invalidadoPor: { select: { id: true, nome: true } },
    propostaVencedora: { select: proposalSummarySelect() },
  };
}

function assertCommercialPointers(business) {
  const contract = business.contratoVenda || null;
  if (!contract) return business.etapa === "FECHADO" ? "LEGACY_WON_UNRECONCILED" : "OK";
  if (contract.propostaPrincipalId) {
    if (!contract.propostaPrincipal || !PRIMARY_PROPOSAL_STATUSES.has(contract.propostaPrincipal.status)) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A proposta principal persistida esta inconsistente.");
    }
    if (contract.propostaPrincipal.clienteId !== undefined && contract.propostaPrincipal.clienteId !== business.clienteId) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A proposta principal pertence a outro Cliente.");
    }
  }
  if (contract.propostaVencedoraId) {
    if (!contract.propostaVencedora || contract.propostaVencedora.status !== "ACEITA") {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A proposta vencedora persistida esta inconsistente.");
    }
    if (contract.propostaPrincipalId !== contract.propostaVencedoraId) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A proposta vencedora precisa permanecer principal.");
    }
    if (contract.propostaVencedora.clienteId !== undefined && contract.propostaVencedora.clienteId !== business.clienteId) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A proposta vencedora pertence a outro Cliente.");
    }
  }
  if (contract.vendaAtivaId) {
    const sale = contract.vendaAtiva;
    if (!sale || sale.id !== contract.vendaAtivaId || sale.status !== "ACTIVE" || business.etapa !== "FECHADO") {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "O ponteiro de venda ativa esta inconsistente.");
    }
    if (sale.negocioId !== undefined && sale.negocioId !== business.id) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A venda ativa pertence a outro Negocio.");
    }
    if (sale.clienteId !== undefined && sale.clienteId !== business.clienteId) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A venda ativa pertence a outro Cliente.");
    }
    if (sale.propostaVencedoraId !== contract.propostaVencedoraId) {
      throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "A origem da venda ativa diverge da proposta vencedora.");
    }
  } else if (business.etapa === "FECHADO") {
    return "LEGACY_WON_UNRECONCILED";
  }
  if (business.etapa === "PERDIDO" && (contract.vendaAtivaId || contract.propostaVencedoraId)) {
    throw conflict("COMMERCIAL_POINTER_INTEGRITY_ERROR", "O Negocio perdido possui ponteiros comerciais ativos.");
  }
  return "OK";
}

function assertSaleSnapshotIntegrity(sale) {
  if (!sale || sale.moeda !== "BRL" || !OPEN_STAGES.includes(sale.etapaAbertaAnterior)) {
    throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "O snapshot da venda esta inconsistente.");
  }
  const subtotal = Number(sale.subtotalCentavos);
  const discount = Number(sale.descontoCentavos);
  const total = Number(sale.totalCentavos);
  if (![subtotal, discount, total].every((value) => Number.isInteger(value) && value >= 0)
    || discount > subtotal || total !== subtotal - discount) {
    throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "Os totais do snapshot da venda estao inconsistentes.");
  }
  const items = sale.itens || [];
  if (sale.origem === "MANUAL_CLOSE") {
    if (sale.propostaVencedoraId !== null || sale.propostaRevisao !== null || discount !== 0 || subtotal !== total || items.length > 0) {
      throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "O snapshot do fechamento manual esta inconsistente.");
    }
  } else if (sale.origem === "ACCEPTED_PROPOSAL") {
    if (!sale.propostaVencedoraId || !sale.propostaRevisao) {
      throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "O snapshot da proposta vencedora esta incompleto.");
    }
    for (const item of items) {
      if (item.empresaId !== sale.empresaId || item.vendaId !== sale.id
        || item.propostaIdOriginal !== sale.propostaVencedoraId || !item.propostaItemId
        || item.moeda !== "BRL" || item.totalCentavos !== item.subtotalCentavos - item.descontoCentavos) {
        throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "Um item do snapshot esta inconsistente.");
      }
    }
  } else {
    throw conflict("CANONICAL_SALE_INTEGRITY_ERROR", "A origem do snapshot da venda e invalida.");
  }
  return true;
}

function withoutTenant(value) {
  if (!value || typeof value !== "object") return value;
  const { empresaId: _empresaId, ...safe } = value;
  return safe;
}

function elapsedSeconds(start, end) {
  const left = new Date(start).getTime();
  const right = new Date(end).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.max(0, Math.floor((right - left) / 1000));
}

function validation(message) {
  return domainError(400, "CANONICAL_SALE_VALIDATION_ERROR", message);
}

function conflict(code, message, details) {
  return domainError(409, code, message, details);
}

function proposalConflict() {
  return conflict("PROPOSAL_REVISION_CONFLICT", "A proposta foi alterada por outra operacao.");
}

function contractConflict() {
  return conflict("SALE_CONTRACT_REVISION_CONFLICT", "O contrato comercial foi alterado por outra operacao.");
}

function businessConflict() {
  return conflict("NEGOCIO_STAGE_CONFLICT", "O Negocio foi alterado por outra operacao.");
}

module.exports = {
  ACCEPTABLE_PROPOSAL_STATUSES,
  OPEN_STAGES,
  PRIMARY_PROPOSAL_STATUSES,
  assertCommercialPointers,
  assertSaleSnapshotIntegrity,
  createCanonicalSaleService,
  saleFingerprint,
};
