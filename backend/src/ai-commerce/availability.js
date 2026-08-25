"use strict";

const {
  AVAILABILITY_STATUS,
  CommerceCatalogError,
  DEFAULT_POLICY,
  parseJson,
  requirePositiveId,
  requireTenantId,
} = require("./common");

function createSellableAvailabilityService({ prisma, clock = () => new Date(), policy = {}, catalogService = null } = {}) {
  if (!prisma) throw new Error("SELLABLE_AVAILABILITY_PRISMA_MISSING");
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };

  async function loadCatalog(empresaId, catalogProductId) {
    const where = { id: requirePositiveId(catalogProductId, "COMMERCE_CATALOG_PRODUCT_ID_INVALID"), empresaId };
    if (catalogService?.get) return catalogService.get(empresaId, where.id, { includeHidden: true });
    if (!prisma.commercialCatalogProduct?.findFirst) throw new CommerceCatalogError("COMMERCE_CATALOG_UNAVAILABLE", "Catalogo comercial indisponivel.", 503);
    const row = await prisma.commercialCatalogProduct.findFirst({ where, include: { stockProduct: true } });
    if (!row) throw new CommerceCatalogError("COMMERCE_CATALOG_PRODUCT_NOT_FOUND", "Produto comercial nao encontrado.", 404);
    return row;
  }

  async function readBalances(empresaId, stockProductId, locationId = null) {
    if (!prisma.saldoEstoque?.findMany) throw new CommerceCatalogError("COMMERCE_STOCK_UNAVAILABLE", "Disponibilidade de estoque indisponivel.", 503);
    const where = { empresaId, produtoEstoqueId: stockProductId };
    if (locationId !== null && locationId !== undefined) where.localId = requirePositiveId(locationId, "COMMERCE_LOCATION_ID_INVALID");
    return prisma.saldoEstoque.findMany({
      where,
      include: { lote: true, local: true, fonteAutoritativa: true },
      orderBy: [{ id: "asc" }],
      take: 200,
    });
  }

  async function getSellableAvailability({ empresaId, catalogProductId, quantity = null, locationId = null, now = clock(), internal = false } = {}) {
    const tenantId = requireTenantId(empresaId);
    const catalog = await loadCatalog(tenantId, catalogProductId);
    if (catalog.visibility !== "PUBLISHED" || catalog.archivedAt || catalog.sellabilityPolicy !== "STOCK_CANONICAL_ONLY") return notSellable(catalog, "CATALOG_NOT_PUBLISHED", internal);
    const stockProduct = catalog.stockProduct || await prisma.produtoEstoque?.findFirst?.({ where: { id: catalog.stockProductId, empresaId: tenantId } });
    if (!stockProduct || stockProduct.ativo === false) return notSellable(catalog, "STOCK_PRODUCT_INACTIVE", internal);

    const requested = quantity === null || quantity === undefined || quantity === "" ? null : positiveQuantity(quantity);
    const balances = await readBalances(tenantId, catalog.stockProductId, locationId);
    const evaluated = evaluateBalances({ balances, now, requested, tenantTimezone: effectivePolicy.tenantTimezone });
    const response = {
      catalogProductId: catalog.id,
      status: evaluated.status,
      label: evaluated.label,
      exactQuantityAuthorized: Boolean(effectivePolicy.exactQuantityAuthorized),
      exactQuantity: effectivePolicy.exactQuantityAuthorized && evaluated.quantity !== null ? evaluated.quantity : undefined,
      freshness: evaluated.freshness,
      confidence: evaluated.confidence,
      reasonCode: evaluated.reasonCode,
      observedAt: evaluated.observedAt,
      expiresAt: evaluated.expiresAt,
      customerSafeMessage: evaluated.customerSafeMessage,
      manualConfirmationRequired: evaluated.manualConfirmationRequired,
      quantityRequested: requested === null ? undefined : requested,
      unit: evaluated.unit,
      stockMaterialVersion: evaluated.stockMaterialVersion,
      // Balance/source/lot identifiers are internal audit material. The
      // customer-facing availability endpoint must remain customer-safe;
      // tool/audit callers can opt into the evidence explicitly.
      evidence: internal ? evaluated.evidence : [],
    };
    if (internal) response.stockProductId = catalog.stockProductId;
    return response;
  }

  return Object.freeze({ getSellableAvailability, evaluateBalances, policy: effectivePolicy });
}

