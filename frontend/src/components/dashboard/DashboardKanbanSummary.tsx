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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Pipeline Kanban Enterprise</p>

            <span className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-cyan-100">
              visão executiva
            </span>
          </div>

          <p className="mt-0.5 text-[10px] text-slate-500">
            {kanbanClientsCount} leads na visão atual •{" "}
            {kanbanOwnerFilter === "Todos" ? "todos os vendedores" : `vendedor ${kanbanOwnerFilter}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Pipeline</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-100">
              {money(kanbanEnterpriseStats.totalValue)}
            </p>
          </div>

          <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-violet-200/50">Forecast</p>
            <p className="mt-1 text-[11px] font-semibold text-violet-100">
              {money(kanbanEnterpriseStats.forecastValue)}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-emerald-200/50">Ganho</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-100">
              {money(kanbanEnterpriseStats.wonValue)}
            </p>
          </div>

          <div className="rounded-xl border border-rose-400/10 bg-rose-500/[0.05] px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.16em] text-rose-200/50">Risco</p>
            <p className="mt-1 text-[11px] font-semibold text-rose-100">
              {kanbanEnterpriseStats.highRiskCount} leads
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
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

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Score médio</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.averageScore}/100</span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-300"
              style={{ width: `${kanbanEnterpriseStats.averageScore}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Pipeline ativo</span>
            <span className="text-slate-300">{kanbanEnterpriseStats.activePipeline} leads</span>
          </div>

          <p className="mt-1 truncate text-[10px] text-slate-400">
            Leads ainda em negociação antes de fechamento ou perda.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
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
