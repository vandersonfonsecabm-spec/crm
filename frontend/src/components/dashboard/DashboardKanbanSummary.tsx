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
    <div className="saas-panel rounded-2xl p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
            <GitBranch size={16} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Pipeline Kanban</p>

              <span className="saas-chip rounded-full px-2 py-0.5 text-[9px] font-semibold">
                visão executiva
              </span>
            </div>

            <p className="mt-0.5 text-[10px] text-slate-500">
              {kanbanClientsCount} leads na visão atual -{" "}
              {kanbanOwnerFilter === "Todos" ? "todos os vendedores" : `vendedor ${kanbanOwnerFilter}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummarySignal icon={<GitBranch size={12} />} label="Pipeline" value={money(kanbanEnterpriseStats.totalValue)} />
          <SummarySignal icon={<Target size={12} />} label="Forecast" value={money(kanbanEnterpriseStats.forecastValue)} tone="forecast" />
          <SummarySignal icon={<CheckCircle2 size={12} />} label="Ganho" value={money(kanbanEnterpriseStats.wonValue)} tone="pipeline" />
          <SummarySignal icon={<AlertTriangle size={12} />} label="Risco" value={`${kanbanEnterpriseStats.highRiskCount} leads`} tone="risk" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <ProgressSignal
          icon={<TrendingUp size={12} />}
          label="Conversão"
          value={`${kanbanEnterpriseStats.conversionRate}%`}
          progress={Math.min(100, kanbanEnterpriseStats.conversionRate)}
          tone="emerald"
        />

        <ProgressSignal
          icon={<Gauge size={12} />}
          label="Score médio"
          value={`${kanbanEnterpriseStats.averageScore}/100`}
          progress={kanbanEnterpriseStats.averageScore}
          tone="sky"
        />

        <TextSignal
          icon={<GitBranch size={12} />}
          label="Pipeline ativo"
          value={`${kanbanEnterpriseStats.activePipeline} leads`}
          hint="Leads ainda em negociação antes de fechamento ou perda."
        />

        <TextSignal
          icon={<CalendarDays size={12} />}
          label="Follow-ups hoje"
          value={String(kanbanEnterpriseStats.todayFollowUps)}
          hint="Ações que precisam de atenção imediata."
        />
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
  tone?: "default" | "pipeline" | "forecast" | "risk";
}) {
  const toneClass = {
    default: "metric-card text-slate-100",
    pipeline: "metric-card metric-pipeline text-emerald-100",
    forecast: "metric-card metric-forecast text-amber-100",
    risk: "metric-card metric-risk text-rose-100",
  };

  return (
    <div className={`rounded-xl px-2.5 py-2 ${toneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[8px] uppercase tracking-[0.16em] opacity-65">{label}</p>
        {icon}
      </div>
      <p className="mt-1 truncate text-[11px] font-semibold">{value}</p>
    </div>
  );
}

function ProgressSignal({
  icon,
  label,
  value,
  progress,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  progress: number;
  tone: "emerald" | "sky";
}) {
  return (
    <div className="metric-card rounded-xl px-3 py-2">
      <div className="flex items-center justify-between text-[9px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="text-slate-300">{value}</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${tone === "emerald" ? "bg-emerald-300" : "bg-sky-300"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function TextSignal({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric-card rounded-xl px-3 py-2">
      <div className="flex items-center justify-between text-[9px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="text-slate-300">{value}</span>
      </div>

      <p className="mt-1 truncate text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
