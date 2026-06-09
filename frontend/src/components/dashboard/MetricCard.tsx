import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  tone?: "pipeline" | "revenue" | "forecast" | "risk" | "neutral";
}

const toneClass = {
  pipeline: "metric-pipeline",
  revenue: "metric-revenue",
  forecast: "metric-forecast",
  risk: "metric-risk",
  neutral: "",
};

export default function MetricCard({ title, value, icon, tone = "neutral" }: MetricCardProps) {
  return (
    <div className={`premium-panel group rounded-2xl p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-400/24 hover:shadow-[0_20px_48px_rgba(0,0,0,0.3)] ${toneClass[tone]}`}>
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-white/[0.022] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
          <h2 className="mt-2 whitespace-nowrap text-[clamp(1.15rem,1.6vw,1.38rem)] font-bold leading-tight text-white">
            {value}
          </h2>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
