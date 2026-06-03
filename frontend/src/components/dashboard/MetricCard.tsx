import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
}

export default function MetricCard({
  title,
  value,
  icon,
}: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400">{title}</p>

        {icon && (
          <div className="flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold text-white">
        {value}
      </p>
    </div>
  );
}