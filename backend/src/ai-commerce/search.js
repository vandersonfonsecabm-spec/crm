"use strict";

const {
  CommerceCatalogError,
  DEFAULT_POLICY,
  VISIBILITY,
  normalizeSearchText,
  parseJson,
  parseList,
  requireTenantId,
} = require("./common");

function createCommercialSearchService({ prisma, catalogService = null, availabilityService = null, policy = {} } = {}) {
  if (!prisma?.commercialCatalogProduct) throw new Error("COMMERCIAL_SEARCH_PRISMA_MODEL_MISSING");
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };

  async function search({ empresaId, query = "", category = null, brand = null, minPrice = null, maxPrice = null, availability = null, limit = effectivePolicy.maxSearchCandidates } = {}) {
    const tenantId = requireTenantId(empresaId);
    const normalizedQuery = normalizeSearchText(query);
    const take = Math.min(effectivePolicy.maxSearchCandidates, Math.max(1, Number(limit) || effectivePolicy.maxSearchCandidates));
    const where = { empresaId: tenantId, visibility: VISIBILITY.PUBLISHED, archivedAt: null };
    if (category) where.category = String(category).trim();
    if (brand) where.brand = String(brand).trim();
    if (minPrice !== null && minPrice !== undefined && minPrice !== "") where.commercialPrice = { ...(where.commercialPrice || {}), gte: assertPrice(minPrice) };
    if (maxPrice !== null && maxPrice !== undefined && maxPrice !== "") where.commercialPrice = { ...(where.commercialPrice || {}), lte: assertPrice(maxPrice) };
    const rows = await prisma.commercialCatalogProduct.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: Math.min(200, Math.max(20, take * 10)) });
    const ranked = rows.map((row) => ({ row, score: scoreRow(row, normalizedQuery) })).filter(({ score }) => !normalizedQuery || score > 0).sort((a, b) => b.score - a.score || a.row.id - b.row.id);
    const filtered = [];
    for (const candidate of ranked) {
      if (filtered.length >= take) break;
      let availabilityResult = null;
      if (availability || availabilityService) {
        if (!availabilityService?.getSellableAvailability) throw new CommerceCatalogError("COMMERCE_AVAILABILITY_UNAVAILABLE", "Disponibilidade indisponivel.", 503);
        availabilityResult = await availabilityService.getSellableAvailability({ empresaId: tenantId, catalogProductId: candidate.row.id });
        if (availability && availabilityResult.status !== availability) continue;
      }
      filtered.push({ product: publicSearchProduct(candidate.row), availability: availabilityResult || undefined });
    }
    return { items: filtered, count: filtered.length, query: typeof query === "string" ? query.slice(0, 240) : "" };
  }

  return Object.freeze({ search, scoreRow, policy: effectivePolicy });
}

function scoreRow(row, query) {
  if (!query) return 1;
  const fields = [
    [row.title, 100],
    [row.brand, 45],
    [row.model, 40],
    [row.category, 30],
    ...parseList(row.tagsJson).map((value) => [value, 22]),
    ...parseList(row.synonymsJson).map((value) => [value, 20]),
    ...Object.entries(parseJson(row.attributesJson, {})).flatMap(([key, value]) => [[key, 12], [String(value), 10]]),
  ];
  let score = 0;
  for (const [value, weight] of fields) {
    const normalized = normalizeSearchText(value);
    if (!normalized) continue;
    if (normalized === query) score += weight * 2;
    else if (normalized.startsWith(query)) score += weight;
    else {
      const queryTokens = query.split(" ").filter(Boolean);
      const matches = queryTokens.filter((token) => normalized.split(" ").some((part) => part === token || part.startsWith(token))).length;
      score += matches * Math.max(1, Math.floor(weight / 3));
    }
  }
  return score;
}

function publicSearchProduct(row) {
  return {
    id: row.id,
    stockProductId: row.stockProductId,
    title: row.title,
    shortDescription: row.shortDescription || null,
    category: row.category || null,
    brand: row.brand || null,
    model: row.model || null,
    tags: parseList(row.tagsJson),
    synonyms: parseList(row.synonymsJson),
    attributes: parseJson(row.attributesJson, {}),
    primaryImageUrl: row.primaryImageUrl || null,
    commercialPrice: row.priceStatus === "AVAILABLE" ? row.commercialPrice : null,
    currency: row.currency,
    priceStatus: row.priceStatus,
    productUrl: row.productUrl || null,
    purchaseUrl: row.purchaseUrl || null,
    revision: row.revision,
  };
}

function assertPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new CommerceCatalogError("COMMERCE_INVALID_PRICE", "Faixa de preco invalida.", 422);
  return parsed;
}

module.exports = { createCommercialSearchService, scoreRow, publicSearchProduct };
