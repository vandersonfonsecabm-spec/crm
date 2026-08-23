"use strict";

const { stockEnabledForTenant } = require("./flags");
const { resolveStockContext } = require("./context");
const { StockError, sendStockError } = require("./errors");
const { createStockServices } = require("./index");
const express = require("express");

function mountStockRoutes({ app, prisma, authenticate, requireRole, env = process.env, logger = console } = {}) {
  if (!app || !prisma || !authenticate || !requireRole) throw new Error("Dependencias de rotas de estoque ausentes.");
  let services;
  function getServices() {
    if (!services) {
      const adapters = new Map();
      try {
        const csv = require("./adapters/fileCsv");
        const factory = csv.createFileCsvAdapter || csv.createAdapter;
        if (factory) adapters.set("FILE_IMPORT_CSV", factory({ env, logger }));
      } catch (error) {
        logger.warn?.("stock_adapter_unavailable", { adapter: "FILE_IMPORT_CSV", code: error?.code || "LOAD_FAILED" });
      }
      services = createStockServices({ prisma, env, adapterRegistry: adapters, logger });
    }
    return services;
  }
  function requireEnabled(req, res, next) {
    try {
      const decodedBody = Buffer.isBuffer(req.body) ? parseRawBody(req.body) : null;
      if (decodedBody) req.stockBody = decodedBody;
      const context = resolveStockContext({ req, suppliedEmpresaId: decodedBody?.empresaId });
      if (!stockEnabledForTenant(context.empresaId, env)) return res.status(404).json({ error: { code: "STOCK_DISABLED", message: "Recurso nao encontrado." } });
      req.stockContext = context;
      return next();
    } catch (error) { return sendStockError(res, error); }
  }
  function requireSourceEnabled(req, res, next) {
    try {
      if (!stockEnabledForTenant(req.stockContext.empresaId, env, { source: true })) return res.status(404).json({ error: { code: "STOCK_DISABLED", message: "Recurso nao encontrado." } });
      return next();
    } catch (error) { return sendStockError(res, error); }
  }
  function guardRole(...roles) { return [authenticate, requireRole(...roles), requireEnabled]; }
  function sourceGuardRole(...roles) { return [authenticate, requireRole(...roles), requireEnabled, requireSourceEnabled]; }
  function sourceGuardRoleLarge(...roles) { return [authenticate, express.json({ limit: "6mb", type: "application/json" }), requireRole(...roles), requireEnabled, requireSourceEnabled]; }
  function route(handler) {
    return async (req, res) => {
      try { return await handler(req, res); } catch (error) { return sendStockError(res, error); }
    };
  }

  app.get("/estoque/fontes", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const { empresaId } = req.stockContext;
    const result = await getServices().canonical.list("fonteEstoque", { empresaId, cursor: req.query.cursor, limit: req.query.limit, orderBy: { id: "asc" } });
    return res.json({ ...result, items: result.items.map(publicSource) });
  }));

  app.post("/estoque/fontes", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const { empresaId, usuarioId } = req.stockContext;
    const source = await getServices().canonical.createSource({ empresaId, actorUsuarioId: usuarioId, data: req.body || {} });
    return res.status(201).json({ item: publicSource(source) });
  }));

  app.post("/estoque/fontes/:id/validar", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const { empresaId } = req.stockContext;
    const fonteId = parsePathId(req.params.id);
    const source = await prisma.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
    if (!source) throw new StockError("STOCK_NOT_FOUND", "Fonte nao encontrada.");
    if (source.statusCiclo !== "ACTIVE") {
      await getServices().canonical.transitionSource({ empresaId, fonteId, status: "VALIDATING", actorUsuarioId: req.stockContext.usuarioId });
      if (source.tipoFonte === "FILE_IMPORT_CSV") await getServices().canonical.transitionSource({ empresaId, fonteId, status: "ACTIVE", actorUsuarioId: req.stockContext.usuarioId });
    }
    const current = await prisma.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
    return res.json({ item: publicSource(current) });
  }));

  app.post("/estoque/importacoes/preview", ...sourceGuardRoleLarge("ADMIN"), route(async (req, res) => {
    const context = req.stockContext;
    const body = requestBody(req);
    const sourceId = parseBodyId(body?.fonteId);
    const source = await prisma.fonteEstoque.findFirst({ where: { id: sourceId, empresaId: context.empresaId } });
    if (!source) throw new StockError("STOCK_NOT_FOUND", "Fonte nao encontrada.");
    if (source.tipoFonte !== "FILE_IMPORT_CSV") throw new StockError("STOCK_INVALID", "A fonte nao suporta importacao CSV.");
    const service = loadImportService({ prisma, services: getServices(), env, logger });
    const csv = body?.content ?? body?.csv;
    const result = await service.preview({ ...context, fonteId: sourceId, content: csv, delimiter: body?.delimiter, safeFilename: body?.filename, idempotencyKey: req.get("Idempotency-Key") || body?.idempotencyKey });
    return res.status(201).json({ item: result });
  }));

  app.get("/estoque/importacoes/:id", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const context = req.stockContext;
    const importacaoId = parsePathId(req.params.id);
    const row = await prisma.importacaoEstoque.findFirst({ where: { id: importacaoId, empresaId: context.empresaId }, include: { linhas: { orderBy: { rowNumber: "asc" }, take: 100 } } });
    if (!row) throw new StockError("STOCK_NOT_FOUND", "Importacao nao encontrada.");
    return res.json({ item: publicImport(row) });
  }));

  app.post("/estoque/importacoes/:id/confirmar", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const context = req.stockContext;
    const service = loadImportService({ prisma, services: getServices(), env, logger });
    const result = await service.confirm({ ...context, importacaoId: parsePathId(req.params.id), expectedRevision: req.body?.revision, idempotencyKey: req.get("Idempotency-Key") || req.body?.idempotencyKey, allowPartial: req.body?.allowPartial === true });
    return res.json({ item: result });
  }));

  app.post("/estoque/importacoes/:id/cancelar", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const context = req.stockContext;
    const service = loadImportService({ prisma, services: getServices(), env, logger });
    const result = await service.cancel({ ...context, importacaoId: parsePathId(req.params.id), expectedRevision: req.body?.revision });
    return res.json({ item: result });
  }));

  app.get("/estoque/sincronizacoes/:id", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const row = await prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: parsePathId(req.params.id), empresaId: req.stockContext.empresaId } });
    if (!row) throw new StockError("STOCK_NOT_FOUND", "Sincronizacao nao encontrada.");
    return res.json({ item: publicSync(row) });
  }));

  for (const [path, entity] of [["/estoque/produtos", "produtoEstoque"], ["/estoque/lotes", "loteEstoque"], ["/estoque/saldos", "saldoEstoque"], ["/estoque/problemas-qualidade", "problemaQualidadeEstoque"]]) {
    app.get(path, ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
      const result = await getServices().canonical.list(entity, { empresaId: req.stockContext.empresaId, cursor: req.query.cursor, limit: req.query.limit, orderBy: { id: "asc" } });
      return res.json({ ...result, items: result.items.map((item) => publicEntity(entity, item)) });
    }));
  }
  app.get("/estoque/freshness", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const result = await getServices().canonical.list("saldoEstoque", { empresaId: req.stockContext.empresaId, cursor: req.query.cursor, limit: req.query.limit, orderBy: { id: "asc" } });
    return res.json({ ...result, items: result.items.map((item) => ({ id: item.id, freshnessEstado: item.freshnessEstado, dataConfidence: item.dataConfidence, observedAt: item.observedAt })) });
  }));
}

