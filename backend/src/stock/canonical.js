"use strict";

const { StockError } = require("./errors");
const { checksum, sanitizeStructured } = require("./contracts");
const { appendStockOutbox } = require("./outbox");
const { classifyFreshness, confidenceFor } = require("./freshness");
const { stockEnabledForTenant } = require("./flags");

const MAX_JSON = 20000;
const DECIMAL_RE = /^\d{1,30}(?:\.\d{1,6})?$/;
const KNOWN_UNITS = new Set(["UN", "KG", "L", "SC", "TON", "ML", "G", "M", "CM", "M2", "M3"]);
const DATE_BY_PRECISION = Object.freeze({
  DAY: /^\d{4}-\d{2}-\d{2}$/,
  MONTH: /^\d{4}-\d{2}$/,
  YEAR: /^\d{4}$/,
  UNKNOWN: /^$/,
});

function boundedJson(value) {
  const output = JSON.stringify(sanitizeStructured(value || {}));
  if (output.length > MAX_JSON) throw new StockError("STOCK_INVALID", "Metadado estruturado excede o limite.");
  return output;
}

function decimal(value, field, options = {}) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!DECIMAL_RE.test(text) || (!options.allowNegative && text.startsWith("-"))) {
    throw new StockError("STOCK_INVALID", `Quantidade invalida: ${field}.`);
  }
  return text;
}

function validateExpiry(value, precision = "UNKNOWN") {
  const text = value === undefined || value === null ? "" : String(value);
  const matcher = DATE_BY_PRECISION[precision];
  if (!matcher || !matcher.test(text)) throw new StockError("STOCK_INVALID", "Validade ou precisao invalida.");
  if (precision === "DAY") {
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new StockError("STOCK_INVALID", "Data de validade invalida.");
  }
  if (precision === "MONTH" && (Number(text.slice(5)) < 1 || Number(text.slice(5)) > 12)) throw new StockError("STOCK_INVALID", "Mes de validade invalido.");
  if (precision === "YEAR" && (Number(text) < 1900 || Number(text) > 9999)) throw new StockError("STOCK_INVALID", "Ano de validade invalido.");
  return text || null;
}

function normalizePayload(payload = {}) {
  const sourceProductId = String(payload.sourceProductId || "").trim();
  if (!sourceProductId || sourceProductId.length > 256) throw new StockError("STOCK_INVALID", "sourceProductId obrigatorio.");
  const unit = String(payload.unitOfMeasure || "").trim().toUpperCase();
  if (!unit || unit.length > 32 || !KNOWN_UNITS.has(unit)) throw new StockError("STOCK_INVALID", "Unidade de medida nao suportada.");
  const quantities = payload.quantities || {};
  const lot = payload.lot || null;
  const location = payload.location || null;
  const precision = String(lot?.expirationPrecision || "UNKNOWN").toUpperCase();
  const expiration = validateExpiry(lot?.expirationDate, precision);
  const quantity = {
    onHand: decimal(quantities.onHand, "onHand"),
    reserved: decimal(quantities.reserved, "reserved"),
    available: decimal(quantities.available, "available"),
    quarantined: decimal(quantities.quarantined, "quarantined"),
    damaged: decimal(quantities.damaged, "damaged"),
    inTransit: decimal(quantities.inTransit, "inTransit"),
  };
  const sourceUpdatedAt = payload.sourceUpdatedAt ? new Date(payload.sourceUpdatedAt) : null;
  if (typeof payload.quantityRelevantForExpiry !== "undefined" && typeof payload.quantityRelevantForExpiry !== "boolean") throw new StockError("STOCK_INVALID", "quantityRelevantForExpiry invalido.");
  if (payload.sourceUpdatedAt && (!sourceUpdatedAt || Number.isNaN(sourceUpdatedAt.getTime()))) throw new StockError("STOCK_INVALID", "sourceUpdatedAt invalido.");
  if (!quantity.onHand) throw new StockError("STOCK_INVALID", "onHand explicito obrigatorio; quantidade ausente nao e zero.");
  return {
    sourceProductId,
    productName: String(payload.productName || sourceProductId).trim().slice(0, 240),
    sku: payload.sku ? String(payload.sku).trim().slice(0, 120) : null,
    barcode: payload.barcode ? String(payload.barcode).trim().slice(0, 120) : null,
    unitOfMeasure: unit,
    location: location ? {
      externalLocationId: location.externalLocationId ? String(location.externalLocationId).slice(0, 256) : null,
      name: String(location.name || "Desconhecido").slice(0, 240),
      type: ["DEPOT", "STORE", "ROOM", "SHELF", "VIRTUAL", "QUARANTINE", "UNKNOWN"].includes(String(location.type).toUpperCase()) ? String(location.type).toUpperCase() : "UNKNOWN",
    } : null,
    lot: lot ? {
      sourceLotId: lot.sourceLotId ? String(lot.sourceLotId).slice(0, 256) : null,
      code: lot.lotCode ? String(lot.lotCode).slice(0, 256) : null,
      expirationDate: expiration,
      expirationPrecision: precision,
    } : null,
    quantity,
    availableSemantics: ["EXPLICIT", "DERIVED_ON_HAND_MINUS_RESERVED", "UNAVAILABLE", "UNKNOWN"].includes(String(payload.availableSemantics).toUpperCase()) ? String(payload.availableSemantics).toUpperCase() : "UNKNOWN",
    quantityRelevantForExpiry: payload.quantityRelevantForExpiry === undefined ? false : payload.quantityRelevantForExpiry,
    sourceVersion: String(payload.sourceVersion || checksum(payload)).slice(0, 256),
    sourceUpdatedAt,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.slice(0, 20).map((warning) => String(warning).slice(0, 240)) : [],
  };
}

