import { ArrowRight, RefreshCw } from "lucide-react";
import type { Client } from "../../types/dashboard";
import { Button, Surface, Toolbar } from "../ui";

type DashboardContextToolbarProps = {
  backendCaption: string;
  priorityClient: Client | null;
  money: (value: number) => string;
  onOpenPriority: (clientId: number) => void;
  onOpenCommercialQueue: () => void;
};

export default function DashboardContextToolbar({
  backendCaption,
  priorityClient,
  money,
  onOpenPriority,
  onOpenCommercialQueue,
}: DashboardContextToolbarProps) {
  return (
    <Surface className="mb-3 overflow-hidden">
      <Toolbar className="min-h-12 gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">
            <RefreshCw aria-hidden="true" size={12} />
            {backendCaption}
          </span>

          {priorityClient && (
            <button
              aria-label={`Abrir prioridade atual: ${priorityClient.name}`}
              className="group flex min-w-0 flex-1 items-center gap-2 border-l border-[var(--border-default)] pl-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              onClick={() => onOpenPriority(priorityClient.id)}
              type="button"
            >
              <span className="shrink-0 text-[10px] font-medium text-[var(--text-muted)]">Prioridade agora</span>
              <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{priorityClient.name}</span>
              <span className="hidden truncate text-[10px] text-[var(--text-muted)] md:inline">{priorityClient.status} · {money(priorityClient.value)} · {priorityClient.nextFollowUp}</span>
              <ArrowRight className="shrink-0 text-[var(--icon-muted)] group-hover:text-[var(--primary)]" size={13} />
            </button>
          )}
        </div>

        <Button onClick={onOpenCommercialQueue} rightIcon={<ArrowRight size={13} />} size="sm" variant="secondary">
          Abrir fila comercial
        </Button>
      </Toolbar>
    </Surface>
  );
}
