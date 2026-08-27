import { ApiHttpError, getApiBaseUrl, getAuthSession } from "./crmApi";

/**
 * Frontend contracts for the E6A commerce foundation.
 *
 * These functions intentionally target only the closed AI-commerce boundary.
 * They do not expose a generic prompt, HTTP or tool endpoint and they never
 * send a message to a customer channel.
 */

export type AICommerceMode = "OFF" | "SHADOW" | "SUGGESTION_ONLY" | "HUMAN_APPROVAL";
export type AICommerceAvailabilityStatus =
  | "AVAILABLE"
  | "LOW_AVAILABILITY"
  | "OUT_OF_STOCK"
  | "NEEDS_CONFIRMATION"
  | "NOT_SELLABLE"
  | "DATA_STALE"
  | "UNKNOWN";
export type AICommerceVisibility = "HIDDEN" | "PUBLISHED" | "ARCHIVED";
export type AICommercePriceStatus = "VALID" | "AVAILABLE" | "ON_REQUEST" | "UNAVAILABLE" | "STALE" | "MISSING";

export type AICommerceCatalogProduct = {
  id: number;
  empresaId?: number;
  stockProductId?: number | null;
  title: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  tags?: string[];
  synonyms?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  primaryImageUrl?: string | null;
  commercialPrice?: string | number | null;
  currency?: string | null;
  priceStatus?: AICommercePriceStatus;
  priceObservedAt?: string | null;
  visibility: AICommerceVisibility;
  sellabilityPolicy?: string | null;
  productUrl?: string | null;
  purchaseUrl?: string | null;
  allowedLinkDomain?: string | null;
  revision: number;
  archivedAt?: string | null;
  updatedAt?: string | null;
};

export type AICommerceAvailability = {
  status: AICommerceAvailabilityStatus;
  label: string;
  exactQuantityAuthorized: boolean;
  exactQuantity?: string | number | null;
  freshness?: "FRESH" | "STALE" | "UNKNOWN" | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  reasonCode?: string | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  stockProductId?: number | null;
  customerSafeMessage?: string | null;
  manualConfirmationRequired: boolean;
  unit?: string | null;
};

export type AICommerceProductOffer = {
  offerId: string;
  empresaId?: number;
  conversationId?: number | null;
  customerId?: number | null;
  catalogProductId: number;
  stockProductId?: number | null;
  title: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  price?: string | number | null;
  currency?: string | null;
  priceStatus?: AICommercePriceStatus;
  availabilityStatus: AICommerceAvailabilityStatus;
  availabilityLabel: string;
  commercialTerms?: Record<string, string | number | boolean | null>;
  productUrl?: string | null;
  purchaseUrl?: string | null;
  allowedActions?: string[];
  sourceFreshness?: "FRESH" | "STALE" | "UNKNOWN" | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  manualConfirmationRequired: boolean;
  createdAt: string;
  expiresAt: string;
  catalogRevision: number;
  stockMaterialVersion?: number | null;
  policyVersion?: string | null;
  correlationId?: string | null;
};

export type AICommerceToolTrace = {
  name: string;
  version?: string;
  classification: "READ" | "SIDE_EFFECT";
  status: "REQUESTED" | "COMPLETED" | "BLOCKED" | "FAILED";
  durationMs?: number | null;
  safeSummary?: string | null;
  errorCode?: string | null;
};

export type AICommerceDraft = {
  id: string;
  revision: number;
  text: string;
  offers: AICommerceProductOffer[];
  questions: string[];
  warnings: string[];
  handoffReason?: string | null;
  requiresHumanApproval: boolean;
  expiresAt?: string | null;
  conversationId: number;
  sourceMessageId?: number | null;
  createdAt?: string;
};

export type AICommerceAssistantResult = {
  runId: string;
  mode: AICommerceMode;
  connectionStatus: "NOT_CONNECTED" | "MOCK_AVAILABLE" | "REAL_NOT_CONNECTED" | "REAL_CONNECTED";
  intent?: string | null;
  confidence?: number | null;
  missingInformation: string[];
  draft?: AICommerceDraft | null;
  offers: AICommerceProductOffer[];
  toolTrace: AICommerceToolTrace[];
  warnings: string[];
  conversationRevision?: number | null;
  sourceMessageId?: number | null;
};

