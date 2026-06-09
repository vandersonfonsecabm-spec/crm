import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
}

export default function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <div className="premium-panel group rounded-2xl p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-200/20 hover:shadow-[0_22px_52px_rgba(0,0,0,0.32)]">
      <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-cyan-300/[0.035] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-400">{title}</p>
          <h2 className="mt-2 whitespace-nowrap text-[clamp(1.05rem,1.45vw,1.22rem)] font-semibold leading-tight text-white">
            {value}
          </h2>
        </div>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
