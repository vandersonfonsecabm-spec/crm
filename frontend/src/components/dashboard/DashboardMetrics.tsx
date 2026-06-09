import {
  Activity,
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
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <MetricCard
        title="Pipeline"
        value={money(analytics.totalValue)}
        icon={<TrendingUp size={15} className="text-emerald-400" />}
      />

      <MetricCard
        title="Ganho"
        value={money(analytics.wonValue)}
        icon={<CheckCircle2 size={15} className="text-sky-400" />}
      />

      <MetricCard
        title="Forecast"
        value={money(analytics.forecastValue)}
        icon={<Target size={15} className="text-violet-400" />}
      />

      <MetricCard
        title="Quentes"
        value={String(analytics.hotCount)}
        icon={<Flame size={15} className="text-rose-400" />}
      />

      <MetricCard
        title="Follow-up hoje"
        value={String(analytics.todayFollowUps)}
        icon={<CalendarDays size={15} className="text-amber-400" />}
      />

      <MetricCard
        title="Score médio"
        value={`${analytics.averageScore}/100`}
        icon={<Activity size={15} className="text-slate-300" />}
      />
    </section>
  );
}
