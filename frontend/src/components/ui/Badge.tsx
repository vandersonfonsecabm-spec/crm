import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]",
  primary: "border-[var(--brand-border)] bg-[var(--brand-subtle)] text-[var(--brand)]",
  success: "border-[var(--success-border)] bg-[var(--success-subtle)] text-[var(--success)]",
  warning: "border-[var(--warning-border)] bg-[var(--warning-subtle)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] bg-[var(--danger-subtle)] text-[var(--danger)]",
  info: "border-[var(--info-border)] bg-[var(--info-subtle)] text-[var(--info)]",
};

export function Badge({ children, className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx("inline-flex min-h-5 items-center rounded-[5px] border px-2 py-0.5 text-[11px] font-medium leading-none", badgeClasses[variant], className)}
    >
      {children}
    </span>
  );
}

export type StatusBadgeStatus =
  | "ativo"
  | "inativo"
  | "conectado"
  | "desconectado"
  | "sucesso"
  | "alerta"
  | "erro"
  | "informacao"
  | "indisponivel"
  | "planejado";

const statusMap: Record<StatusBadgeStatus, { label: string; variant: BadgeVariant; dot: string }> = {
  ativo: { label: "Ativo", variant: "success", dot: "bg-[var(--success)]" },
  inativo: { label: "Inativo", variant: "neutral", dot: "bg-[var(--text-tertiary)]" },
  conectado: { label: "Conectado", variant: "success", dot: "bg-[var(--success)]" },
  desconectado: { label: "Desconectado", variant: "neutral", dot: "bg-[var(--text-tertiary)]" },
  sucesso: { label: "Sucesso", variant: "success", dot: "bg-[var(--success)]" },
  alerta: { label: "Alerta", variant: "warning", dot: "bg-[var(--warning)]" },
  erro: { label: "Erro", variant: "danger", dot: "bg-[var(--danger)]" },
  informacao: { label: "Informação", variant: "info", dot: "bg-[var(--info)]" },
  indisponivel: { label: "Indisponível", variant: "neutral", dot: "bg-[var(--text-tertiary)]" },
  planejado: { label: "Planejado", variant: "info", dot: "bg-[var(--info)]" },
};

export function StatusBadge({ className, label, status }: { className?: string; label?: ReactNode; status: StatusBadgeStatus }) {
  const config = statusMap[status];
  return (
    <Badge className={cx("gap-1.5", className)} variant={config.variant}>
      <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", config.dot)} />
      {label ?? config.label}
    </Badge>
  );
}
