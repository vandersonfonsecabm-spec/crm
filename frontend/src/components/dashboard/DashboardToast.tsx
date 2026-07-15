import { CheckCircle2, X } from "lucide-react";

type DashboardToastProps = {
  toast: string;
  onClose: () => void;
};

export default function DashboardToast({ toast, onClose }: DashboardToastProps) {
  if (!toast) return null;

  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 w-[320px] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]" role="status">
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:rgba(36,122,82,0.28)] bg-[var(--surface-subtle)]">
          <CheckCircle2 size={16} className="text-[var(--success)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Ação concluída</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{toast}</p>
        </div>

        <button
          aria-label="Fechar mensagem"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          type="button"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
