import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  caption?: string;
  tone?: "pipeline" | "revenue" | "forecast" | "risk" | "neutral";
}

const toneClass = {
  pipeline: "metric-pipeline",
  revenue: "metric-revenue",
  forecast: "metric-forecast",
  risk: "metric-risk",
  neutral: "",
};

export default function MetricCard({
  title,
  value,
  icon,
  caption,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <div className={`premium-panel group min-h-[116px] self-start rounded-2xl p-4 transition-all duration-300 hover:border-slate-400/24 hover:shadow-[0_18px_42px_rgba(0,0,0,0.28)] ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
          <h2 className="mt-2 whitespace-nowrap text-[clamp(1.1rem,1.45vw,1.32rem)] font-semibold leading-tight text-white">
            {value}
          </h2>
        </div>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.11] bg-white/[0.045] text-slate-200">
          {icon}
        </div>
      </div>

      {caption && (
        <>
          <div className="mt-4 h-px w-full bg-white/[0.07]" />
          <p className="mt-3 truncate text-[11px] text-slate-500">{caption}</p>
        </>
      )}
    </div>
  );
}
