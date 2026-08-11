import { AlertCircle, Inbox } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./utils";

type FeedbackState = "empty" | "no-results" | "restricted" | "unavailable" | "info" | "success" | "warning" | "danger";

const stateIconClasses: Record<FeedbackState, string> = {
  empty: "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--icon-muted)]",
  "no-results": "border-[var(--info-border)] bg-[var(--info-subtle)] text-[var(--info)]",
  restricted: "border-[var(--warning-border)] bg-[var(--warning-subtle)] text-[var(--warning)]",
  unavailable: "border-[var(--border-default)] bg-[var(--disabled-bg)] text-[var(--disabled-text)]",
  info: "border-[var(--info-border)] bg-[var(--info-subtle)] text-[var(--info)]",
  success: "border-[var(--success-border)] bg-[var(--success-subtle)] text-[var(--success)]",
  warning: "border-[var(--warning-border)] bg-[var(--warning-subtle)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] bg-[var(--danger-subtle)] text-[var(--danger)]",
};

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  state?: FeedbackState;
};

export function EmptyState({ action, className, description, icon = <Inbox size={18} />, state = "empty", title, ...props }: EmptyStateProps) {
  return (
    <div {...props} className={cx("mx-auto flex w-full max-w-md flex-col items-center px-5 py-8 text-center", className)} data-ui-feedback data-state={state}>
      <div className={cx("flex h-10 w-10 items-center justify-center rounded-[5px] border", stateIconClasses[state])}>{icon}</div>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type ErrorStateProps = Omit<EmptyStateProps, "icon" | "action" | "state"> & {
  onRetry?: () => void;
  retryLabel?: string;
  state?: Extract<FeedbackState, "restricted" | "unavailable" | "danger">;
};

export function ErrorState({ description, onRetry, retryLabel = "Tentar novamente", state = "danger", title, ...props }: ErrorStateProps) {
  return (
    <EmptyState
      {...props}
      action={onRetry ? <Button onClick={onRetry} size="sm" variant="secondary">{retryLabel}</Button> : undefined}
      description={description}
      icon={<AlertCircle size={18} />}
      state={state}
      title={title}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cx("animate-pulse rounded-[5px] bg-[var(--surface-subtle)]", className)} />;
}

export function LoadingState({ className, label = "Carregando", rows = 3 }: { className?: string; label?: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className={cx("grid gap-2", className)} data-ui-feedback data-state="loading" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => <Skeleton className="h-16 w-full" key={index} />)}
    </div>
  );
}
