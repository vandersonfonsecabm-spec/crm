import {
  CalendarDays,
  CheckCircle2,
  Target,
  TrendingUp,
} from "lucide-react";
import DashboardMetricStrip from "./DashboardMetricStrip";

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
    <DashboardMetricStrip
      metrics={[
        { label: "Pipeline total", value: money(analytics.totalValue), context: `Score médio ${analytics.averageScore}/100`, icon: <TrendingUp size={15} />, tone: "info" },
        { label: "Receita ganha", value: money(analytics.wonValue), context: "Negócios confirmados", icon: <CheckCircle2 size={15} />, tone: "success" },
        { label: "Previsão aberta", value: money(analytics.forecastValue), context: `${analytics.hotCount} oportunidades prioritárias`, icon: <Target size={15} />, tone: "warning" },
        { label: "Agenda de hoje", value: String(analytics.todayFollowUps), context: "Acompanhamentos previstos", icon: <CalendarDays size={15} /> },
      ]}
    />
  );
}
