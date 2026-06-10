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

  const urgencyLabel = isStrongLead
    ? "Quente"
    : isAttentionLead
      ? "Atenção"
      : "Estável";

  const urgencyTone = isStrongLead
    ? "border-rose-300/20 bg-slate-950/25 text-rose-100"
    : isAttentionLead
      ? "border-amber-300/20 bg-slate-950/25 text-amber-100"
      : "border-emerald-300/20 bg-slate-950/25 text-emerald-100";

  const slaTone =
    client.lastContactDays >= 7
      ? "border-rose-300/16 bg-slate-950/25 text-rose-200"
      : client.lastContactDays >= 3
        ? "border-amber-300/16 bg-slate-950/25 text-amber-200"
        : "border-emerald-300/16 bg-slate-950/25 text-emerald-200";

  const scoreTone =
    score >= 80
      ? "border-emerald-300/16 bg-slate-950/25 text-emerald-200"
      : score >= 60
        ? "border-amber-300/16 bg-slate-950/25 text-amber-200"
        : "border-slate-500/16 bg-slate-950/25 text-slate-400";

  const interactionLabel =
    client.lastContactDays === 0
      ? "Contato hoje"
      : client.lastContactDays === 1
        ? "1 dia parado"
        : `${client.lastContactDays} dias parado`;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("clientId", String(client.id));
        setIsDraggingKanban(true);
      }}
      onDragEnd={() => {
        setDragOverStatus(null);
        setIsDraggingKanban(false);
      }}
      onClick={() => setSelectedId(client.id)}
      className={`metric-card group relative min-w-0 cursor-grab overflow-hidden rounded-xl p-2.5 transition active:cursor-grabbing ${
        isSelected
          ? "border-teal-300/32 bg-teal-300/[0.055] shadow-[inset_2px_0_0_rgba(45,212,191,0.42),0_14px_32px_rgba(0,0,0,0.18)]"
          : ""
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${
          isStrongLead
            ? "bg-rose-300/65"
            : isAttentionLead
              ? "bg-amber-300/55"
              : "bg-emerald-300/35"
        }`}
      />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-500/16 bg-slate-900/70 text-[8px] font-bold text-slate-100">
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[11px] font-semibold text-slate-100">
                {client.name}
              </p>

              {client.notes.length > 0 && (
                <span className="saas-chip inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px]">
                  <MessageSquareText size={9} />
                  {client.notes.length}
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-[9px] text-slate-500">
              {client.company}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${scoreTone}`}>
            {score}
          </span>
          <GripVertical size={12} className="text-slate-600 opacity-0 transition group-hover:opacity-100" />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-100">
            {money(client.value)}
          </p>
          <p className="mt-0.5 truncate text-[8px] text-slate-500">
            {forecastLabel(client)}
          </p>
        </div>

        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${urgencyTone}`}>
          {urgencyLabel}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px]">
        <span className={`inline-flex items-center gap-1 truncate rounded-full border px-1.5 py-0.5 font-medium ${slaTone}`}>
          <Timer size={9} />
          {slaLabel(client)}
        </span>

        <span className="truncate rounded-full border border-slate-500/16 bg-slate-950/25 px-1.5 py-0.5 font-medium text-slate-300">
          {client.nextFollowUp}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${
              intensity >= 85
                ? "bg-rose-300"
                : intensity >= 65
                  ? "bg-amber-300"
                  : "bg-slate-400"
            }`}
            style={{ width: `${intensity}%` }}
          />
        </div>

        <span className="shrink-0 truncate text-[8px] font-medium text-slate-500">
          {priorityLabel(client)} - {interactionLabel}
        </span>
      </div>
    </div>
  );
}
