type DashboardExecutiveSummaryProps = {
  analytics: {
    todayFollowUps: number;
    hotCount: number;
    averageScore: number;
  };
};

export default function DashboardExecutiveSummary({ analytics }: DashboardExecutiveSummaryProps) {
  return (
    <div className="saas-panel rounded-2xl p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Resumo executivo</p>
        <span className="text-[11px] text-slate-500">Leitura consolidada</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="metric-card rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/24 hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Próximas ações</p>
          <p className="mt-2 text-sm font-semibold">{analytics.todayFollowUps} follow-ups hoje</p>
        </div>

        <div className="metric-card rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/24 hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Clientes quentes</p>
          <p className="mt-2 text-sm font-semibold">{analytics.hotCount} oportunidades</p>
        </div>

        <div className="metric-card rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/24 hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Score médio</p>
          <p className="mt-2 text-sm font-semibold">{analytics.averageScore}/100</p>
        </div>
      </div>
    </div>
  );
}
