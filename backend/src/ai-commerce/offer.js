"use strict";

const {
  AVAILABILITY_STATUS,
  CommerceCatalogError,
  DEFAULT_POLICY,
  PRICE_STATUS,
  VISIBILITY,
  boundedJson,
  normalizeCurrency,
  parseJson,
  requireTenantId,
  validatePublicUrl,
} = require("./common");

function createProductOfferService({ prisma, catalogService, availabilityService, clock = () => new Date(), policy = {} } = {}) {
  if (!prisma?.productOffer) throw new Error("PRODUCT_OFFER_PRISMA_MODEL_MISSING");
  if (!catalogService?.get) throw new Error("PRODUCT_OFFER_CATALOG_SERVICE_MISSING");
  if (!availabilityService?.getSellableAvailability) throw new Error("PRODUCT_OFFER_AVAILABILITY_SERVICE_MISSING");
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };

  async function create({ empresaId, catalogProductId, conversationId = null, customerId = null, correlationId = null, now = clock(), internal = false } = {}) {
    const tenantId = requireTenantId(empresaId);
    const catalog = await catalogService.get(tenantId, catalogProductId, { includeHidden: true });
    if (catalog.visibility !== VISIBILITY.PUBLISHED || catalog.archivedAt || catalog.sellabilityPolicy !== "STOCK_CANONICAL_ONLY") throw new CommerceCatalogError("COMMERCE_PRODUCT_NOT_SELLABLE", "Produto comercial nao pode ser ofertado.", 422);
    if (conversationId !== null && conversationId !== undefined) conversationId = positiveId(conversationId, "COMMERCE_CONVERSATION_ID_INVALID");
    if (customerId !== null && customerId !== undefined) customerId = positiveId(customerId, "COMMERCE_CUSTOMER_ID_INVALID");
    if (conversationId !== null && prisma.conversaCanal?.findFirst) {
      const conversation = await prisma.conversaCanal.findFirst({ where: { id: conversationId, empresaId: tenantId } });
      if (!conversation) throw new CommerceCatalogError("COMMERCE_CONVERSATION_NOT_FOUND", "Conversa nao encontrada.", 404);
    }
    if (customerId !== null && prisma.cliente?.findFirst) {
      const customer = await prisma.cliente.findFirst({ where: { id: customerId, empresaId: tenantId } });
      if (!customer) throw new CommerceCatalogError("COMMERCE_CUSTOMER_NOT_FOUND", "Cliente nao encontrado.", 404);
    }
    const availability = await availabilityService.getSellableAvailability({ empresaId: tenantId, catalogProductId: catalog.id, now });
    if (availability.status === AVAILABILITY_STATUS.NOT_SELLABLE) throw new CommerceCatalogError("COMMERCE_PRODUCT_NOT_SELLABLE", "Produto comercial nao pode ser ofertado.", 422);
    const expiresAt = new Date(new Date(now).getTime() + Math.min(1440, Math.max(1, Number(effectivePolicy.offerTtlMinutes) || 15)) * 60 * 1000);
    const price = catalog.priceStatus === PRICE_STATUS.AVAILABLE && catalog.commercialPrice !== null && catalog.commercialPrice !== undefined ? catalog.commercialPrice : null;
    const currency = normalizeCurrency(catalog.currency || "BRL");
    const allowedActions = ["VIEW_PRODUCT", "REGISTER_PRODUCT_INTEREST"];
    if (catalog.purchaseUrl) allowedActions.push("PURCHASE_LINK");
    const data = {
      empresaId: tenantId,
      conversationId,
      customerId,
      catalogProductId: catalog.id,
      stockProductId: catalog.stockProductId,
      title: catalog.title,
      shortDescription: catalog.shortDescription || null,
      imageUrl: catalog.primaryImageUrl || null,
      price,
      currency,
      availabilityStatus: availability.status,
      availabilityLabel: availability.label,
      commercialTermsJson: boundedJson({ priceStatus: catalog.priceStatus, policy: catalog.sellabilityPolicy }, {}),
      productUrl: catalog.productUrl || null,
      purchaseUrl: catalog.purchaseUrl || null,
      allowedActionsJson: JSON.stringify(allowedActions),
      sourceFreshness: availability.freshness || "UNKNOWN",
      confidence: availability.confidence || "UNKNOWN",
      manualConfirmationRequired: Boolean(availability.manualConfirmationRequired || availability.status !== AVAILABILITY_STATUS.AVAILABLE),
      createdAt: now,
      expiresAt,
      catalogRevision: catalog.revision,
      stockMaterialVersion: availability.stockMaterialVersion || null,
      policyVersion: effectivePolicy.policyVersion,
      correlationId: typeof correlationId === "string" ? correlationId.slice(0, 128) : null,
      status: "ACTIVE",
    };
    validateSnapshotUrls(data, catalog.allowedLinkDomain);
    const row = await prisma.productOffer.create({ data });
    return publicOffer(row, { internal });
  }

  async function get({ empresaId, offerId, revalidate = true, now = clock(), internal = false } = {}) {
    const tenantId = requireTenantId(empresaId);
    const id = boundedOfferId(offerId);
    const row = await prisma.productOffer.findFirst({ where: { id, empresaId: tenantId } });
    if (!row) throw new CommerceCatalogError("COMMERCE_OFFER_NOT_FOUND", "Oferta nao encontrada.", 404);
    if (new Date(row.expiresAt).getTime() <= new Date(now).getTime()) {
      if (row.status === "ACTIVE") await prisma.productOffer.updateMany({ where: { id, empresaId: tenantId, status: "ACTIVE" }, data: { status: "EXPIRED" } });
      return { ...publicOffer({ ...row, status: "EXPIRED" }, { internal }), valid: false, invalidReason: "OFFER_EXPIRED" };
    }
    if (!revalidate) return { ...publicOffer(row, { internal }), valid: row.status === "ACTIVE", invalidReason: row.status === "ACTIVE" ? null : `OFFER_${row.status}` };
    const catalog = await catalogService.get(tenantId, row.catalogProductId, { includeHidden: true }).catch(() => null);
    if (!catalog || catalog.visibility !== VISIBILITY.PUBLISHED || catalog.archivedAt || catalog.revision !== row.catalogRevision) return markStale(row, tenantId, "CATALOG_CHANGED", internal);
    const current = await availabilityService.getSellableAvailability({ empresaId: tenantId, catalogProductId: row.catalogProductId, now });
    if (Number(current.stockMaterialVersion || 0) !== Number(row.stockMaterialVersion || 0) || current.status !== row.availabilityStatus) return markStale(row, tenantId, "AVAILABILITY_CHANGED", internal);
    return { ...publicOffer(row, { internal }), valid: row.status === "ACTIVE", invalidReason: row.status === "ACTIVE" ? null : `OFFER_${row.status}` };
  }

  async function markStale(row, tenantId, reason, internal = false) {
    await prisma.productOffer.updateMany({ where: { id: row.id, empresaId: tenantId, status: "ACTIVE" }, data: { status: "STALE" } });
    return { ...publicOffer({ ...row, status: "STALE" }, { internal }), valid: false, invalidReason: reason };
  }

  return Object.freeze({ create, get, public: publicOffer, policy: effectivePolicy });
}

