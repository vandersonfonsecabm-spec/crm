"use strict";

const crypto = require("node:crypto");

const MODES = Object.freeze({ OFF: "OFF", SHADOW: "SHADOW", SUGGESTION_ONLY: "SUGGESTION_ONLY", HUMAN_APPROVAL: "HUMAN_APPROVAL" });
const STATES = Object.freeze({ IDLE: "IDLE", DISCOVERY: "DISCOVERY", CLARIFYING: "CLARIFYING", SEARCHING: "SEARCHING", OFFER_READY: "OFFER_READY", AWAITING_APPROVAL: "AWAITING_APPROVAL", OFFERED: "OFFERED", INTERESTED: "INTERESTED", HANDOFF: "HANDOFF", CLOSED: "CLOSED", ERROR: "ERROR" });
const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_BYTES = 64 * 1024;
const MAX_TOOL_CALLS = 5;
const MAX_OFFERS = 3;

function normalizeMode(value) {
  const mode = String(value || MODES.OFF).trim().toUpperCase();
  return Object.values(MODES).includes(mode) ? mode : MODES.OFF;
}

function modeAllowsExecution(mode) {
  return normalizeMode(mode) !== MODES.OFF;
}

function modeRequiresHumanApproval(mode) {
  return normalizeMode(mode) === MODES.HUMAN_APPROVAL;
}

function buildModePolicy({ mode = MODES.OFF, enabled = false, featureEnabled = false, mockEnabled = false, tenantAllowed = false } = {}) {
  const normalized = normalizeMode(mode);
  const active = enabled === true && featureEnabled === true && tenantAllowed === true && (normalized === MODES.OFF || mockEnabled === true);
  return Object.freeze({
    mode: normalized,
    enabled: active && normalized !== MODES.OFF,
    featureEnabled: featureEnabled === true,
    tenantAllowed: tenantAllowed === true,
    mockEnabled: mockEnabled === true,
    humanApprovalRequired: normalized === MODES.HUMAN_APPROVAL,
    autoReply: false,
    outbound: false,
  });
}

function buildSanitizedContext(input = {}) {
  const empresaId = positiveId(input.empresaId);
  const conversationId = positiveId(input.conversationId);
  if (!empresaId || !conversationId) throw policyError("AI_CONTEXT_INVALID", "Contexto de conversa invalido.", 401);
  const messages = (Array.isArray(input.messages) ? input.messages : []).slice(-MAX_CONTEXT_MESSAGES).map((message) => sanitizeMessage(message));
  const context = {
    schemaVersion: "CommerceAIContext.v1",
    empresaId,
    conversationId,
    channel: sanitizeString(input.channel, 80),
    customer: input.customer ? sanitizeCustomer(input.customer) : null,
    conversationState: sanitizeString(input.conversationState, 80),
    messages,
    productsOffered: sanitizeIds(input.productsOffered, MAX_OFFERS),
    interests: sanitizeData(input.interests),
    opportunity: sanitizeData(input.opportunity),
    sellerAssignment: sanitizeData(input.sellerAssignment),
    policyVersion: sanitizeString(input.policyVersion || "ai-commerce-policy.v1", 80),
    channelCapabilities: sanitizeData(input.channelCapabilities),
  };
  const bytes = Buffer.byteLength(JSON.stringify(context), "utf8");
  if (bytes > MAX_CONTEXT_BYTES) {
    context.customer = null;
    context.interests = null;
    context.opportunity = null;
    context.sellerAssignment = null;
    context.messages = context.messages.slice(-MAX_CONTEXT_MESSAGES).map((message) => ({ ...message, text: message.text.slice(0, 1600) }));
  }
  return Object.freeze(context);
}

function validateToolRequests(requests, toolRegistry, { maxCalls = MAX_TOOL_CALLS } = {}) {
  if (!Array.isArray(requests)) return [];
  if (requests.length > Math.min(MAX_TOOL_CALLS, maxCalls)) throw policyError("AI_TOOL_LOOP_LIMIT", "Limite de ferramentas excedido.", 422);
  const seen = new Set();
  return requests.map((request) => {
    const name = String(request?.name || "");
    if (!toolRegistry?.isAllowed?.(name)) throw policyError("AI_TOOL_NOT_ALLOWED", "Ferramenta nao autorizada.", 403);
    if (seen.has(name) && !name.startsWith("get")) throw policyError("AI_TOOL_DUPLICATE", "Ferramenta de efeito duplicada.", 409);
    seen.add(name);
    return { name, version: String(request?.version || "v1").slice(0, 30), input: sanitizeData(request?.input || {}) };
  });
}

