import type { WhatsappOperationalStatusResponse } from "../../services/crmApi";

export type WhatsAppConnectionState =
  | "NOT_CONFIGURED"
  | "WAITING_META_AUTH"
  | "CONFIGURED_INACTIVE"
  | "CONNECTED"
  | "PAUSED"
  | "ERROR"
  | "UNAVAILABLE";

export type WhatsAppConnectionStatus = {
  state: WhatsAppConnectionState;
  canalIntegracaoId: number | null;
  credentialConfigured: boolean;
  credentialRevision: number | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  lastWebhookAt: string | null;
  lastFailureAt: string | null;
};

const SUPPORTED_STATES = new Set<WhatsAppConnectionState>([
  "NOT_CONFIGURED",
  "WAITING_META_AUTH",
  "CONFIGURED_INACTIVE",
  "CONNECTED",
  "PAUSED",
  "ERROR",
  "UNAVAILABLE",
]);

export function mapWhatsAppConnectionStatus(
  payload: WhatsappOperationalStatusResponse | null | undefined,
): WhatsAppConnectionStatus {
  const state = normalizeState(payload);
  return {
    state,
    canalIntegracaoId: positiveId(payload?.canalIntegracaoId),
    credentialConfigured: payload?.credentialConfigured === true,
    credentialRevision: Number.isSafeInteger(payload?.credentialRevision) && (payload?.credentialRevision || 0) > 0 ? payload!.credentialRevision! : null,
    connectedAt: optionalDate(payload?.connectedAt),
    verifiedAt: optionalDate(payload?.verifiedAt),
    lastWebhookAt: optionalDate(payload?.lastWebhookAt),
    lastFailureAt: optionalDate(payload?.lastFailureAt),
  };
}

function positiveId(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function normalizeState(payload: WhatsappOperationalStatusResponse | null | undefined): WhatsAppConnectionState {
  const rawStatus = typeof payload?.status === "string" ? payload.status.toUpperCase() : "";
  if (rawStatus === "CONFIGURED") {
    return payload?.ready === true && optionalDate(payload.verifiedAt) ? "CONNECTED" : "CONFIGURED_INACTIVE";
  }
  return SUPPORTED_STATES.has(rawStatus as WhatsAppConnectionState)
    ? rawStatus as WhatsAppConnectionState
    : "UNAVAILABLE";
}

function optionalDate(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
