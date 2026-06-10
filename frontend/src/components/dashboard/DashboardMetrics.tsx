import {
  CalendarDays,
  CheckCircle2,
  Flame,
  Target,
  TrendingUp,
} from "lucide-react";

import MetricCard from "./MetricCard";

type DashboardMetricsProps = {
  analytics: {
    totalValue: number;
    wonValue: number;
    forecastValue: number;
    hotCount: number;
    todayFollowUps: number;
    averageScore: number;
  };
  money: (value: number) => string;
};

export default function DashboardMetrics({
  analytics,
  money,
}: DashboardMetricsProps) {
  return (
    <section className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="identity-panel self-start rounded-2xl p-3.5 md:col-span-2 xl:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100/70">Pipeline comercial</p>
            <h2 className="mt-2 max-w-full whitespace-nowrap text-2xl font-semibold leading-tight text-white">{money(analytics.totalValue)}</h2>
            <p className="mt-1 text-[11px] text-slate-400">Receita potencial com foco em follow-up e fechamento.</p>
          </div>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-teal-300/18 bg-teal-300/[0.065] text-teal-100">
            <TrendingUp size={18} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniSignal label="Quentes" value={String(analytics.hotCount)} />
          <MiniSignal label="Hoje" value={String(analytics.todayFollowUps)} />
          <MiniSignal label="Score" value={String(analytics.averageScore)} />
        </div>
      </div>

      <MetricCard
        title="Ganho"
        value={money(analytics.wonValue)}
        caption="Receita confirmada"
        icon={<CheckCircle2 size={16} className="text-cyan-300" />}
        tone="revenue"
      />

      <MetricCard
        title="Forecast"
        value={money(analytics.forecastValue)}
        caption="Previsão em aberto"
        icon={<Target size={16} className="text-amber-300" />}
        tone="forecast"
      />

      <MetricCard
        title="Quentes"
        value={String(analytics.hotCount)}
        caption="Prioridade ativa"
        icon={<Flame size={16} className="text-rose-300" />}
        tone="risk"
      />

      <MetricCard
        title="Follow-up"
        value={String(analytics.todayFollowUps)}
        caption="Agenda de hoje"
        icon={<CalendarDays size={16} className="text-emerald-300" />}
        tone="pipeline"
      />
    </section>
  );
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card rounded-lg px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
