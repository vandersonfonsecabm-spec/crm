import DashboardKanbanSummary from "./DashboardKanbanSummary";
import KanbanLeadCard from "../kanban/KanbanLeadCard";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
type ActivePage = "dashboard" | "clientes" | "kanban" | "automacoes";

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

type KanbanEnterpriseStats = {
  totalValue: number;
  forecastValue: number;
  wonValue: number;
  averageScore: number;
  highRiskCount: number;
  todayFollowUps: number;
  activePipeline: number;
  conversionRate: number;
};

type DashboardKanbanBoardProps = {
  activePage: ActivePage;
  clients: Client[];
  kanbanClients: Client[];
  kanbanOwnerFilter: "Todos" | "Ana" | "Marco" | "Bia" | "Time";
  kanbanEnterpriseStats: KanbanEnterpriseStats;
  statusList: Status[];
  dragOverStatus: Status | null;
  isDraggingKanban: boolean;
  selectedId: number | null;
  money: (value: number) => string;
  initials: (name: string) => string;
  leadOwner: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  forecastLabel: (client: Client) => string;
  idleLabel: (client: Client) => string;
  activitySignalLabel: (client: Client) => string;
  actionIntensity: (client: Client) => number;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  smartCardBorderClass: (client: Client) => string;
  stageGuidance: (status: Status) => string;
  kanbanHeaderClass: (status: Status) => string;
  setSelectedId: (clientId: number | null) => void;
  setDragOverStatus: (status: Status | null) => void;
  setIsDraggingKanban: (isDragging: boolean) => void;
  changeStatus: (clientId: number, status: Status) => void;
};

