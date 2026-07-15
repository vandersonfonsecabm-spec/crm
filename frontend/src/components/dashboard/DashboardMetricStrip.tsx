import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Surface } from "../ui";

export type DashboardMetric = {
  label: string;
  value: string;
  context: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  actionLabel?: string;
  featured?: boolean;
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
  const hasFeaturedMetric = metrics.some((metric) => metric.featured);

  return (
    <Surface className={`dashboard-metric-strip grid overflow-hidden md:grid-cols-2 ${hasFeaturedMetric ? "xl:grid-cols-[1.18fr_0.92fr_1.08fr_0.82fr]" : "xl:grid-cols-4"}`}>
      {metrics.map((metric, index) => {
        const className = `dashboard-metric min-w-0 px-4 py-3.5 text-left ${metric.featured ? "dashboard-metric-featured" : ""} ${dividerClasses[index] ?? "border-t border-[var(--border-default)]"} ${
          metric.onClick
            ? "group transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]"
            : ""
        }`;
        const content = (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-[11px] ${metric.featured ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]"}`}>{metric.label}</p>
              {metric.icon && <span className="text-[var(--icon-muted)]">{metric.icon}</span>}
            </div>
            <p className={`mt-1.5 truncate font-semibold tabular-nums ${metric.featured ? "text-[22px] leading-7" : "text-xl leading-6"} ${toneClasses[metric.tone ?? "default"]}`}>{metric.value}</p>
            <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="truncate">{metric.context}</span>
              {metric.onClick && (
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)]">
                  {metric.actionLabel ?? "Ver"}
                  <ArrowRight size={12} />
                </span>
              )}
            </div>
          </>
        );

        return metric.onClick ? (
          <button aria-label={`${metric.label}: ${metric.value}. ${metric.actionLabel ?? "Ver detalhes"}`} className={className} key={metric.label} onClick={metric.onClick} type="button">
            {content}
          </button>
        ) : (
          <div className={className} key={metric.label}>{content}</div>
        );
      })}
    </Surface>
  );
}
