import type { ReactNode } from "react";
import { Badge } from "../ui";
import type { ConversationStatus, LeadStatus } from "../../services/crmApi";
import { conversationStatusLabels, leadStatusLabels } from "./communicationFormatters";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const variant = status === "QUALIFICADO" ? "success" : status === "DESQUALIFICADO" || status === "CONVERTIDO" ? "neutral" : status === "EM_ATENDIMENTO" ? "info" : "primary";
  return <Badge variant={variant}>{leadStatusLabels[status]}</Badge>;
}

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const variant = status === "AGUARDANDO_ATENDIMENTO" || status === "NOVA" ? "warning" : status === "EM_ATENDIMENTO" || status === "AGUARDANDO_CLIENTE" ? "info" : status === "ENCERRADA" ? "neutral" : "primary";
  return <Badge variant={variant}>{conversationStatusLabels[status]}</Badge>;
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 border-b border-[var(--border-default)] py-2 last:border-b-0">
      <dt className="text-[11px] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 text-[11px] font-medium text-[var(--text-primary)]">{value || "Não informado"}</dd>
    </div>
  );
}
