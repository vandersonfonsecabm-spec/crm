import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
}

export default function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-400">{title}</p>
          <h2 className="mt-2 truncate text-lg font-semibold text-white">{value}</h2>
        </div>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
          {icon}
        </div>
      </div>
    </div>
  );
}
