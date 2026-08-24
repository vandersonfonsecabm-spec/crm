"use strict";

const express = require("express");
const { FEATURE_KEYS, isFeatureEnabledForTenant } = require("../tenant-features/service");
const { MODES, normalizeMode } = require("./policy");
const { MockCommerceAIConnection, UnconfiguredCommerceAIConnection } = require("./connection");
const { TOOL_NAMES } = require("./tools");

function mountAICommerceRoutes({
  app,
  prisma,
  authenticate,
  requireRole,
  orchestrator,
  connection,
  settingsService,
  env = process.env,
  logger = console,
} = {}) {
  if (!app || !prisma || !authenticate || !requireRole) throw new Error("Dependencias de rotas AI Commerce ausentes.");
  const aiConnection = connection || new UnconfiguredCommerceAIConnection();
  const router = express.Router();
  const roles = ["ADMIN", "GERENTE", "VENDEDOR"];

  router.use(authenticate);
  router.use(requireRole(...roles));
  router.use(async (req, res, next) => {
    try {
      const empresaId = positiveId(req.auth?.empresaId);
      if (!empresaId) return res.status(401).json({ error: { code: "AI_TENANT_CONTEXT_INVALID", message: "Contexto autenticado invalido." } });
      if (!await isFeatureEnabledForTenant({ prisma, empresaId, featureKey: FEATURE_KEYS.AI_COMMERCE, env })) {
        return res.status(404).json({ error: { code: "AI_COMMERCE_DISABLED", message: "Recurso nao encontrado." } });
      }
      req.aiCommerceContext = { empresaId, actorUsuarioId: positiveId(req.auth.usuarioId), papel: req.auth.papel };
      return next();
    } catch (error) {
      logger.warn?.("ai_commerce_feature_gate_failed", { code: String(error?.code || "FEATURE_GATE_FAILED") });
      return res.status(404).json({ error: { code: "AI_COMMERCE_DISABLED", message: "Recurso nao encontrado." } });
    }
  });

  router.get("/settings", async (req, res) => {
    try {
      const item = await readSettings({ prisma, settingsService, empresaId: req.aiCommerceContext.empresaId });
      return res.json({ item: publicSettings(item) });
    } catch (error) { return sendError(res, error); }
  });

  router.put("/settings", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      if (!["ADMIN", "GERENTE"].includes(req.auth?.papel)) return res.status(403).json({ error: { code: "AI_SETTINGS_FORBIDDEN", message: "Permissao insuficiente para configurar a fundacao." } });
      const item = await writeSettings({ prisma, settingsService, empresaId: req.aiCommerceContext.empresaId, actorUsuarioId: req.aiCommerceContext.actorUsuarioId, body: req.body || {} });
      return res.json({ item: publicSettings(item) });
    } catch (error) { return sendError(res, error); }
  });

  router.get("/connection/status", async (req, res) => {
    try { return res.json({ item: await aiConnection.getConnectionStatus({ empresaId: req.aiCommerceContext.empresaId }) }); } catch (error) { return sendError(res, error); }
  });

  router.post("/mock/validate", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const mock = aiConnection instanceof MockCommerceAIConnection ? aiConnection : new MockCommerceAIConnection({ enabled: false });
      const result = await mock.validateConnection({ empresaId: req.aiCommerceContext.empresaId });
      return res.json({ item: result });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/runs", express.json({ limit: "128kb" }), async (req, res) => {
    try {
      if (!orchestrator || typeof orchestrator.run !== "function") return res.status(503).json({ error: { code: "AI_COMMERCE_UNAVAILABLE", message: "Fundacao comercial indisponivel." } });
      const body = req.body || {};
      rejectForeignTenant(body, req.aiCommerceContext.empresaId);
      const result = await orchestrator.run({
        ...body,
        empresaId: req.aiCommerceContext.empresaId,
        actorUsuarioId: req.aiCommerceContext.actorUsuarioId,
      });
      return res.status(result?.noExecution ? 200 : 201).json({ item: redactRun(result) });
    } catch (error) { return sendError(res, error); }
  });

  router.get("/runs/:key", async (req, res) => {
    try {
      const result = orchestrator?.getRun?.(req.params.key);
      if (!result || result.empresaId !== req.aiCommerceContext.empresaId) return res.status(404).json({ error: { code: "AI_RUN_NOT_FOUND", message: "Execucao nao encontrada." } });
      return res.json({ item: redactRun(result) });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/drafts/:id/approve", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      if (!orchestrator || typeof orchestrator.approve !== "function") return res.status(503).json({ error: { code: "AI_COMMERCE_UNAVAILABLE", message: "Aprovacao indisponivel." } });
      const body = req.body || {};
      rejectForeignTenant(body, req.aiCommerceContext.empresaId);
      const result = await orchestrator.approve({ ...body, draftId: req.params.id, empresaId: req.aiCommerceContext.empresaId, actorUsuarioId: req.aiCommerceContext.actorUsuarioId });
      return res.json({ item: redactRun(result) });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/drafts/:id/reject", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      if (!orchestrator || typeof orchestrator.reject !== "function") return res.status(503).json({ error: { code: "AI_COMMERCE_UNAVAILABLE", message: "Rejeicao indisponivel." } });
      const body = req.body || {};
      rejectForeignTenant(body, req.aiCommerceContext.empresaId);
      const result = await orchestrator.reject({ ...body, draftId: req.params.id, empresaId: req.aiCommerceContext.empresaId, conversationId: body.conversationId || undefined, actorUsuarioId: req.aiCommerceContext.actorUsuarioId });
      return res.json({ item: redactRun(result) });
    } catch (error) { return sendError(res, error); }
  });

  app.use("/ai-commerce", router);
  return router;
}

