"use strict";

const {
  CommerceCatalogError,
  DEFAULT_POLICY,
  PRICE_STATUS,
  VISIBILITY,
  boundedJson,
  boundedString,
  decimalNumber,
  normalizeCurrency,
  parseJson,
  publicCatalogProduct,
  requirePositiveId,
  requireTenantId,
  validatePublicUrl,
  validateMediaJson,
} = require("./common");

function createCommercialCatalogService({ prisma, clock = () => new Date(), policy = {} } = {}) {
  if (!prisma?.commercialCatalogProduct) throw new Error("COMMERCIAL_CATALOG_PRISMA_MODEL_MISSING");
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };

  async function getProduct(empresaId, catalogProductId, { includeHidden = false } = {}) {
    const tenantId = requireTenantId(empresaId);
    const id = requirePositiveId(catalogProductId, "COMMERCE_CATALOG_PRODUCT_ID_INVALID");
    const where = { id, empresaId };
    if (!includeHidden) where.visibility = VISIBILITY.PUBLISHED;
    const row = await prisma.commercialCatalogProduct.findFirst({ where });
    if (!row || (!includeHidden && row.archivedAt)) throw new CommerceCatalogError("COMMERCE_CATALOG_PRODUCT_NOT_FOUND", "Produto comercial nao encontrado.", 404);
    return row;
  }

  async function assertStockProduct(empresaId, stockProductId) {
    const id = requirePositiveId(stockProductId, "COMMERCE_STOCK_PRODUCT_ID_INVALID");
    const row = await prisma.produtoEstoque?.findFirst?.({ where: { id, empresaId } });
    if (!row || row.ativo === false) throw new CommerceCatalogError("COMMERCE_STOCK_PRODUCT_NOT_FOUND", "Produto canonico de estoque nao encontrado.", 404);
    return row;
  }

  function normalizeProductInput(input = {}, { partial = false } = {}) {
    const result = {};
    if (!partial || input.stockProductId !== undefined) result.stockProductId = requirePositiveId(input.stockProductId, "COMMERCE_STOCK_PRODUCT_ID_INVALID");
    if (!partial || input.title !== undefined) result.title = boundedString(input.title, 240, "title", { optional: false });
    for (const field of ["shortDescription", "longDescription", "category", "brand", "model"]) {
      if (!partial || input[field] !== undefined) result[field] = boundedString(input[field], field === "longDescription" ? 8000 : 1000, field);
    }
    for (const field of ["tags", "synonyms"]) {
      if (!partial || input[field] !== undefined) result[`${field}Json`] = boundedJson(input[field], [], field === "tags" ? 100 : 100);
    }
    if (!partial || input.attributes !== undefined) result.attributesJson = boundedJson(input.attributes, {}, 16000);
    if (!partial || input.additionalMedia !== undefined) result.additionalMediaJson = boundedJson(input.additionalMedia, [], 12000);
    for (const field of ["primaryImageUrl", "productUrl", "purchaseUrl"]) {
      if (!partial || input[field] !== undefined) result[field] = input[field] || null;
    }
    if (!partial || input.allowedLinkDomain !== undefined) result.allowedLinkDomain = boundedString(input.allowedLinkDomain, 255, "allowedLinkDomain");
    if (input.currency !== undefined || !partial) result.currency = normalizeCurrency(input.currency || "BRL");
    if (input.commercialPrice !== undefined || !partial) result.commercialPrice = decimalNumber(input.commercialPrice);
    if (input.priceStatus !== undefined || !partial) {
      const value = String(input.priceStatus || (result.commercialPrice === null ? PRICE_STATUS.ON_REQUEST : PRICE_STATUS.AVAILABLE)).toUpperCase();
      if (!Object.values(PRICE_STATUS).includes(value)) throw new CommerceCatalogError("COMMERCE_INVALID_PRICE_STATUS", "Status de preco invalido.", 422);
      result.priceStatus = value;
    }
    if (input.visibility !== undefined || !partial) {
      const value = String(input.visibility || VISIBILITY.HIDDEN).toUpperCase();
      if (!Object.values(VISIBILITY).includes(value)) throw new CommerceCatalogError("COMMERCE_INVALID_VISIBILITY", "Visibilidade invalida.", 422);
      result.visibility = value;
    }
    if (input.sellabilityPolicy !== undefined || !partial) result.sellabilityPolicy = boundedString(input.sellabilityPolicy || "STOCK_CANONICAL_ONLY", 100, "sellabilityPolicy", { optional: false });
    return result;
  }

  function validateUrls(input) {
    const domain = input.allowedLinkDomain || null;
    validateMediaJson(input.additionalMediaJson, domain);
    return {
      ...input,
      primaryImageUrl: validatePublicUrl(input.primaryImageUrl, domain, "primaryImageUrl"),
      productUrl: validatePublicUrl(input.productUrl, domain, "productUrl"),
      purchaseUrl: validatePublicUrl(input.purchaseUrl, domain, "purchaseUrl"),
    };
  }

  async function create({ empresaId, data = {}, actorUsuarioId = null } = {}) {
    const tenantId = requireTenantId(empresaId);
    const normalized = validateUrls(normalizeProductInput(data));
    await assertStockProduct(tenantId, normalized.stockProductId);
    if (normalized.visibility === VISIBILITY.PUBLISHED && normalized.sellabilityPolicy !== "STOCK_CANONICAL_ONLY") {
      throw new CommerceCatalogError("COMMERCE_PUBLISH_POLICY_INVALID", "Produto publicado deve usar politica de estoque canonico.", 422);
    }
    assertPriceStatusConsistency(normalized);
    const now = clock();
    const row = await prisma.commercialCatalogProduct.create({
      data: {
        empresaId: tenantId,
        ...normalized,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: normalized.visibility === VISIBILITY.ARCHIVED ? now : null,
      },
    });
    return publicCatalogProduct(row);
  }

  async function update({ empresaId, catalogProductId, data = {}, expectedRevision = null } = {}) {
    const tenantId = requireTenantId(empresaId);
    const id = requirePositiveId(catalogProductId, "COMMERCE_CATALOG_PRODUCT_ID_INVALID");
    const existing = await prisma.commercialCatalogProduct.findFirst({ where: { id, empresaId: tenantId } });
    if (!existing) throw new CommerceCatalogError("COMMERCE_CATALOG_PRODUCT_NOT_FOUND", "Produto comercial nao encontrado.", 404);
    if (expectedRevision !== null && Number(expectedRevision) !== existing.revision) throw new CommerceCatalogError("COMMERCE_CATALOG_CONFLICT", "Produto comercial foi alterado por outro operador.", 409);
    const rawNormalized = normalizeProductInput(data, { partial: true });
    const mergedForValidation = validateUrls({ ...existing, ...rawNormalized, allowedLinkDomain: rawNormalized.allowedLinkDomain ?? existing.allowedLinkDomain });
    const normalized = Object.fromEntries(Object.keys(rawNormalized).map((key) => [key, mergedForValidation[key]]));
    if (normalized.stockProductId !== undefined) await assertStockProduct(tenantId, normalized.stockProductId);
    const merged = { ...existing, ...normalized };
    if (merged.visibility === VISIBILITY.PUBLISHED && merged.sellabilityPolicy !== "STOCK_CANONICAL_ONLY") throw new CommerceCatalogError("COMMERCE_PUBLISH_POLICY_INVALID", "Produto publicado deve usar politica de estoque canonico.", 422);
    assertPriceStatusConsistency(merged);
    const now = clock();
    const updateData = {
      ...normalized,
      ...(normalized.visibility === undefined ? {} : { archivedAt: normalized.visibility === VISIBILITY.ARCHIVED ? now : null }),
      revision: { increment: 1 },
      updatedAt: now,
    };
    const result = await prisma.commercialCatalogProduct.updateMany({ where: { id, empresaId: tenantId, revision: existing.revision }, data: updateData });
    if (result.count !== 1) throw new CommerceCatalogError("COMMERCE_CATALOG_CONFLICT", "Produto comercial foi alterado por outro operador.", 409);
    const row = await prisma.commercialCatalogProduct.findFirst({ where: { id, empresaId: tenantId } });
    return publicCatalogProduct(row);
  }

  async function archive({ empresaId, catalogProductId, expectedRevision = null } = {}) {
    return update({ empresaId, catalogProductId, expectedRevision, data: { visibility: VISIBILITY.ARCHIVED } });
  }

  async function publish({ empresaId, catalogProductId, expectedRevision = null } = {}) {
    return update({ empresaId, catalogProductId, expectedRevision, data: { visibility: VISIBILITY.PUBLISHED, sellabilityPolicy: "STOCK_CANONICAL_ONLY" } });
  }

  async function list({ empresaId, cursor = null, limit = 20, includeHidden = false, category = null, brand = null, visibility = null } = {}) {
    const tenantId = requireTenantId(empresaId);
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const where = { empresaId: tenantId, ...(includeHidden ? {} : { visibility: VISIBILITY.PUBLISHED, archivedAt: null }) };
    if (visibility !== null && visibility !== undefined && String(visibility).trim()) {
      const requestedVisibility = String(visibility).trim().toUpperCase();
      if (!Object.values(VISIBILITY).includes(requestedVisibility)) throw new CommerceCatalogError("COMMERCE_INVALID_VISIBILITY", "Visibilidade invalida.", 422);
      if (!includeHidden && requestedVisibility !== VISIBILITY.PUBLISHED) throw new CommerceCatalogError("COMMERCE_VISIBILITY_FORBIDDEN", "Esta visibilidade exige permissao de gestor.", 403);
      where.visibility = requestedVisibility;
      if (requestedVisibility === VISIBILITY.ARCHIVED) where.archivedAt = { not: null };
      if (requestedVisibility !== VISIBILITY.ARCHIVED) where.archivedAt = null;
    }
    if (category) where.category = boundedString(category, 255, "category");
    if (brand) where.brand = boundedString(brand, 255, "brand");
    if (cursor !== null && cursor !== undefined) where.id = { gt: requirePositiveId(cursor, "COMMERCE_CURSOR_INVALID") };
    const rows = await prisma.commercialCatalogProduct.findMany({ where, orderBy: { id: "asc" }, take: take + 1 });
    const hasNext = rows.length > take;
    return { items: rows.slice(0, take).map(publicCatalogProduct), nextCursor: hasNext ? rows[take - 1].id : null };
  }

  return Object.freeze({ create, update, archive, publish, get: getProduct, list, assertStockProduct, normalizeProductInput, normalizePublic: publicCatalogProduct, policy: effectivePolicy });
}

function assertPriceStatusConsistency(product) {
  if (product.priceStatus === PRICE_STATUS.AVAILABLE && (product.commercialPrice === null || product.commercialPrice === undefined)) throw new CommerceCatalogError("COMMERCE_PRICE_STATUS_MISMATCH", "Preco disponivel exige valor comercial.", 422);
}

module.exports = { createCommercialCatalogService };
