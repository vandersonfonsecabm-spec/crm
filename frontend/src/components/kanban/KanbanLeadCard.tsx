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
  actionIntensity,
  slaLabel,
  priorityLabel,
  smartCardBorderClass,
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
    ? "border-rose-300/15 bg-rose-500/10 text-rose-100"
    : isAttentionLead
      ? "border-amber-300/15 bg-amber-500/10 text-amber-100"
      : "border-emerald-300/15 bg-emerald-500/10 text-emerald-100";

  const slaTone =
    client.lastContactDays >= 7
      ? "bg-rose-500/10 text-rose-200"
      : client.lastContactDays >= 3
        ? "bg-amber-500/10 text-amber-200"
        : "bg-emerald-500/10 text-emerald-200";

  const scoreTone =
    score >= 80
      ? "bg-emerald-500/10 text-emerald-200"
      : score >= 60
        ? "bg-amber-500/10 text-amber-200"
        : "bg-white/5 text-slate-400";

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
      className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/20 p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.065] hover:shadow-[0_14px_32px_rgba(0,0,0,0.34)] ${
        isSelected
          ? "scale-[1.01] border-cyan-300/50 bg-cyan-500/[0.10] shadow-[0_0_26px_rgba(34,211,238,0.12)]"
          : smartCardBorderClass(client)
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${
          isStrongLead
            ? "bg-gradient-to-r from-transparent via-rose-300/75 to-transparent"
            : isAttentionLead
              ? "bg-gradient-to-r from-transparent via-amber-300/65 to-transparent"
              : "bg-gradient-to-r from-transparent via-emerald-300/35 to-transparent"
        }`}
      />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-[8px] font-black text-white">
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[11px] font-semibold text-slate-100">
                {client.name}
              </p>

              {client.notes.length > 0 && (
                <span className="shrink-0 rounded-full bg-white/10 px-1 py-0.5 text-[8px] text-slate-300">
                  {client.notes.length}
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-[9px] text-slate-500">
              {client.company}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${scoreTone}`}>
          {score}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-slate-100">
            {money(client.value)}
          </p>
          <p className="mt-0.5 truncate text-[8px] text-slate-500">
            {interactionLabel}
          </p>
        </div>

        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${urgencyTone}`}>
          {urgencyLabel}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px]">
        <span className={`truncate rounded-full px-1.5 py-0.5 font-medium ${slaTone}`}>
          SLA {slaLabel(client)}
        </span>

        <span className="truncate rounded-full bg-white/[0.045] px-1.5 py-0.5 font-medium text-slate-300">
          {client.nextFollowUp}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
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
          {priorityLabel(client)}
        </span>
      </div>
    </div>
  );
}