function evaluateBalances({ balances = [], now = new Date(), requested = null, tenantTimezone = DEFAULT_POLICY.tenantTimezone } = {}) {
  if (!Array.isArray(balances) || balances.length === 0) return result(AVAILABILITY_STATUS.UNKNOWN, "NO_CANONICAL_BALANCE", { customerSafeMessage: "Disponibilidade precisa ser confirmada com um vendedor." });
  const authority = selectAuthoritativeBalances(balances);
  if (authority.error) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, authority.error, { customerSafeMessage: "A disponibilidade precisa ser confirmada com um vendedor." });
  balances = authority.rows;
  const requestedDecimal = requested === null || requested === undefined || requested === "" ? null : parseDecimalScaled(requested);
  if (requested !== null && requested !== undefined && requested !== "" && !requestedDecimal) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, "REQUESTED_QUANTITY_PRECISION_UNSUPPORTED", { customerSafeMessage: "A quantidade precisa ser confirmada com um vendedor." });
  const units = new Set(balances.map((balance) => normalizeUnit(balance.unidade)).filter(Boolean));
  if (units.size !== 1 || balances.some((balance) => !normalizeUnit(balance.unidade))) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, "INCOMPATIBLE_UNITS", { customerSafeMessage: "A unidade da disponibilidade precisa ser confirmada com um vendedor." });
  let total = 0n;
  let quantityKnown = false;
  let hasFresh = false;
  let hasStale = false;
  let hasUnknown = false;
  let hasExplicitZero = false;
  let hasExpired = false;
  let hasExcludedQuality = false;
  let hasActiveSource = false;
  let confidence = "HIGH";
  let observedAt = null;
  let stockMaterialVersion = 0;
  let unit = [...units][0] || null;
  const evidence = [];

  for (const balance of balances.slice(0, 200)) {
    const source = balance.fonteAutoritativa || {};
    if (source.statusCiclo && source.statusCiclo !== "ACTIVE") { hasStale = true; continue; }
    hasActiveSource = true;
    if (balance.local?.tipo === "QUARANTINE") { hasExcludedQuality = true; continue; }
    if (positiveNumber(balance.quarantined) > 0 || positiveNumber(balance.damaged) > 0) { hasExcludedQuality = true; continue; }
    const freshness = String(balance.freshnessEstado || "UNKNOWN").toUpperCase();
    if (freshness === "FRESH") hasFresh = true;
    else if (["STALE", "SYNC_FAILED", "PARTIAL"].includes(freshness)) { hasStale = true; continue; }
    else { hasUnknown = true; continue; }
    const confidenceValue = String(balance.dataConfidence || "UNKNOWN").toUpperCase();
    if (confidenceValue === "UNKNOWN" || confidenceValue === "LOW") { hasUnknown = true; continue; }
    if (confidenceValue === "MEDIUM") confidence = "MEDIUM";
    const lot = balance.lote;
    if (lot && lot.estado && lot.estado !== "ACTIVE") continue;
    if (lot && isExpired(lot.validadeEm, lot.precisaoValidade, now, tenantTimezone)) { hasExpired = true; continue; }
    const value = declaredAvailableDecimal(balance);
    const quantityFailure = declaredQuantityFailure(balance);
    if (quantityFailure) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, quantityFailure, { customerSafeMessage: "A quantidade precisa ser confirmada com um vendedor." });
    if (value === null) { hasUnknown = true; continue; }
    quantityKnown = true;
    if (value.scaled === 0n) hasExplicitZero = true;
    if (total + value.scaled > MAX_DECIMAL_SCALED) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, "QUANTITY_OVERFLOW", { customerSafeMessage: "A quantidade precisa ser confirmada com um vendedor." });
    total += value.scaled;
    observedAt = maxDate(observedAt, balance.observedAt);
    stockMaterialVersion = Math.max(stockMaterialVersion, Number(balance.revision) || 0);
    evidence.push({ id: balance.id, sourceId: balance.fonteAutoritativaId, loteId: balance.loteId || null, quantityKnown: true });
  }
  const staleStatus = hasStale && !quantityKnown ? AVAILABILITY_STATUS.DATA_STALE : null;
  if (!hasActiveSource && !quantityKnown) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, "NO_ACTIVE_AUTHORITY", { confidence: "UNKNOWN", freshness: "UNKNOWN", customerSafeMessage: "Disponibilidade precisa ser confirmada com um vendedor." });
  if (staleStatus) return result(staleStatus, "SOURCE_STALE", { confidence, freshness: "STALE", observedAt, stockMaterialVersion, evidence, customerSafeMessage: "A disponibilidade precisa ser confirmada com um vendedor." });
  if (!quantityKnown) {
    return result(hasExpired ? AVAILABILITY_STATUS.NEEDS_CONFIRMATION : AVAILABILITY_STATUS.UNKNOWN, hasExpired ? "ONLY_EXPIRED_LOTS" : hasExcludedQuality ? "QUALITY_EXCLUDED" : "QUANTITY_UNKNOWN", {
      confidence: "UNKNOWN", freshness: hasStale ? "STALE" : "UNKNOWN", observedAt, stockMaterialVersion, evidence,
      customerSafeMessage: "Disponibilidade precisa ser confirmada com um vendedor.",
    });
  }
  if (total <= 0n && !hasUnknown && !hasStale) return result(AVAILABILITY_STATUS.OUT_OF_STOCK, "EXPLICIT_ZERO", { confidence, freshness: hasFresh ? "FRESH" : "UNKNOWN", observedAt, stockMaterialVersion, unit, evidence, customerSafeMessage: "No momento, este produto está sem disponibilidade confirmada." });
  if (hasUnknown || hasStale) return result(AVAILABILITY_STATUS.NEEDS_CONFIRMATION, hasStale ? "PARTIAL_STALE" : "PARTIAL_UNKNOWN", { confidence: hasUnknown ? "UNKNOWN" : confidence, freshness: hasStale ? "STALE" : "FRESH", observedAt, stockMaterialVersion, unit, evidence, customerSafeMessage: "A disponibilidade precisa ser confirmada com um vendedor." });
  const threshold = parseDecimalScaled(DEFAULT_POLICY.lowAvailabilityThreshold) || { scaled: 1n * DECIMAL_SCALE };
  const low = requestedDecimal ? total < requestedDecimal.scaled : total <= threshold.scaled;
  const status = low ? AVAILABILITY_STATUS.LOW_AVAILABILITY : AVAILABILITY_STATUS.AVAILABLE;
  return result(status, low ? "LOW_SELLABLE_QUANTITY" : "SELLABLE_QUANTITY", { confidence, freshness: "FRESH", observedAt, stockMaterialVersion, unit, evidence, quantity: decimalToString(total), customerSafeMessage: low ? "Há disponibilidade limitada; um vendedor pode confirmar a quantidade." : "Disponibilidade confirmada no estoque canônico." });
}

