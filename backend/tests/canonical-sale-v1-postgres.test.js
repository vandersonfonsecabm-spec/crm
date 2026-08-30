const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createCanonicalSaleService } = require("../src/canonical-sales/service");
const { createNegociosKanbanServices } = require("../src/negocios-kanban/services");

let prismaA;
let prismaB;
let company;
let actor;
let client;
let context;
const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

before(async () => {
  const url = requiredPostgresUrl();
  prismaA = new PrismaClient({ datasourceUrl: url });
  prismaB = new PrismaClient({ datasourceUrl: url });
  await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  company = await prismaA.empresa.create({ data: { nome: `Canonical PG ${suffix}`, slug: `canonical-pg-${suffix}` } });
  actor = await prismaA.usuario.create({ data: { empresaId: company.id, nome: "Admin Canonical PG", email: `admin-${suffix}@canonical-pg.test`, senhaHash: "hash-sintetico", papel: "ADMIN" } });
  client = await prismaA.cliente.create({ data: { empresaId: company.id, nome: "Cliente Canonical PG", origem: "QA PostgreSQL" } });
  context = { empresaId: company.id, usuarioId: actor.id, papel: "ADMIN" };
});

after(async () => {
  await Promise.allSettled([prismaA?.$disconnect(), prismaB?.$disconnect()]);
});

