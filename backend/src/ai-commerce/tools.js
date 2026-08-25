"use strict";

const { sanitizeData } = require("./connection");

const TOOL_REGISTRY_VERSION = "AICommerceToolRegistry.v1";
const MAX_TOOL_CALLS = 5;
const TOOL_COUNTER_TTL_MS = 15 * 60 * 1000;
const MAX_TOOL_COUNTER_ENTRIES = 10000;
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
    type: "object", properties: { query: { type: "string", maxLength: 240 }, filters: {
      type: "object",
      properties: {
        category: { type: "string", maxLength: 120 },
        brand: { type: "string", maxLength: 120 },
        minPrice: { type: ["string", "number"], maxLength: 40 },
        maxPrice: { type: ["string", "number"], maxLength: 40 },
        availability: { type: "string", maxLength: 40 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
        attributes: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    } }, additionalProperties: false,
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
    type: "object", required: ["offerId"], properties: { offerId: { type: "string", maxLength: 128 }, desiredQuantity: { type: "string", maxLength: 40 }, customerId: { type: "integer", minimum: 1 }, preferences: { type: "object", additionalProperties: true } }, additionalProperties: false,
  }),
  createOpportunityDraft: definition("createOpportunityDraft", "SIDE_EFFECT", {
    type: "object", required: ["offerIds"], properties: { offerIds: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 128 } }, customerId: { type: "integer", minimum: 1 }, summary: { type: "string", maxLength: 1000 } }, additionalProperties: false,
  }),
  handoffToSalesperson: definition("handoffToSalesperson", "SIDE_EFFECT", {
    type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 500 }, summary: { type: "string", maxLength: 1500 }, draftId: { type: "string", maxLength: 160 }, opportunityDraftId: { type: "string", maxLength: 160 }, offerId: { type: "string", maxLength: 128 } }, additionalProperties: false,
  }),
});

function createCommercialToolRegistry({
  services = {},
  authorizeTool,
  audit,
  maxToolCalls = MAX_TOOL_CALLS,
  counterTtlMs = TOOL_COUNTER_TTL_MS,
  maxCounterEntries = MAX_TOOL_COUNTER_ENTRIES,
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
    const now = Date.now();
    purgeCounters(now, counter, Math.max(1000, Number(counterTtlMs) || TOOL_COUNTER_TTL_MS), Math.min(MAX_TOOL_COUNTER_ENTRIES, Math.max(100, Number(maxCounterEntries) || MAX_TOOL_COUNTER_ENTRIES)));
    const runKey = String(context.runId || context.correlationId || "run").slice(0, 128);
    const entry = counter.get(runKey);
    const used = entry && now - entry.lastUsedAt <= Math.max(1000, Number(counterTtlMs) || TOOL_COUNTER_TTL_MS) ? entry.count : 0;
    if (used >= limit) throw toolError("AI_TOOL_CALL_LIMIT", "Limite de ferramentas por turno excedido.", 429);
    counter.set(runKey, { count: used + 1, lastUsedAt: now });
    const invocationNumber = used + 1;
    const auditIdempotencyKey = `${String(context.idempotencyKey || runKey)}:${name}:${invocationNumber}`.slice(0, 200);
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
      await recordAudit(audit, "tool", { name, classification: definition.classification, context: safeContext, input: safeInput, idempotencyKey: auditIdempotencyKey, status: "FAILED", errorCode: String(error?.code || "TOOL_FAILED"), durationMs: Date.now() - startedAt });
      throw error;
    }
    const normalizedResult = name === "searchCommercialCatalog" ? normalizeSearchResult(result) : result;
    const safeResult = redactSensitiveData(sanitizeData(normalizedResult));
    await recordAudit(audit, "tool", { name, classification: definition.classification, context: safeContext, input: safeInput, output: safeResult, idempotencyKey: auditIdempotencyKey, status: "SUCCEEDED", durationMs: Date.now() - startedAt });
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
  const schema = TOOL_DEFINITIONS[name]?.inputSchema;
  if (schema) validateSchemaValue(input, schema, "input");
  if (name === "searchCommercialCatalog") {
    if (input.query !== undefined && (typeof input.query !== "string" || input.query.length > 240)) throw toolError("AI_TOOL_INPUT_INVALID", "Consulta invalida.", 422);
  }
  if (input.catalogProductId !== undefined && !referenceId(input.catalogProductId)) throw toolError("AI_TOOL_INPUT_INVALID", "Identificador de produto invalido.", 422);
  if (input.locationId !== undefined && !positiveId(input.locationId)) throw toolError("AI_TOOL_INPUT_INVALID", "Identificador de local invalido.", 422);
  if (name === "getSellableAvailability" && input.requestedQuantity !== undefined && (typeof input.requestedQuantity !== "string" || !/^\d{1,12}(?:\.\d{1,6})?$/.test(input.requestedQuantity))) throw toolError("AI_TOOL_INPUT_INVALID", "Quantidade solicitada invalida.", 422);
  if (name === "createOpportunityDraft" && (!Array.isArray(input.offerIds) || input.offerIds.length < 1 || input.offerIds.length > 3)) throw toolError("AI_TOOL_INPUT_INVALID", "Ofertas do rascunho invalidas.", 422);
  if (name === "handoffToSalesperson" && (!String(input.reason || "").trim() || String(input.reason).length > 500)) throw toolError("AI_TOOL_INPUT_INVALID", "Motivo de handoff invalido.", 422);
}

