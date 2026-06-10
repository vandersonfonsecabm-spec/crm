import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  caption?: string;
  tone?: "pipeline" | "revenue" | "forecast" | "risk" | "neutral";
  compact?: boolean;
}

const toneClass = {
  pipeline: "metric-pipeline",
  revenue: "metric-revenue",
  forecast: "metric-forecast",
  risk: "metric-risk",
  neutral: "",
};

const iconToneClass = {
  pipeline: "border-teal-300/18 bg-teal-300/[0.065] text-teal-100",
  revenue: "border-sky-300/18 bg-sky-300/[0.065] text-sky-100",
  forecast: "border-amber-300/18 bg-amber-300/[0.065] text-amber-100",
  risk: "border-rose-300/18 bg-rose-300/[0.065] text-rose-100",
  neutral: "border-slate-500/16 bg-slate-900/55 text-slate-200",
};

export default function MetricCard({
  title,
  value,
  icon,
  caption,
  tone = "neutral",
  compact = false,
}: MetricCardProps) {
  return (
    <div
      className={`metric-card group self-start ${compact ? "rounded-xl p-3" : "min-h-[112px] rounded-2xl p-4"} transition-all duration-300 hover:border-slate-400/24 hover:shadow-[0_18px_42px_rgba(0,0,0,0.28)] ${toneClass[tone]}`}
    >
      <div className="flex h-full min-w-0 flex-col justify-between">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconToneClass[tone]}`}>
            {icon}
          </div>
        </div>

        <h2
          className={`${compact ? "mt-1.5 text-base" : "mt-2 text-xl"} max-w-full whitespace-nowrap font-semibold leading-tight text-white`}
        >
          {value}
        </h2>

        {caption && <p className="mt-1 truncate text-[11px] text-slate-500">{caption}</p>}
      </div>
    </div>
  );
}
