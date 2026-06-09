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
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="identity-panel rounded-2xl p-4 md:col-span-2 xl:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100/70">Pipeline comercial</p>
            <h2 className="mt-2 truncate text-2xl font-bold text-white">{money(analytics.totalValue)}</h2>
            <p className="mt-1 text-[11px] text-slate-400">Receita potencial com foco em follow-up e fechamento.</p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] text-teal-100">
            <TrendingUp size={18} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniSignal label="Quentes" value={String(analytics.hotCount)} />
          <MiniSignal label="Hoje" value={String(analytics.todayFollowUps)} />
          <MiniSignal label="Score" value={String(analytics.averageScore)} />
        </div>
      </div>

      <MetricCard
        title="Ganho"
        value={money(analytics.wonValue)}
        icon={<CheckCircle2 size={16} className="text-cyan-300" />}
        tone="revenue"
      />

      <MetricCard
        title="Forecast"
        value={money(analytics.forecastValue)}
        icon={<Target size={16} className="text-amber-300" />}
        tone="forecast"
      />

      <MetricCard
        title="Quentes"
        value={String(analytics.hotCount)}
        icon={<Flame size={16} className="text-rose-300" />}
        tone="risk"
      />

      <MetricCard
        title="Follow-up"
        value={String(analytics.todayFollowUps)}
        icon={<CalendarDays size={16} className="text-emerald-300" />}
        tone="pipeline"
      />
    </section>
  );
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2 py-2">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