test("PostgreSQL converge close/accept/update concorrentes sem venda duplicada", async () => {
  const salesA = createCanonicalSaleService({ prisma: prismaA });
  const salesB = createCanonicalSaleService({ prisma: prismaB });
  const kanban = createNegociosKanbanServices({ prisma: prismaA });

  const manualBusiness = await createBusiness("Manual concorrente", "PROPOSTA");
  const closeResults = await Promise.allSettled([
    salesA.closeDealAsWon(context, manualBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-close-a-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 120000 }),
    salesB.closeDealAsWon(context, manualBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-close-b-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 120000 }),
  ]);
  assert.equal(closeResults.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(closeResults));
  assert.equal(closeResults.filter((result) => result.status === "rejected").length, 1, JSON.stringify(closeResults));
  const activeSales = await prismaA.vendaCanonica.findMany({ where: { empresaId: company.id, negocioId: manualBusiness.id, status: "ACTIVE" } });
  assert.equal(activeSales.length, 1);
  const replay = await salesA.closeDealAsWon(context, manualBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: activeSales[0].idempotencyKey, contratoRevisao: 1, valorFinalCentavos: 120000 });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.contrato.vendaAtiva.id, activeSales[0].id);

  const sameKeyBusiness = await createBusiness("Mesma chave concorrente", "PROPOSTA");
  const sameKeyPayload = { origem: "MANUAL_CLOSE", idempotencyKey: `pg-same-key-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 32100 };
  const sameKeyResults = await Promise.allSettled([
    salesA.closeDealAsWon(context, sameKeyBusiness.id, sameKeyPayload),
    salesB.closeDealAsWon(context, sameKeyBusiness.id, sameKeyPayload),
  ]);
  assert.equal(sameKeyResults.filter((result) => result.status === "fulfilled").length, 2, JSON.stringify(sameKeyResults));
  assert.equal(await prismaA.vendaCanonica.count({ where: { empresaId: company.id, negocioId: sameKeyBusiness.id } }), 1);
  assert.equal(sameKeyResults.filter((result) => result.status === "fulfilled" && result.value.idempotentReplay).length, 1);
  await assert.rejects(
    salesA.closeDealAsWon(context, sameKeyBusiness.id, { ...sameKeyPayload, valorFinalCentavos: 32101 }),
    (error) => error?.codigo === "IDEMPOTENCY_KEY_REUSED",
  );

  const proposalBusiness = await createBusiness("Aceite concorrente", "PROPOSTA");
  const [proposalA, proposalB] = await Promise.all([
    createReadyProposal(proposalBusiness.id, "A"),
    createReadyProposal(proposalBusiness.id, "B"),
  ]);
  const acceptResults = await Promise.allSettled([
    salesA.acceptProposal(context, proposalA.id, { revisao: proposalA.revisao, contratoRevisao: 1 }),
    salesB.acceptProposal(context, proposalB.id, { revisao: proposalB.revisao, contratoRevisao: 1 }),
  ]);
  assert.equal(acceptResults.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(acceptResults));
  assert.equal(acceptResults.filter((result) => result.status === "rejected").length, 1, JSON.stringify(acceptResults));
  const proposalContract = await prismaA.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: company.id, negocioId: proposalBusiness.id } } });
  assert.ok([proposalA.id, proposalB.id].includes(proposalContract.propostaVencedoraId));
  assert.equal(await prismaA.propostaComercial.count({ where: { empresaId: company.id, negocioId: proposalBusiness.id, status: "ACEITA" } }), 1);

  const acceptCloseBusiness = await createBusiness("Aceite versus fechamento", "PROPOSTA");
  const acceptCloseProposal = await createReadyProposal(acceptCloseBusiness.id, "AC");
  const acceptVsClose = await Promise.allSettled([
    salesA.acceptProposal(context, acceptCloseProposal.id, { revisao: acceptCloseProposal.revisao, contratoRevisao: 1 }),
    salesB.closeDealAsWon(context, acceptCloseBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-accept-close-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 77700 }),
  ]);
  assert.equal(acceptVsClose.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(acceptVsClose));
  const acceptCloseStage = (await prismaA.negocio.findUnique({ where: { id: acceptCloseBusiness.id } })).etapa;
  const acceptCloseSales = await prismaA.vendaCanonica.count({ where: { empresaId: company.id, negocioId: acceptCloseBusiness.id, status: "ACTIVE" } });
  const acceptCloseWinners = await prismaA.propostaComercial.count({ where: { empresaId: company.id, negocioId: acceptCloseBusiness.id, status: "ACEITA" } });
  if (acceptCloseStage === "FECHADO") {
    assert.equal(acceptCloseSales, 1);
    assert.equal(acceptCloseWinners, 0);
  } else {
    assert.equal(acceptCloseStage, "PROPOSTA");
    assert.equal(acceptCloseSales, 0);
    assert.equal(acceptCloseWinners, 1);
  }

  const replaceCloseBusiness = await createBusiness("Substituicao versus fechamento", "PROPOSTA");
  const replaceProposalA = await createReadyProposal(replaceCloseBusiness.id, "RA");
  const replaceProposalB = await createReadyProposal(replaceCloseBusiness.id, "RB");
  await salesA.acceptProposal(context, replaceProposalA.id, { revisao: replaceProposalA.revisao, contratoRevisao: 1 });
  const replaceVsClose = await Promise.allSettled([
    salesA.replaceWinningProposal(context, replaceCloseBusiness.id, { propostaId: replaceProposalB.id, propostaRevisao: replaceProposalB.revisao, contratoRevisao: 2, motivo: "Corrida PostgreSQL de substituicao" }),
    salesB.closeDealAsWon(context, replaceCloseBusiness.id, { origem: "ACCEPTED_PROPOSAL", idempotencyKey: `pg-replace-close-${suffix}`, contratoRevisao: 2 }),
  ]);
  assert.equal(replaceVsClose.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(replaceVsClose));
  const replaceCloseState = await salesA.getCommercialState(context, replaceCloseBusiness.id);
  if (replaceCloseState.negocio.etapa === "FECHADO") {
    assert.equal(replaceCloseState.contrato.vendaAtiva.propostaVencedoraId, replaceProposalA.id);
  } else {
    assert.equal(replaceCloseState.contrato.propostaVencedoraId, replaceProposalB.id);
    assert.equal(replaceCloseState.contrato.vendaAtivaId, null);
  }

  const updateBusiness = await createBusiness("Update versus close", "PROPOSTA");
  const updateVsClose = await Promise.allSettled([
    kanban.updateBusinessStage(context, updateBusiness.id, { etapa: "CONTATO", etapaAnterior: "PROPOSTA" }),
    salesB.closeDealAsWon(context, updateBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-update-close-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 99000 }),
  ]);
  assert.equal(updateVsClose.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(updateVsClose));
  assert.equal(updateVsClose.filter((result) => result.status === "rejected").length, 1, JSON.stringify(updateVsClose));
  const updateStage = (await prismaA.negocio.findUnique({ where: { id: updateBusiness.id } })).etapa;
  const updateSales = await prismaA.vendaCanonica.findMany({ where: { empresaId: company.id, negocioId: updateBusiness.id, status: "ACTIVE" } });
  const updateContract = await prismaA.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: company.id, negocioId: updateBusiness.id } } });
  if (updateStage === "CONTATO") {
    assert.equal(updateSales.length, 0);
    assert.equal(updateContract.vendaAtivaId, null);
  } else {
    assert.equal(updateStage, "FECHADO");
    assert.equal(updateSales.length, 1);
    assert.equal(updateContract.vendaAtivaId, updateSales[0].id);
  }

  const reopenBusiness = await createBusiness("Reopen versus close", "PROPOSTA");
  const closedForReopen = await salesA.closeDealAsWon(context, reopenBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-reopen-seed-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 88000 });
  const reopenVsClose = await Promise.allSettled([
    salesA.reopenDeal(context, reopenBusiness.id, { contratoRevisao: closedForReopen.contrato.revisao, motivo: "Reabertura concorrente PostgreSQL" }),
    salesB.closeDealAsWon(context, reopenBusiness.id, { origem: "MANUAL_CLOSE", idempotencyKey: `pg-reopen-close-${suffix}`, contratoRevisao: closedForReopen.contrato.revisao, valorFinalCentavos: 88000 }),
  ]);
  assert.equal(reopenVsClose.filter((result) => result.status === "fulfilled").length, 1, JSON.stringify(reopenVsClose));
  const reopenedBusiness = await prismaA.negocio.findUnique({ where: { id: reopenBusiness.id } });
  assert.equal(reopenedBusiness.etapa, "PROPOSTA");
  assert.equal(await prismaA.vendaCanonica.count({ where: { empresaId: company.id, negocioId: reopenBusiness.id, status: "ACTIVE" } }), 0);
  const replayReopenBusiness = await createBusiness("Replay apos reabertura", "PROPOSTA");
  const replaySeedPayload = { origem: "MANUAL_CLOSE", idempotencyKey: `pg-replay-seed-${suffix}`, contratoRevisao: 1, valorFinalCentavos: 88000 };
  const replaySeed = await salesA.closeDealAsWon(context, replayReopenBusiness.id, replaySeedPayload);
  const replayReopened = await salesA.reopenDeal(context, replayReopenBusiness.id, { contratoRevisao: replaySeed.contrato.revisao, motivo: "Reabertura para validar replay" });
  await assert.rejects(
    salesA.closeDealAsWon(context, replayReopenBusiness.id, replaySeedPayload),
    (error) => error?.codigo === "IDEMPOTENCY_KEY_REPLAY_INVALIDATED",
  );
  assert.equal(replayReopened.contrato.vendaAtivaId, null);

  const lostBusiness = await createBusiness("Perdido com historico valido", "CONTATO");
  const lostState = await salesA.markDealAsLost(context, lostBusiness.id, { contratoRevisao: 1, motivo: "Perda causal PostgreSQL" });
  const lostReopened = await salesA.reopenDeal(context, lostBusiness.id, { contratoRevisao: lostState.contrato.revisao, motivo: "Retomada causal PostgreSQL" });
  assert.equal(lostReopened.negocio.etapa, "CONTATO");

  const lostWithoutHistory = await createBusiness("Perdido sem historico", "PERDIDO");
  await assert.rejects(
    salesA.reopenDeal(context, lostWithoutHistory.id, { contratoRevisao: 1, motivo: "Reabertura sem historico PostgreSQL" }),
    (error) => error?.codigo === "LOST_REOPEN_HISTORY_INVALID",
  );
  assert.equal((await prismaA.negocio.findUnique({ where: { id: lostWithoutHistory.id } })).etapa, "PERDIDO");
  assert.equal(await prismaA.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: company.id, negocioId: lostWithoutHistory.id } } }), null);

  const lostMalformedHistory = await createBusiness("Perdido com historico malformado", "CONTATO");
  const malformedLostState = await salesA.markDealAsLost(context, lostMalformedHistory.id, { contratoRevisao: 1, motivo: "Historico sera corrompido PostgreSQL" });
  const malformedLossHistory = await prismaA.historicoAtribuicao.findFirstOrThrow({
    where: { empresaId: company.id, negocioId: lostMalformedHistory.id, tipo: "MOVIMENTAR_ETAPA", etapaNova: "PERDIDO" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  await prismaA.historicoAtribuicao.update({ where: { id: malformedLossHistory.id }, data: { etapaAnterior: "FECHADO" } });
  await assert.rejects(
    salesA.reopenDeal(context, lostMalformedHistory.id, { contratoRevisao: malformedLostState.contrato.revisao, motivo: "Reabertura com historico malformado PostgreSQL" }),
    (error) => error?.codigo === "LOST_REOPEN_HISTORY_INVALID",
  );
  assert.equal((await prismaA.negocio.findUnique({ where: { id: lostMalformedHistory.id } })).etapa, "PERDIDO");
  assert.equal((await prismaA.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: company.id, negocioId: lostMalformedHistory.id } } })).revisao, malformedLostState.contrato.revisao);

  const crossDeal = await createBusiness("FK cross deal", "NOVO");
  await assert.rejects(
    prismaA.negocioContratoVenda.create({ data: { empresaId: company.id, negocioId: crossDeal.id, propostaPrincipalId: proposalA.id } }),
    (error) => error?.code === "P2003" || /NEGOCIO_CONTRATO_VENDA_CUSTOMER_MISMATCH/.test(String(error?.message || "")),
  );

  const otherClient = await prismaA.cliente.create({ data: { empresaId: company.id, nome: "Cliente divergente PostgreSQL", origem: "QA PostgreSQL" } });
  const mismatchBusiness = await createBusiness("Contrato cliente divergente", "PROPOSTA");
  await assert.rejects(prismaA.propostaComercial.create({
    data: {
      empresaId: company.id,
      clienteId: otherClient.id,
      negocioId: mismatchBusiness.id,
      responsavelId: actor.id,
      autorId: actor.id,
      codigo: `PROP-PG-MISMATCH-${suffix}`,
      titulo: "Proposta de cliente divergente",
      descontoGeralCentavos: 0,
      subtotalCentavos: 100,
      totalCentavos: 100,
      validade: new Date("2026-12-31T00:00:00.000Z"),
      status: "PRONTA",
    },
  }));
  await assert.rejects(prismaA.propostaComercial.update({ where: { id: proposalA.id }, data: { clienteId: otherClient.id } }));
  await assert.rejects(prismaA.negocio.update({ where: { id: proposalBusiness.id }, data: { clienteId: otherClient.id } }));
  const constraintBusiness = await createBusiness("Constraints PostgreSQL", "PROPOSTA");
  const timestamp = new Date();
  await assert.rejects(prismaA.$executeRaw`
    INSERT INTO "VendaCanonica" ("empresaId","negocioId","clienteId","origem","subtotalCentavos","descontoCentavos","totalCentavos","etapaAbertaAnterior","revisao","idempotencyKey","requestFingerprint","fechadoEm","fechadoPorId","updatedAt")
    VALUES (${company.id},${constraintBusiness.id},${otherClient.id},${"MANUAL_CLOSE"}::"OrigemVendaCanonica",100,0,100,${"PROPOSTA"}::"EtapaNegocio",1,${`pg-wrong-customer-${suffix}`},'wrong-customer',${timestamp},${actor.id},${timestamp})
  `);
  await assert.rejects(prismaA.$executeRaw`
    INSERT INTO "VendaCanonica" ("empresaId","negocioId","clienteId","origem","subtotalCentavos","descontoCentavos","totalCentavos","etapaAbertaAnterior","revisao","idempotencyKey","requestFingerprint","fechadoEm","fechadoPorId","updatedAt")
    VALUES (${company.id},${constraintBusiness.id},${client.id},${"MANUAL_CLOSE"}::"OrigemVendaCanonica",100,0,100,${"FECHADO"}::"EtapaNegocio",1,${`pg-invalid-stage-${suffix}`},'invalid-stage',${timestamp},${actor.id},${timestamp})
  `);
  await assert.rejects(prismaA.$executeRaw`
    INSERT INTO "VendaCanonica" ("empresaId","negocioId","clienteId","origem","subtotalCentavos","descontoCentavos","totalCentavos","etapaAbertaAnterior","revisao","idempotencyKey","requestFingerprint","fechadoEm","fechadoPorId","updatedAt")
    VALUES (${company.id},${constraintBusiness.id},${client.id},${"MANUAL_CLOSE"}::"OrigemVendaCanonica",100,1,99,${"PROPOSTA"}::"EtapaNegocio",1,${`pg-invalid-manual-${suffix}`},'invalid-manual',${timestamp},${actor.id},${timestamp})
  `);
  await assert.rejects(prismaA.$executeRaw`
    INSERT INTO "ItemVendaCanonica" ("empresaId","vendaId","descricao","quantidade","valorUnitarioCentavos","descontoCentavos","subtotalCentavos","totalCentavos","ordem")
    VALUES (${company.id},${activeSales[0].id},'Item manual proibido',1,100,0,100,100,0)
  `);

  const itemConstraintBusiness = await createBusiness("Item constraint PostgreSQL", "PROPOSTA");
  const itemConstraintProposal = await createReadyProposal(itemConstraintBusiness.id, "IC");
  await salesA.acceptProposal(context, itemConstraintProposal.id, { revisao: itemConstraintProposal.revisao, contratoRevisao: 1 });
  const itemConstraintSale = await salesA.closeDealAsWon(context, itemConstraintBusiness.id, { origem: "ACCEPTED_PROPOSAL", idempotencyKey: `pg-item-constraint-${suffix}`, contratoRevisao: 2 });
  const protectedSaleId = itemConstraintSale.contrato.vendaAtiva.id;
  const protectedItem = await prismaA.itemVendaCanonica.findFirstOrThrow({ where: { empresaId: company.id, vendaId: protectedSaleId } });
  const protectedHistory = await prismaA.historicoVendaCanonica.findFirstOrThrow({ where: { empresaId: company.id, vendaId: protectedSaleId, acao: "CREATE" } });
  await assert.rejects(prismaA.$executeRaw`
    INSERT INTO "ItemVendaCanonica" ("empresaId","vendaId","propostaIdOriginal","propostaItemId","itemTypeOriginal","descricao","quantidade","valorUnitarioCentavos","descontoCentavos","subtotalCentavos","totalCentavos","ordem")
    VALUES (${company.id},${protectedSaleId},${itemConstraintProposal.id},${itemConstraintProposal.itens[0].id},${"LEGACY_ITEM"}::"TipoItemPropostaComercial",'Formula invalida',1,100,0,99,99,99)
  `);
  await assert.rejects(prismaA.itemVendaCanonica.create({ data: { empresaId: company.id, vendaId: protectedSaleId, propostaIdOriginal: itemConstraintProposal.id, propostaItemId: itemConstraintProposal.itens[0].id, itemTypeOriginal: "LEGACY_ITEM", descricao: "Inclusao tardia proibida", quantidade: "1", valorUnitarioCentavos: 100, descontoCentavos: 0, subtotalCentavos: 100, totalCentavos: 100, ordem: 98 } }));
  await assert.rejects(prismaA.historicoVendaCanonica.create({ data: { empresaId: company.id, vendaId: protectedSaleId, negocioId: itemConstraintBusiness.id, autorId: actor.id, acao: "INVALIDATE", statusAnterior: "ACTIVE", statusNovo: "INVALIDATED", motivo: "Invalidacao fora do lifecycle" } }));
  await assert.rejects(prismaA.vendaCanonica.update({ where: { id: protectedSaleId }, data: { idempotencyKey: `pg-mutated-sale-${suffix}` } }));
  await assert.rejects(prismaA.itemVendaCanonica.delete({ where: { id: protectedItem.id } }));
  await assert.rejects(prismaA.historicoVendaCanonica.delete({ where: { id: protectedHistory.id } }));
  await assert.rejects(prismaA.vendaCanonica.delete({ where: { id: protectedSaleId } }));
  await assert.rejects(prismaA.negocioContratoVenda.delete({ where: { empresaId_negocioId: { empresaId: company.id, negocioId: itemConstraintBusiness.id } } }));
  await assert.rejects(
    prismaA.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL crm.allow_canonical_sale_delete = 'test-cleanup'");
      await tx.vendaCanonica.delete({ where: { id: protectedSaleId } });
    }),
    /CANONICAL_SALE_DELETE_FORBIDDEN/,
  );
  await assert.rejects(
    prismaA.$executeRawUnsafe('TRUNCATE TABLE "HistoricoVendaCanonica"'),
    /CANONICAL_SALE_TRUNCATE_FORBIDDEN/,
  );
  await assert.rejects(
    prismaA.$executeRawUnsafe('TRUNCATE TABLE "NegocioContratoVenda"'),
    /CANONICAL_SALE_TRUNCATE_FORBIDDEN/,
  );
});

async function createBusiness(title, etapa) {
  return prismaA.negocio.create({ data: { empresaId: company.id, clienteId: client.id, responsavelId: actor.id, titulo: title, etapa, valor: 5000 } });
}

async function createReadyProposal(negocioId, label) {
  const proposal = await prismaA.propostaComercial.create({
    data: {
      empresaId: company.id,
      clienteId: client.id,
      negocioId,
      responsavelId: actor.id,
      autorId: actor.id,
      codigo: `PROP-PG-${label}-${suffix}`,
      titulo: `Proposta PostgreSQL ${label}`,
      descontoGeralCentavos: 0,
      subtotalCentavos: 50000,
      totalCentavos: 50000,
      validade: new Date("2026-12-31T00:00:00.000Z"),
      status: "PRONTA",
    },
  });
  const item = await prismaA.itemPropostaComercial.create({
    data: { empresaId: company.id, propostaId: proposal.id, itemType: "LEGACY_ITEM", descricao: `Item ${label}`, quantidade: "1", valorUnitarioCentavos: 50000, descontoCentavos: 0, subtotalCentavos: 50000, totalCentavos: 50000, ordem: 0 },
  });
  return { ...proposal, itens: [item] };
}

function requiredPostgresUrl() {
  const value = String(process.env.POSTGRES_TEST_DATABASE_URL || "").trim();
  if (process.env.NODE_ENV !== "test"
    || process.env.CRM_TEST_DATABASE_PROVIDER !== "postgresql"
    || process.env.CRM_TEST_POSTGRES_ALLOW !== "true"
    || process.env.CRM_POSTGRES_SUITE_VERIFIED !== "true"
    || !/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error("PostgreSQL descartavel verificado obrigatorio.");
  }
  return value;
}
