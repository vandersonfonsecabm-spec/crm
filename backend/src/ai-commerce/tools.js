"use strict";

const { sanitizeData } = require("./connection");

const TOOL_REGISTRY_VERSION = "AICommerceToolRegistry.v1";
const MAX_TOOL_CALLS = 5;
const READ_TOOLS = Object.freeze([
  "searchCommercialCatalog",
  "getProductDetails",
  "getSellableAvailability",
  "getProductAlternatives",
  "getPurchaseLink",
]);
const SIDE_EFFECT_TOOLS = Object.freeze([
  "registerProductInterest",
  "createOpportunityDraft",
  "handoffToSalesperson",
]);
const TOOL_NAMES = Object.freeze([...READ_TOOLS, ...SIDE_EFFECT_TOOLS]);

const TOOL_DEFINITIONS = Object.freeze({
  searchCommercialCatalog: definition("searchCommercialCatalog", "READ", {
    type: "object", properties: { query: { type: "string", maxLength: 240 }, filters: { type: "object" } }, additionalProperties: false,
  }),
  getProductDetails: definition("getProductDetails", "READ", {
    type: "object", required: ["catalogProductId"], properties: { catalogProductId: { type: ["string", "integer"], maxLength: 160 } }, additionalProperties: false,
  }),
  getSellableAvailability: definition("getSellableAvailability", "READ", {
    type: "object", required: ["catalogProductId"], properties: { catalogProductId: { type: ["string", "integer"], maxLength: 160 }, requestedQuantity: { type: "string", maxLength: 40 }, locationId: { type: "integer", minimum: 1 } }, additionalProperties: false,
  }),
  getProductAlternatives: definition("getProductAlternatives", "READ", {
    type: "object", required: ["catalogProductId"], properties: { catalogProductId: { type: ["string", "integer"], maxLength: 160 }, limit: { type: "integer", minimum: 1, maximum: 3 } }, additionalProperties: false,
  }),
  getPurchaseLink: definition("getPurchaseLink", "READ", {
    type: "object", required: ["catalogProductId"], properties: { catalogProductId: { type: ["string", "integer"], maxLength: 160 } }, additionalProperties: false,
  }),
  registerProductInterest: definition("registerProductInterest", "SIDE_EFFECT", {
    type: "object", required: ["offerId"], properties: { offerId: { type: "string", maxLength: 128 }, desiredQuantity: { type: "string", maxLength: 40 }, preferences: { type: "object" } }, additionalProperties: false,
  }),
  createOpportunityDraft: definition("createOpportunityDraft", "SIDE_EFFECT", {
    type: "object", required: ["offerIds"], properties: { offerIds: { type: "array", maxItems: 3 }, summary: { type: "string", maxLength: 1000 } }, additionalProperties: false,
  }),
  handoffToSalesperson: definition("handoffToSalesperson", "SIDE_EFFECT", {
    type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 500 }, summary: { type: "string", maxLength: 1500 } }, additionalProperties: false,
  }),
});

function createCommercialToolRegistry({
  services = {},
  authorizeTool,
  audit,
  maxToolCalls = MAX_TOOL_CALLS,
} = {}) {
  const handlers = new Map();
  const counter = new Map();
  const limit = Math.min(MAX_TOOL_CALLS, Math.max(1, Number(maxToolCalls) || MAX_TOOL_CALLS));

  for (const name of TOOL_NAMES) {
    const handler = resolveHandler(services, name);
    handlers.set(name, handler || unavailableHandler(name));
  }

  async function execute(name, input = {}, context = {}) {
    const definition = TOOL_DEFINITIONS[name];
    if (!definition) throw toolError("AI_TOOL_NOT_ALLOWED", "Ferramenta comercial nao autorizada.", 403);
    const tenantId = positiveId(context.empresaId);
    if (!tenantId) throw toolError("AI_TENANT_CONTEXT_INVALID", "Contexto de tenant invalido.", 401);
    if (input.empresaId !== undefined && positiveId(input.empresaId) !== tenantId) {
      throw toolError("AI_TENANT_CONTEXT_INVALID", "Tenant nao pode ser fornecido pela ferramenta.", 403);
    }
    const runKey = String(context.runId || context.correlationId || "run").slice(0, 128);
    const used = counter.get(runKey) || 0;
    if (used >= limit) throw toolError("AI_TOOL_CALL_LIMIT", "Limite de ferramentas por turno excedido.", 429);
    counter.set(runKey, used + 1);
    validateInput(name, input);

    if (typeof authorizeTool === "function") {
      const authorized = await authorizeTool({ name, definition, input, context: { ...context, empresaId: tenantId } });
      if (authorized !== true) throw toolError("AI_TOOL_FORBIDDEN", "Ferramenta nao autorizada para este contexto.", 403);
    }
    if (definition.classification === "SIDE_EFFECT") {
      requireApproval(name, context);
    }

    const safeContext = sanitizeContext({ ...context, empresaId: tenantId });
    const safeInput = sanitizeToolInput(input);
    const startedAt = Date.now();
    let result;
    try {
      result = await handlers.get(name)(safeInput, safeContext);
    } catch (error) {
      await recordAudit(audit, "tool", { name, classification: definition.classification, context: safeContext, input: safeInput, status: "FAILED", errorCode: String(error?.code || "TOOL_FAILED"), durationMs: Date.now() - startedAt });
      throw error;
    }
    const normalizedResult = name === "searchCommercialCatalog" ? normalizeSearchResult(result) : result;
    const safeResult = sanitizeData(normalizedResult);
    await recordAudit(audit, "tool", { name, classification: definition.classification, context: safeContext, input: safeInput, output: safeResult, status: "SUCCEEDED", durationMs: Date.now() - startedAt });
    return safeResult;
  }

  function reset(runId) {
    if (runId === undefined) counter.clear();
    else counter.delete(String(runId));
  }

  return Object.freeze({
    version: TOOL_REGISTRY_VERSION,
    names: TOOL_NAMES,
    definitions: TOOL_DEFINITIONS,
    readTools: READ_TOOLS,
    sideEffectTools: SIDE_EFFECT_TOOLS,
    execute,
    reset,
    isAllowed: (name) => TOOL_NAMES.includes(name),
  });
}

