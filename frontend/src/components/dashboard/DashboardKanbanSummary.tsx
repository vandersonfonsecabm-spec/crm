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

type KanbanOwnerFilter = "Todos" | "Ana" | "Marco" | "Bia" | "Time";

type DashboardKanbanSummaryProps = {
  kanbanClientsCount: number;
  kanbanOwnerFilter: KanbanOwnerFilter;
  kanbanEnterpriseStats: KanbanEnterpriseStats;
  money: (value: number) => string;
};

export default function DashboardKanbanSummary({
  kanbanClientsCount,
  kanbanOwnerFilter,
  kanbanEnterpriseStats,
  money,
}: DashboardKanbanSummaryProps) {
  return (
    <div className="saas-panel rounded-2xl p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Pipeline Kanban</p>

            <span className="saas-chip rounded-full px-2 py-0.5 text-[9px] font-semibold">
              visão executiva
            </span>
          </div>

          <p className="mt-0.5 text-[10px] text-slate-500">
            {kanbanClientsCount} leads na visão atual •{" "}
            {kanbanOwnerFilter === "Todos" ? "todos os vendedores" : `vendedor ${kanbanOwnerFilter}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="saas-card rounded-xl px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Pipeline</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-100">
              {money(kanbanEnterpriseStats.totalValue)}
            </p>
          </div>

          <div className="saas-card rounded-xl px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Forecast</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-100">
              {money(kanbanEnterpriseStats.forecastValue)}
            </p>
          </div>

          <div className="saas-card saas-accent-emerald rounded-xl px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-emerald-200/50">Ganho</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-100">
              {money(kanbanEnterpriseStats.wonValue)}
            </p>
          </div>

          <div className="saas-card saas-accent-rose rounded-xl px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-rose-200/50">Risco</p>
            <p className="mt-1 text-[11px] font-semibold text-rose-100">
              {kanbanEnterpriseStats.highRiskCount} leads
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="saas-card rounded-xl px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Conversão</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.conversionRate}%</span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-300"
              style={{ width: `${Math.min(100, kanbanEnterpriseStats.conversionRate)}%` }}
            />
          </div>
        </div>

        <div className="saas-card rounded-xl px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Score médio</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.averageScore}/100</span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-300"
              style={{ width: `${kanbanEnterpriseStats.averageScore}%` }}
            />
          </div>
        </div>

        <div className="saas-card rounded-xl px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Pipeline ativo</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.activePipeline} leads</span>
          </div>

          <p className="mt-1 truncate text-[10px] text-slate-400">
            Leads ainda em negociação antes de fechamento ou perda.
          </p>
        </div>

        <div className="saas-card rounded-xl px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Follow-ups hoje</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.todayFollowUps}</span>
          </div>

          <p className="mt-1 truncate text-[10px] text-slate-400">
            Ações que precisam de atenção imediata.
          </p>
        </div>
      </div>
    </div>
  );
}
