"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test, after } = require("node:test");
const { Prisma, PrismaClient } = require("@prisma/client");
const {
  decimalToCentsRoundHalfUp,
  revalidateProposalCatalogItems,
} = require("../src/commercial-proposals/service");

const prisma = new PrismaClient();
const suffix = crypto.randomBytes(6).toString("hex");
let fixture;

test("V1 PostgreSQL valida isolamento, snapshots, revalidacao, retention e CAS", async () => {
  fixture = await seedFixture();
  const now = new Date("2026-08-26T12:00:00.000Z");
  try {
    assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("10.004")), 1000);
    assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("10.005")), 1001);
    assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("10.006")), 1001);

    let proposal = await prisma.propostaComercial.findUniqueOrThrow({
      where: { id: fixture.proposal.id },
      include: { itens: true },
    });
    const valid = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.deepEqual(valid, { valid: true, reasons: [] });

    await prisma.commercialCatalogProduct.update({
      where: { id: fixture.catalog.id },
      data: { commercialPrice: new Prisma.Decimal("10.01") },
    });
    const priceChanged = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(priceChanged.reasons.some((reason) => reason.code === "PRICE_CHANGED"));
    await prisma.commercialCatalogProduct.update({
      where: { id: fixture.catalog.id },
      data: { commercialPrice: new Prisma.Decimal("10.00") },
    });

    await prisma.productOffer.update({ where: { id: fixture.offer.id }, data: { status: "EXPIRED" } });
    const expired = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(expired.reasons.some((reason) => ["OFFER_STATUS_CHANGED", "OFFER_EXPIRED"].includes(reason.code)));
    await prisma.productOffer.update({ where: { id: fixture.offer.id }, data: { status: "ACTIVE" } });

    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { freshnessEstado: "STALE" } });
    const stale = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(stale.reasons.some((reason) => reason.code === "STALE_AVAILABILITY"));
    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { freshnessEstado: "FRESH" } });

    await prisma.commercialCatalogProduct.update({ where: { id: fixture.catalog.id }, data: { priceStatus: "STALE" } });
    const stalePrice = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(stalePrice.reasons.some((reason) => ["PRICE_STATUS_CHANGED", "PRICE_UNAVAILABLE"].includes(reason.code)));
    await prisma.commercialCatalogProduct.update({ where: { id: fixture.catalog.id }, data: { priceStatus: "AVAILABLE" } });

    await prisma.commercialCatalogProduct.update({ where: { id: fixture.catalog.id }, data: { currency: "USD" } });
    const wrongCurrency = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(wrongCurrency.reasons.some((reason) => reason.code === "CURRENCY_MISMATCH"));
    await prisma.commercialCatalogProduct.update({ where: { id: fixture.catalog.id }, data: { currency: "BRL" } });

    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { onHand: new Prisma.Decimal("0"), available: new Prisma.Decimal("0") } });
    const outOfStock = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(outOfStock.reasons.some((reason) => reason.code === "OUT_OF_STOCK"));
    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { onHand: new Prisma.Decimal("10"), available: new Prisma.Decimal("10") } });

    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { revision: 2 } });
    const changedStockVersion = await revalidateProposalCatalogItems(prisma, { empresaId: fixture.empresa.id }, proposal, now);
    assert.ok(changedStockVersion.reasons.some((reason) => reason.code === "STOCK_MATERIAL_CHANGED"));
    await prisma.saldoEstoque.update({ where: { id: fixture.balance.id }, data: { revision: 1 } });

    const snapshot = await prisma.itemPropostaComercial.findUniqueOrThrow({ where: { id: fixture.item.id } });
    assert.equal(snapshot.valorUnitarioCentavos, 1000);
    assert.equal(snapshot.productNameSnapshot, "Produto V1");

    await expectConstraint(
      () => prisma.itemPropostaComercial.create({
        data: baseItemData(fixture.proposal.id, fixture.empresa.id, {
          itemType: "CATALOG_ITEM",
        }),
      }),
      "CATALOG_ITEM incompleto",
    );
    await expectConstraint(
      () => prisma.itemPropostaComercial.create({
        data: baseItemData(fixture.proposal.id, fixture.empresa.id, {
          itemType: "LEGACY_ITEM",
          productOfferId: fixture.offer.id,
        }),
      }),
      "LEGACY_ITEM com referencia catalogada",
    );
    await expectConstraint(
      () => prisma.itemPropostaComercial.create({
        data: baseItemData(fixture.otherProposal.id, fixture.empresa.id, {
          itemType: "LEGACY_ITEM",
        }),
      }),
      "proposta de outro tenant",
    );
    await expectConstraint(
      () => prisma.itemPropostaComercial.create({
        data: baseItemData(fixture.proposal.id, fixture.empresa.id, {
          itemType: "CATALOG_ITEM",
          productOfferId: fixture.otherOffer.id,
          catalogProductId: fixture.catalog.id,
          stockProductId: fixture.stock.id,
          productNameSnapshot: "Produto V1",
          unitSnapshot: "UN",
          currencySnapshot: "BRL",
          priceStatusSnapshot: "AVAILABLE",
          offerExpiresAt: fixture.offer.expiresAt,
          catalogRevision: 1,
          stockMaterialVersion: 1,
        }),
      }),
      "ProductOffer de outro tenant",
    );

    await expectConstraint(() => prisma.productOffer.delete({ where: { id: fixture.offer.id } }), "retention ProductOffer");
    await expectConstraint(() => prisma.commercialCatalogProduct.delete({ where: { id: fixture.catalog.id } }), "retention catalogo");
    await expectConstraint(() => prisma.produtoEstoque.delete({ where: { id: fixture.stock.id } }), "retention estoque");

    const firstClient = new PrismaClient();
    const secondClient = new PrismaClient();
    try {
      const [first, second] = await Promise.all([
        firstClient.propostaComercial.updateMany({
          where: { id: fixture.proposal.id, empresaId: fixture.empresa.id, revisao: 1 },
          data: { revisao: { increment: 1 } },
        }),
        secondClient.propostaComercial.updateMany({
          where: { id: fixture.proposal.id, empresaId: fixture.empresa.id, revisao: 1 },
          data: { revisao: { increment: 1 } },
        }),
      ]);
      assert.deepEqual([first.count, second.count].sort(), [0, 1]);
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
    }
  } finally {
    await cleanupFixture(fixture);
    fixture = null;
  }
});

