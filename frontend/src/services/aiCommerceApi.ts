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
export type AICommercePriceStatus = "VALID" | "ON_REQUEST" | "STALE" | "MISSING";

export type AICommerceCatalogProduct = {
  id: number;
  empresaId?: number;
  stockProductId?: number | null;
  title: string;
  shortDescription?: string | null;
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
  connectionStatus: "NOT_CONNECTED" | "MOCK_AVAILABLE" | "REAL_NOT_CONNECTED";
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
  status: "NOT_CONNECTED" | "MOCK_AVAILABLE" | "REAL_NOT_CONNECTED";
  realProviderConnected: false;
  realConnectorImplemented: false;
  autoReplyEnabled: false;
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
  return request<AICommercePage<AICommerceCatalogProduct>>(`/ai-commerce/catalog${query}`);
}

export async function searchAICommerceCatalog(params: AICommerceCatalogQuery = {}) {
  const query = toQueryString({
    ...params,
    q: clampText(params.q, 120),
    page: clampInteger(params.page, 1, 100000, 1),
    limit: clampInteger(params.limit, 1, 20, 20),
  });
  return request<AICommercePage<AICommerceCatalogProduct>>(`/ai-commerce/catalog/search${query}`);
}

export async function fetchAICommerceCatalogProduct(id: number) {
  assertPositiveId(id, "catalogProductId");
  return request<AICommerceCatalogProduct>(`/ai-commerce/catalog/${id}`);
}

export async function previewAICommerceOffer(payload: { catalogProductId: number; conversationId?: number; quantity?: number }) {
  assertPositiveId(payload.catalogProductId, "catalogProductId");
  if (payload.conversationId !== undefined) assertPositiveId(payload.conversationId, "conversationId");
  return request<{ offer: AICommerceProductOffer }>("/ai-commerce/offers/preview", { method: "POST", body: payload });
}

export async function fetchAICommerceSettings() {
  return request<AICommerceSettings>("/ai-commerce/settings");
}

export async function updateAICommerceSettings(payload: Partial<Pick<AICommerceSettings, "enabled" | "mode" | "allowedTools" | "maxTools" | "maxContextMessages" | "maxProducts" | "humanApprovalRequired" | "catalogVisibilityPolicy" | "exactQuantityPolicy" | "stalePolicy" | "noPricePolicy">> & { revision: number }) {
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0) throw new Error("Revisão de configuração inválida.");
  return request<AICommerceSettings>("/ai-commerce/settings", { method: "PATCH", body: payload });
}

export async function fetchAICommerceConnectionStatus() {
  return request<AICommerceConnectionStatus>("/ai-commerce/connection/status");
}

export async function validateMockAICommerceConnection() {
  return request<AICommerceConnectionStatus>("/ai-commerce/connection/mock/validate", { method: "POST", body: {} });
}

export async function runAICommerceAssistant(payload: { conversationId: number; sourceMessageId?: number; mode: Exclude<AICommerceMode, "OFF"> }) {
  assertPositiveId(payload.conversationId, "conversationId");
  if (payload.sourceMessageId !== undefined) assertPositiveId(payload.sourceMessageId, "sourceMessageId");
  return request<AICommerceAssistantResult>(`/ai-commerce/conversations/${payload.conversationId}/assistant-runs`, { method: "POST", body: payload });
}

export async function approveAICommerceDraft(id: string, payload: { revision: number; conversationRevision?: number; action: "INSERT_COMPOSER" | "REGISTER_INTEREST" | "CREATE_OPPORTUNITY_DRAFT" | "HANDOFF" }) {
  assertOpaqueId(id, "draftId");
  return request<{ draft: AICommerceDraft; applied: boolean }>(`/ai-commerce/drafts/${encodeURIComponent(id)}/approve`, { method: "POST", body: payload });
}

export async function rejectAICommerceDraft(id: string, payload: { revision: number; reason?: string }) {
  assertOpaqueId(id, "draftId");
  return request<{ rejected: boolean }>(`/ai-commerce/drafts/${encodeURIComponent(id)}/reject`, { method: "POST", body: { ...payload, reason: clampText(payload.reason, 240) });
}

export async function registerAICommerceInterest(payload: { offerId: string; conversationId: number; draftRevision: number }) {
  assertOpaqueId(payload.offerId, "offerId");
  assertPositiveId(payload.conversationId, "conversationId");
  return request<{ registered: boolean }>("/ai-commerce/interests", { method: "POST", body: payload });
}

export async function createAICommerceOpportunityDraft(payload: { draftId: string; conversationId: number; draftRevision: number }) {
  assertOpaqueId(payload.draftId, "draftId");
  assertPositiveId(payload.conversationId, "conversationId");
  return request<{ created: boolean; opportunityDraftId?: string }>("/ai-commerce/opportunity-drafts", { method: "POST", body: payload });
}

export async function requestAICommerceHandoff(payload: { draftId: string; conversationId: number; draftRevision: number; reason: string }) {
  assertOpaqueId(payload.draftId, "draftId");
  assertPositiveId(payload.conversationId, "conversationId");
  return request<{ requested: boolean }>("/ai-commerce/handoffs", { method: "POST", body: { ...payload, reason: clampText(payload.reason, 500) });
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

async function request<T>(path: string, options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}): Promise<T> {
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
  if (normalized === "::1" || normalized === "0.0.0.0") return true;
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) return true;
  const private172 = normalized.match(/^172\.(\d{1,3})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function isAllowedDomain(hostname: string, allowedDomain: string) {
  const normalized = allowedDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return hostname.toLowerCase() === normalized || hostname.toLowerCase().endsWith(`.${normalized}`);
}