const DECIMAL_SCALE = 1000000n;
const MAX_DECIMAL_SCALED = 1000000000000000000000000000n;

function declaredAvailableDecimal(balance) {
  const semantics = String(balance.semanticaDisponivel || "UNKNOWN").toUpperCase();
  if (semantics === "EXPLICIT") {
    const value = parseDecimalScaled(balance.available);
    return value && value.scaled >= 0n ? value : null;
  }
  if (semantics === "DERIVED_ON_HAND_MINUS_RESERVED") {
    const onHand = parseDecimalScaled(balance.onHand);
    const reserved = parseDecimalScaled(balance.reserved);
    if (!onHand || !reserved || onHand.scaled < 0n || reserved.scaled < 0n) return null;
    return { scaled: onHand.scaled > reserved.scaled ? onHand.scaled - reserved.scaled : 0n };
  }
  return null;
}

function declaredQuantityFailure(balance) {
  const semantics = String(balance.semanticaDisponivel || "UNKNOWN").toUpperCase();
  const values = semantics === "EXPLICIT" ? [balance.available] : semantics === "DERIVED_ON_HAND_MINUS_RESERVED" ? [balance.onHand, balance.reserved] : [];
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const raw = String(value).trim();
    const match = raw.match(/^\+?(\d+)(?:\.(\d+))?$/);
    if (!match) return "QUANTITY_INVALID";
    if (match[2] && match[2].length > 6) return "QUANTITY_PRECISION_UNSUPPORTED";
    if (BigInt(match[1]) * DECIMAL_SCALE > MAX_DECIMAL_SCALED) return "QUANTITY_OVERFLOW";
  }
  return null;
}

function declaredAvailable(balance) {
  const value = declaredAvailableDecimal(balance);
  if (!value || value.scaled > BigInt(Number.MAX_SAFE_INTEGER) * DECIMAL_SCALE) return null;
  return Number(value.scaled) / Number(DECIMAL_SCALE);
}

