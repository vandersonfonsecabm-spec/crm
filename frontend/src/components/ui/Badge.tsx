import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]",
  primary: "border-emerald-200 bg-emerald-50 text-emerald-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function Badge({ children, className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx("inline-flex min-h-5 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none", badgeClasses[variant], className)}
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
  ativo: { label: "Ativo", variant: "success", dot: "bg-emerald-600" },
  inativo: { label: "Inativo", variant: "neutral", dot: "bg-slate-500" },
  conectado: { label: "Conectado", variant: "success", dot: "bg-emerald-600" },
  desconectado: { label: "Desconectado", variant: "neutral", dot: "bg-slate-500" },
  sucesso: { label: "Sucesso", variant: "success", dot: "bg-emerald-600" },
  alerta: { label: "Alerta", variant: "warning", dot: "bg-amber-600" },
  erro: { label: "Erro", variant: "danger", dot: "bg-rose-600" },
  informacao: { label: "Informação", variant: "info", dot: "bg-sky-600" },
  indisponivel: { label: "Indisponível", variant: "neutral", dot: "bg-slate-500" },
  planejado: { label: "Planejado", variant: "info", dot: "bg-sky-600" },
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