async function readSettings({ prisma, settingsService, empresaId }) {
  if (typeof settingsService?.get === "function") return settingsService.get({ empresaId });
  const model = prisma.aiCommerceSettings || prisma.aICommerceSettings;
  if (model?.findUnique) return (await model.findUnique({ where: { empresaId } })) || defaultSettings(empresaId);
  return defaultSettings(empresaId);
}

async function writeSettings({ prisma, settingsService, empresaId, actorUsuarioId, body }) {
  const expectedRevision = body.revision === undefined ? null : Number(body.revision);
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw routeError("AI_SETTINGS_REVISION_INVALID", "Revisao de configuracao invalida.", 422);
  const current = typeof settingsService?.get === "function"
    ? await settingsService.get({ empresaId })
    : prisma?.aiCommerceSettings?.findUnique
      ? await prisma.aiCommerceSettings.findUnique({ where: { empresaId } })
      : prisma?.aICommerceSettings?.findUnique
        ? await prisma.aICommerceSettings.findUnique({ where: { empresaId } })
        : null;
  const data = normalizeSettings(body, current || defaultSettings(empresaId));
  if (typeof settingsService?.update === "function") return settingsService.update({ empresaId, actorUsuarioId, expectedRevision, data });
  const model = prisma.aiCommerceSettings || prisma.aICommerceSettings;
  if (!model?.upsert) return { ...defaultSettings(empresaId), ...data, actorUsuarioId };
  const persistenceData = { ...data, allowedToolsJson: JSON.stringify(data.allowedTools || []) };
  delete persistenceData.allowedTools;
  if (expectedRevision !== null && model.findUnique) {
    const current = await model.findUnique({ where: { empresaId }, select: { revision: true } });
    if (current && Number(current.revision) !== expectedRevision) throw routeError("AI_SETTINGS_CONFLICT", "Configuracao alterada por outro operador.", 409);
  }
  return model.upsert({
    where: { empresaId },
    create: { empresaId, ...persistenceData, revision: 1, actorUsuarioId },
    update: { ...persistenceData, revision: { increment: 1 }, actorUsuarioId },
  });
}