function positiveQuantity(value) {
  const parsed = parseDecimalScaled(value);
  if (!parsed || parsed.scaled <= 0n) throw new CommerceCatalogError("COMMERCE_INVALID_QUANTITY", "Quantidade solicitada invalida.", 422);
  return decimalToString(parsed.scaled);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positiveNumber(value) { const decimal = parseDecimalScaled(value); return decimal && decimal.scaled > 0n ? 1 : 0; }
function maxDate(a, b) { const dates = [a, b].filter(Boolean).map((v) => new Date(v)).filter((v) => !Number.isNaN(v.getTime())); return dates.length ? new Date(Math.max(...dates.map((v) => v.getTime()))) : null; }
function localDateParts(now, timeZone) { const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)); const result = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])); return { year: result.year, month: result.month, day: result.day }; }
function isExpired(value, precision, now, timeZone) {
  if (!value || precision === "UNKNOWN") return false;
  const local = localDateParts(now, timeZone || DEFAULT_POLICY.tenantTimezone);
  const normalized = String(value);
  if (precision === "DAY") return `${local.year}-${local.month}-${local.day}` > normalized;
  if (precision === "MONTH") return `${local.year}-${local.month}` > normalized;
  if (precision === "YEAR") return local.year > normalized;
  return false;
}
function result(status, reasonCode, extra = {}) {
  return { status, reasonCode, label: labelFor(status), manualConfirmationRequired: ![AVAILABILITY_STATUS.AVAILABLE, AVAILABILITY_STATUS.OUT_OF_STOCK].includes(status), freshness: extra.freshness || "UNKNOWN", confidence: extra.confidence || "UNKNOWN", observedAt: extra.observedAt || null, expiresAt: extra.expiresAt || null, stockMaterialVersion: extra.stockMaterialVersion || 0, customerSafeMessage: extra.customerSafeMessage || "Disponibilidade precisa ser confirmada com um vendedor.", evidence: extra.evidence || [], quantity: extra.quantity ?? null, unit: extra.unit || null };
}
function notSellableLegacy(catalog, reasonCode, internal = false) {
  const result = { catalogProductId: catalog.id, status: AVAILABILITY_STATUS.NOT_SELLABLE, label: "Não vendável", exactQuantityAuthorized: false, freshness: "UNKNOWN", confidence: "UNKNOWN", reasonCode, customerSafeMessage: "Este produto não está disponível para oferta.", manualConfirmationRequired: true, stockMaterialVersion: 0, evidence: [] };
  if (internal) result.stockProductId = catalog.stockProductId;
  return result;
}
function notSellable(catalog, reasonCode, internal = false) { const response = { catalogProductId: catalog.id, status: AVAILABILITY_STATUS.NOT_SELLABLE, label: "Não vendável", exactQuantityAuthorized: false, freshness: "UNKNOWN", confidence: "UNKNOWN", reasonCode, customerSafeMessage: "Este produto não está disponível para oferta.", manualConfirmationRequired: true, stockMaterialVersion: 0, evidence: [] }; if (internal) response.stockProductId = catalog.stockProductId; return response; }
function labelFor(status) { return ({ AVAILABLE: "Disponível", LOW_AVAILABILITY: "Disponibilidade limitada", OUT_OF_STOCK: "Sem estoque", NEEDS_CONFIRMATION: "Confirmação necessária", NOT_SELLABLE: "Não vendável", DATA_STALE: "Dados desatualizados", UNKNOWN: "Disponibilidade desconhecida" })[status] || "Confirmação necessária"; }

function selectAuthoritativeBalances(balances) {
  const groups = new Map();
  const seen = new Set();
  for (const balance of balances.slice(0, 200)) {
    const sourceId = Number(balance.fonteAutoritativaId);
    const source = balance.fonteAutoritativa;
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !source) return { error: "AUTHORITATIVE_SOURCE_MISSING" };
    const duplicateKey = `${sourceId}:${balance.loteId || "none"}:${balance.localId || "none"}`;
    if (seen.has(duplicateKey)) return { error: "DUPLICATE_BALANCE_OBSERVATION" };
    seen.add(duplicateKey);
    if (source.authoritative === false || source.isAuthoritative === false || source.autoridade === false) continue;
    if (!groups.has(sourceId)) groups.set(sourceId, { source, rows: [] });
    groups.get(sourceId).rows.push(balance);
  }
  if (!groups.size) return { error: "NO_AUTHORITATIVE_SOURCE" };
  if (groups.size === 1) return { rows: [...groups.values()][0].rows };
  const ranked = [...groups.values()].map((group) => ({ group, priority: Number.isFinite(Number(group.source.prioridade)) ? Number(group.source.prioridade) : 100 }));
  const minimum = Math.min(...ranked.map((item) => item.priority));
  const winners = ranked.filter((item) => item.priority === minimum);
  if (winners.length !== 1) return { error: "MULTIPLE_AUTHORITATIVE_SOURCES" };
  return { rows: winners[0].group.rows };
}

function normalizeUnit(value) { const unit = String(value || "").trim().toUpperCase(); return unit || null; }
function parseDecimalScaled(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const match = raw.match(/^\+?(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2] && match[2].length > 6)) return null;
  const scaled = BigInt(match[1]) * DECIMAL_SCALE + BigInt((match[2] || "").padEnd(6, "0") || "0");
  if (scaled > MAX_DECIMAL_SCALED) return null;
  return { scaled };
}
function decimalToString(value) {
  const scaled = typeof value === "bigint" ? value : value?.scaled;
  if (typeof scaled !== "bigint") return null;
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / DECIMAL_SCALE;
  const fraction = String(absolute % DECIMAL_SCALE).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

module.exports = { createSellableAvailabilityService, evaluateBalances, isExpired, declaredAvailable, parseDecimalScaled, decimalToString, selectAuthoritativeBalances };
