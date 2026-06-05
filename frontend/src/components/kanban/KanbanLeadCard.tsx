type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";

type Note = {
  id: number;
  text: string;
  date: string;
};

type Client = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  value: number;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
};

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
  idleLabel,
  activitySignalLabel,
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
      className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.34)] ${
        isSelected
          ? "scale-[1.01] border-cyan-300/50 bg-cyan-500/[0.10] shadow-[0_0_24px_rgba(34,211,238,0.10)]"
          : `${smartCardBorderClass(client)} hover:border-white/25 hover:bg-white/[0.06]`
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${
          isStrongLead
            ? "bg-gradient-to-r from-transparent via-rose-300/70 to-transparent"
            : isAttentionLead
              ? "bg-gradient-to-r from-transparent via-amber-300/60 to-transparent"
              : "bg-gradient-to-r from-transparent via-white/20 to-transparent"
        }`}
      />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[8px] font-bold text-white">
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <p className="truncate text-xs font-semibold text-slate-100">
                {client.name}
              </p>

              {client.notes.length > 0 && (
                <span className="shrink-0 rounded-full bg-white/10 px-1 py-0.5 text-[8px] text-slate-300">
                  {client.notes.length}
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-[10px] text-slate-500">
              {client.company}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {client.hot && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.85)]" />
            </span>
          )}

          <span
            className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
              score >= 80
                ? "bg-emerald-500/10 text-emerald-200"
                : score >= 60
                  ? "bg-amber-500/10 text-amber-200"
                  : "bg-white/5 text-slate-400"
            }`}
          >
            {score}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold text-slate-200">
          {money(client.value)}
        </p>

        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${
            isStrongLead
              ? "bg-rose-500/10 text-rose-100"
              : score >= 60
                ? "bg-violet-500/10 text-violet-100"
                : "bg-white/5 text-slate-400"
          }`}
        >
          {priorityLabel(client)}
        </span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${
            intensity >= 85
              ? "bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.70)]"
              : intensity >= 65
                ? "bg-amber-300"
                : "bg-slate-400"
          }`}
          style={{ width: `${intensity}%` }}
        />
      </div>

      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-1.5 text-[8px]">
        <span className="min-w-0 truncate rounded-full bg-white/[0.04] px-1.5 py-0.5 text-slate-400">
          {activitySignalLabel(client)} • {idleLabel(client)}
        </span>

        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 ${
            client.lastContactDays >= 7
              ? "bg-rose-500/10 text-rose-200"
              : client.lastContactDays >= 3
                ? "bg-amber-500/10 text-amber-200"
                : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          SLA {slaLabel(client)}
        </span>
      </div>

      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-1.5 text-[8px]">
        <span className="min-w-0 truncate text-slate-500">
          {forecastLabel(client)}
        </span>

        <span className="shrink-0 rounded-full bg-white/[0.04] px-1.5 py-0.5 font-medium text-slate-300">
          {client.nextFollowUp} • {intensity}%
        </span>
      </div>
    </div>
  );
}
