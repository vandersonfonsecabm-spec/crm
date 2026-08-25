const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Prisma } = require("@prisma/client");
const {
  decimalToCentsRoundHalfUp,
  revalidateProposalCatalogItems,
} = require("../src/commercial-proposals/service");

test("proposta usa ROUND_HALF_UP exato para preco Decimal", () => {
  assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("10.004")), 1000);
  assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("10.005")), 1001);
  assert.equal(decimalToCentsRoundHalfUp(new Prisma.Decimal("0.005")), 1);
});

test("revalidacao catalogada e tenant-scoped e detecta mudanca de preco", async () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const state = {
    offer: {
      id: "offer-catalog-001",
      empresaId: 7,
      catalogProductId: 11,
      stockProductId: 21,
      title: "Produto canônico",
      price: new Prisma.Decimal("10.00"),
      currency: "BRL",
      availabilityStatus: "AVAILABLE",
      sourceFreshness: "FRESH",
      stockMaterialVersion: 4,
      catalogRevision: 3,
      status: "ACTIVE",
      expiresAt: new Date("2026-08-25T13:00:00.000Z"),
      catalogProduct: null,
      stockProduct: null,
    },
    catalog: {
      id: 11,
      empresaId: 7,
      stockProductId: 21,
      title: "Produto canônico",
      commercialPrice: new Prisma.Decimal("10.00"),
      currency: "BRL",
      priceStatus: "AVAILABLE",
      visibility: "PUBLISHED",
      sellabilityPolicy: "STOCK_CANONICAL_ONLY",
      archivedAt: null,
      revision: 3,
      stockProduct: null,
    },
    stock: { id: 21, empresaId: 7, nomeExibicao: "Produto canônico", skuCanonico: "SKU-21", unidadeCanonica: "UN", ativo: true },
  };
  const prisma = {
    productOffer: { findFirst: async () => state.offer },
    commercialCatalogProduct: { findFirst: async () => state.catalog },
    produtoEstoque: { findFirst: async () => state.stock },
    saldoEstoque: { findMany: async () => [{ revision: 4, freshnessEstado: "FRESH", dataConfidence: "HIGH", fonteAutoritativaId: 1, fonteAutoritativa: { statusCiclo: "ACTIVE", prioridade: 1 }, semanticaDisponivel: "EXPLICIT", available: new Prisma.Decimal("5"), unidade: "UN" }] },
  };
  const proposal = {
    itens: [{
      itemType: "CATALOG_ITEM",
      productOfferId: state.offer.id,
      catalogProductId: 11,
      stockProductId: 21,
      productNameSnapshot: "Produto canônico",
      skuSnapshot: "SKU-21",
      unitSnapshot: "UN",
      valorUnitarioCentavos: 1000,
      currencySnapshot: "BRL",
      priceStatusSnapshot: "AVAILABLE",
      offerExpiresAt: state.offer.expiresAt,
      catalogRevision: 3,
      stockMaterialVersion: 4,
      quantidade: new Prisma.Decimal("2"),
    }],
  };
  assert.deepEqual((await revalidateProposalCatalogItems(prisma, { empresaId: 7 }, proposal, now)).reasons, []);
  state.catalog.commercialPrice = new Prisma.Decimal("10.005");
  const changed = await revalidateProposalCatalogItems(prisma, { empresaId: 7 }, proposal, now);
  assert.equal(changed.valid, false);
  assert.ok(changed.reasons.some((reason) => reason.code === "PRICE_CHANGED"));
});

test("revalidacao ignora itens legados e nao exige catalogo", async () => {
  const result = await revalidateProposalCatalogItems({}, { empresaId: 9 }, {
    itens: [{ itemType: "LEGACY_ITEM", descricao: "Servico", quantidade: new Prisma.Decimal("1"), valorUnitarioCentavos: 100 }],
  });
  assert.deepEqual(result, { valid: true, reasons: [] });
});

test("revalidacao bloqueia moeda divergente e disponibilidade stale/out-of-stock", async () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const offer = {
    id: "offer-catalog-002",
    empresaId: 7,
    catalogProductId: 11,
    stockProductId: 21,
    title: "Produto canônico",
    price: new Prisma.Decimal("10.00"),
    currency: "BRL",
    availabilityStatus: "AVAILABLE",
    sourceFreshness: "FRESH",
    stockMaterialVersion: 4,
    catalogRevision: 3,
    status: "ACTIVE",
    expiresAt: new Date("2026-08-25T13:00:00.000Z"),
    catalogProduct: null,
    stockProduct: null,
  };
  const catalog = {
    id: 11,
    empresaId: 7,
    stockProductId: 21,
    title: "Produto canônico",
    commercialPrice: new Prisma.Decimal("10.00"),
    currency: "USD",
    priceStatus: "AVAILABLE",
    visibility: "PUBLISHED",
    archivedAt: null,
    revision: 3,
    stockProduct: null,
  };
  const stock = { id: 21, empresaId: 7, nomeExibicao: "Produto canônico", skuCanonico: "SKU-21", unidadeCanonica: "UN", ativo: true };
  const balances = [{ revision: 4, freshnessEstado: "STALE", dataConfidence: "HIGH", fonteAutoritativaId: 1, fonteAutoritativa: { statusCiclo: "ACTIVE", prioridade: 1 }, semanticaDisponivel: "EXPLICIT", available: new Prisma.Decimal("0"), unidade: "UN" }];
  const prisma = {
    productOffer: { findFirst: async () => offer },
    commercialCatalogProduct: { findFirst: async () => catalog },
    produtoEstoque: { findFirst: async () => stock },
    saldoEstoque: { findMany: async () => balances },
  };
  const result = await revalidateProposalCatalogItems(prisma, { empresaId: 7 }, {
    itens: [{
      itemType: "CATALOG_ITEM",
      productOfferId: offer.id,
      catalogProductId: 11,
      stockProductId: 21,
      productNameSnapshot: offer.title,
      skuSnapshot: "SKU-21",
      unitSnapshot: "UN",
      valorUnitarioCentavos: 1000,
      currencySnapshot: "BRL",
      priceStatusSnapshot: "AVAILABLE",
      offerExpiresAt: offer.expiresAt,
      catalogRevision: 3,
      stockMaterialVersion: 4,
      quantidade: new Prisma.Decimal("2"),
    }],
  }, now);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.code === "CURRENCY_MISMATCH"));
  assert.ok(result.reasons.some((reason) => ["STALE_AVAILABILITY", "OUT_OF_STOCK", "UNKNOWN_AVAILABILITY"].includes(reason.code)));
});