function createCanonicalStockService({ prisma, clock = () => new Date(), env = process.env, enforceFlags = true } = {}) {
  if (!prisma) throw new Error("prisma obrigatorio");
  function assertMutationEnabled(empresaId) {
    if (enforceFlags && !stockEnabledForTenant(empresaId, env, { source: true })) throw new StockError("STOCK_DISABLED", "Recurso de estoque indisponivel.");
  }

  async function createSource({ empresaId, actorUsuarioId, data }) {
    assertMutationEnabled(empresaId);
    if (!Number.isSafeInteger(Number(empresaId)) || Number(empresaId) <= 0 || !Number.isSafeInteger(Number(actorUsuarioId)) || Number(actorUsuarioId) <= 0) throw new StockError("STOCK_TENANT_CONTEXT_INVALID", "Ator ou tenant invalido.", undefined, 401);
    const now = clock();
    const tipo = String(data?.tipoFonte || "").toUpperCase();
    const allowed = ["INTERNAL", "GENERIC_API_PULL", "GENERIC_WEBHOOK_PUSH", "DATABASE_READONLY", "FILE_IMPORT_CSV", "FILE_IMPORT_XLSX", "MANUAL_CONTROLLED", "VENDOR_SPECIFIC"];
    if (!allowed.includes(tipo)) throw new StockError("STOCK_INVALID", "Tipo de fonte invalido.");
    if (tipo !== "FILE_IMPORT_CSV") throw new StockError("STOCK_SCHEMA_UNSUPPORTED", "Somente FILE_IMPORT_CSV esta implementado na E2.");
    const name = String(data?.nome || "").trim();
    if (!name || name.length > 120) throw new StockError("STOCK_INVALID", "Nome de fonte invalido.");
    let configValue = data?.configuracaoPublicaJson || null;
    if (typeof configValue === "string") {
      try { configValue = JSON.parse(configValue); } catch { throw new StockError("STOCK_INVALID", "Configuracao publica deve ser JSON estruturado."); }
    }
    assertSafePublicConfig(configValue);
    const config = configValue ? boundedJson(configValue) : null;
    const write = async (db) => {
    const source = await db.fonteEstoque.create({ data: {
      empresaId, tipoFonte: tipo, nome: name, statusCiclo: "DRAFT", configuracaoPublicaJson: config,
      credencialRef: null, capabilitiesVersion: "stock-capabilities.v1", prioridade: Number.isInteger(data?.prioridade) ? data.prioridade : 100,
      schemaVersion: tipo === "FILE_IMPORT_CSV" ? "stock-csv.v1" : "stock-adapter.v1", createdAt: now, updatedAt: now,
    } });
    if (tipo === "FILE_IMPORT_CSV") {
      const defaults = { FULL_SNAPSHOT: false, IMPORT_BATCH: true, PRODUCT_IDENTITY: true, UNIT_OF_MEASURE: false, READ_ONLY_ACCESS: true, PAGINATION: false, INCREMENTAL_CURSOR: false, WEBHOOK_EVENTS: false, MOVEMENTS: false, TOMBSTONES_DELETIONS: false };
      for (const [codigo, suportada] of Object.entries(defaults)) {
        await db.capacidadeFonteEstoque.create({ data: { empresaId, fonteId: source.id, codigo, suportada, versao: "stock-capabilities.v1", semanticaJson: boundedJson({ source: "FILE_IMPORT_CSV" }), observadaEm: now } });
      }
    }
    await db.eventoAuditoriaEstoque.create({ data: {
      empresaId, actorType: "USER", actorUsuarioId, actorSystemKey: null,
      action: "STOCK_SOURCE_CREATED", afterJsonSanitized: boundedJson({ fonteId: source.id, tipoFonte: tipo, nome: name }),
    } });
    return source;
    };
    return prisma.$transaction ? prisma.$transaction(write) : write(prisma);
  }

  async function transitionSource({ empresaId, fonteId, status, actorUsuarioId = null }) {
    assertMutationEnabled(empresaId);
    const allowed = { DRAFT: ["VALIDATING", "DISABLED", "ARCHIVED"], VALIDATING: ["ACTIVE", "DEGRADED", "AUTH_ERROR", "DISABLED"], ACTIVE: ["DEGRADED", "AUTH_ERROR", "DISABLED", "ARCHIVED"], DEGRADED: ["ACTIVE", "AUTH_ERROR", "DISABLED"], AUTH_ERROR: ["VALIDATING", "DISABLED"], DISABLED: ["VALIDATING", "ARCHIVED"], ARCHIVED: [] };
    const write = async (db) => {
      const current = await db.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
      if (!current) throw new StockError("STOCK_NOT_FOUND", "Fonte nao encontrada.");
      if (!allowed[current.statusCiclo]?.includes(status)) throw new StockError("STOCK_CONFLICT", "Transicao de fonte invalida.");
      const result = await db.fonteEstoque.updateMany({ where: { id: fonteId, empresaId, statusCiclo: current.statusCiclo }, data: { statusCiclo: status, disabledAt: ["DISABLED", "ARCHIVED"].includes(status) ? clock() : null, updatedAt: clock() } });
      if (result.count === 1 && actorUsuarioId) await db.eventoAuditoriaEstoque.create({ data: { empresaId, actorType: "USER", actorUsuarioId, actorSystemKey: null, action: "STOCK_SOURCE_STATUS_CHANGED", beforeJsonSanitized: boundedJson({ status: current.statusCiclo }), afterJsonSanitized: boundedJson({ status }), } });
      return result;
    };
    return prisma.$transaction ? prisma.$transaction(write) : write(prisma);
  }

  async function applyNormalizedRecord({ empresaId, fonteId, syncRunId, envelope, slaMs = null, tx: providedTx = null }) {
    assertMutationEnabled(empresaId);
    if (Number(envelope.tenantId) !== empresaId || Number(envelope.sourceConnectionId) !== fonteId) throw new StockError("STOCK_FORBIDDEN", "Proveniencia cross-tenant rejeitada.", undefined, 403);
    const payload = normalizePayload(envelope.payload);
    const now = clock();
    const apply = async (tx) => {
      const source = await tx.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
      if (!source || source.statusCiclo !== "ACTIVE") throw new StockError("STOCK_SOURCE_DISABLED", "Fonte nao esta ativa.");
      const existingObservation = await tx.observacaoEstoque.findFirst({ where: { empresaId, fonteId, sourceEntityType: envelope.sourceEntityType, sourceRecordId: envelope.sourceRecordId, sourceVersion: envelope.sourceRecordVersion } });
      if (existingObservation) {
        if (existingObservation.checksum !== envelope.checksum) throw new StockError("STOCK_CONFLICT", "Replay com checksum divergente.");
        return { duplicate: true, observation: existingObservation };
      }
      let mapping = await tx.mapeamentoProdutoExterno.findFirst({ where: { empresaId, fonteId, sourceProductId: payload.sourceProductId } });
      let product;
      if (mapping?.produtoEstoqueId && ["MATCHED", "MANUALLY_CONFIRMED"].includes(mapping.estado)) {
        product = await tx.produtoEstoque.findFirst({ where: { id: mapping.produtoEstoqueId, empresaId } });
      }
      if (!product && !mapping) {
        const sku = payload.sku;
        const barcode = payload.barcode;
        const candidates = [];
        if (sku) candidates.push(...await tx.produtoEstoque.findMany({ where: { empresaId, skuCanonico: sku, skuCanonicoConfirmado: true }, take: 2 }));
        if (barcode) candidates.push(...await tx.produtoEstoque.findMany({ where: { empresaId, barcodeCanonico: barcode, barcodeCanonicoConfirmado: true }, take: 2 }));
        const uniqueIds = [...new Set(candidates.map((item) => item.id))];
        if (uniqueIds.length > 1) {
          mapping = await tx.mapeamentoProdutoExterno.create({ data: { empresaId, fonteId, sourceProductId: payload.sourceProductId, estado: "AMBIGUOUS", sourceVersion: payload.sourceVersion, evidenciaJson: boundedJson({ sku: payload.sku, barcode: payload.barcode }) } });
        } else {
          product = uniqueIds.length === 1 ? candidates.find((item) => item.id === uniqueIds[0]) : await tx.produtoEstoque.create({ data: { empresaId, nomeExibicao: payload.productName, skuCanonico: null, barcodeCanonico: null, unidadeCanonica: payload.unitOfMeasure } });
          mapping = await tx.mapeamentoProdutoExterno.create({ data: { empresaId, fonteId, sourceProductId: payload.sourceProductId, produtoEstoqueId: product.id, estado: "MATCHED", sourceVersion: payload.sourceVersion, evidenciaJson: boundedJson({ sku: payload.sku, barcode: payload.barcode }) } });
        }
      }
      if (!product && mapping?.produtoEstoqueId) product = await tx.produtoEstoque.findFirst({ where: { id: mapping.produtoEstoqueId, empresaId } });
      const blockedMapping = mapping && !["MATCHED", "MANUALLY_CONFIRMED"].includes(mapping.estado);
      const quality = blockedMapping ? "UNKNOWN" : "HIGH";
      if (blockedMapping) await tx.problemaQualidadeEstoque.create({ data: { empresaId, fonteId, syncRunId, tipo: "PRODUCT_MAPPING_BLOCKED", severidade: "MEDIUM", targetRef: payload.sourceProductId, estado: "OPEN", detailsSanitizedJson: boundedJson({ mappingState: mapping.estado }), retentionUntil: new Date(now.getTime() + 90 * 86400000) } });
      let location = null;
      let balance = null;
      if (payload.location) {
        const locationIdentity = payload.location.externalLocationId || `unknown:${checksum({ name: payload.location.name, type: payload.location.type })}`;
        location = await tx.localEstoque.findFirst({ where: { empresaId, fonteId, externalLocationId: locationIdentity } });
        if (!location) location = await tx.localEstoque.create({ data: { empresaId, fonteId, externalLocationId: locationIdentity, nome: payload.location.name, tipo: payload.location.type } });
      }
      let lot = null;
      if (payload.lot && product && !blockedMapping) {
        lot = payload.lot.sourceLotId
          ? await tx.loteEstoque.findFirst({ where: { empresaId, fonteId, sourceLotId: payload.lot.sourceLotId } })
          : payload.lot.code ? await tx.loteEstoque.findFirst({ where: { empresaId, fonteId, produtoEstoqueId: product.id, sourceLotId: null, codigoLote: payload.lot.code } }) : null;
        if (!lot) lot = await tx.loteEstoque.create({ data: { empresaId, produtoEstoqueId: product.id, fonteId, sourceLotId: payload.lot.sourceLotId, codigoLote: payload.lot.code, validadeEm: payload.lot.expirationDate, precisaoValidade: payload.lot.expirationPrecision, estado: "ACTIVE", sourceUpdatedAt: payload.sourceUpdatedAt, observedAt: now } });
      }
      if (product && !blockedMapping) {
        const balanceWhere = { empresaId, produtoEstoqueId: product.id, loteId: lot?.id ?? null, localId: location?.id ?? null, fonteAutoritativaId: fonteId };
        const current = await tx.saldoEstoque.findFirst({ where: balanceWhere });
        const freshness = classifyFreshness({ observedAt: payload.sourceUpdatedAt || now, lastSuccessfulSyncAt: payload.sourceUpdatedAt ? null : now, slaMs, now });
        const balanceData = { unidade: payload.unitOfMeasure, onHand: payload.quantity.onHand, reserved: payload.quantity.reserved, available: payload.quantity.available, quarantined: payload.quantity.quarantined, damaged: payload.quantity.damaged, inTransit: payload.quantity.inTransit, semanticaDisponivel: payload.availableSemantics, quantityRelevantForExpiry: payload.quantityRelevantForExpiry, sourceUpdatedAt: payload.sourceUpdatedAt, observedAt: now, freshnessEstado: freshness, dataConfidence: confidenceFor({ quality, mapping: mapping.estado, freshness }), sourceVersion: payload.sourceVersion, revision: { increment: 1 }, updatedAt: now };
        if (current) balance = await tx.saldoEstoque.update({ where: { id: current.id }, data: balanceData });
        else balance = await tx.saldoEstoque.create({ data: { ...balanceData, ...balanceWhere, revision: 1 } });
      }
      const observation = await tx.observacaoEstoque.create({ data: { empresaId, fonteId, syncRunId, sourceEntityType: envelope.sourceEntityType, sourceRecordId: envelope.sourceRecordId, sourceVersion: envelope.sourceRecordVersion, checksum: envelope.checksum, observedAt: now, dataQuality: quality, warningsJson: boundedJson(envelope.warnings), appliedAt: now, retentionUntil: new Date(now.getTime() + 90 * 86400000) } });
      const aggregateId = String(observation.id);
      const materialVersion = Number(syncRunId || 1);
      const event = require("./events").buildStockEvent({ type: "StockRecordObserved.v1", empresaId, syncRunId, aggregateType: "StockRecord", aggregateId, materialVersion, correlationId: envelope.provenance?.correlationId, payload: { observationId: observation.id, mappingState: mapping?.estado || "UNKNOWN", dataQuality: quality } });
      await appendStockOutbox({ tx, event, retentionUntil: new Date(now.getTime() + 90 * 86400000) });
      if (balance) {
        const stateEvent = require("./events").buildStockEvent({ type: "StockCanonicalStateChanged.v1", empresaId, syncRunId, aggregateType: "StockBalance", aggregateId: String(balance.id), materialVersion: Number(balance.revision || 1), correlationId: envelope.provenance?.correlationId, payload: { balanceId: balance.id, freshnessEstado: balance.freshnessEstado, dataConfidence: balance.dataConfidence } });
        await appendStockOutbox({ tx, event: stateEvent, retentionUntil: new Date(now.getTime() + 90 * 86400000) });
      }
      return { duplicate: false, product, mapping, lot, location, observation, quality };
    };
    return providedTx ? apply(providedTx) : prisma.$transaction(apply);
  }

  async function applyImportRows({ tx, empresaId, fonteId, syncRun, importacao = null, lines, now = clock() }) {
    if (!tx) throw new StockError("STOCK_INVALID", "Transacao de importacao obrigatoria.");
    const appliedLineIds = [];
    for (const line of lines || []) {
      const normalized = line.normalizedJsonSanitized || line.normalizedJson;
      if (!normalized) continue;
      let payload;
      try { payload = typeof normalized === "string" ? JSON.parse(normalized) : normalized; } catch { continue; }
      if (require("./contracts").checksum(payload) !== line.rowChecksum) throw new StockError("STOCK_CONFLICT", "Linha de staging alterada apos preview.");
      const envelope = require("./contracts").buildNormalizedEnvelope({ tenantId: empresaId, sourceConnectionId: fonteId }, {
        sourceEntityType: "CSV_ROW",
        sourceRecordId: line.sourceRecordId,
        sourceRecordVersion: line.sourceVersion || line.rowChecksum,
        payload: {
          sourceProductId: payload.sourceProductId,
          productName: payload.productName,
          sku: payload.sku,
          barcode: payload.barcode,
          unitOfMeasure: payload.unit || payload.unitOfMeasure,
          quantities: { onHand: payload.quantities?.on_hand ?? payload.quantity?.onHand, reserved: payload.quantities?.reserved ?? payload.quantity?.reserved, available: payload.quantities?.available ?? payload.quantity?.available, quarantined: payload.quantities?.quarantined ?? payload.quantity?.quarantined, damaged: payload.quantities?.damaged ?? payload.quantity?.damaged, inTransit: payload.quantities?.in_transit ?? payload.quantity?.inTransit },
          availableSemantics: payload.availableSemantics,
          quantityRelevantForExpiry: payload.quantityRelevantForExpiry,
          lot: payload.sourceLotId || payload.lotCode || payload.expiryDate ? { sourceLotId: payload.sourceLotId, lotCode: payload.lotCode, expirationDate: payload.expiryDate, expirationPrecision: payload.expiryPrecision || "UNKNOWN" } : null,
          location: payload.sourceLocationId || payload.locationName ? { externalLocationId: payload.sourceLocationId, name: payload.locationName || "Desconhecido", type: payload.locationType || "UNKNOWN" } : null,
          sourceVersion: payload.sourceVersion || line.sourceVersion || line.rowChecksum,
          sourceUpdatedAt: payload.sourceUpdatedAt,
        },
        warnings: JSON.parse(line.warningsJson || "[]"),
        provenance: { importacaoId: line.importacaoId, rowNumber: line.rowNumber, correlationId: importacao?.correlationId || null },
      });
      await applyNormalizedRecord({ empresaId, fonteId, syncRunId: syncRun.id, envelope, tx: tx });
      appliedLineIds.push(line.id);
    }
    return { appliedLineIds };
  }

  async function list(entity, { empresaId, cursor = null, limit = 50, where = {}, orderBy = { id: "asc" } }) {
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const base = { ...where, empresaId };
    if (cursor) base.id = { gt: Number(cursor) };
    const rows = await prisma[entity].findMany({ where: base, orderBy, take: take + 1 });
    const hasMore = rows.length > take;
    return { items: rows.slice(0, take), nextCursor: hasMore ? rows[take - 1].id : null };
  }

  return { createSource, transitionSource, applyNormalizedRecord, applyImportRows, list, normalizePayload, validateExpiry };
}

function assertSafePublicConfig(value, depth = 0) {
  if (value === null || value === undefined) return;
  if (depth > 4) throw new StockError("STOCK_INVALID", "Configuracao publica profunda demais.");
  if (Array.isArray(value)) return value.forEach((item) => assertSafePublicConfig(item, depth + 1));
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:secret|token|password|credential|authorization|cookie|privatekey|database|dsn|url)/i.test(key)) throw new StockError("STOCK_INVALID", "Configuracao publica contem campo sensivel.");
      assertSafePublicConfig(item, depth + 1);
    }
  }
}

module.exports = { createCanonicalStockService, normalizePayload, validateExpiry, decimal };