export type AICommerceSettings = {
  empresaId?: number;
  enabled: boolean;
  mode: AICommerceMode;
  allowedTools: string[];
  maxTools: number;
  maxContextMessages: number;
  maxProducts: number;
  humanApprovalRequired: boolean;
  catalogVisibilityPolicy?: string | null;
  exactQuantityPolicy?: string | null;
  stalePolicy?: string | null;
  noPricePolicy?: string | null;
  revision: number;
  updatedAt?: string | null;
};

export type AICommerceConnectionStatus = {
  status: "NOT_CONNECTED" | "MOCK_AVAILABLE" | "REAL_NOT_CONNECTED" | "REAL_CONNECTED";
  realProviderConnected: boolean;
  realConnectorImplemented: boolean;
  autoReplyEnabled: boolean;
  lastValidatedAt?: string | null;
  message?: string | null;
};

export type AICommercePage<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AICommerceCatalogQuery = {
  q?: string;
  category?: string;
  visibility?: AICommerceVisibility;
  availability?: AICommerceAvailabilityStatus;
  page?: number;
  limit?: number;
};

export async function fetchAICommerceCatalog(params: AICommerceCatalogQuery = {}) {
  const query = toQueryString({
    ...params,
    q: clampText(params.q, 120),
    page: clampInteger(params.page, 1, 100000, 1),
    limit: clampInteger(params.limit, 1, 20, 20),
  });
  const response = await request<{ items?: AICommerceCatalogProduct[]; data?: AICommerceCatalogProduct[]; nextCursor?: string | null }>(`/catalogo-comercial${query}`);
  return normalizeCatalogPage(response);
}

export async function searchAICommerceCatalog(params: AICommerceCatalogQuery = {}) {
  const query = toQueryString({
    ...params,
    q: clampText(params.q, 120),
    page: clampInteger(params.page, 1, 100000, 1),
    limit: clampInteger(params.limit, 1, 20, 20),
  });
  const response = await request<{ items?: AICommerceCatalogProduct[]; data?: AICommerceCatalogProduct[]; nextCursor?: string | null }>(`/catalogo-comercial/busca${query}`);
  return normalizeCatalogPage(response);
}

export async function fetchAICommerceCatalogProduct(id: number) {
  assertPositiveId(id, "catalogProductId");
  const response = await request<{ item?: AICommerceCatalogProduct }>(`/catalogo-comercial/produtos/${id}`);
  if (!response.item) throw new ApiHttpError("Produto comercial não encontrado.", 404, "COMMERCE_CATALOG_PRODUCT_NOT_FOUND");
  return response.item;
}

export async function previewAICommerceOffer(payload: { catalogProductId: number; conversationId?: number; quantity?: number }) {
  assertPositiveId(payload.catalogProductId, "catalogProductId");
  if (payload.conversationId !== undefined) assertPositiveId(payload.conversationId, "conversationId");
  const response = await request<{ item?: AICommerceProductOffer }>("/catalogo-comercial/ofertas/preview", { method: "POST", body: payload });
  if (!response.item) throw new ApiHttpError("Não foi possível gerar a oferta comercial.", 422, "COMMERCE_OFFER_INVALID");
  return { offer: response.item };
}

export async function fetchAICommerceSettings() {
  const response = await request<{ item?: AICommerceSettings }>("/ai-commerce/settings");
  return response.item ?? defaultAICommerceSettings();
}

export async function updateAICommerceSettings(payload: Partial<Pick<AICommerceSettings, "enabled" | "mode" | "allowedTools" | "maxTools" | "maxContextMessages" | "maxProducts" | "humanApprovalRequired" | "catalogVisibilityPolicy" | "exactQuantityPolicy" | "stalePolicy" | "noPricePolicy">> & { revision: number }) {
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0) throw new Error("Revisão de configuração inválida.");
  const response = await request<{ item?: AICommerceSettings }>("/ai-commerce/settings", { method: "PUT", body: payload });
  return response.item ?? defaultAICommerceSettings();
}

export async function fetchAICommerceConnectionStatus() {
  const response = await request<{ item?: Record<string, unknown> }>("/ai-commerce/connection/status");
  return normalizeConnectionStatus(response.item);
}

export async function validateMockAICommerceConnection() {
  const response = await request<{ item?: Record<string, unknown> }>("/ai-commerce/mock/validate", { method: "POST", body: {} });
  return normalizeConnectionStatus(response.item);
}

