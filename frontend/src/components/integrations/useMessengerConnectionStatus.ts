import { useCallback, useEffect, useState } from "react";
import { ApiHttpError, fetchMessengerOperationalStatus } from "../../services/crmApi";
import { mapMessengerConnectionStatus, type MessengerConnectionStatus } from "./messengerConnectionState";

export type MessengerStatusLoadState = "loading" | "ready" | "forbidden" | "error";

const NOT_CONFIGURED_STATUS = mapMessengerConnectionStatus({ state: "NOT_CONFIGURED" });

export function useMessengerConnectionStatus(onUnauthorized: () => void) {
  const [loadState, setLoadState] = useState<MessengerStatusLoadState>("loading");
  const [status, setStatus] = useState<MessengerConnectionStatus>(NOT_CONFIGURED_STATUS);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetchMessengerOperationalStatus();
      setStatus(mapMessengerConnectionStatus(response));
      setLoadState("ready");
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        setLoadState("forbidden");
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
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { loadState, refresh, status };
}
