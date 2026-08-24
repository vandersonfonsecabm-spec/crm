"use strict";

const crypto = require("node:crypto");

const CONNECTION_SCHEMA_VERSION = "CommerceAIConnectionPort.v1";
const DECISION_SCHEMA_VERSION = "CommerceAIDecision.v1";
const CONNECTION_STATUSES = Object.freeze({
  NOT_CONNECTED: "NOT_CONNECTED",
  READY: "READY",
  DEGRADED: "DEGRADED",
  BLOCKED: "BLOCKED",
});

class CommerceAIConnectionError extends Error {
  constructor(code, message, details = undefined, status = 503) {
    super(message);
    this.name = "CommerceAIConnectionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

class UnconfiguredCommerceAIConnection {
  constructor({ reason = "REAL_PROVIDER_NOT_CONFIGURED" } = {}) {
    this.reason = String(reason).slice(0, 160);
  }

  getConnectionStatus() {
    return Object.freeze({
      schemaVersion: CONNECTION_SCHEMA_VERSION,
      status: CONNECTION_STATUSES.NOT_CONNECTED,
      providerConnected: false,
      realConnector: false,
      realProviderConnected: false,
      realConnectorImplemented: false,
      autoReplyEnabled: false,
      networkEnabled: false,
      reason: this.reason,
    });
  }

  async validateConnection() {
    return Object.freeze({
      valid: false,
      status: CONNECTION_STATUSES.NOT_CONNECTED,
      code: this.reason,
      networkAttempted: false,
    });
  }

  async generateCommercialDecision() {
    throw new CommerceAIConnectionError(
      "AI_CONNECTION_NOT_CONFIGURED",
      "Nenhuma conexao de IA comercial esta configurada.",
      undefined,
      503,
    );
  }

  async cancel() {
    return Object.freeze({ cancelled: false, reason: "NOT_CONNECTED" });
  }
}

class MockCommerceAIConnection {
  constructor({
    allowlist = [],
    enabled = false,
    version = "mock-commerce-ai.v1",
    scenario = "default",
  } = {}) {
    this.allowlist = new Set(normalizeTenantIds(allowlist));
    this.enabled = enabled === true;
    this.version = String(version).slice(0, 80);
    this.scenario = String(scenario).slice(0, 80);
    this.networkAttempted = false;
  }

  getConnectionStatus(input = {}) {
    const tenantAllowed = isTenantAllowed(input.empresaId, this.allowlist);
    const enabled = this.enabled && tenantAllowed;
    return Object.freeze({
      schemaVersion: CONNECTION_SCHEMA_VERSION,
      status: enabled ? CONNECTION_STATUSES.READY : CONNECTION_STATUSES.BLOCKED,
      providerConnected: false,
      realConnector: false,
      realProviderConnected: false,
      realConnectorImplemented: false,
      autoReplyEnabled: false,
      mock: true,
      networkEnabled: false,
      tenantAllowed,
      enabled,
      version: this.version,
      reason: enabled ? null : "MOCK_NOT_ALLOWLISTED_OR_DISABLED",
    });
  }

  async validateConnection(input = {}) {
    const status = this.getConnectionStatus(input);
    return Object.freeze({
      valid: status.status === CONNECTION_STATUSES.READY,
      status: status.status,
      code: status.reason,
      networkAttempted: false,
      deterministic: true,
      version: this.version,
    });
  }

  async generateCommercialDecision(input = {}) {
    const status = this.getConnectionStatus(input);
    if (status.status !== CONNECTION_STATUSES.READY) {
      throw new CommerceAIConnectionError(
        "AI_MOCK_DISABLED",
        "Mock de IA comercial indisponivel para este tenant.",
        undefined,
        404,
      );
    }
    const context = sanitizeInput(input);
    const messages = Array.isArray(context.conversationContext?.messages)
      ? context.conversationContext.messages
      : [];
    const latest = String(messages[messages.length - 1]?.text || context.latestMessage || "").trim();
    const lower = normalizeText(latest);
    const conversationText = normalizeText([...messages.map((message) => message?.text || ""), latest].join(" "));
    const correlationId = String(context.correlationId || crypto.createHash("sha256").update(latest).digest("hex")).slice(0, 128);

    if (containsPromptInjection(latest) || containsPromptInjection(JSON.stringify(context.catalogContext || {}))) {
      return decision({
        correlationId,
        intent: "UNSAFE_REQUEST",
        confidence: "HIGH",
        nextAction: "HANDOFF",
        safetyFlags: ["PROMPT_INJECTION_BLOCKED"],
        policyFlags: ["NO_TOOL_EXECUTION", "NO_INTERNAL_DATA"],
        handoffReason: "Mensagem rejeitada pela politica de seguranca.",
      });
    }

    const searchAttempted = Object.prototype.hasOwnProperty.call(context.toolResults || {}, "searchCommercialCatalog");
    const hasSearchResult = Array.isArray(context.toolResults?.searchCommercialCatalog)
      && context.toolResults.searchCommercialCatalog.length > 0;
    const hasAvailability = context.toolResults?.getSellableAvailability;

    if (hasAvailability) {
      const availabilityValue = Array.isArray(context.toolResults.getSellableAvailability)
        ? context.toolResults.getSellableAvailability[0]
        : context.toolResults.getSellableAvailability;
      const availability = sanitizeData(availabilityValue);
      return decision({
        correlationId,
        intent: "PRODUCT_SEARCH",
        confidence: "HIGH",
        nextAction: "DRAFT_RESPONSE",
        requestedTools: [],
        offerIds: Array.isArray(context.offerIds) ? context.offerIds.slice(0, 3) : [],
        draftResponse: buildAvailabilityDraft(availability),
      });
    }

    if (hasSearchResult) {
      const first = sanitizeData(context.toolResults.searchCommercialCatalog[0]);
      return decision({
        correlationId,
        intent: "PRODUCT_SEARCH",
        confidence: "HIGH",
        nextAction: "CHECK_AVAILABILITY",
        requestedTools: [{
          name: "getSellableAvailability",
          version: "v1",
            input: { catalogProductId: safeReferenceId(first.catalogProductId || first.id) },
        }],
        draftResponse: null,
      });
    }

    if (searchAttempted) {
      return decision({
        correlationId,
        intent: "PRODUCT_SEARCH",
        confidence: "HIGH",
        nextAction: "HANDOFF",
        handoffReason: "Nenhum produto publicado correspondeu aos filtros informados.",
        safetyFlags: ["NO_CATALOG_MATCH"],
        draftResponse: "Não encontrei um produto publicado com esses critérios. Posso encaminhar a solicitação para um vendedor ou buscar alternativas.",
      });
    }

    if (isBrushCutterRequest(conversationText) && !hasProductQualification(lower)) {
      return decision({
        correlationId,
        intent: "PRODUCT_SEARCH",
        confidence: "HIGH",
        nextAction: "ASK_CLARIFYING_QUESTION",
        missingInformation: ["uso", "tipo de motor", "faixa de preco"],
        draftResponse: "Para indicar a roçadeira certa, qual será o uso, prefere motor a gasolina ou elétrico e qual faixa de preço?",
      });
    }

    if (isBrushCutterRequest(conversationText)) {
      return decision({
        correlationId,
        intent: "PRODUCT_SEARCH",
        confidence: "MEDIUM",
        nextAction: "SEARCH_CATALOG",
        requestedTools: [{
          name: "searchCommercialCatalog",
          version: "v1",
          input: {
            query: "roçadeira",
            filters: extractBrushCutterFilters(latest),
          },
        }],
      });
    }

    if (!latest) {
      return decision({
        correlationId,
        intent: "UNKNOWN",
        confidence: "LOW",
        nextAction: "ASK_CLARIFYING_QUESTION",
        missingInformation: ["necessidade do cliente"],
        draftResponse: "Como posso ajudar com os produtos da sua empresa?",
      });
    }

    return decision({
      correlationId,
      intent: "GENERAL_COMMERCIAL_QUESTION",
      confidence: "LOW",
      nextAction: "HANDOFF",
      handoffReason: "Pergunta fora do catalogo comercial estruturado.",
      safetyFlags: ["OUT_OF_KNOWLEDGE_SCOPE"],
      draftResponse: "Vou encaminhar sua dúvida para um vendedor confirmar as informações.",
    });
  }

  async cancel(runId) {
    return Object.freeze({ cancelled: true, runId: String(runId || "").slice(0, 128), providerCall: false });
  }
}

function decision(input = {}) {
  return Object.freeze({
    schemaVersion: DECISION_SCHEMA_VERSION,
    connectorVersion: "mock-commerce-ai.v1",
    intent: String(input.intent || "UNKNOWN").slice(0, 80),
    confidence: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(input.confidence) ? input.confidence : "UNKNOWN",
    nextAction: String(input.nextAction || "HANDOFF").slice(0, 80),
    missingInformation: boundedStrings(input.missingInformation, 20, 120),
    requestedTools: boundedToolRequests(input.requestedTools),
    draftResponse: typeof input.draftResponse === "string" ? input.draftResponse.slice(0, 2000) : null,
    offerIds: boundedIds(input.offerIds, 3),
    handoffReason: typeof input.handoffReason === "string" ? input.handoffReason.slice(0, 500) : null,
    safetyFlags: boundedStrings(input.safetyFlags, 20, 120),
    policyFlags: boundedStrings(input.policyFlags, 20, 120),
    correlationId: String(input.correlationId || "").slice(0, 128),
  });
}

function sanitizeInput(input) {
  const safe = {
    empresaId: safeId(input.empresaId),
    conversationId: safeId(input.conversationId),
    correlationId: typeof input.correlationId === "string" ? input.correlationId : null,
    latestMessage: typeof input.latestMessage === "string" ? input.latestMessage.slice(0, 4000) : null,
    conversationContext: {
      messages: Array.isArray(input.conversationContext?.messages)
        ? input.conversationContext.messages.slice(-20).map((message) => ({
          id: safeId(message?.id),
          direction: message?.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
          text: String(message?.text || "").slice(0, 4000),
        }))
        : [],
    },
    catalogContext: sanitizeData(input.catalogContext),
    toolResults: sanitizeData(input.toolResults),
    offerIds: boundedIds(input.offerIds, 3),
  };
  return safe;
}

function buildAvailabilityDraft(availability) {
  const status = String(availability?.status || "NEEDS_CONFIRMATION");
  const message = String(availability?.customerSafeMessage || "A disponibilidade precisa ser confirmada por um vendedor.").slice(0, 800);
  return message || (status === "AVAILABLE" ? "Encontrei uma opção no catálogo." : "A disponibilidade precisa ser confirmada por um vendedor.");
}

function extractBrushCutterFilters(message) {
  const lower = normalizeText(message);
  const filters = { category: "roçadeira" };
  if (lower.includes("gasolina")) filters.attributes = { engineType: "GASOLINE" };
  if (lower.includes("eletric") || lower.includes("elétric")) filters.attributes = { engineType: "ELECTRIC" };
  const match = lower.match(/(?:ate|até)\s*(?:r\$\s*)?(\d+[\d.,]*)/i);
  if (match) {
    const value = Number(match[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(value) && value >= 0 && value <= 100000000) filters.maxPrice = value;
  }
  if (lower.includes("profissional")) filters.tags = ["profissional"];
  return filters;
}

function hasProductQualification(text) {
  return /gasolina|el[eé]tric|profissional|\bate\b|até|r\$/.test(text);
}

function isBrushCutterRequest(text) {
  return text.includes("rocadeira") || text.includes("roçadeira");
}

function containsPromptInjection(value) {
  const text = normalizeText(value);
  return /(ignore|desconsidere|esqueca|esqueça).{0,40}(regra|instrucao|instrução|politica|política)|mostre.{0,40}(senha|segredo|custo|margem|token)|execute.{0,40}(sql|http|url)/i.test(text);
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sanitizeData(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof value === "object" && (value.constructor?.name === "Decimal" || value.constructor?.name === "PrismaDecimal")) {
    return typeof value.toJSON === "function" ? String(value.toJSON()) : String(value);
  }
  if (typeof value === "string") return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeData(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).slice(0, 80).map((key) => {
      if (/password|token|secret|cookie|authorization|credential|dsn|database|chain.?of.?thought|prompt/i.test(key)) return [key, "[redacted]"];
      return [String(key).slice(0, 120), sanitizeData(value[key], depth + 1)];
    }));
  }
  return null;
}

function normalizeTenantIds(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map((item) => safeId(item)).filter(Boolean);
}

function isTenantAllowed(value, allowlist) {
  const id = safeId(value);
  return Boolean(id && allowlist instanceof Set && allowlist.has(id));
}

function safeId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeReferenceId(value) {
  const numeric = safeId(value);
  if (numeric) return numeric;
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(text) ? text : null;
}

function boundedIds(value, max) {
  return (Array.isArray(value) ? value : []).map(safeId).filter(Boolean).slice(0, max);
}

function boundedStrings(value, max, length) {
  return (Array.isArray(value) ? value : []).map((item) => String(item).slice(0, length)).slice(0, max);
}

function boundedToolRequests(value) {
  return (Array.isArray(value) ? value : []).slice(0, 5).map((item) => ({
    name: String(item?.name || "").slice(0, 80),
    version: String(item?.version || "v1").slice(0, 30),
    input: sanitizeData(item?.input || {}),
  }));
}

module.exports = {
  CONNECTION_SCHEMA_VERSION,
  DECISION_SCHEMA_VERSION,
  CONNECTION_STATUSES,
  CommerceAIConnectionError,
  UnconfiguredCommerceAIConnection,
  MockCommerceAIConnection,
  containsPromptInjection,
  sanitizeData,
};