function definition(name, classification, inputSchema) {
  return Object.freeze({ name, version: "v1", classification, inputSchema, requiredPermission: classification === "READ" ? "AI_COMMERCE_READ" : "AI_COMMERCE_APPROVE" });
}

function resolveHandler(services, name) {
  const aliases = {
    searchCommercialCatalog: ["searchCommercialCatalog", "search"],
    getProductDetails: ["getProductDetails", "details"],
    getSellableAvailability: ["getSellableAvailability", "availability"],
    getProductAlternatives: ["getProductAlternatives", "alternatives"],
    getPurchaseLink: ["getPurchaseLink", "purchaseLink"],
    registerProductInterest: ["registerProductInterest", "registerInterest"],
    createOpportunityDraft: ["createOpportunityDraft", "createDraft"],
    handoffToSalesperson: ["handoffToSalesperson", "handoff"],
  };
  for (const key of aliases[name] || []) if (typeof services[key] === "function") return services[key].bind(services);
  return null;
}

function unavailableHandler(name) {
  return async () => { throw toolError("AI_TOOL_UNAVAILABLE", `Ferramenta ${name} indisponivel.`, 503); };
}

function requireApproval(name, context) {
  if (context.mode !== "HUMAN_APPROVAL" || context.approvedActions?.[name] !== true) {
    throw toolError("AI_TOOL_HUMAN_APPROVAL_REQUIRED", "Esta acao exige aprovacao humana explicita.", 409);
  }
  if (!positiveId(context.actorUsuarioId)) throw toolError("AI_APPROVAL_ACTOR_REQUIRED", "Ator de aprovacao ausente.", 403);
  if (!String(context.idempotencyKey || "").trim()) throw toolError("AI_IDEMPOTENCY_REQUIRED", "Chave de idempotencia obrigatoria.", 422);
}

function validateInput(name, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw toolError("AI_TOOL_INPUT_INVALID", "Entrada de ferramenta invalida.", 422);
  if (name === "searchCommercialCatalog") {
    if (input.query !== undefined && (typeof input.query !== "string" || input.query.length > 240)) throw toolError("AI_TOOL_INPUT_INVALID", "Consulta invalida.", 422);
  }
  if (input.catalogProductId !== undefined && !referenceId(input.catalogProductId)) throw toolError("AI_TOOL_INPUT_INVALID", "Identificador de produto invalido.", 422);
  if (input.locationId !== undefined && !positiveId(input.locationId)) throw toolError("AI_TOOL_INPUT_INVALID", "Identificador de local invalido.", 422);
  if (name === "getSellableAvailability" && input.requestedQuantity !== undefined && (typeof input.requestedQuantity !== "string" || !/^\d{1,12}(?:\.\d{1,6})?$/.test(input.requestedQuantity))) throw toolError("AI_TOOL_INPUT_INVALID", "Quantidade solicitada invalida.", 422);
  if (name === "createOpportunityDraft" && (!Array.isArray(input.offerIds) || input.offerIds.length < 1 || input.offerIds.length > 3)) throw toolError("AI_TOOL_INPUT_INVALID", "Ofertas do rascunho invalidas.", 422);
  if (name === "handoffToSalesperson" && (!String(input.reason || "").trim() || String(input.reason).length > 500)) throw toolError("AI_TOOL_INPUT_INVALID", "Motivo de handoff invalido.", 422);
}

function sanitizeToolInput(input) {
  const safe = sanitizeData(input || {});
  if (safe && typeof safe === "object") delete safe.empresaId;
  return safe;
}

function normalizeSearchResult(result) {
  const items = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
  return items.slice(0, 20).map((item) => {
    if (item?.product && typeof item.product === "object") return { ...item.product, ...(item.availability && typeof item.availability === "object" ? { availability: item.availability } : {}) };
    return item;
  });
}

function sanitizeContext(context) {
  return {
    empresaId: positiveId(context.empresaId),
    conversationId: positiveId(context.conversationId),
    actorUsuarioId: positiveId(context.actorUsuarioId),
    runId: String(context.runId || "").slice(0, 128),
    correlationId: String(context.correlationId || "").slice(0, 128),
    mode: String(context.mode || "OFF"),
    idempotencyKey: String(context.idempotencyKey || "").slice(0, 200),
    approvedActions: Object.fromEntries(Object.entries(context.approvedActions || {}).filter(([key, value]) => TOOL_NAMES.includes(key) && value === true)),
  };
}

async function recordAudit(audit, type, payload) {
  if (typeof audit === "function") return audit(type, sanitizeData(payload));
  if (audit && typeof audit.recordToolInvocation === "function" && type === "tool") return audit.recordToolInvocation(payload);
  return undefined;
}

function toolError(code, message, status = 400) {
  const error = new Error(message);
  error.name = "AICommerceToolError";
  error.code = code;
  error.status = status;
  return error;
}

function positiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function referenceId(value) {
  if (positiveId(value)) return true;
  return /^[A-Za-z0-9_-]{1,160}$/.test(String(value || "").trim());
}

module.exports = {
  TOOL_REGISTRY_VERSION,
  MAX_TOOL_CALLS,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  READ_TOOLS,
  SIDE_EFFECT_TOOLS,
  createCommercialToolRegistry,
  validateInput,
};