export async function runAICommerceAssistant(payload: { conversationId: number; sourceMessageId?: number; messageRevision?: number; conversationRevision?: number; latestMessage?: string; mode: Exclude<AICommerceMode, "OFF">; enabled?: boolean; mockEnabled?: boolean; messages?: Array<{ id?: number; direction: "INBOUND" | "OUTBOUND"; text: string }> }) {
  assertPositiveId(payload.conversationId, "conversationId");
  if (payload.sourceMessageId !== undefined) assertPositiveId(payload.sourceMessageId, "sourceMessageId");
  const response = await request<{ item?: Record<string, unknown> }>("/ai-commerce/runs", { method: "POST", body: { ...payload, messageId: payload.sourceMessageId, messages: payload.messages?.slice(-20) } });
  return normalizeAssistantResult(response.item);
}

export async function approveAICommerceDraft(id: string, payload: { revision: number; conversationRevision?: number; action: "INSERT_COMPOSER" | "REGISTER_INTEREST" | "CREATE_OPPORTUNITY_DRAFT" | "HANDOFF"; approvalToken?: string; idempotencyKey?: string }) {
  assertOpaqueId(id, "draftId");
  const response = await request<{ item?: Record<string, unknown> }>(`/ai-commerce/drafts/${encodeURIComponent(id)}/approve`, { method: "POST", body: { ...payload, action: toBackendApprovalAction(payload.action), approvalToken: payload.approvalToken || createOpaqueKey("approval"), idempotencyKey: payload.idempotencyKey || createOpaqueKey("approval-idem"), draftRevision: payload.revision } });
  const item = response.item ?? {};
  return { draft: normalizeDraft(item.draft as Record<string, unknown> | null | undefined), applied: item.status === "APPROVED" || item.action !== undefined };
}

export async function rejectAICommerceDraft(id: string, payload: { revision: number; conversationRevision?: number; approvalToken?: string; idempotencyKey?: string }) {
  assertOpaqueId(id, "draftId");
  const response = await request<{ item?: Record<string, unknown> }>(`/ai-commerce/drafts/${encodeURIComponent(id)}/reject`, { method: "POST", body: { ...payload, approvalToken: payload.approvalToken || createOpaqueKey("reject"), idempotencyKey: payload.idempotencyKey || createOpaqueKey("reject-idem") } });
  return { draft: normalizeDraft(response.item?.draft as Record<string, unknown> | null | undefined), rejected: response.item?.status === "REJECTED" };
}

export function isOfferExpired(offer: Pick<AICommerceProductOffer, "expiresAt">, now = Date.now()) {
  const expires = Date.parse(offer.expiresAt);
  return !Number.isFinite(expires) || expires <= now;
}

