"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCommercialCatalogService } = require("../src/ai-commerce/catalog");
const { createSellableAvailabilityService, evaluateBalances } = require("../src/ai-commerce/availability");
const { createCommercialSearchService } = require("../src/ai-commerce/search");
const { createProductOfferService } = require("../src/ai-commerce/offer");

function row(overrides = {}) {
  return {
    id: 1, empresaId: 1, stockProductId: 7, title: "Rocadeira profissional", shortDescription: "Gasolina", longDescription: null,
    category: "Ferramentas", brand: "Agro", model: "RX", tagsJson: '["roçadeira","gasolina"]', synonymsJson: '["roçadeira"]', attributesJson: '{"motor":"gasolina"}',
    primaryImageUrl: "https://catalog.example.test/images/1.jpg", additionalMediaJson: "[]", commercialPrice: 1499.9, currency: "BRL", priceStatus: "AVAILABLE",
    priceObservedAt: new Date("2026-08-24T12:00:00Z"), visibility: "PUBLISHED", sellabilityPolicy: "STOCK_CANONICAL_ONLY", productUrl: "https://catalog.example.test/products/1", purchaseUrl: "https://catalog.example.test/buy/1", allowedLinkDomain: "catalog.example.test", revision: 1,
    createdAt: new Date("2026-08-24T12:00:00Z"), updatedAt: new Date("2026-08-24T12:00:00Z"), archivedAt: null, ...overrides,
  };
}

function fakePrisma() {
  const products = [row()];
  const offers = [];
  const balances = [{ id: 4, empresaId: 1, produtoEstoqueId: 7, loteId: null, localId: null, fonteAutoritativaId: 8, unidade: "UN", onHand: 5, reserved: 0, available: 5, semanticaDisponivel: "EXPLICIT", freshnessEstado: "FRESH", dataConfidence: "HIGH", observedAt: new Date("2026-08-24T11:00:00Z"), revision: 3, fonteAutoritativa: { id: 8, statusCiclo: "ACTIVE" }, lote: null, local: null }];
  return {
    products,
    offers,
    commercialCatalogProduct: {
      findFirst: async ({ where }) => products.find((item) => item.id === where.id && item.empresaId === where.empresaId && (!where.visibility || item.visibility === where.visibility)) || null,
      findMany: async ({ where, take }) => products.filter((item) => item.empresaId === where.empresaId && (!where.visibility || item.visibility === where.visibility) && (!where.archivedAt || item.archivedAt === where.archivedAt) && (!where.category || item.category === where.category) && (!where.brand || item.brand === where.brand)).slice(0, take),
      create: async ({ data }) => { const created = row({ ...data, id: products.length + 1 }); products.push(created); return created; },
      updateMany: async ({ where, data }) => { const item = products.find((candidate) => candidate.id === where.id && candidate.empresaId === where.empresaId && candidate.revision === where.revision); if (!item) return { count: 0 }; for (const [key, value] of Object.entries(data)) item[key] = key === "revision" ? item.revision + 1 : value; return { count: 1 }; },
    },
    produtoEstoque: { findFirst: async ({ where }) => where.id === 7 && where.empresaId === 1 ? { id: 7, empresaId: 1, ativo: true } : null },
    saldoEstoque: { findMany: async ({ where }) => balances.filter((item) => item.empresaId === where.empresaId && item.produtoEstoqueId === where.produtoEstoqueId) },
    productOffer: {
      create: async ({ data }) => { const created = { id: `offer-${String(offers.length + 1).padStart(4, "0")}`, ...data }; offers.push(created); return created; },
      findFirst: async ({ where }) => offers.find((item) => item.id === where.id && item.empresaId === where.empresaId) || null,
      updateMany: async ({ where, data }) => { const item = offers.find((candidate) => candidate.id === where.id && candidate.empresaId === where.empresaId && (!where.status || candidate.status === where.status)); if (!item) return { count: 0 }; Object.assign(item, data); return { count: 1 }; },
    },
  };
}