function validateCommercialDraft(draft, { empresaId, conversationId, offers = [] } = {}) {
  if (!draft || typeof draft !== "object") throw policyError("AI_DRAFT_INVALID", "Rascunho comercial invalido.", 422);
  const allowedOfferIds = new Set((Array.isArray(offers) ? offers : []).map((offer) => String(offer?.offerId || offer?.id || "")));
  const productOffers = (Array.isArray(draft.productOffers) ? draft.productOffers : []).slice(0, MAX_OFFERS).map((offer) => {
    const offerId = String(offer?.offerId || "");
    if (!offerId || !allowedOfferIds.has(offerId)) throw policyError("AI_OFFER_NOT_GROUNDED", "Oferta nao pertence ao contexto.", 409);
    if (positiveId(offer.empresaId) && positiveId(offer.empresaId) !== positiveId(empresaId)) throw policyError("AI_OFFER_TENANT_MISMATCH", "Oferta de outro tenant.", 403);
    if (positiveId(offer.conversationId) && positiveId(offer.conversationId) !== positiveId(conversationId)) throw policyError("AI_OFFER_CONVERSATION_MISMATCH", "Oferta de outra conversa.", 409);
    if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now()) throw policyError("AI_OFFER_EXPIRED", "Oferta expirada.", 409);
    if (offer.productUrl && !isAllowedHttpsUrl(offer.productUrl, offer.allowedLinkDomain)) throw policyError("AI_UNSAFE_URL", "Link de produto nao permitido.", 422);
    if (offer.purchaseUrl && !isAllowedHttpsUrl(offer.purchaseUrl, offer.allowedLinkDomain)) throw policyError("AI_UNSAFE_URL", "Link de compra nao permitido.", 422);
    return sanitizeData(offer);
  });
  const text = sanitizeString(draft.text, 2000);
  if (containsForbiddenOutput(text)) throw policyError("AI_RESPONSE_POLICY_BLOCKED", "Resposta contem informacao interna ou envio automatico.", 422);
  if (/\bR\$\s*\d|\bUSD\s*\d|\bEUR\s*\d/i.test(text) && !productOffers.some((offer) => offer.price !== null && offer.price !== undefined)) {
    throw policyError("AI_RESPONSE_PRICE_NOT_GROUNDED", "Preco da resposta nao possui oferta validada.", 422);
  }
  if (/(dispon[ií]vel|em estoque|tem estoque)/i.test(text)) {
    const grounded = productOffers.some((offer) => ["AVAILABLE", "LOW_AVAILABILITY"].includes(String(offer.availabilityStatus || "").toUpperCase()));
    if (!grounded) throw policyError("AI_RESPONSE_AVAILABILITY_NOT_GROUNDED", "Disponibilidade da resposta nao possui evidencia valida.", 422);
  }
  return Object.freeze({
    schemaVersion: "CommerceAssistantDraft.v1",
    draftId: sanitizeString(draft.draftId, 160),
    empresaId: positiveId(empresaId),
    conversationId: positiveId(conversationId),
    conversationRevision: sanitizeString(draft.conversationRevision, 80),
    revision: Number.isSafeInteger(draft.revision) ? draft.revision : 1,
    text,
    productOffers,
    questions: boundedStrings(draft.questions, 10, 500),
    actions: boundedStrings(draft.actions, 10, 120),
    warnings: boundedStrings(draft.warnings, 20, 500),
    handoff: sanitizeData(draft.handoff),
    requiresHumanApproval: true,
    provenanceRefs: boundedStrings(draft.provenanceRefs, 20, 200),
    expiresAt: draft.expiresAt || null,
  });
}

function makeIdempotencyKey({ empresaId, conversationId, messageId, messageRevision, policyRevision = "1" } = {}) {
  const tenant = positiveId(empresaId);
  const conversation = positiveId(conversationId);
  if (!tenant || !conversation || !String(messageId || "").trim()) throw policyError("AI_IDEMPOTENCY_CONTEXT_INVALID", "Mensagem idempotente obrigatoria.", 422);
  const material = [tenant, conversation, String(messageId).slice(0, 160), String(messageRevision ?? "0").slice(0, 80), String(policyRevision).slice(0, 80)].join(":");
  return `ai:${crypto.createHash("sha256").update(material).digest("hex")}`;
}

