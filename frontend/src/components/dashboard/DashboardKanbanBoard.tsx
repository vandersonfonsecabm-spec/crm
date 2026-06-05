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
  initials,
  leadOwner,
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
  return (
    <>
              {activePage === "kanban" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Resumo operacional do Kanban</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Gargalos, oportunidades, saúde das colunas e próxima ação do pipeline.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Maior gargalo</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          {clients.filter((client) => client.status === "Contato").length >= clients.filter((client) => client.status === "Proposta").length
                            ? "Contato"
                            : "Proposta"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Alta prioridade</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          {clients.filter((client) => getLeadScore(client) >= 80).length} leads
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Ação sugerida</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          Follow-up hoje
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-emerald-200/70">
                          Previsão receita
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-emerald-100">
                          {money(
                            clients
                              .filter(
                                (client) =>
                                  client.status === "Proposta" ||
                                  client.status === "Fechado"
                              )
                              .reduce((sum, client) => sum + client.value, 0)
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl border border-sky-400/10 bg-sky-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-sky-200/70">
                          Conversão
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-sky-100">
                          {Math.max(
                            1,
                            Math.round(
                              (clients.filter((client) => client.status === "Fechado").length /
                                Math.max(clients.length, 1)) *
                                100
                            )
                          )}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-violet-200/70">
                          Meta pipeline
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-violet-100">
                          78%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePage === "kanban" && (
                <div className="grid gap-3 lg:grid-cols-3">
                  {["Ana", "Marco", "Bia"].map((seller) => {
                    const sellerClients = clients.filter(
                      (client) => leadOwner(client) === seller
                    );

                    const sellerValue = sellerClients.reduce(
                      (sum, client) => sum + client.value,
                      0
                    );

                    return (
                      <div
                        key={seller}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                              {initials(seller)}
                            </div>

                            <div>
                              <p className="text-xs font-semibold">{seller}</p>
                              <p className="text-[10px] text-slate-500">
                                Operador comercial
                              </p>
                            </div>
                          </div>

                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                            {sellerClients.length} leads
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Pipeline
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {money(sellerValue)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">
                              Score médio
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {sellerClients.length > 0
                                ? Math.round(
                                    sellerClients.reduce(
                                      (sum, client) =>
                                        sum + getLeadScore(client),
                                      0
                                    ) / sellerClients.length
                                  )
                                : 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activePage === "kanban" && (
                <div className="space-y-3">
                  <DashboardKanbanSummary
                    kanbanClientsCount={kanbanClients.length}
                    kanbanOwnerFilter={kanbanOwnerFilter}
                    kanbanEnterpriseStats={kanbanEnterpriseStats}
                    money={money}
                  />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {statusList.map((status) => (
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
                    className={`min-w-0 rounded-2xl border p-3 transition-all duration-300 hover:shadow-[0_16px_45px_rgba(0,0,0,0.25)] ${
                      dragOverStatus === status
                        ? "scale-[1.01] border-cyan-400/50 bg-cyan-500/[0.08] shadow-[0_0_35px_rgba(34,211,238,0.18)]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className={`mb-3 overflow-hidden rounded-xl border ${kanbanHeaderClass(status)}`}>
                      <div className="flex min-w-0 items-start justify-between gap-2 px-2 py-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className={`h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.25)] ${status === "Novo" ? "bg-sky-300" : status === "Contato" ? "bg-violet-300" : status === "Proposta" ? "bg-amber-300" : status === "Fechado" ? "bg-emerald-300" : "bg-rose-300"}`} />

                            <p className="truncate text-xs font-semibold">{status}</p>
                          </div>

                          <p className="mt-1 truncate text-[9px] text-slate-400">
                            {dragOverStatus === status && isDraggingKanban ? "Solte aqui" : stageGuidance(status)}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="inline-flex min-w-5 justify-center rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-300">
                            {kanbanClients.filter((client) => client.status === status).length}
                          </span>

                          <p className="mt-1 max-w-[92px] truncate text-[8px] font-medium text-slate-300">
                            {money(
                              kanbanClients
                                .filter((client) => client.status === status)
                                .reduce((sum, client) => sum + client.value, 0)
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-white/10 bg-black/10 px-2 py-1.5">
                        <div className="flex items-center justify-between text-[8px]">
                          <span className="text-slate-500">Saúde</span>
                          <span className="text-slate-300">
                            {kanbanClients.filter((client) => client.status === status && getRisk(client) === "Alto").length === 0 ? "Saudável" : "Revisar"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10 text-center">
                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Score</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {Math.round(
                              kanbanClients
                                .filter((client) => client.status === status)
                                .reduce((sum, client) => sum + getLeadScore(client), 0) /
                                Math.max(1, kanbanClients.filter((client) => client.status === status).length)
                            )}
                          </p>
                        </div>

                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Risco</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {kanbanClients.filter((client) => client.status === status && getRisk(client) === "Alto").length}
                          </p>
                        </div>

                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Hoje</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {kanbanClients.filter((client) => client.status === status && client.nextFollowUp.toLowerCase() === "hoje").length}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between text-[8px] text-slate-500">
                        <span>Intensidade</span>

                        <span>
                          {Math.min(
                            100,
                            kanbanClients.filter((client) => client.status === status).length * 18
                          )}%
                        </span>
                      </div>

                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
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
                          style={{
                            width: `${Math.min(
                              100,
                              kanbanClients.filter((client) => client.status === status).length * 18
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {kanbanClients.filter((client) => client.status === status).length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-3 text-center">
                          <p className="text-[11px] font-semibold text-slate-400">
                            Etapa vazia
                          </p>

                          <p className="mt-1 text-[9px] text-slate-600">
                            Arraste um card para esta etapa
                          </p>
                        </div>
                      )}

                      {kanbanClients.filter((client) => client.status === status).map((client) => (
                        <KanbanLeadCard
                          key={client.id}
                          client={client}
                          selectedId={selectedId}
                          money={money}
                          initials={initials}
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
                ))}
                  </div>
                </div>
              )}
    </>
  );
}
