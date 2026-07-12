import type { ReactNode } from "react";
import { Surface } from "../ui";

export type DashboardMetric = {
  label: string;
  value: string;
  context: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

const toneClasses: Record<NonNullable<DashboardMetric["tone"]>, string> = {
  default: "text-[var(--text-primary)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  info: "text-[var(--info)]",
};

const dividerClasses = [
  "",
  "border-t border-[var(--border-default)] md:border-l md:border-t-0",
  "border-t border-[var(--border-default)] xl:border-l xl:border-t-0",
  "border-t border-[var(--border-default)] md:border-l xl:border-t-0",
];

export default function DashboardMetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <Surface className="grid overflow-hidden md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          className={`min-w-0 px-4 py-3.5 ${dividerClasses[index] ?? "border-t border-[var(--border-default)]"}`}
          key={metric.label}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">{metric.label}</p>
            {metric.icon && <span className="text-[var(--icon-muted)]">{metric.icon}</span>}
          </div>
          <p className={`mt-1.5 truncate text-xl font-semibold leading-6 ${toneClasses[metric.tone ?? "default"]}`}>{metric.value}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{metric.context}</p>
        </div>
      ))}
    </Surface>
  );
}
