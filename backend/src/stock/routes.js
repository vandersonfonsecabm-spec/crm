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

  app.post("/estoque/fontes/:id/sincronizar", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const fonteId = parsePathId(req.params.id);
    const { empresaId, usuarioId } = req.stockContext;
    const source = await prisma.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
    if (!source) throw new StockError("STOCK_NOT_FOUND", "Fonte nao encontrada.");
    const result = await getServices().sync.createRun({ empresaId, fonteId, modo: req.body?.modo || "IMPORT", actorUsuarioId: usuarioId, correlationId: req.get("X-Correlation-Id") || null, snapshotGeneration: req.body?.snapshotGeneration || null });
    return res.status(202).json({ item: publicSync(result) });
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

  app.get("/estoque/sincronizacoes", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const rows = await prisma.execucaoSincronizacaoEstoque.findMany({ where: { empresaId: req.stockContext.empresaId }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: limit });
    return res.json({ items: rows.map(publicSync) });
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

  for (const [path, entity] of [["fontes", "fonteEstoque"], ["produtos", "produtoEstoque"], ["lotes", "loteEstoque"]]) {
    app.get(`/estoque/${path}/:id`, ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
      const id = parsePathId(req.params.id);
      const row = await prisma[entity].findFirst({ where: { id, empresaId: req.stockContext.empresaId } });
      if (!row) throw new StockError("STOCK_NOT_FOUND", "Registro de estoque nao encontrado.");
      return res.json({ item: entity === "fonteEstoque" ? publicSource(row) : publicEntity(entity, row) });
    }));
  }

  app.get("/estoque/regras", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const rows = await prisma.configuracaoRegraEstoque.findMany({ where: { empresaId: req.stockContext.empresaId }, orderBy: [{ ruleType: "asc" }, { scopeKey: "asc" }] });
    return res.json({ items: rows.map(publicRuleConfig) });
  }));

  app.put("/estoque/regras/:ruleType", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const { RULE_TYPES } = require("./rules");
    const ruleType = String(req.params.ruleType || "").trim();
    if (!RULE_TYPES.includes(ruleType)) throw new StockError("STOCK_INVALID", "Regra de estoque nao suportada.");
    const body = req.body || {};
    const empresaId = req.stockContext.empresaId;
    const expectedRevision = body.revision === undefined ? null : Number(body.revision);
    const data = {
      enabled: body.enabled === true,
      expiryWindowDays: Number.isInteger(Number(body.expiryWindowDays)) ? Math.min(3650, Math.max(0, Number(body.expiryWindowDays))) : null,
      freshnessSlaMinutes: Number.isInteger(Number(body.freshnessSlaMinutes)) ? Math.min(7 * 24 * 60, Math.max(1, Number(body.freshnessSlaMinutes))) : null,
      timezone: normalizeTimezone(body.timezone),
      requiredCapabilitiesJson: boundedRuleJson(body.requiredCapabilities),
      priorityBandsJson: boundedRuleJson(body.priorityBands),
      recipientPolicyJson: boundedRuleJson(body.recipientPolicy),
      suppressionPolicyJson: boundedRuleJson(body.suppressionPolicy),
      actorRef: `usuario:${req.stockContext.usuarioId}`,
      correlationId: typeof req.get === "function" ? (req.get("X-Correlation-Id") || null) : null,
      revision: { increment: 1 },
    };
    const write = async (tx) => {
      const existing = await tx.configuracaoRegraEstoque.findFirst({ where: { empresaId, ruleType, scopeType: "TENANT", scopeKey: "TENANT" } });
      if (existing && expectedRevision !== null && expectedRevision !== existing.revision) throw new StockError("STOCK_CONFLICT", "Configuracao de regra alterada por outro operador.", undefined, 409);
      let row;
      if (existing) {
        const cas = await tx.configuracaoRegraEstoque.updateMany({ where: { id: existing.id, empresaId, revision: existing.revision }, data });
        if (cas.count !== 1) throw new StockError("STOCK_CONFLICT", "Configuracao de regra alterada por outro operador.", undefined, 409);
        row = await tx.configuracaoRegraEstoque.findFirst({ where: { id: existing.id, empresaId } });
      } else {
        row = await tx.configuracaoRegraEstoque.create({ data: { empresaId, ruleType, scopeType: "TENANT", scopeKey: "TENANT", ...data, revision: 1 } });
      }
      await tx.eventoAuditoriaEstoque.create({ data: { empresaId, actorType: "USER", actorUsuarioId: req.stockContext.usuarioId, action: "STOCK_RULE_CONFIG_CHANGED", beforeJsonSanitized: existing ? boundedRuleJson(publicRuleConfig(existing)) : null, afterJsonSanitized: boundedRuleJson(publicRuleConfig(row)), correlationId: data.correlationId } });
      return row;
    };
    const row = prisma.$transaction ? await prisma.$transaction(write) : await write(prisma);
    return res.json({ item: publicRuleConfig(row) });
  }));

  app.get("/estoque/avaliacoes", ...guardRole("ADMIN", "GERENTE"), route(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const rows = await prisma.avaliacaoRegraEstoque.findMany({ where: { empresaId: req.stockContext.empresaId }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }], take: limit });
    return res.json({ items: rows.map(publicRuleEvaluation) });
  }));

  app.post("/estoque/regras/avaliar", ...sourceGuardRole("ADMIN"), route(async (req, res) => {
    const result = await getServices().rules.evaluateTenant(req.stockContext.empresaId, { limit: req.body?.limit });
    return res.json({ item: result });
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
function boundedRuleJson(value) { if (value === undefined) return null; try { const text = JSON.stringify(value); return text.length <= 4000 ? text : null; } catch { return null; } }
function normalizeTimezone(value) { if (value === undefined || value === null || value === "") return "America/Sao_Paulo"; if (typeof value !== "string" || value.length > 80) throw new StockError("STOCK_INVALID", "Timezone invalido."); try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value; } catch { throw new StockError("STOCK_INVALID", "Timezone invalido."); } }
function publicRuleConfig(row) { return { id: row.id, ruleType: row.ruleType, scopeType: row.scopeType, scopeKey: row.scopeKey, enabled: row.enabled, expiryWindowDays: row.expiryWindowDays, freshnessSlaMinutes: row.freshnessSlaMinutes, timezone: row.timezone, requiredCapabilities: parseJson(row.requiredCapabilitiesJson), priorityBands: parseJson(row.priorityBandsJson), recipientPolicy: parseJson(row.recipientPolicyJson), suppressionPolicy: parseJson(row.suppressionPolicyJson), revision: row.revision, updatedAt: row.updatedAt }; }
function publicRuleEvaluation(row) { return { id: row.id, ruleType: row.ruleType, matched: row.matched, noMatchReason: row.noMatchReason, priority: row.priority, occurrenceKey: row.occurrenceKey, materialVersion: row.materialVersion, materialChange: row.materialChange, freshnessObserved: row.freshnessObserved, confidence: row.confidence, expiryDate: row.expiryDate, expiryPrecision: row.expiryPrecision, evaluatedAt: row.evaluatedAt, correlationId: row.correlationId }; }
function parseJson(value) { if (!value) return null; try { return JSON.parse(value); } catch { return null; } }

module.exports = { mountStockRoutes, parsePathId, publicSource, publicImport };