function normalizeSettings(body = {}, current = {}) {
  const allowed = new Set(["revision", "mode", "enabled", "allowedTools", "maxTools", "maxContextMessages", "maxProducts", "humanApprovalRequired", "catalogVisibilityPolicy", "exactQuantityPolicy", "stalePolicy", "noPricePolicy", "opportunityPolicy", "handoffPolicy"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw routeError("AI_SETTINGS_FIELDS_INVALID", "Campos de configuracao nao permitidos.", 422);
  const mode = body.mode === undefined ? normalizeMode(current.mode) : normalizeMode(body.mode);
  const allowedTools = body.allowedTools === undefined
    ? parseAllowedTools(current.allowedTools ?? current.allowedToolsJson)
    : Array.isArray(body.allowedTools) ? body.allowedTools.map((item) => String(item).slice(0, 80)).slice(0, 8) : [];
  if (allowedTools.some((name) => !TOOL_NAMES.includes(name))) throw routeError("AI_SETTINGS_TOOL_INVALID", "Ferramenta nao autorizada na configuracao.", 422);
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") throw routeError("AI_SETTINGS_INVALID", "enabled deve ser booleano.", 422);
  return {
    enabled: (body.enabled === undefined ? current.enabled === true : body.enabled === true) && mode !== MODES.OFF,
    mode,
    allowedTools,
    maxTools: clamp(body.maxTools, 1, 5, clamp(current.maxTools, 1, 5, 5)),
    maxContextMessages: clamp(body.maxContextMessages, 1, 20, clamp(current.maxContextMessages, 1, 20, 20)),
    maxProducts: clamp(body.maxProducts, 1, 3, clamp(current.maxProducts, 1, 3, 3)),
    humanApprovalRequired: true,
    catalogVisibilityPolicy: String(body.catalogVisibilityPolicy ?? current.catalogVisibilityPolicy ?? "PUBLISHED").slice(0, 80),
    exactQuantityPolicy: String(body.exactQuantityPolicy ?? current.exactQuantityPolicy ?? "HIDDEN").slice(0, 80),
    stalePolicy: String(body.stalePolicy ?? current.stalePolicy ?? "NEEDS_CONFIRMATION").slice(0, 80),
    noPricePolicy: String(body.noPricePolicy ?? current.noPricePolicy ?? "DO_NOT_QUOTE").slice(0, 80),
    opportunityPolicy: String(body.opportunityPolicy ?? current.opportunityPolicy ?? "DRAFT_ONLY").slice(0, 80),
    handoffPolicy: String(body.handoffPolicy ?? current.handoffPolicy ?? "HUMAN_ONLY").slice(0, 80),
  };
}

function publicSettings(item) {
  const value = item || {};
  return {
    empresaId: positiveId(value.empresaId),
    enabled: value.enabled === true,
    mode: normalizeMode(value.mode),
    allowedTools: parseAllowedTools(value.allowedTools ?? value.allowedToolsJson),
    maxTools: Number(value.maxTools) || 5,
    maxContextMessages: Number(value.maxContextMessages) || 20,
    maxProducts: Number(value.maxProducts) || 3,
    humanApprovalRequired: true,
    catalogVisibilityPolicy: String(value.catalogVisibilityPolicy || "PUBLISHED_ONLY"),
    exactQuantityPolicy: String(value.exactQuantityPolicy || "HIDDEN_BY_DEFAULT"),
    stalePolicy: String(value.stalePolicy || "NEEDS_CONFIRMATION"),
    noPricePolicy: String(value.noPricePolicy || "DO_NOT_QUOTE"),
    opportunityPolicy: String(value.opportunityPolicy || "DRAFT_ONLY"),
    handoffPolicy: String(value.handoffPolicy || "HUMAN_SELLER"),
    revision: Number(value.revision) || 1,
    realProviderConnected: false,
    autoReply: false,
    outbound: 0,
  };
}

function redactRun(result) {
  if (!result || typeof result !== "object") return null;
  return {
    ...result,
    toolResults: sanitizeToolResults(result.toolResults),
    draft: result.draft ? { ...result.draft, productOffers: Array.isArray(result.draft.productOffers) ? result.draft.productOffers.map(redactOffer) : [] } : null,
    decision: result.decision ? { ...result.decision, requestedTools: Array.isArray(result.decision.requestedTools) ? result.decision.requestedTools.map((item) => ({ name: item.name, version: item.version, input: item.input })) : [] } : null,
    autoSend: false,
    outbound: 0,
  };
}

function redactOffer(offer) {
  if (!offer || typeof offer !== "object") return offer;
  const copy = { ...offer };
  for (const field of ["empresaId", "stockProductId", "conversationId", "customerId", "catalogProductId"]) delete copy[field];
  return copy;
}

function sanitizeToolResults(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, list]) => [key, (Array.isArray(list) ? list : [list]).slice(0, 3).map((item) => {
    if (!item || typeof item !== "object") return item;
    const copy = { ...item };
    for (const field of ["externalId", "credentialRef", "rawPayload", "sourceId", "sourceRecordId", "externalLocationId", "cost", "margin"]) delete copy[field];
    return copy;
  })]));
}

function rejectForeignTenant(body, empresaId) {
  if (body && body.empresaId !== undefined && positiveId(body.empresaId) !== positiveId(empresaId)) throw routeError("AI_TENANT_CONTEXT_INVALID", "Tenant nao autorizado.", 403);
}
function defaultSettings(empresaId) { return { empresaId, enabled: false, mode: MODES.OFF, allowedTools: [], maxTools: 5, maxContextMessages: 20, maxProducts: 3, humanApprovalRequired: true, revision: 1 }; }
function parseAllowedTools(value) {
  if (Array.isArray(value)) return value.map(String).filter((name) => TOOL_NAMES.includes(name)).slice(0, 8);
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String).filter((name) => TOOL_NAMES.includes(name)).slice(0, 8) : []; } catch { return []; }
}
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function positiveId(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }
function routeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
function sendError(res, error) { const status = Number.isInteger(error?.status) ? error.status : 500; return res.status(status).json({ error: { code: String(error?.code || "AI_COMMERCE_ERROR"), message: status >= 500 ? "Operacao comercial indisponivel." : String(error?.message || "Requisicao invalida.") } }); }

module.exports = { mountAICommerceRoutes, normalizeSettings, publicSettings, redactRun };
