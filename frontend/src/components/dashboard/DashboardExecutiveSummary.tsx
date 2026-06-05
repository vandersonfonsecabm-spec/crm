type DashboardExecutiveSummaryProps = {
  analytics: {
    todayFollowUps: number;
    hotCount: number;
    averageScore: number;
  };
};

export default function DashboardExecutiveSummary({ analytics }: DashboardExecutiveSummaryProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Resumo executivo</p>
        <span className="text-[11px] text-slate-500">Leitura consolidada</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Próximas ações</p>
          <p className="mt-2 text-sm font-semibold">{analytics.todayFollowUps} follow-ups hoje</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Clientes quentes</p>
          <p className="mt-2 text-sm font-semibold">{analytics.hotCount} oportunidades</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
          <p className="text-[11px] text-slate-400">Score médio</p>
          <p className="mt-2 text-sm font-semibold">{analytics.averageScore}/100</p>
        </div>
      </div>
    </div>
  );
}
