const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const auditDir = path.join(os.tmpdir(), "crm-prisma-tests", "canonical-sale-v1");
const databasePath = path.join(auditDir, `canonical-sale-${process.pid}.db`);
const sourceDatabase = process.env.CRM_TEST_BASE_DATABASE_PATH;

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "canonical-sale-v1-secret-with-sufficient-entropy",
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: "canonical-sale-v1-encryption-key",
  NEGOCIOS_KANBAN_ENABLED: "true",
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
});

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  if (!sourceDatabase || !path.isAbsolute(sourceDatabase)) throw new Error("CRM_TEST_BASE_DATABASE_PATH absoluto e obrigatorio.");
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => { server = api.app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("Venda Canônica V1 fecha, deduplica, reabre e protege tenant/concorrência", async () => {
  const adminA = await registerAndLogin("Empresa Venda Canonica A", "Admin Venda A", "admin-a@canonical-sale.test");
  const adminB = await registerAndLogin("Empresa Venda Canonica B", "Admin Venda B", "admin-b@canonical-sale.test");
  const sellerA = await createUserAndLogin(adminA, "Vendedor Venda A", "seller-a@canonical-sale.test", "VENDEDOR");
  const sellerOther = await createUserAndLogin(adminA, "Vendedor Outro", "seller-other@canonical-sale.test", "VENDEDOR");
  const fixture = await businessFixture(adminA, sellerA.usuarioId, "Cliente Venda Canonica");
  const otherTenant = await businessFixture(adminB, adminB.usuarioId, "Cliente Outro Tenant");

  assert.equal((await request("GET", `/negocios/${fixture.business.id}/contrato-venda`, undefined, adminB.token)).status, 404);
  assert.equal((await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, manualClose("cross-tenant", 1, 100), adminB.token)).status, 404);
  assert.equal((await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, manualClose("seller-forbidden", 1, 100), sellerOther.token)).status, 403);

  const proposalA = await createReadyProposal(fixture.business.id, sellerA.token, "Proposta A");
  const proposalB = await createReadyProposal(fixture.business.id, sellerA.token, "Proposta B");
  const proposalOtherTenant = await createReadyProposal(otherTenant.business.id, adminB.token, "Proposta Outro Tenant");
  const sameTenantOther = await businessFixture(adminA, sellerA.usuarioId, "Cliente Outro Mesmo Tenant", "PROPOSTA", null);
  const mismatchedProposal = await prisma.propostaComercial.create({
    data: {
      empresaId: adminA.empresaId,
      clienteId: sameTenantOther.client.id,
      negocioId: fixture.business.id,
      autorId: sellerA.usuarioId,
      codigo: `MISMATCH_PROPOSAL_${process.pid}`,
      titulo: "Proposta de cliente incorreto",
      validade: new Date("2026-12-31T00:00:00.000Z"),
      status: "PRONTA",
      subtotalCentavos: 100,
      totalCentavos: 100,
      descontoGeralCentavos: 0,
    },
  });
  await assert.rejects(prisma.negocioContratoVenda.create({
    data: {
      empresaId: adminA.empresaId,
      negocioId: fixture.business.id,
      propostaPrincipalId: mismatchedProposal.id,
    },
  }));

  const primary = await request("PUT", `/negocios/${fixture.business.id}/proposta-principal`, { propostaId: proposalA.id, revisao: 1 }, sellerA.token);
  assert.equal(primary.status, 200, JSON.stringify(primary.body));
  assert.equal(primary.body.contrato.propostaPrincipalId, proposalA.id);
  assert.equal(primary.body.contrato.revisao, 2);
  assert.equal((await request("PUT", `/negocios/${fixture.business.id}/proposta-principal`, { propostaId: proposalOtherTenant.id, revisao: 2 }, adminA.token)).status, 404);

  const genericAccept = await request("POST", `/propostas/${proposalA.id}/status`, { status: "ACEITA", revisao: proposalA.revisao }, sellerA.token);
  assert.equal(genericAccept.status, 422);
  assert.equal(genericAccept.body.codigo, "PROPOSAL_ACCEPT_REQUIRES_WINNER_ACTION");

  const accepts = await Promise.all([
    request("POST", `/propostas/${proposalA.id}/aceitar`, { revisao: proposalA.revisao, contratoRevisao: 2 }, sellerA.token),
    request("POST", `/propostas/${proposalB.id}/aceitar`, { revisao: proposalB.revisao, contratoRevisao: 2 }, sellerA.token),
  ]);
  assert.equal(accepts.filter((response) => response.status === 200).length, 1, JSON.stringify(accepts));
  assert.equal(accepts.filter((response) => response.status === 409).length, 1, JSON.stringify(accepts));
  let state = (await request("GET", `/negocios/${fixture.business.id}/contrato-venda`, undefined, adminA.token)).body;
  assert.equal(state.contrato.revisao, 3);
  const firstWinnerId = state.contrato.propostaVencedoraId;
  const replacementId = firstWinnerId === proposalA.id ? proposalB.id : proposalA.id;
  const replacement = await request("GET", `/propostas/${replacementId}`, undefined, adminA.token);

  const replaced = await request("POST", `/negocios/${fixture.business.id}/proposta-vencedora/substituir`, {
    propostaId: replacementId,
    propostaRevisao: replacement.body.revisao,
    contratoRevisao: state.contrato.revisao,
    motivo: "Cliente escolheu a segunda condição comercial",
  }, adminA.token);
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.equal(replaced.body.contrato.propostaVencedoraId, replacementId);
  assert.equal((await request("GET", `/propostas/${firstWinnerId}`, undefined, adminA.token)).body.status, "SUBSTITUIDA");
  const primaryLocked = await request("PUT", `/negocios/${fixture.business.id}/proposta-principal`, { propostaId: null, revisao: replaced.body.contrato.revisao }, adminA.token);
  assert.equal(primaryLocked.status, 409);
  assert.equal(primaryLocked.body.codigo, "WINNING_PROPOSAL_PRIMARY_LOCKED");

  state = replaced.body;
  const closePayload = { origem: "ACCEPTED_PROPOSAL", idempotencyKey: "canonical-proposal-close-001", contratoRevisao: state.contrato.revisao };
  const closed = await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, closePayload, sellerA.token);
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.negocio.etapa, "FECHADO");
  assert.equal(closed.body.contrato.vendaAtiva.origem, "ACCEPTED_PROPOSAL");
  assert.equal(closed.body.contrato.vendaAtiva.itens.length, 1);
  assert.equal(closed.body.contrato.vendaAtiva.totalCentavos, 5000);
  const firstSaleId = closed.body.contrato.vendaAtiva.id;

  const replay = await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, closePayload, sellerA.token);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.contrato.vendaAtiva.id, firstSaleId);
  assert.equal((await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, closePayload, sellerOther.token)).status, 403);
  assert.equal(await prisma.vendaCanonica.count({ where: { empresaId: adminA.empresaId, negocioId: fixture.business.id } }), 1);
  assert.equal((await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, { ...closePayload, idempotencyKey: "canonical-proposal-close-002", contratoRevisao: closed.body.contrato.revisao }, sellerA.token)).status, 409);

  const winnerItem = await prisma.itemPropostaComercial.findFirst({ where: { empresaId: adminA.empresaId, propostaId: replacementId } });
  const saleItem = await prisma.itemVendaCanonica.findFirst({ where: { empresaId: adminA.empresaId, vendaId: firstSaleId } });
  const saleHistory = await prisma.historicoVendaCanonica.findFirst({ where: { empresaId: adminA.empresaId, vendaId: firstSaleId, acao: "CREATE" } });
  assert.ok(winnerItem && saleItem && saleHistory);
  await assert.rejects(prisma.vendaCanonica.update({ where: { id: firstSaleId }, data: { totalCentavos: 5001 } }));
  await assert.rejects(prisma.itemVendaCanonica.update({ where: { id: saleItem.id }, data: { descricao: "Mutacao silenciosa proibida" } }));
  await assert.rejects(prisma.vendaCanonica.delete({ where: { id: firstSaleId } }));
  await assert.rejects(prisma.itemVendaCanonica.delete({ where: { id: saleItem.id } }));
  await assert.rejects(prisma.historicoVendaCanonica.delete({ where: { id: saleHistory.id } }));
  await assert.rejects(prisma.historicoVendaCanonica.create({ data: { empresaId: adminA.empresaId, vendaId: firstSaleId, negocioId: fixture.business.id, autorId: adminA.usuarioId, acao: "INVALIDATE", statusAnterior: "ACTIVE", statusNovo: "INVALIDATED", motivo: "Invalidacao fora do lifecycle" } }));
  await assert.rejects(prisma.itemVendaCanonica.create({
    data: {
      empresaId: adminA.empresaId,
      vendaId: firstSaleId,
      propostaIdOriginal: replacementId,
      propostaItemId: winnerItem.id,
      itemTypeOriginal: "LEGACY_ITEM",
      descricao: "Inclusao tardia proibida",
      quantidade: "1",
      valorUnitarioCentavos: 100,
      descontoCentavos: 0,
      subtotalCentavos: 100,
      totalCentavos: 100,
      ordem: 98,
    },
  }));
  const supersededItem = await prisma.itemPropostaComercial.findFirst({ where: { empresaId: adminA.empresaId, propostaId: firstWinnerId } });
  await assert.rejects(prisma.itemVendaCanonica.create({
    data: {
      empresaId: adminA.empresaId,
      vendaId: firstSaleId,
      propostaIdOriginal: replacementId,
      propostaItemId: supersededItem.id,
      itemTypeOriginal: "LEGACY_ITEM",
      descricao: "Item de outra proposta",
      quantidade: "1",
      valorUnitarioCentavos: 100,
      descontoCentavos: 0,
      subtotalCentavos: 100,
      totalCentavos: 100,
      ordem: 99,
    },
  }));
  await prisma.itemPropostaComercial.update({ where: { id: winnerItem.id }, data: { descricao: "Descricao alterada depois da primeira venda" } });
  assert.equal((await prisma.itemVendaCanonica.findFirst({ where: { empresaId: adminA.empresaId, vendaId: firstSaleId } })).descricao, "Item Proposta A".replace("A", replacementId === proposalA.id ? "A" : "B"));

  const reopened = await request("POST", `/negocios/${fixture.business.id}/reabrir`, { contratoRevisao: closed.body.contrato.revisao, motivo: "Correcao comercial auditada" }, adminA.token);
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(reopened.body.negocio.etapa, "PROPOSTA");
  assert.equal(reopened.body.contrato.vendaAtivaId, null);
  const invalidated = await prisma.vendaCanonica.findUnique({ where: { id: firstSaleId } });
  assert.equal(invalidated.status, "INVALIDATED");
  assert.equal(invalidated.motivoInvalidacao, "Correcao comercial auditada");
  await assert.rejects(prisma.vendaCanonica.update({ where: { id: firstSaleId }, data: { status: "ACTIVE" } }));
  const staleReplay = await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, closePayload, sellerA.token);
  assert.equal(staleReplay.status, 409, JSON.stringify(staleReplay.body));
  assert.equal(staleReplay.body.codigo, "IDEMPOTENCY_KEY_REPLAY_INVALIDATED");

  const reclosed = await request("POST", `/negocios/${fixture.business.id}/fechar-ganho`, { origem: "ACCEPTED_PROPOSAL", idempotencyKey: "canonical-proposal-close-003", contratoRevisao: reopened.body.contrato.revisao }, sellerA.token);
  assert.equal(reclosed.status, 200, JSON.stringify(reclosed.body));
  assert.equal(reclosed.body.contrato.vendaAtiva.revisao, 2);
  assert.equal(reclosed.body.contrato.vendaAtiva.itens[0].descricao, "Descricao alterada depois da primeira venda");
  assert.equal(await prisma.vendaCanonica.count({ where: { empresaId: adminA.empresaId, negocioId: fixture.business.id } }), 2);

  const manual = await businessFixture(adminA, sellerA.usuarioId, "Cliente Venda Manual", "NOVO", null);
  const manualClosed = await request("POST", `/negocios/${manual.business.id}/fechar-ganho`, manualClose("manual-close-zero", 1, 0), sellerA.token);
  assert.equal(manualClosed.status, 200, JSON.stringify(manualClosed.body));
  assert.equal(manualClosed.body.contrato.vendaAtiva.origem, "MANUAL_CLOSE");
  assert.equal(manualClosed.body.contrato.vendaAtiva.totalCentavos, 0);
  assert.equal(manualClosed.body.contrato.vendaAtiva.itens.length, 0);
  const salesExport = await request("GET", "/vendas?status=ACTIVE&limit=100", undefined, sellerA.token);
  assert.equal(salesExport.status, 200);
  assert.ok(salesExport.body.data.some((sale) => sale.id === manualClosed.body.contrato.vendaAtiva.id && sale.totalCentavos === 0));
  assert.ok(salesExport.body.data.every((sale) => !Object.hasOwn(sale, "empresaId") && !Object.hasOwn(sale, "idempotencyKey") && sale.moeda === "BRL"));
  await assert.rejects(prisma.itemVendaCanonica.create({
    data: {
      empresaId: adminA.empresaId,
      vendaId: manualClosed.body.contrato.vendaAtiva.id,
      propostaIdOriginal: null,
      propostaItemId: null,
      descricao: "Item proibido em fechamento manual",
      quantidade: "1",
      valorUnitarioCentavos: 100,
      descontoCentavos: 0,
      subtotalCentavos: 100,
      totalCentavos: 100,
      ordem: 0,
    },
  }));
  assert.equal((await request("GET", "/vendas?status=ACTIVE&limit=100", undefined, adminB.token)).body.data.some((sale) => sale.negocioId === fixture.business.id), false);

  const lost = await businessFixture(adminA, sellerA.usuarioId, "Cliente Perdido", "CONTATO", null);
  const lostResult = await request("POST", `/negocios/${lost.business.id}/marcar-perdido`, { contratoRevisao: 1, motivo: "Cliente adiou o projeto" }, sellerA.token);
  assert.equal(lostResult.status, 200);
  assert.equal(lostResult.body.negocio.etapa, "PERDIDO");
  const lostReopened = await request("POST", `/negocios/${lost.business.id}/reabrir`, { contratoRevisao: 2, motivo: "Cliente retomou o projeto" }, adminA.token);
  assert.equal(lostReopened.status, 200);
  assert.equal(lostReopened.body.negocio.etapa, "CONTATO");

  const legacyAccepted = await businessFixture(adminA, sellerA.usuarioId, "Cliente Aceite Legado", "PROPOSTA", null);
  const legacyAcceptedProposal = await createReadyProposal(legacyAccepted.business.id, sellerA.token, "Proposta Aceita Legada");
  await prisma.propostaComercial.update({ where: { id: legacyAcceptedProposal.id }, data: { status: "ACEITA" } });
  const manualWithLegacyWinner = await request("POST", `/negocios/${legacyAccepted.business.id}/fechar-ganho`, manualClose("legacy-winner-manual", 1, 8000), sellerA.token);
  assert.equal(manualWithLegacyWinner.status, 409);
  assert.equal(manualWithLegacyWinner.body.codigo, "WINNER_RECONCILIATION_REQUIRED");
  const lostWithLegacyWinner = await request("POST", `/negocios/${legacyAccepted.business.id}/marcar-perdido`, { contratoRevisao: 1, motivo: "Nao pode ignorar aceite legado" }, sellerA.token);
  assert.equal(lostWithLegacyWinner.status, 409);
  assert.equal(lostWithLegacyWinner.body.codigo, "WINNER_RECONCILIATION_REQUIRED");

  const ambiguousWinner = await businessFixture(adminA, sellerA.usuarioId, "Cliente Vencedora Ambigua", "PROPOSTA", null);
  const ambiguousProposalA = await createReadyProposal(ambiguousWinner.business.id, sellerA.token, "Proposta Ambigua A");
  const ambiguousProposalB = await createReadyProposal(ambiguousWinner.business.id, sellerA.token, "Proposta Ambigua B");
  const acceptedWinner = await request("POST", `/propostas/${ambiguousProposalA.id}/aceitar`, { revisao: ambiguousProposalA.revisao, contratoRevisao: 1 }, sellerA.token);
  assert.equal(acceptedWinner.status, 200, JSON.stringify(acceptedWinner.body));
  await prisma.propostaComercial.update({ where: { id: ambiguousProposalB.id }, data: { status: "ACEITA" } });
  const ambiguousClose = await request("POST", `/negocios/${ambiguousWinner.business.id}/fechar-ganho`, {
    origem: "ACCEPTED_PROPOSAL",
    idempotencyKey: "ambiguous-winner-close",
    contratoRevisao: acceptedWinner.body.contrato.revisao,
  }, sellerA.token);
  assert.equal(ambiguousClose.status, 409);
  assert.equal(ambiguousClose.body.codigo, "WINNER_RECONCILIATION_REQUIRED");
  const reconciledWinner = await request("POST", `/negocios/${ambiguousWinner.business.id}/proposta-vencedora/reconciliar`, {
    propostaId: ambiguousProposalB.id,
    contratoRevisao: acceptedWinner.body.contrato.revisao,
    motivo: "Escolha explicita entre propostas aceitas legadas",
  }, adminA.token);
  assert.equal(reconciledWinner.status, 200, JSON.stringify(reconciledWinner.body));
  assert.equal(reconciledWinner.body.contrato.propostaVencedoraId, ambiguousProposalB.id);
  assert.equal(await prisma.propostaComercial.count({ where: { empresaId: adminA.empresaId, negocioId: ambiguousWinner.business.id, status: "ACEITA" } }), 1);
  const reconciledClose = await request("POST", `/negocios/${ambiguousWinner.business.id}/fechar-ganho`, {
    origem: "ACCEPTED_PROPOSAL",
    idempotencyKey: "reconciled-winner-close",
    contratoRevisao: reconciledWinner.body.contrato.revisao,
  }, sellerA.token);
  assert.equal(reconciledClose.status, 200, JSON.stringify(reconciledClose.body));
  assert.equal(reconciledClose.body.contrato.vendaAtiva.propostaVencedoraId, ambiguousProposalB.id);

  const wrongCustomerBusiness = await businessFixture(adminA, sellerA.usuarioId, "Cliente Vinculo Correto", "PROPOSTA", null);
  await assert.rejects(prisma.vendaCanonica.create({
    data: {
      empresaId: adminA.empresaId,
      negocioId: wrongCustomerBusiness.business.id,
      clienteId: fixture.client.id,
      origem: "MANUAL_CLOSE",
      subtotalCentavos: 100,
      descontoCentavos: 0,
      totalCentavos: 100,
      etapaAbertaAnterior: "PROPOSTA",
      revisao: 1,
      idempotencyKey: "wrong-customer-sale",
      requestFingerprint: "invalid-link",
      fechadoEm: new Date(),
      fechadoPorId: adminA.usuarioId,
    },
  }), (error) => error?.code === "P2003");

  const rollbackFixture = await businessFixture(adminA, sellerA.usuarioId, "Cliente Rollback", "PROPOSTA", null);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "canonical_sale_force_rollback" BEFORE UPDATE OF "etapa" ON "Negocio" WHEN NEW."id" = ${rollbackFixture.business.id} AND NEW."etapa" = 'FECHADO' BEGIN SELECT RAISE(ABORT, 'forced canonical sale rollback'); END`);
  const failedClose = await request("POST", `/negocios/${rollbackFixture.business.id}/fechar-ganho`, manualClose("manual-close-rollback", 1, 1000), sellerA.token);
  assert.equal(failedClose.status, 500);
  assert.equal(await prisma.vendaCanonica.count({ where: { empresaId: adminA.empresaId, negocioId: rollbackFixture.business.id } }), 0);
  assert.equal((await prisma.negocio.findUnique({ where: { id: rollbackFixture.business.id } })).etapa, "PROPOSTA");
  const rolledBackContract = await prisma.negocioContratoVenda.findUnique({ where: { empresaId_negocioId: { empresaId: adminA.empresaId, negocioId: rollbackFixture.business.id } } });
  assert.equal(rolledBackContract?.vendaAtivaId ?? null, null);
  await prisma.$executeRawUnsafe('DROP TRIGGER "canonical_sale_force_rollback"');

  const concurrentFixture = await businessFixture(adminA, sellerA.usuarioId, "Cliente Concorrencia", "PROPOSTA", null);
  const concurrent = await Promise.all([
    request("POST", `/negocios/${concurrentFixture.business.id}/fechar-ganho`, manualClose("manual-concurrent-a", 1, 1200), sellerA.token),
    request("POST", `/negocios/${concurrentFixture.business.id}/fechar-ganho`, manualClose("manual-concurrent-b", 1, 1200), adminA.token),
  ]);
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((response) => response.status === 409).length, 1, JSON.stringify(concurrent));
  assert.equal(await prisma.vendaCanonica.count({ where: { empresaId: adminA.empresaId, negocioId: concurrentFixture.business.id, status: "ACTIVE" } }), 1);

  const closedWinner = await request("GET", `/propostas/${replacementId}`, undefined, adminA.token);
  assert.equal(closedWinner.status, 200);
  assert.equal(Object.values(closedWinner.body.permissoes).some(Boolean), false);

  const dashboardBefore = await request("GET", "/dashboard", undefined, adminA.token);
  assert.equal(dashboardBefore.status, 200);
  const provenanceFixture = await businessFixture(adminA, sellerA.usuarioId, "Cliente Proveniencia Dashboard", "NOVO", 7777);
  await prisma.cliente.update({ where: { id: provenanceFixture.client.id }, data: { valor: 888888 } });
  const dashboardOpen = await request("GET", "/dashboard", undefined, adminA.token);
  assert.equal(dashboardOpen.body.indicadores.pipeline - dashboardBefore.body.indicadores.pipeline, 7777);
  const provenanceClosed = await request("POST", `/negocios/${provenanceFixture.business.id}/fechar-ganho`, manualClose("dashboard-provenance-close", 1, 123400), sellerA.token);
  assert.equal(provenanceClosed.status, 200);
  const dashboardClosed = await request("GET", "/dashboard", undefined, adminA.token);
  assert.equal(dashboardClosed.body.receita.fonte, "CANONICAL_SALE");
  assert.equal(dashboardClosed.body.analytics.wonValueCents - dashboardOpen.body.analytics.wonValueCents, 123400);
  assert.equal(dashboardClosed.body.indicadores.pipeline, dashboardBefore.body.indicadores.pipeline);

  assert.equal((await request("PATCH", `/negocios/${manual.business.id}/etapa`, { etapa: "PERDIDO", etapaAnterior: "FECHADO" }, adminA.token)).body.codigo, "NEGOCIO_TERMINAL_ACTION_REQUIRED");
  assert.equal((await request("PATCH", `/negocios/${lost.business.id}/etapa`, { etapa: "FECHADO", etapaAnterior: "CONTATO" }, adminA.token)).body.codigo, "NEGOCIO_TERMINAL_ACTION_REQUIRED");
});

function manualClose(key, contratoRevisao, valorFinalCentavos) {
  return { origem: "MANUAL_CLOSE", idempotencyKey: key, contratoRevisao, valorFinalCentavos };
}

async function createReadyProposal(negocioId, token, title) {
  const created = await request("POST", `/negocios/${negocioId}/propostas`, {
    titulo: title,
    validade: "2026-12-31",
    descontoGeralCentavos: 0,
    itens: [{ descricao: `Item ${title}`, quantidade: "1", valorUnitarioCentavos: 5000, descontoCentavos: 0 }],
  }, token);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ready = await request("POST", `/propostas/${created.body.id}/status`, { status: "PRONTA", revisao: created.body.revisao }, token);
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  return ready.body;
}

async function businessFixture(account, responsavelId, name, etapa = "PROPOSTA", valor = 7000) {
  const client = await prisma.cliente.create({ data: { empresaId: account.empresaId, nome: name, origem: "QA Venda V1" } });
  const business = await prisma.negocio.create({ data: { empresaId: account.empresaId, clienteId: client.id, responsavelId, titulo: `Negocio ${name}`, etapa, valor } });
  return { client, business };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const senha = "SenhaVendaCanonicaSegura123";
  const registration = await request("POST", "/auth/register-company", { empresaNome, adminNome, email, senha });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  await prisma.empresaFuncionalidade.create({ data: { empresaId: registration.body.empresa.id, chave: "NEGOCIOS_KANBAN", habilitada: true } });
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(admin, nome, email, papel) {
  const senha = "SenhaVendaCanonicaSegura123";
  const created = await request("POST", "/usuarios", { nome, email, senha, papel }, admin.token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: admin.empresaId, usuarioId: created.body.id };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
