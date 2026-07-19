import { useCallback, useEffect, useState } from "react";
import {
  ApiHttpError,
  fetchWhatsappOperationalStatus,
} from "../../services/crmApi";
import {
  mapWhatsAppConnectionStatus,
  type WhatsAppConnectionStatus,
} from "./whatsappConnectionState";

export type WhatsAppStatusLoadState = "loading" | "ready" | "forbidden" | "error";

const NOT_CONFIGURED_STATUS = mapWhatsAppConnectionStatus({ status: "NOT_CONFIGURED", ready: false });

export function useWhatsAppConnectionStatus(onUnauthorized: () => void) {
  const [loadState, setLoadState] = useState<WhatsAppStatusLoadState>("loading");
  const [status, setStatus] = useState<WhatsAppConnectionStatus>(NOT_CONFIGURED_STATUS);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetchWhatsappOperationalStatus();
      setStatus(mapWhatsAppConnectionStatus(response));
      setLoadState("ready");
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        onUnauthorized();
        return;
      }
      if (error instanceof ApiHttpError && error.status === 403) {
        setLoadState("forbidden");
        return;
      }
      if (error instanceof ApiHttpError && error.status === 404) {
        setStatus(NOT_CONFIGURED_STATUS);
        setLoadState("ready");
        return;
      }
      setStatus((current) => ({ ...current, state: "UNAVAILABLE" }));
      setLoadState("error");
    }
  }, [onUnauthorized]);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(initialRequest);
  }, [refresh]);

  return { loadState, refresh, status };
}
