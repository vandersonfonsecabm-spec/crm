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
  onOpenPipeline: () => void;
  onOpenWon: () => void;
  onOpenForecast: () => void;
  onOpenTodayAgenda: () => void;
};

export default function DashboardMetrics({
  analytics,
  money,
  onOpenPipeline,
  onOpenWon,
  onOpenForecast,
  onOpenTodayAgenda,
}: DashboardMetricsProps) {
  return (
    <DashboardMetricStrip
      metrics={[
        { label: "Pipeline total", value: money(analytics.totalValue), context: `Score médio ${analytics.averageScore}/100`, icon: <TrendingUp size={15} />, tone: "info", onClick: onOpenPipeline, actionLabel: "Funil" },
        { label: "Receita ganha", value: money(analytics.wonValue), context: "Negócios confirmados", icon: <CheckCircle2 size={15} />, tone: "success", onClick: onOpenWon, actionLabel: "Resultados" },
        { label: "Previsão aberta", value: money(analytics.forecastValue), context: `${analytics.hotCount} oportunidades prioritárias`, icon: <Target size={15} />, tone: "warning", onClick: onOpenForecast, actionLabel: "Oportunidades" },
        { label: "Agenda de hoje", value: String(analytics.todayFollowUps), context: "Acompanhamentos previstos", icon: <CalendarDays size={15} />, onClick: onOpenTodayAgenda, actionLabel: "Agenda" },
      ]}
    />
  );
}
