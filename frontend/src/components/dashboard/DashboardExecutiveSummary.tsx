import { CalendarCheck, Flame, Gauge } from "lucide-react";
import type { ReactNode } from "react";

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
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">Resumo executivo</p>
        <span className="text-[11px] text-slate-500">Leitura consolidada</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          icon={<CalendarCheck size={14} className="text-sky-300" />}
          label="Próximas ações"
          value={`${analytics.todayFollowUps} acompanhamentos`}
          helper="Agenda de hoje"
          tone="sky"
        />
        <SummaryCard
          icon={<Flame size={14} className="text-rose-300" />}
          label="Oportunidades quentes"
          value={`${analytics.hotCount} oportunidades`}
          helper="Prioridade ativa"
          tone="rose"
        />
        <SummaryCard
          icon={<Gauge size={14} className="text-emerald-300" />}
          label="Score médio"
          value={`${analytics.averageScore}/100`}
          helper="Qualidade geral"
          tone="emerald"
        />
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "sky" | "rose" | "emerald";
}) {
  const classes = {
    sky: "metric-revenue text-sky-100",
    rose: "metric-risk text-rose-100",
    emerald: "metric-pipeline text-emerald-100",
  };

  return (
    <div className={`metric-card rounded-xl p-3 ${classes[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] opacity-70">{label}</p>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/25">
          {icon}
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
      <p className="mt-1 text-[10px] opacity-60">{helper}</p>
    </div>
  );
}