function loadImportService({ prisma, services, env, logger }) {
  try {
    const module = require("./imports/service");
    const factory = module.createStockImportService || module.createImportService;
    if (!factory) throw new Error("STOCK_IMPORT_SERVICE_EXPORT_MISSING");
    return factory({ prisma, canonicalService: services.canonical, syncService: services.sync, env, logger });
  } catch (error) {
    if (error?.code && String(error.code).startsWith("STOCK_")) throw error;
    throw new StockError("STOCK_UNAVAILABLE", "Importacao de estoque indisponivel.", undefined, 503);
  }
}

function parsePathId(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new StockError("STOCK_INVALID", "Identificador invalido.");
  return parsed;
}
function parseBodyId(value) { return parsePathId(value); }
function requestBody(req) {
  if (req.stockBody) return req.stockBody;
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString("utf8")); } catch { throw new StockError("STOCK_INVALID", "Envelope JSON invalido."); }
  }
  return req.body || {};
}
function parseRawBody(buffer) {
  try { return JSON.parse(buffer.toString("utf8")); } catch { throw new StockError("STOCK_INVALID", "Envelope JSON invalido."); }
}
function publicSource(source) { if (!source) return null; const { credencialRef, configuracaoPublicaJson, ...safe } = source; return { ...safe, configuracaoPublica: safePublicConfig(configuracaoPublicaJson), credencialConfigured: Boolean(credencialRef) }; }
function publicImport(row) {
  if (!row) return null;
  return {
    id: row.id, fonteId: row.fonteId, status: row.status, schemaVersion: row.schemaVersion,
    fileHash: row.fileHash, safeFilename: row.safeFilename, byteSize: row.byteSize, rowCount: row.rowCount,
    acceptedCount: row.acceptedCount, rejectedCount: row.rejectedCount, revision: row.revision,
    expiresAt: row.expiresAt, retentionUntil: row.retentionUntil, syncRunId: row.syncRunId || null,
    confirmedAt: row.confirmedAt || null, cancelledAt: row.cancelledAt || null,
    linhas: row.linhas?.map((line) => ({ id: line.id, rowNumber: line.rowNumber, rowChecksum: line.rowChecksum, sourceRecordId: line.sourceRecordId, sourceVersion: line.sourceVersion, status: line.status, warningsJson: line.warningsJson, errorsJson: line.errorsJson, appliedAt: line.appliedAt, revision: line.revision })),
  };
}
function publicSync(row) {
  const { leaseOwner, leaseExpiresAt, warningsJson, ...safe } = row || {};
  return { ...safe, warnings: boundedJsonArray(warningsJson) };
}
function publicEntity(entity, row) {
  if (entity === "produtoEstoque") return { id: row.id, nomeExibicao: row.nomeExibicao, skuCanonico: row.skuCanonico, barcodeCanonico: row.barcodeCanonico, unidadeCanonica: row.unidadeCanonica, ativo: row.ativo, revision: row.revision, updatedAt: row.updatedAt };
  if (entity === "loteEstoque") return { id: row.id, produtoEstoqueId: row.produtoEstoqueId, fonteId: row.fonteId, sourceLotId: row.sourceLotId, codigoLote: row.codigoLote, validadeEm: row.validadeEm, precisaoValidade: row.precisaoValidade, estado: row.estado, observedAt: row.observedAt, revision: row.revision };
  if (entity === "saldoEstoque") return { id: row.id, produtoEstoqueId: row.produtoEstoqueId, loteId: row.loteId, localId: row.localId, unidade: row.unidade, onHand: row.onHand, reserved: row.reserved, available: row.available, quarantined: row.quarantined, damaged: row.damaged, inTransit: row.inTransit, semanticaDisponivel: row.semanticaDisponivel, freshnessEstado: row.freshnessEstado, dataConfidence: row.dataConfidence, observedAt: row.observedAt, revision: row.revision };
  return { id: row.id, fonteId: row.fonteId, tipo: row.tipo, severidade: row.severidade, targetRef: row.targetRef, estado: row.estado, firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt, resolvedAt: row.resolvedAt, revision: row.revision };
}
function boundedJsonArray(value) { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.slice(0, 50) : []; } catch { return []; } }
function safePublicConfig(value) { if (!value) return null; try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return { delimiter: parsed?.delimiter === "semicolon" ? "semicolon" : parsed?.delimiter === "comma" ? "comma" : undefined, encoding: parsed?.encoding === "utf8" ? "utf8" : undefined }; } catch { return null; } }

module.exports = { mountStockRoutes, parsePathId, publicSource, publicImport };
