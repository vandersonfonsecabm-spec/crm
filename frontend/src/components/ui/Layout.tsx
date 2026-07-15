import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm", className)} />;
}

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("flex min-w-0 flex-wrap items-center justify-between gap-2", className)} />;
}

export function FilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("flex min-w-0 flex-wrap items-end gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3", className)} />;
}

type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
};

export function SectionHeader({ actions, className, description, icon, status, title, ...props }: SectionHeaderProps) {
  return (
    <div {...props} className={cx("flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--icon-default)]">{icon}</div>}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
            {status}
          </div>
          {description && <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