function validateApproval({ action, mode, actorUsuarioId, empresaId, conversationId, conversationRevision, draftRevision, approvalToken, idempotencyKey } = {}) {
  if (normalizeMode(mode) !== MODES.HUMAN_APPROVAL) throw policyError("AI_APPROVAL_MODE_REQUIRED", "A aprovacao exige modo HUMAN_APPROVAL.", 409);
  if (!positiveId(actorUsuarioId) || !positiveId(empresaId) || !positiveId(conversationId)) throw policyError("AI_APPROVAL_CONTEXT_INVALID", "Contexto de aprovacao invalido.", 403);
  if (!String(action || "").trim() || !["insertComposer", "registerProductInterest", "createOpportunityDraft", "handoffToSalesperson"].includes(action)) throw policyError("AI_APPROVAL_ACTION_INVALID", "Acao de aprovacao invalida.", 422);
  if (!String(approvalToken || "").trim() || !String(idempotencyKey || "").trim()) throw policyError("AI_APPROVAL_TOKEN_REQUIRED", "Aprovacao exige token e idempotencia.", 422);
  return Object.freeze({ action, actorUsuarioId: positiveId(actorUsuarioId), empresaId: positiveId(empresaId), conversationId: positiveId(conversationId), conversationRevision: String(conversationRevision ?? ""), draftRevision: String(draftRevision ?? ""), approvalToken: String(approvalToken).slice(0, 200), idempotencyKey: String(idempotencyKey).slice(0, 200) });
}

function isAllowedHttpsUrl(value, allowedDomain) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (allowedDomain) {
      const domain = String(allowedDomain).toLowerCase().replace(/^www\./, "");
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!(host === domain || host.endsWith(`.${domain}`))) return false;
    }
    if (isPrivateHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^(0|224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239)\./.test(host)) return true;
  if (/^[0-9a-f:]+$/i.test(host) && (host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb"))) return true;
  return false;
}

function containsForbiddenOutput(text) {
  return /(senha|token|cookie|authorization|margem|custo interno|chain.?of.?thought|auto.?envio|enviar automaticamente)/i.test(String(text || ""));
}

function sanitizeMessage(message) {
  return {
    id: positiveId(message?.id) || sanitizeString(message?.id, 120),
    direction: message?.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
    text: sanitizeString(message?.text, 4000),
    createdAt: message?.createdAt ? sanitizeDate(message.createdAt) : null,
  };
}

function sanitizeCustomer(value) {
  return {
    id: positiveId(value?.id),
    name: sanitizeString(value?.name, 120),
    segment: sanitizeString(value?.segment, 80),
  };
}

function sanitizeData(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof value === "object" && isDecimalLike(value)) {
    return typeof value.toJSON === "function" ? String(value.toJSON()) : String(value);
  }
  if (typeof value === "string") return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeData(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.keys(value).slice(0, 80).map((key) => [/password|token|secret|cookie|authorization|credential|database|dsn|chain.?of.?thought|prompt/i.test(key) ? key : String(key).slice(0, 120), /password|token|secret|cookie|authorization|credential|database|dsn|chain.?of.?thought|prompt/i.test(key) ? "[redacted]" : sanitizeData(value[key], depth + 1)]));
  return null;
}

function isDecimalLike(value) {
  const keys = Object.keys(value || {});
  return value.constructor?.name === "Decimal"
    || value.constructor?.name === "PrismaDecimal"
    || (keys.includes("s") && keys.includes("e") && keys.includes("d") && Array.isArray(value.d));
}

function sanitizeString(value, max) { return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max); }
function sanitizeDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function boundedStrings(value, max, length) { return (Array.isArray(value) ? value : []).map((item) => sanitizeString(item, length)).filter(Boolean).slice(0, max); }
function sanitizeIds(value, max) { return (Array.isArray(value) ? value : []).map(positiveId).filter(Boolean).slice(0, max); }
function positiveId(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }
function policyError(code, message, status = 400) { const error = new Error(message); error.name = "AICommercePolicyError"; error.code = code; error.status = status; return error; }

module.exports = {
  MODES,
  STATES,
  MAX_CONTEXT_MESSAGES,
  MAX_CONTEXT_BYTES,
  MAX_TOOL_CALLS,
  MAX_OFFERS,
  normalizeMode,
  modeAllowsExecution,
  modeRequiresHumanApproval,
  buildModePolicy,
  buildSanitizedContext,
  validateToolRequests,
  validateCommercialDraft,
  makeIdempotencyKey,
  validateApproval,
  isAllowedHttpsUrl,
  isPrivateHost,
  containsForbiddenOutput,
  sanitizeData,
  policyError,
};
