import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type DrawerFocusSession = {
  readonly token: number;
};

type ActiveDrawerFocusSession = DrawerFocusSession & {
  readonly fallback: HTMLElement | null;
  readonly origin: HTMLElement | null;
  readonly pageKey: string;
  closing: boolean;
  restored: boolean;
};

export function useDrawerFocusSession(pageKey: string) {
  const nextTokenRef = useRef(0);
  const activeSessionRef = useRef<ActiveDrawerFocusSession | null>(null);
  const pageKeyRef = useRef(pageKey);
  const [session, setSession] = useState<DrawerFocusSession | null>(null);

  const startSession = useCallback((origin: HTMLElement | null, fallback: HTMLElement | null) => {
    const nextSession: ActiveDrawerFocusSession = {
      token: nextTokenRef.current + 1,
      origin,
      fallback,
      pageKey,
      closing: false,
      restored: false,
    };
    nextTokenRef.current = nextSession.token;
    activeSessionRef.current = nextSession;
    setSession({ token: nextSession.token });
    return nextSession.token;
  }, [pageKey]);

  const isSessionActive = useCallback((token: number) => {
    const current = activeSessionRef.current;
    return current !== null
      && current.token === token
      && current.pageKey === pageKeyRef.current
      && !current.restored;
  }, []);

  const requestClose = useCallback((token: number) => {
    const current = activeSessionRef.current;
    if (!current
      || current.token !== token
      || current.pageKey !== pageKeyRef.current
      || current.closing
      || current.restored) {
      return false;
    }
    current.closing = true;
    return true;
  }, []);

  const settleClose = useCallback((token: number) => {
    const current = activeSessionRef.current;
    if (!current
      || current.token !== token
      || current.pageKey !== pageKeyRef.current
      || !current.closing
      || current.restored) {
      return;
    }

    const target = resolveFocusTarget(current);
    current.restored = true;
    activeSessionRef.current = null;
    setSession(null);
    target?.focus({ preventScroll: true });
  }, []);

  const invalidateSession = useCallback(() => {
    const current = activeSessionRef.current;
    if (!current) return;
    current.restored = true;
    activeSessionRef.current = null;
    setSession(null);
  }, []);

  useLayoutEffect(() => {
    pageKeyRef.current = pageKey;
    const current = activeSessionRef.current;
    if (current && current.pageKey !== pageKey) {
      invalidateSession();
    }
  }, [invalidateSession, pageKey]);

  useLayoutEffect(() => () => {
    const current = activeSessionRef.current;
    if (!current) return;
    current.restored = true;
    activeSessionRef.current = null;
  }, []);

  return {
    session,
    startSession,
    isSessionActive,
    requestClose,
    settleClose,
    invalidateSession,
  };
}

function resolveFocusTarget(session: ActiveDrawerFocusSession) {
  if (isValidFocusTarget(session.origin)) return session.origin;
  if (isValidFocusTarget(session.fallback)) return session.fallback;
  return null;
}

function isValidFocusTarget(target: HTMLElement | null) {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.ownerDocument !== document || !target.isConnected || !document.documentElement.contains(target)) return false;
  if (target.getRootNode({ composed: true }) !== document) return false;
  if (target.matches(":disabled") || target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") return false;
  if (target.hidden || target.getClientRects().length === 0) return false;

  const view = document.defaultView;
  if (!view) return false;

  let current: HTMLElement | null = target;
  while (current) {
    if (current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true") return false;
    const style = view.getComputedStyle(current);
    if (style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || style.contentVisibility === "hidden"
      || style.opacity === "0") {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}