export default function DashboardKanbanBoard({
  activePage,
  clients,
  kanbanClients,
  kanbanOwnerFilter,
  kanbanEnterpriseStats,
  statusList,
  dragOverStatus,
  isDraggingKanban,
  selectedId,
  money,
  getLeadScore,
  getRisk,
  forecastLabel,
  idleLabel,
  activitySignalLabel,
  actionIntensity,
  slaLabel,
  priorityLabel,
  smartCardBorderClass,
  stageGuidance,
  kanbanHeaderClass,
  setSelectedId,
  setDragOverStatus,
  setIsDraggingKanban,
  changeStatus,
}: DashboardKanbanBoardProps) {
  if (activePage !== "kanban") {
    return null;
  }

  const hotLeads = clients.filter((client) => client.hot || getLeadScore(client) >= 80).length;
  const proposalLeads = clients.filter((client) => client.status === "Proposta").length;
  const stalledLeads = clients.filter((client) => client.lastContactDays >= 7).length;
  const biggestBottleneck =
    clients.filter((client) => client.status === "Contato").length >=
    clients.filter((client) => client.status === "Proposta").length
      ? "Contato"
      : "Proposta";

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Comando do Kanban</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Leitura executiva do funil sem ocupar espaço das colunas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <KanbanCommandPill label="Gargalo" value={biggestBottleneck} tone="default" />
            <KanbanCommandPill label="Prioridade" value={`${hotLeads} leads`} tone="amber" />
            <KanbanCommandPill label="Propostas" value={`${proposalLeads} abertas`} tone="violet" />
            <KanbanCommandPill label="Silenciosos" value={`${stalledLeads} leads`} tone="rose" />
            <KanbanCommandPill
              label="Receita prevista"
              value={money(
                clients
                  .filter((client) => client.status === "Proposta" || client.status === "Fechado")
                  .reduce((sum, client) => sum + client.value, 0)
              )}
              tone="emerald"
            />
            <KanbanCommandPill
              label="Conversão"
              value={`${Math.max(
                1,
                Math.round(
                  (clients.filter((client) => client.status === "Fechado").length /
                    Math.max(clients.length, 1)) *
                    100
                )
              )}%`}
              tone="sky"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <DashboardKanbanSummary
          kanbanClientsCount={kanbanClients.length}
          kanbanOwnerFilter={kanbanOwnerFilter}
          kanbanEnterpriseStats={kanbanEnterpriseStats}
          money={money}
        />

        <div className="flex gap-3 overflow-x-auto pb-2 pr-1 [scrollbar-width:thin]">
          {statusList.map((status) => {
            const stageClients = kanbanClients.filter((client) => client.status === status);
            const stageValue = stageClients.reduce((sum, client) => sum + client.value, 0);
            const stageScore = Math.round(
              stageClients.reduce((sum, client) => sum + getLeadScore(client), 0) /
                Math.max(1, stageClients.length)
            );
            const stageRiskCount = stageClients.filter((client) => getRisk(client) === "Alto").length;
            const stageTodayCount = stageClients.filter(
              (client) => client.nextFollowUp.toLowerCase() === "hoje"
            ).length;
            const isDropTarget = dragOverStatus === status;

            return (
              <div
                key={status}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = Number(event.dataTransfer.getData("clientId"));
                  if (id) changeStatus(id, status);
                  setDragOverStatus(null);
                  setIsDraggingKanban(false);
                }}
                className={`w-[292px] shrink-0 rounded-2xl border p-2.5 transition-all duration-300 hover:shadow-[0_16px_45px_rgba(0,0,0,0.25)] ${
                  isDropTarget
                    ? "scale-[1.01] border-cyan-400/50 bg-cyan-500/[0.08] shadow-[0_0_35px_rgba(34,211,238,0.18)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className={`mb-2 overflow-hidden rounded-xl border ${kanbanHeaderClass(status)}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2 px-2.5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.25)] ${
                            status === "Novo"
                              ? "bg-sky-300"
                              : status === "Contato"
                                ? "bg-violet-300"
                                : status === "Proposta"
                                  ? "bg-amber-300"
                                  : status === "Fechado"
                                    ? "bg-emerald-300"
                                    : "bg-rose-300"
                          }`}
                        />

                        <p className="truncate text-sm font-semibold">{status}</p>
                      </div>

                      <p className="mt-1 truncate text-[9px] text-slate-400">
                        {isDropTarget && isDraggingKanban ? "Solte o lead nesta etapa" : stageGuidance(status)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="inline-flex min-w-6 justify-center rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                        {stageClients.length}
                      </span>

                      <p className="mt-1 max-w-[104px] truncate text-[9px] font-medium text-slate-300">
                        {money(stageValue)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10 text-center">
                    <StageMini label="Score" value={String(stageScore)} />
                    <StageMini label="Risco" value={String(stageRiskCount)} />
                    <StageMini label="Hoje" value={String(stageTodayCount)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {stageClients.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-3 text-center">
                      <p className="text-[11px] font-semibold text-slate-400">Etapa vazia</p>
                      <p className="mt-1 text-[9px] text-slate-600">Arraste um lead para esta coluna</p>
                    </div>
                  )}

                  {stageClients.map((client) => (
                    <KanbanLeadCard
                      key={client.id}
                      client={client}
                      selectedId={selectedId}
                      money={money}
                      initials={(name) =>
                        name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                      }
                      getLeadScore={getLeadScore}
                      getRisk={getRisk}
                      forecastLabel={forecastLabel}
                      idleLabel={idleLabel}
                      activitySignalLabel={activitySignalLabel}
                      actionIntensity={actionIntensity}
                      slaLabel={slaLabel}
                      priorityLabel={priorityLabel}
                      smartCardBorderClass={smartCardBorderClass}
                      setSelectedId={setSelectedId}
                      setIsDraggingKanban={setIsDraggingKanban}
                      setDragOverStatus={setDragOverStatus}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KanbanCommandPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "amber" | "violet" | "rose" | "emerald" | "sky";
}) {
  const tones = {
    default: "border-white/10 bg-black/20 text-slate-200",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    violet: "border-violet-400/10 bg-violet-500/[0.055] text-violet-100",
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    emerald: "border-emerald-400/10 bg-emerald-500/[0.055] text-emerald-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[9px] opacity-65">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function StageMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/20 px-1.5 py-1.5">
      <p className="text-[7px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[9px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}
