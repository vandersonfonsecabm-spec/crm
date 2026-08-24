"use strict";

const { URL } = require("node:url");

const VISIBILITY = Object.freeze({ HIDDEN: "HIDDEN", PUBLISHED: "PUBLISHED", ARCHIVED: "ARCHIVED" });
const PRICE_STATUS = Object.freeze({ AVAILABLE: "AVAILABLE", ON_REQUEST: "ON_REQUEST", UNAVAILABLE: "UNAVAILABLE", STALE: "STALE" });
const AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  LOW_AVAILABILITY: "LOW_AVAILABILITY",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION",
  NOT_SELLABLE: "NOT_SELLABLE",
  DATA_STALE: "DATA_STALE",
  UNKNOWN: "UNKNOWN",
});
const DEFAULT_POLICY = Object.freeze({
  maxProductsPerOffer: 3,
  maxSearchCandidates: 20,
  exactQuantityAuthorized: false,
  lowAvailabilityThreshold: 1,
  offerTtlMinutes: 15,
  policyVersion: "ai-commerce-foundation.v1",
  tenantTimezone: "America/Sao_Paulo",
});

class CommerceCatalogError extends Error {
  constructor(code, message, status = 422, details = undefined) {
    super(message);
    this.name = "CommerceCatalogError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function requireTenantId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new CommerceCatalogError("COMMERCE_TENANT_CONTEXT_INVALID", "Contexto de empresa invalido.", 401);
  return id;
}

function requirePositiveId(value, code = "COMMERCE_INVALID_ID") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new CommerceCatalogError(code, "Identificador invalido.", 422);
  return id;
}

function boundedString(value, max, field, { optional = true } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new CommerceCatalogError("COMMERCE_INVALID_INPUT", `${field} obrigatorio.`, 422);
  }
  if (typeof value !== "string" || value.length > max) throw new CommerceCatalogError("COMMERCE_INVALID_INPUT", `${field} invalido.`, 422);
  const normalized = value.trim();
  if (!normalized && !optional) throw new CommerceCatalogError("COMMERCE_INVALID_INPUT", `${field} obrigatorio.`, 422);
  return normalized || null;
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedJson(value, fallback, maxBytes = 16000) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  let parsed = value;
  if (typeof value === "string") parsed = parseJson(value, undefined);
  if (parsed === undefined) throw new CommerceCatalogError("COMMERCE_INVALID_INPUT", "JSON estruturado invalido.", 422);
  let serialized;
  try { serialized = JSON.stringify(parsed); } catch { throw new CommerceCatalogError("COMMERCE_INVALID_INPUT", "JSON estruturado invalido.", 422); }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw new CommerceCatalogError("COMMERCE_INPUT_TOO_LARGE", "JSON estruturado excede o limite.", 422);
  return serialized;
}

function validateMediaJson(value, allowedLinkDomain) {
  const media = parseJson(value, []);
  if (!Array.isArray(media)) throw new CommerceCatalogError("COMMERCE_INVALID_MEDIA", "Midia estruturada invalida.", 422);
  for (const item of media.slice(0, 20)) {
    const url = typeof item === "string" ? item : item && typeof item === "object" ? item.url : null;
    if (url) validatePublicUrl(url, allowedLinkDomain, "media.url");
  }
  return media;
}

function parseList(value, max = 50) {
  const parsed = parseJson(value, Array.isArray(value) ? value : []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCurrency(value) {
  const currency = String(value || "BRL").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new CommerceCatalogError("COMMERCE_INVALID_CURRENCY", "Moeda invalida.", 422);
  return currency;
}

function decimalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new CommerceCatalogError("COMMERCE_INVALID_PRICE", "Preco invalido.", 422);
  return number;
}

function validatePublicUrl(value, allowedLinkDomain, field = "URL") {
  if (value === undefined || value === null || value === "") return null;
  const raw = boundedString(value, 2048, field, { optional: false });
  let parsed;
  try { parsed = new URL(raw); } catch { throw new CommerceCatalogError("COMMERCE_INVALID_URL", `${field} invalida.`, 422); }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) throw new CommerceCatalogError("COMMERCE_INVALID_URL", `${field} deve usar HTTPS publico.`, 422);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) throw new CommerceCatalogError("COMMERCE_INVALID_URL", `${field} aponta para destino privado.`, 422);
  const domain = allowedLinkDomain ? String(allowedLinkDomain).trim().toLowerCase().replace(/^\.+|\.+$/g, "") : null;
  if (!domain || !(hostname === domain || hostname.endsWith(`.${domain}`))) throw new CommerceCatalogError("COMMERCE_URL_DOMAIN_NOT_ALLOWED", `${field} fora do dominio permitido.`, 422);
  return parsed.toString();
}

function publicCatalogProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    empresaId: row.empresaId,
    stockProductId: row.stockProductId,
    title: row.title,
    shortDescription: row.shortDescription || null,
    longDescription: row.longDescription || null,
    category: row.category || null,
    brand: row.brand || null,
    model: row.model || null,
    tags: parseList(row.tagsJson),
    synonyms: parseList(row.synonymsJson),
    attributes: parseJson(row.attributesJson, {}),
    primaryImageUrl: row.primaryImageUrl || null,
    additionalMedia: parseJson(row.additionalMediaJson, []),
    commercialPrice: row.commercialPrice ?? null,
    currency: row.currency,
    priceStatus: row.priceStatus,
    priceObservedAt: row.priceObservedAt || null,
    visibility: row.visibility,
    sellabilityPolicy: row.sellabilityPolicy,
    productUrl: row.productUrl || null,
    purchaseUrl: row.purchaseUrl || null,
    allowedLinkDomain: row.allowedLinkDomain || null,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt || null,
  };
}

module.exports = {
  AVAILABILITY_STATUS,
  CommerceCatalogError,
  DEFAULT_POLICY,
  PRICE_STATUS,
  VISIBILITY,
  boundedJson,
  boundedString,
  decimalNumber,
  normalizeCurrency,
  normalizeSearchText,
  parseJson,
  parseList,
  publicCatalogProduct,
  requirePositiveId,
  requireTenantId,
  validatePublicUrl,
  validateMediaJson,
};
