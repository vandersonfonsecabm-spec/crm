import type { MessengerOperationalStatusResponse } from "../../services/crmApi";

export type MessengerConnectionState =
  | "NOT_CONFIGURED"
  | "CONFIGURED_INACTIVE"
  | "WAITING_META_AUTH"
  | "CONNECTED"
  | "PAUSED"
  | "ERROR"
  | "UNAVAILABLE";

export type MessengerConnectionStatus = {
  state: MessengerConnectionState;
  canalIntegracaoId: number | null;
  credentialConfigured: boolean;
  credentialRevision: number | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  lastWebhookAt: string | null;
  lastFailureAt: string | null;
  nextRequirement: string | null;
};

const SUPPORTED = new Set<MessengerConnectionState>([
  "NOT_CONFIGURED",
  "CONFIGURED_INACTIVE",
  "WAITING_META_AUTH",
  "CONNECTED",
  "PAUSED",
  "ERROR",
  "UNAVAILABLE",
]);

export function mapMessengerConnectionStatus(
  payload: MessengerOperationalStatusResponse | null | undefined,
): MessengerConnectionStatus {
  const raw = String(payload?.state || payload?.status || "").toUpperCase();
  return {
    state: SUPPORTED.has(raw as MessengerConnectionState) ? raw as MessengerConnectionState : "UNAVAILABLE",
    canalIntegracaoId: positiveId(payload?.canalIntegracaoId),
    credentialConfigured: payload?.credentialConfigured === true,
    credentialRevision: Number.isSafeInteger(payload?.credentialRevision) && (payload?.credentialRevision || 0) > 0 ? payload!.credentialRevision! : null,
    connectedAt: dateOrNull(payload?.connectedAt),
    verifiedAt: dateOrNull(payload?.verifiedAt),
    lastWebhookAt: dateOrNull(payload?.lastWebhookAt),
    lastFailureAt: dateOrNull(payload?.lastFailureAt),
    nextRequirement: typeof payload?.nextRequirement === "string" ? payload.nextRequirement : null,
  };
}

function positiveId(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function dateOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
