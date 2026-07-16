import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { IconButton } from "../ui";

type OverlayProps = {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
  triggerRef?: RefObject<HTMLElement | null>;
};

export function CommunicationDrawer({ children, description, footer, onClose, open, title, triggerRef }: OverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useOverlayLifecycle(open, dialogRef, onClose, triggerRef);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex justify-end" role="presentation">
      <button aria-label="Fechar painel" className="absolute inset-0 bg-slate-950/20" onClick={onClose} type="button" />
      <aside aria-describedby={description ? "communication-drawer-description" : undefined} aria-labelledby="communication-drawer-title" aria-modal="true" className="communication-drawer relative flex h-full w-[min(480px,calc(100vw-16px))] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl" ref={dialogRef} role="dialog">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]" id="communication-drawer-title">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]" id="communication-drawer-description">{description}</p>}
          </div>
          <IconButton aria-label="Fechar painel" data-overlay-initial-focus onClick={onClose}><X size={15} /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && <footer className="shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-3">{footer}</footer>}
      </aside>
    </div>
  );
}

export function CommunicationModal({ children, description, footer, onClose, open, title, triggerRef }: OverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useOverlayLifecycle(open, dialogRef, onClose, triggerRef);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/25 p-4" role="presentation">
      <section aria-describedby={description ? "communication-modal-description" : undefined} aria-labelledby="communication-modal-title" aria-modal="true" className="flex max-h-[calc(100dvh-32px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl" ref={dialogRef} role="dialog">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]" id="communication-modal-title">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]" id="communication-modal-description">{description}</p>}
          </div>
          <IconButton aria-label="Fechar modal" data-overlay-initial-focus onClick={onClose}><X size={15} /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="border-t border-[var(--border-default)] p-3">{footer}</footer>}
      </section>
    </div>
  );
}

function useOverlayLifecycle(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previousFocus = triggerRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-overlay-initial-focus], button, input, select, textarea")?.focus({ preventScroll: true });
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [dialogRef, onClose, open, triggerRef]);
}
