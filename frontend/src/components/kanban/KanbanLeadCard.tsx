import { GripVertical, MessageSquareText, Timer } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";

type KanbanLeadCardProps = {
  client: Client;
  selectedId: number | null;
  money: (value: number) => string;
  initials: (name: string) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  forecastLabel: (client: Client) => string;
  idleLabel: (client: Client) => string;
  activitySignalLabel: (client: Client) => string;
  actionIntensity: (client: Client) => number;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  smartCardBorderClass: (client: Client) => string;
  setSelectedId: (clientId: number | null) => void;
  setIsDraggingKanban: (isDragging: boolean) => void;
  setDragOverStatus: (status: Status | null) => void;
};

export default function KanbanLeadCard({
  client,
  selectedId,
  money,
  initials,
  getLeadScore,
  getRisk,
  forecastLabel,
  actionIntensity,
  slaLabel,
  priorityLabel,
  setSelectedId,
  setIsDraggingKanban,
  setDragOverStatus,
}: KanbanLeadCardProps) {
  const score = getLeadScore(client);
  const intensity = actionIntensity(client);
  const risk = getRisk(client);
  const isSelected = selectedId === client.id;
  const isStrongLead = client.hot && score >= 80;
  const isAttentionLead = risk === "Alto" || client.lastContactDays >= 7;
  const urgencyLabel = isStrongLead ? "Quente" : isAttentionLead ? "Atenção" : "Estável";
  const urgencyColor = isStrongLead ? "bg-[var(--danger)]" : isAttentionLead ? "bg-[var(--warning)]" : "bg-[var(--success)]";
  const scoreColor = score >= 80 ? "text-[var(--success)]" : score >= 60 ? "text-[var(--warning)]" : "text-[var(--text-secondary)]";
  const interactionLabel = client.lastContactDays === 0
    ? "Contato hoje"
    : client.lastContactDays === 1
      ? "1 dia parado"
      : `${client.lastContactDays} dias parado`;

  const openDetails = () => setSelectedId(client.id);

  return (
    <div
      aria-label={`Abrir oportunidade de ${client.name}`}
      draggable
      onClick={openDetails}
      onDragEnd={() => {
        setDragOverStatus(null);
        setIsDraggingKanban(false);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("clientId", String(client.id));
        setIsDraggingKanban(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative min-w-0 cursor-grab overflow-hidden rounded-md border bg-[var(--bg-surface)] p-2.5 text-left shadow-sm transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:cursor-grabbing ${
        isSelected ? "border-[var(--primary)] bg-[var(--bg-muted)] shadow-[inset_3px_0_0_var(--primary)]" : "border-[var(--border-default)]"
      }`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${urgencyColor}`} />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
            {initials(client.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{client.name}</span>
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">{client.company}</span>
          </span>
        </div>
        <GripVertical aria-hidden="true" className="shrink-0 text-[var(--icon-muted)] opacity-60 group-hover:opacity-100" size={14} />
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{money(client.value)}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{forecastLabel(client)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs font-semibold ${scoreColor}`}>{score}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Score</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-[var(--border-default)] pt-2 text-[11px]">
        <div className="min-w-0">
          <p className="text-[var(--text-muted)]">Próxima ação</p>
          <p className="mt-0.5 truncate font-medium text-[var(--text-primary)]">{client.nextFollowUp}</p>
        </div>
        <div className="text-right">
          <p className="inline-flex items-center gap-1 text-[var(--text-muted)]"><Timer size={11} /> SLA</p>
          <p className="mt-0.5 font-medium text-[var(--text-secondary)]">{slaLabel(client)}</p>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${urgencyColor}`} />
          {urgencyLabel} · {priorityLabel(client)} · {interactionLabel}
        </span>
        {client.notes.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1" title={`${client.notes.length} nota(s)`}>
            <MessageSquareText size={11} /> {client.notes.length}
          </span>
        )}
      </div>

      <div aria-label={`Intensidade comercial ${intensity}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={intensity} className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]" role="progressbar">
        <div className={`h-full rounded-full ${intensity >= 85 ? "bg-[var(--danger)]" : intensity >= 65 ? "bg-[var(--warning)]" : "bg-[var(--icon-muted)]"}`} style={{ width: `${intensity}%` }} />
      </div>
    </div>
  );
}
