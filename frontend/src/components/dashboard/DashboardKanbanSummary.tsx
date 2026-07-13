import { AlertTriangle, CalendarDays, CheckCircle2, Gauge, GitBranch, Target, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

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
    <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-default)] px-3 py-2 text-[11px]">
        <span className="font-medium text-[var(--text-secondary)]">Resumo executivo</span>
        <span className="text-[var(--text-muted)]">
          {kanbanClientsCount} oportunidades · {kanbanOwnerFilter === "Todos" ? "todos os vendedores" : kanbanOwnerFilter}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <SummarySignal icon={<GitBranch size={12} />} label="Funil" value={money(kanbanEnterpriseStats.totalValue)} />
        <SummarySignal icon={<Target size={12} />} label="Previsão" value={money(kanbanEnterpriseStats.forecastValue)} tone="warning" />
        <SummarySignal icon={<CheckCircle2 size={12} />} label="Ganho" value={money(kanbanEnterpriseStats.wonValue)} tone="success" />
        <SummarySignal icon={<AlertTriangle size={12} />} label="Risco" value={`${kanbanEnterpriseStats.highRiskCount} oportunidades`} tone="danger" />
        <SummarySignal icon={<TrendingUp size={12} />} label="Conversão" value={`${kanbanEnterpriseStats.conversionRate}%`} tone="success" />
        <SummarySignal icon={<Gauge size={12} />} label="Score médio" value={`${kanbanEnterpriseStats.averageScore}/100`} tone="info" />
        <SummarySignal icon={<GitBranch size={12} />} label="Funil ativo" value={`${kanbanEnterpriseStats.activePipeline} oportunidades`} />
        <SummarySignal icon={<CalendarDays size={12} />} label="Hoje" value={`${kanbanEnterpriseStats.todayFollowUps} ações`} tone="info" />
      </div>
    </div>
  );
}

function SummarySignal({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass = {
    default: "text-[var(--text-primary)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    info: "text-[var(--info)]",
  }[tone];

  return (
    <div className="min-w-0 border-b border-r border-[var(--border-default)] px-3 py-2 last:border-r-0 xl:border-b-0">
      <div className="flex items-center justify-between gap-2 text-[var(--text-muted)]">
        <span className="text-[11px]">{label}</span>
        {icon}
      </div>
      <p className={`mt-0.5 truncate text-[11px] font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
