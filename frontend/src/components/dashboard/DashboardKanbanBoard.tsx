import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import DashboardKanbanCommandBar from "./DashboardKanbanCommandBar";
import DashboardKanbanSummary from "./DashboardKanbanSummary";
import KanbanLeadCard from "../kanban/KanbanLeadCard";
import type { ActivePage, Client, KanbanOwner, Status } from "../../types/dashboard";
import { Surface } from "../ui";

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
  initialStageGroup?: "pipeline" | "resultado";
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
  initialStageGroup = "pipeline",
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
  const [stageGroup, setStageGroup] = useState<"pipeline" | "resultado">(initialStageGroup);

  const groupedStatuses = useMemo(() => {
    const pipeline = statusList.filter((status) => ["Novo", "Contato", "Proposta"].includes(status));
    const resultado = statusList.filter((status) => ["Fechado", "Perdido"].includes(status));

    return {
      pipeline,
      resultado,
    };
  }, [statusList]);

  const effectiveStageGroup = kanbanClients.length > 0 && kanbanClients.every((client) => client.status === "Fechado" || client.status === "Perdido")
    ? "resultado"
    : stageGroup;
  const visibleStatuses = groupedStatuses[effectiveStageGroup];

  if (activePage !== "kanban") {
    return null;
  }

  return (
    <section className="space-y-2">
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Pipeline de negócios</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{kanbanClients.length} oportunidades · arraste entre etapas ou abra os detalhes.</p>
          </div>

          <div className="flex rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1">
            <button
              onClick={() => setStageGroup("pipeline")}
              className={`rounded px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                effectiveStageGroup === "pipeline"
                  ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              type="button"
            >
              Fluxo comercial
            </button>
            <button
              onClick={() => setStageGroup("resultado")}
              className={`rounded px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                effectiveStageGroup === "resultado"
                  ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              type="button"
            >
              Resultado
            </button>
          </div>
        </div>

        <details className="group border-t border-[var(--border-default)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
            Indicadores e comando do funil
            <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
          </summary>
          <div className="space-y-2 border-t border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
            <DashboardKanbanCommandBar clients={clients} money={money} getLeadScore={getLeadScore} />
            <DashboardKanbanSummary
              kanbanClientsCount={kanbanClients.length}
              kanbanOwnerFilter={kanbanOwnerFilter}
              kanbanEnterpriseStats={kanbanEnterpriseStats}
              money={money}
            />
          </div>
        </details>
      </Surface>

      <div className={`grid gap-2 ${visibleStatuses.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
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
                role="group"
                aria-label={`Etapa ${status}`}
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
                className={`min-h-[280px] min-w-0 rounded-lg border bg-[var(--bg-surface)] p-2 transition-colors ${
                  isDropTarget
                    ? "border-[var(--primary)] bg-[var(--surface-subtle)] shadow-[inset_0_0_0_1px_var(--primary)]"
                    : "border-[var(--border-default)]"
                }`}
              >
                <div className={`mb-2 overflow-hidden rounded-md border ${kanbanHeaderClass(status)}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2 px-2.5 py-2">
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

                        <p className="truncate text-xs font-semibold">{status}</p>
                      </div>

                      <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                        {isDropTarget && isDraggingKanban ? "Solte a oportunidade nesta etapa" : stageGuidance(status)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="inline-flex min-w-6 justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                        {stageClients.length}
                      </span>

                      <p className="mt-1 max-w-[112px] truncate text-[11px] font-medium text-[var(--text-secondary)]">
                        {money(stageValue)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)]">
                    <span>Score <strong className="font-medium text-[var(--text-secondary)]">{stageScore}</strong></span>
                    <span>Risco <strong className="font-medium text-[var(--text-secondary)]">{stageRiskCount}</strong></span>
                    <span>Hoje <strong className="font-medium text-[var(--text-secondary)]">{stageTodayCount}</strong></span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {stageClients.length === 0 && (
                    <div className="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] p-4 text-center">
                      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">Etapa vazia</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {isDraggingKanban ? "Solte aqui para mover a oportunidade" : "Sem oportunidades nesta etapa"}
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
    </section>
  );
}
