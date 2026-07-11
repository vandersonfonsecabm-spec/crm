import { AlertCircle, Inbox } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./utils";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ action, className, description, icon = <Inbox size={18} />, title, ...props }: EmptyStateProps) {
  return (
    <div {...props} className={cx("mx-auto flex w-full max-w-md flex-col items-center px-5 py-8 text-center", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--icon-muted)]">{icon}</div>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type ErrorStateProps = Omit<EmptyStateProps, "icon" | "action"> & {
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({ description, onRetry, retryLabel = "Tentar novamente", title, ...props }: ErrorStateProps) {
  return (
    <EmptyState
      {...props}
      action={onRetry ? <Button onClick={onRetry} size="sm" variant="secondary">{retryLabel}</Button> : undefined}
      description={description}
      icon={<AlertCircle size={18} />}
      title={title}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cx("animate-pulse rounded-md bg-[var(--surface-subtle)]", className)} />;
}

export function LoadingState({ className, label = "Carregando", rows = 3 }: { className?: string; label?: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className={cx("grid gap-2", className)} role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => <Skeleton className="h-16 w-full" key={index} />)}
    </div>
  );
}