export function isSafeCommerceUrl(value: string | null | undefined, allowedDomain?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || isPrivateHostname(url.hostname)) return false;
    if (allowedDomain && !isAllowedDomain(url.hostname, allowedDomain)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeCatalogPage(value: { items?: AICommerceCatalogProduct[]; data?: AICommerceCatalogProduct[]; nextCursor?: string | null }): AICommercePage<AICommerceCatalogProduct> {
  const data = Array.isArray(value.items) ? value.items : Array.isArray(value.data) ? value.data : [];
  return { data: data.slice(0, 20), page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 };
}

function normalizeAssistantResult(value?: Record<string, unknown>): AICommerceAssistantResult {
  const result = value ?? {};
  const decision = (result.decision && typeof result.decision === "object" ? result.decision : {}) as Record<string, unknown>;
  const draftValue = result.draft && typeof result.draft === "object" ? result.draft as Record<string, unknown> : null;
  const toolResults = result.toolResults && typeof result.toolResults === "object" ? result.toolResults as Record<string, unknown> : {};
  const offers = Array.isArray(draftValue?.productOffers) ? draftValue.productOffers : collectOfferValues(toolResults);
  const trace = Object.entries(toolResults).slice(0, 5).map(([name, raw]) => {
    const sample = Array.isArray(raw) ? raw[0] : raw;
    const candidateStatus = sample && typeof sample === "object" && "status" in sample ? String((sample as Record<string, unknown>).status) : "";
    const status = candidateStatus === "REQUESTED" || candidateStatus === "COMPLETED" || candidateStatus === "BLOCKED" || candidateStatus === "FAILED" ? candidateStatus : "COMPLETED";
    return {
      name,
      classification: isSideEffectTool(name) ? "SIDE_EFFECT" as const : "READ" as const,
      status: status as AICommerceToolTrace["status"],
      safeSummary: Array.isArray(raw) ? `${raw.length} resultado(s) sanitizado(s)` : "Resultado sanitizado",
    };
  });
  return {
    runId: String(result.runId ?? ""),
    mode: normalizeModeValue(result.mode),
    connectionStatus: normalizeRunConnectionStatus(result),
    intent: typeof decision.intent === "string" ? decision.intent : null,
    confidence: confidenceNumber(decision.confidence),
    missingInformation: arrayOfStrings(draftValue?.questions ?? decision.missingInformation),
    draft: normalizeDraft(draftValue),
    offers: offers.map((item) => normalizeOffer(item)).filter((item): item is AICommerceProductOffer => item !== null).slice(0, 3),
    toolTrace: trace,
    warnings: arrayOfStrings(draftValue?.warnings ?? decision.safetyFlags),
    conversationRevision: result.conversationRevision === undefined || result.conversationRevision === null || result.conversationRevision === "" ? null : Number(result.conversationRevision),
    sourceMessageId: null,
  };
}

function normalizeDraft(value?: Record<string, unknown> | null): AICommerceDraft | null {
  if (!value) return null;
  const handoff = value.handoff && typeof value.handoff === "object" ? value.handoff as Record<string, unknown> : null;
  return {
    id: String(value.draftId ?? value.id ?? ""),
    revision: Number.isSafeInteger(value.revision) ? Number(value.revision) : 1,
    text: String(value.text ?? ""),
    offers: (Array.isArray(value.productOffers) ? value.productOffers : []).map((item) => normalizeOffer(item)).filter((item): item is AICommerceProductOffer => item !== null),
    questions: arrayOfStrings(value.questions),
    warnings: arrayOfStrings(value.warnings),
    handoffReason: handoff && typeof handoff.reason === "string" ? handoff.reason : null,
    requiresHumanApproval: true,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    conversationId: Number(value.conversationId) || 0,
    sourceMessageId: null,
    createdAt: undefined,
  };
}

function normalizeOffer(value: unknown): AICommerceProductOffer | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const offerId = String(item.offerId ?? item.id ?? "");
  const title = String(item.title ?? "");
  if (!offerId || !title) return null;
  return {
    offerId,
    catalogProductId: Number(item.catalogProductId ?? item.productId) || 0,
    stockProductId: Number(item.stockProductId) || null,
    title,
    shortDescription: typeof item.shortDescription === "string" ? item.shortDescription : null,
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    price: typeof item.price === "number" || typeof item.price === "string" ? item.price : null,
    currency: typeof item.currency === "string" ? item.currency : null,
    priceStatus: typeof item.priceStatus === "string" ? item.priceStatus as AICommercePriceStatus : "MISSING",
    availabilityStatus: typeof item.availabilityStatus === "string" ? item.availabilityStatus as AICommerceAvailabilityStatus : "UNKNOWN",
    availabilityLabel: String(item.availabilityLabel ?? item.customerSafeMessage ?? "Confirmar com vendedor"),
    allowedActions: Array.isArray(item.allowedActions) ? item.allowedActions.map(String) : [],
    sourceFreshness: typeof item.sourceFreshness === "string" ? item.sourceFreshness as AICommerceProductOffer["sourceFreshness"] : "UNKNOWN",
    confidence: typeof item.confidence === "string" ? item.confidence as AICommerceProductOffer["confidence"] : "UNKNOWN",
    manualConfirmationRequired: item.manualConfirmationRequired !== false,
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    expiresAt: String(item.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()),
    catalogRevision: Number(item.catalogRevision) || 1,
    stockMaterialVersion: Number(item.stockMaterialVersion) || null,
    policyVersion: typeof item.policyVersion === "string" ? item.policyVersion : null,
    correlationId: typeof item.correlationId === "string" ? item.correlationId : null,
    productUrl: typeof item.productUrl === "string" ? item.productUrl : null,
    purchaseUrl: typeof item.purchaseUrl === "string" ? item.purchaseUrl : null,
  };
}

function collectOfferValues(toolResults: Record<string, unknown>) {
  return Object.values(toolResults).flatMap((value) => Array.isArray(value) ? value : [value]);
}

function arrayOfStrings(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => String(item)).filter(Boolean).slice(0, 20);
}

function confidenceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "HIGH") return 0.9;
  if (value === "MEDIUM") return 0.65;
  if (value === "LOW") return 0.35;
  return null;
}

function isSideEffectTool(name: string) {
  return ["registerProductInterest", "createOpportunityDraft", "handoffToSalesperson"].includes(name);
}