after(async () => {
  await prisma.$disconnect();
});

async function seedFixture() {
  const empresa = await prisma.empresa.create({ data: { nome: `V1 PostgreSQL ${suffix}`, slug: `v1-postgres-${suffix}` } });
  const otherEmpresa = await prisma.empresa.create({ data: { nome: `V1 PostgreSQL other ${suffix}`, slug: `v1-postgres-other-${suffix}` } });
  const usuario = await prisma.usuario.create({
    data: { empresaId: empresa.id, nome: "V1 Rehearsal Admin", email: `v1-admin-${suffix}@example.test`, senhaHash: "hash", papel: "ADMIN" },
  });
  const otherUsuario = await prisma.usuario.create({
    data: { empresaId: otherEmpresa.id, nome: "V1 Other Admin", email: `v1-other-${suffix}@example.test`, senhaHash: "hash", papel: "ADMIN" },
  });
  const cliente = await prisma.cliente.create({ data: { empresaId: empresa.id, nome: "Cliente V1 PostgreSQL" } });
  const otherCliente = await prisma.cliente.create({ data: { empresaId: otherEmpresa.id, nome: "Cliente V1 PostgreSQL other" } });
  const negocio = await prisma.negocio.create({ data: { empresaId: empresa.id, clienteId: cliente.id, etapa: "NOVO" } });
  const otherNegocio = await prisma.negocio.create({ data: { empresaId: otherEmpresa.id, clienteId: otherCliente.id, etapa: "NOVO" } });
  const proposal = await prisma.propostaComercial.create({
    data: {
      empresaId: empresa.id,
      clienteId: cliente.id,
      negocioId: negocio.id,
      autorId: usuario.id,
      codigo: `V1-${suffix}`,
      titulo: "Proposta V1 PostgreSQL",
      validade: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
  const otherProposal = await prisma.propostaComercial.create({
    data: {
      empresaId: otherEmpresa.id,
      clienteId: otherCliente.id,
      negocioId: otherNegocio.id,
      autorId: otherUsuario.id,
      codigo: `V1-OTHER-${suffix}`,
      titulo: "Proposta V1 PostgreSQL other",
      validade: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
  const fonte = await prisma.fonteEstoque.create({
    data: { empresaId: empresa.id, tipoFonte: "MANUAL_CONTROLLED", nome: `V1 source ${suffix}`, statusCiclo: "ACTIVE", schemaVersion: "v1" },
  });
  const otherFonte = await prisma.fonteEstoque.create({
    data: { empresaId: otherEmpresa.id, tipoFonte: "MANUAL_CONTROLLED", nome: `V1 source other ${suffix}`, statusCiclo: "ACTIVE", schemaVersion: "v1" },
  });
  const stock = await prisma.produtoEstoque.create({ data: { empresaId: empresa.id, nomeExibicao: "Produto V1", skuCanonico: `SKU-V1-${suffix}`, unidadeCanonica: "UN" } });
  const otherStock = await prisma.produtoEstoque.create({ data: { empresaId: otherEmpresa.id, nomeExibicao: "Produto V1 other", skuCanonico: `SKU-V1-O-${suffix}`, unidadeCanonica: "UN" } });
  const catalog = await prisma.commercialCatalogProduct.create({
    data: {
      empresaId: empresa.id,
      stockProductId: stock.id,
      title: "Produto V1",
      commercialPrice: new Prisma.Decimal("10.00"),
      currency: "BRL",
      priceStatus: "AVAILABLE",
      visibility: "PUBLISHED",
      sellabilityPolicy: "STOCK_CANONICAL_ONLY",
      revision: 1,
    },
  });
  const otherCatalog = await prisma.commercialCatalogProduct.create({
    data: {
      empresaId: otherEmpresa.id,
      stockProductId: otherStock.id,
      title: "Produto V1 other",
      commercialPrice: new Prisma.Decimal("10.00"),
      currency: "BRL",
      priceStatus: "AVAILABLE",
      visibility: "PUBLISHED",
      sellabilityPolicy: "STOCK_CANONICAL_ONLY",
      revision: 1,
    },
  });
  const expiresAt = new Date("2026-09-01T00:00:00.000Z");
  const offer = await prisma.productOffer.create({
    data: {
      id: `offer-v1-${suffix}`,
      empresaId: empresa.id,
      catalogProductId: catalog.id,
      stockProductId: stock.id,
      title: "Produto V1",
      price: new Prisma.Decimal("10.00"),
      currency: "BRL",
      availabilityStatus: "AVAILABLE",
      availabilityLabel: "Disponivel",
      sourceFreshness: "FRESH",
      confidence: "HIGH",
      expiresAt,
      catalogRevision: 1,
      stockMaterialVersion: 1,
      policyVersion: "v1-test",
    },
  });
  const otherOffer = await prisma.productOffer.create({
    data: {
      id: `offer-v1-other-${suffix}`,
      empresaId: otherEmpresa.id,
      catalogProductId: otherCatalog.id,
      stockProductId: otherStock.id,
      title: "Produto V1 other",
      price: new Prisma.Decimal("10.00"),
      currency: "BRL",
      availabilityStatus: "AVAILABLE",
      availabilityLabel: "Disponivel",
      sourceFreshness: "FRESH",
      confidence: "HIGH",
      expiresAt,
      catalogRevision: 1,
      stockMaterialVersion: 1,
      policyVersion: "v1-test",
    },
  });
  const balance = await prisma.saldoEstoque.create({
    data: {
      empresaId: empresa.id,
      produtoEstoqueId: stock.id,
      fonteAutoritativaId: fonte.id,
      unidade: "UN",
      onHand: new Prisma.Decimal("10"),
      available: new Prisma.Decimal("10"),
      semanticaDisponivel: "EXPLICIT",
      sourceVersion: "v1-test",
      freshnessEstado: "FRESH",
      dataConfidence: "HIGH",
      revision: 1,
    },
  });
  await prisma.saldoEstoque.create({
    data: {
      empresaId: otherEmpresa.id,
      produtoEstoqueId: otherStock.id,
      fonteAutoritativaId: otherFonte.id,
      unidade: "UN",
      onHand: new Prisma.Decimal("10"),
      available: new Prisma.Decimal("10"),
      semanticaDisponivel: "EXPLICIT",
      sourceVersion: "v1-test",
      freshnessEstado: "FRESH",
      dataConfidence: "HIGH",
      revision: 1,
    },
  });
  const item = await prisma.itemPropostaComercial.create({
    data: {
      empresaId: empresa.id,
      propostaId: proposal.id,
      itemType: "CATALOG_ITEM",
      productOfferId: offer.id,
      catalogProductId: catalog.id,
      stockProductId: stock.id,
      descricao: "Produto V1",
      productNameSnapshot: "Produto V1",
      skuSnapshot: stock.skuCanonico,
      unitSnapshot: "UN",
      quantidade: new Prisma.Decimal("2"),
      valorUnitarioCentavos: 1000,
      currencySnapshot: "BRL",
      priceStatusSnapshot: "AVAILABLE",
      offerExpiresAt: expiresAt,
      catalogRevision: 1,
      stockMaterialVersion: 1,
      subtotalCentavos: 2000,
      totalCentavos: 2000,
    },
  });
  return { empresa, otherEmpresa, proposal, otherProposal, catalog, offer, otherOffer, stock, balance, item };
}

function baseItemData(propostaId, empresaId, overrides = {}) {
  return {
    empresaId,
    propostaId,
    descricao: "V1 constraint probe",
    quantidade: new Prisma.Decimal("1"),
    valorUnitarioCentavos: 1000,
    descontoCentavos: 0,
    subtotalCentavos: 1000,
    totalCentavos: 1000,
    ...overrides,
  };
}

async function expectConstraint(action, label) {
  await assert.rejects(action, (error) => {
    const text = String(error?.message || error);
    assert.match(text, /P2003|P2004|constraint|foreign key|check/i, label);
    return true;
  }, label);
}

async function cleanupFixture(value) {
  if (!value) return;
  const empresaIds = [value.empresa.id, value.otherEmpresa.id];
  await prisma.itemPropostaComercial.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.propostaComercial.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.saldoEstoque.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.productOffer.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.commercialCatalogProduct.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.produtoEstoque.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.fonteEstoque.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.negocio.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.cliente.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.usuario.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.empresa.deleteMany({ where: { id: { in: empresaIds } } });
}