function validateSchemaValue(value, schema, path) {
  if (schema.required && typeof value === "object" && value !== null) {
    for (const field of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined || value[field] === null || value[field] === "") {
        throw toolError("AI_TOOL_INPUT_REQUIRED", `Campo obrigatorio ausente: ${path}.${field}.`, 422);
      }
    }
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some((type) => matchesSchemaType(value, type))) throw toolError("AI_TOOL_INPUT_INVALID", `Tipo invalido em ${path}.`, 422);
  if (typeof value === "string") {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw toolError("AI_TOOL_INPUT_INVALID", `Campo excede limite em ${path}.`, 422);
    if (schema.minLength !== undefined && value.length < schema.minLength) throw toolError("AI_TOOL_INPUT_INVALID", `Campo abaixo do limite em ${path}.`, 422);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw toolError("AI_TOOL_INPUT_INVALID", `Numero invalido em ${path}.`, 422);
    if (schema.minimum !== undefined && value < schema.minimum) throw toolError("AI_TOOL_INPUT_INVALID", `Numero abaixo do limite em ${path}.`, 422);
    if (schema.maximum !== undefined && value > schema.maximum) throw toolError("AI_TOOL_INPUT_INVALID", `Numero acima do limite em ${path}.`, 422);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw toolError("AI_TOOL_INPUT_INVALID", `Lista excede limite em ${path}.`, 422);
    if (schema.minItems !== undefined && value.length < schema.minItems) throw toolError("AI_TOOL_INPUT_INVALID", `Lista abaixo do limite em ${path}.`, 422);
    if (schema.items) value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`));
  }
  if (isPlainObject(value) && schema.type === "object") {
    const properties = schema.properties || {};
    if (schema.additionalProperties !== true) {
      const unknown = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unknown.length) throw toolError("AI_TOOL_INPUT_UNKNOWN_FIELD", `Campos nao permitidos em ${path}: ${unknown.join(", ")}.`, 422);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null) validateSchemaValue(value[key], childSchema, `${path}.${key}`);
    }
  }
}

function matchesSchemaType(value, type) {
  if (type === "object") return isPlainObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  return true;
}

function isPlainObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)); }

function sanitizeToolInput(input) {
  const safe = redactSensitiveData(sanitizeData(input || {}));
  if (safe && typeof safe === "object") delete safe.empresaId;
  return safe;
}

function redactSensitiveData(value, depth = 0) {
  if (depth > 5) return "[truncated]";
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitiveData(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    String(key).slice(0, 120),
    /api.?key|private.?key|access.?key|password|token|secret|cookie|authorization|credential|database|dsn/i.test(key)
      ? "[redacted]"
      : redactSensitiveData(item, depth + 1),
  ]));
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

function purgeCounters(now, counter, ttlMs, maxEntries) {
  for (const [key, entry] of counter.entries()) if (!entry || now - entry.lastUsedAt > ttlMs) counter.delete(key);
  if (counter.size <= maxEntries) return;
  const oldest = [...counter.entries()].sort((a, b) => (a[1]?.lastUsedAt || 0) - (b[1]?.lastUsedAt || 0));
  for (const [key] of oldest.slice(0, counter.size - maxEntries)) counter.delete(key);
}

module.exports = {
  TOOL_REGISTRY_VERSION,
  MAX_TOOL_CALLS,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  READ_TOOLS,
  SIDE_EFFECT_TOOLS,
  TOOL_COUNTER_TTL_MS,
  MAX_TOOL_COUNTER_ENTRIES,
  createCommercialToolRegistry,
  validateInput,
};