function normalizeModeValue(value: unknown): AICommerceMode {
  return value === "SHADOW" || value === "SUGGESTION_ONLY" || value === "HUMAN_APPROVAL" ? value : "OFF";
}

function normalizeRunConnectionStatus(value: Record<string, unknown>): AICommerceAssistantResult["connectionStatus"] {
  const explicit = String(value.connectionStatus ?? "").toUpperCase();
  if (explicit === "MOCK_AVAILABLE" || explicit === "REAL_NOT_CONNECTED" || explicit === "REAL_CONNECTED" || explicit === "NOT_CONNECTED") {
    return explicit;
  }
  return value.mock === true ? "MOCK_AVAILABLE" : "NOT_CONNECTED";
}

function normalizeConnectionStatus(value?: Record<string, unknown>): AICommerceConnectionStatus {
  const connected = value?.providerConnected === true || value?.realProviderConnected === true;
  const connectorImplemented = value?.realConnectorImplemented === true;
  const realConnected = connected && connectorImplemented;
  const mockReady = value?.mock === true && value?.status === "READY";
  return {
    status: realConnected ? "REAL_CONNECTED" : connected ? "REAL_NOT_CONNECTED" : mockReady ? "MOCK_AVAILABLE" : "NOT_CONNECTED",
    realProviderConnected: connected,
    realConnectorImplemented: connectorImplemented,
    autoReplyEnabled: realConnected && value?.autoReplyEnabled === true,
    lastValidatedAt: typeof value?.lastValidatedAt === "string" ? value.lastValidatedAt : null,
    message: realConnected ? "Provider real conectado; respostas automáticas seguem a política do servidor." : connected ? "O provider respondeu, mas o conector real ainda não está habilitado." : mockReady ? "Mock disponível sem rede externa." : "Nenhuma conexão está ativa; o modo OFF permanece seguro.",
  };
}

function defaultAICommerceSettings(): AICommerceSettings {
  return { enabled: false, mode: "OFF", allowedTools: [], maxTools: 5, maxContextMessages: 20, maxProducts: 3, humanApprovalRequired: true, revision: 1 };
}

function toBackendApprovalAction(action: "INSERT_COMPOSER" | "REGISTER_INTEREST" | "CREATE_OPPORTUNITY_DRAFT" | "HANDOFF") {
  return ({ INSERT_COMPOSER: "insertComposer", REGISTER_INTEREST: "registerProductInterest", CREATE_OPPORTUNITY_DRAFT: "createOpportunityDraft", HANDOFF: "handoffToSalesperson" } as const)[action];
}

function createOpaqueKey(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function request<T>(path: string, options: { method?: "GET" | "POST" | "PUT" | "PATCH"; body?: unknown } = {}): Promise<T> {
  const session = getAuthSession();
  if (!session?.token) throw new ApiHttpError("Sessão expirada. Entre novamente para continuar.", 401, "AUTH_TOKEN_REQUIRED");
  const headers = new Headers({ Authorization: `Bearer ${session.token}` });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiHttpError("Não foi possível se comunicar com o assistente comercial.", 0, "NETWORK_ERROR");
  }
  if (!response.ok) {
    const details = await readError(response);
    throw new ApiHttpError(details.message, response.status, details.code, details.details);
  }
  return (await response.json()) as T;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    return {
      message: String(body.erro ?? body.error ?? body.message ?? "Não foi possível concluir a operação comercial."),
      code: typeof body.codigo === "string" ? body.codigo : typeof body.code === "string" ? body.code : undefined,
      details: body,
    };
  } catch {
    return { message: "Não foi possível concluir a operação comercial.", code: undefined, details: undefined };
  }
}

function toQueryString(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function clampText(value: string | undefined, max: number) {
  return value?.trim().slice(0, max) || undefined;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function assertPositiveId(value: number, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} inválido.`);
}

function assertOpaqueId(value: string, label: string): asserts value is string {
  if (!value.trim() || value.length > 180 || /[\r\n]/.test(value)) throw new Error(`${label} inválido.`);
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^169\.254\./.test(normalized) || /^192\.168\./.test(normalized)) return true;
  const private172 = normalized.match(/^172\.(\d{1,3})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function isAllowedDomain(hostname: string, allowedDomain: string) {
  const normalized = allowedDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return hostname.toLowerCase() === normalized || hostname.toLowerCase().endsWith(`.${normalized}`);
}