test("catalog defaults hidden, binds canonical tenant product and rejects unapproved URL", async () => {
  const prisma = fakePrisma();
  const service = createCommercialCatalogService({ prisma, clock: () => new Date("2026-08-24T12:00:00Z") });
  await assert.rejects(() => service.create({ empresaId: 1, data: { stockProductId: 7, title: "X", allowedLinkDomain: "catalog.example.test", productUrl: "https://evil.example.org/x" } }), (error) => error.code === "COMMERCE_URL_DOMAIN_NOT_ALLOWED");
  const created = await service.create({ empresaId: 1, data: { stockProductId: 7, title: "Rocadeira nova", allowedLinkDomain: "catalog.example.test", productUrl: "https://catalog.example.test/x" } });
  assert.equal(created.visibility, "HIDDEN");
  assert.equal(created.id, 2);
});

test("availability is fail-closed for stale, unknown and expired canonical balances", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const fresh = evaluateBalances({ now, balances: [{ id: 1, fonteAutoritativa: { statusCiclo: "ACTIVE" }, semanticaDisponivel: "EXPLICIT", available: 4, freshnessEstado: "FRESH", dataConfidence: "HIGH", revision: 1, unidade: "UN" }] });
  assert.equal(fresh.status, "AVAILABLE");
  const stale = evaluateBalances({ now, balances: [{ id: 1, fonteAutoritativa: { statusCiclo: "ACTIVE" }, semanticaDisponivel: "EXPLICIT", available: 4, freshnessEstado: "STALE", dataConfidence: "HIGH" }] });
  assert.equal(stale.status, "DATA_STALE");
  const unknown = evaluateBalances({ now, balances: [{ id: 1, fonteAutoritativa: { statusCiclo: "ACTIVE" }, semanticaDisponivel: "UNKNOWN", onHand: 4, freshnessEstado: "FRESH", dataConfidence: "HIGH" }] });
  assert.equal(unknown.status, "UNKNOWN");
  const expired = evaluateBalances({ now, balances: [{ id: 1, fonteAutoritativa: { statusCiclo: "ACTIVE" }, lote: { estado: "ACTIVE", validadeEm: "2026-08-23", precisaoValidade: "DAY" }, semanticaDisponivel: "EXPLICIT", available: 4, freshnessEstado: "FRESH", dataConfidence: "HIGH" }] });
  assert.equal(expired.status, "NEEDS_CONFIRMATION");
});

test("deterministic search is tenant-scoped and bounded", async () => {
  const prisma = fakePrisma();
  const catalog = createCommercialCatalogService({ prisma });
  const availability = createSellableAvailabilityService({ prisma, catalogService: catalog });
  const search = createCommercialSearchService({ prisma, availabilityService: availability });
  const result = await search.search({ empresaId: 1, query: "rocadeira gasolina", limit: 20 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].product.title, "Rocadeira profissional");
  assert.equal((await search.search({ empresaId: 2, query: "rocadeira" })).items.length, 0);
});

test("ProductOffer snapshots price/availability and expires or revalidates materially", async () => {
  const prisma = fakePrisma();
  const catalog = createCommercialCatalogService({ prisma });
  const availability = createSellableAvailabilityService({ prisma, catalogService: catalog });
  const offers = createProductOfferService({ prisma, catalogService: catalog, availabilityService: availability, clock: () => new Date("2026-08-24T12:00:00Z") });
  const created = await offers.create({ empresaId: 1, catalogProductId: 1, correlationId: "test" });
  assert.equal(created.availabilityStatus, "AVAILABLE");
  assert.equal(created.price, 1499.9);
  assert.deepEqual(created.allowedActions, ["VIEW_PRODUCT", "REGISTER_PRODUCT_INTEREST", "PURCHASE_LINK"]);
  const valid = await offers.get({ empresaId: 1, offerId: created.offerId, now: new Date("2026-08-24T12:01:00Z") });
  assert.equal(valid.valid, true);
  const expired = await offers.get({ empresaId: 1, offerId: created.offerId, now: new Date("2026-08-25T12:01:00Z") });
  assert.equal(expired.valid, false);
});
