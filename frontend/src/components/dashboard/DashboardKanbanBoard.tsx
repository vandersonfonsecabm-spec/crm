import { useMemo, useState } from "react";
import DashboardKanbanCommandBar from "./DashboardKanbanCommandBar";
import DashboardKanbanSummary from "./DashboardKanbanSummary";
import KanbanLeadCard from "../kanban/KanbanLeadCard";
import type { ActivePage, Client, KanbanOwner, Status } from "../../types/dashboard";

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
  kanbanOwnerFilter: KanbanOwner;
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
  changeStatus: (clientId: number, status: Status) => void | Promise<void>;
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
  const [stageGroup, setStageGroup] = useState<"pipeline" | "resultado">("pipeline");

  const groupedStatuses = useMemo(() => {
    const pipeline = statusList.filter((status) => ["Novo", "Contato", "Proposta"].includes(status));
    const resultado = statusList.filter((status) => ["Fechado", "Perdido"].includes(status));

    return {
      pipeline,
      resultado,
    };
  }, [statusList]);

  const visibleStatuses = groupedStatuses[stageGroup];

  if (activePage !== "kanban") {
    return null;
  }

  return (
    <>
      <DashboardKanbanCommandBar clients={clients} money={money} getLeadScore={getLeadScore} />

      <div className="space-y-3">
        <DashboardKanbanSummary
          kanbanClientsCount={kanbanClients.length}
          kanbanOwnerFilter={kanbanOwnerFilter}
          kanbanEnterpriseStats={kanbanEnterpriseStats}
          money={money}
        />

        <div className="saas-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Etapas do Kanban</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Movimente leads por etapa e acompanhe gargalos sem barra horizontal.</p>
          </div>

          <div className="flex rounded-xl border border-slate-500/16 bg-slate-950/25 p-1">
            <button
              onClick={() => setStageGroup("pipeline")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                stageGroup === "pipeline"
                  ? "bg-slate-100 text-slate-950 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              Fluxo comercial
            </button>
            <button
              onClick={() => setStageGroup("resultado")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                stageGroup === "resultado"
                  ? "bg-slate-100 text-slate-950 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              Resultado
            </button>
          </div>
        </div>

        <div className={`grid gap-3 ${visibleStatuses.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {visibleStatuses.map((status) => {
            const stageClients = kanbanClients.filter((client) => client.status === status);
            const stageValue = stageClients.reduce((sum, client) => sum + client.value, 0);
            const stageScore = Math.round(
              stageClients.reduce((sum, client) => sum + getLeadScore(client), 0) / Math.max(1, stageClients.length)
            );
            const stageRiskCount = stageClients.filter((client) => getRisk(client) === "Alto").length;
            const stageTodayCount = stageClients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje").length;
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
                  if (id) void changeStatus(id, status);
                  setDragOverStatus(null);
                  setIsDraggingKanban(false);
                }}
                className={`saas-panel min-w-0 rounded-2xl p-2.5 transition-all duration-300 ${
                  isDropTarget
                    ? "scale-[1.01] border-teal-300/40 bg-teal-300/[0.08] shadow-[0_18px_42px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(45,212,191,0.16)]"
                    : ""
                }`}
              >
                <div className={`mb-2 overflow-hidden rounded-xl border ${kanbanHeaderClass(status)}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2 px-2.5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            status === "Novo"
                              ? "bg-sky-300"
                              : status === "Contato"
                                ? "bg-slate-300"
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
                      <span className="saas-chip inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold">
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
                    <div className="metric-card rounded-xl border-dashed p-4 text-center">
                      <p className="text-[11px] font-semibold text-slate-300">Etapa vazia</p>
                      <p className="mt-1 text-[9px] text-slate-600">
                        {isDraggingKanban ? "Solte aqui para mover o lead" : "Sem leads nesta etapa"}
                      </p>
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

function StageMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950/22 px-1.5 py-1.5">
      <p className="text-[7px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[9px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}