function publicOffer(row, { internal = false } = {}) {
  const safe = {
    offerId: row.id,
    catalogProductId: row.catalogProductId,
    title: row.title,
    shortDescription: row.shortDescription || null,
    imageUrl: row.imageUrl || null,
    price: row.price ?? null,
    currency: row.currency,
    availabilityStatus: row.availabilityStatus,
    availabilityLabel: row.availabilityLabel,
    commercialTerms: parseJson(row.commercialTermsJson, {}),
    productUrl: row.productUrl || null,
    purchaseUrl: row.purchaseUrl || null,
    allowedActions: parseJson(row.allowedActionsJson, []),
    sourceFreshness: row.sourceFreshness,
    confidence: row.confidence,
    manualConfirmationRequired: Boolean(row.manualConfirmationRequired),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    catalogRevision: row.catalogRevision,
    stockMaterialVersion: row.stockMaterialVersion || null,
    policyVersion: row.policyVersion,
    correlationId: row.correlationId || null,
    status: row.status,
  };
  if (internal) Object.assign(safe, { stockProductId: row.stockProductId, conversationId: row.conversationId || null, customerId: row.customerId || null, empresaId: row.empresaId });
  return safe;
}

function validateSnapshotUrls(data, domain) {
  validatePublicUrl(data.productUrl, domain, "productUrl");
  validatePublicUrl(data.purchaseUrl, domain, "purchaseUrl");
  validatePublicUrl(data.imageUrl, domain, "imageUrl");
}
function positiveId(value, code) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new CommerceCatalogError(code, "Identificador invalido.", 422); return n; }
function boundedOfferId(value) { if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new CommerceCatalogError("COMMERCE_OFFER_ID_INVALID", "Oferta invalida.", 422); return value; }

module.exports = { createProductOfferService, publicOffer };
