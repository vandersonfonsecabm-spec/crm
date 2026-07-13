import { AlertTriangle, BadgeDollarSign, Flame, GitBranch, Target, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { Client } from "../../types/dashboard";

type DashboardKanbanCommandBarProps = {
  clients: Client[];
  money: (value: number) => string;
  getLeadScore: (client: Client) => number;
};

export default function DashboardKanbanCommandBar({
  clients,
  money,
  getLeadScore,
}: DashboardKanbanCommandBarProps) {
  const hotLeads = clients.filter((client) => client.hot || getLeadScore(client) >= 80).length;
  const proposalLeads = clients.filter((client) => client.status === "Proposta").length;
  const stalledLeads = clients.filter((client) => client.lastContactDays >= 7).length;
  const contactCount = clients.filter((client) => client.status === "Contato").length;
  const proposalCount = clients.filter((client) => client.status === "Proposta").length;
  const biggestBottleneck = contactCount >= proposalCount ? "Contato" : "Proposta";
  const expectedRevenue = clients
    .filter((client) => client.status === "Proposta" || client.status === "Fechado")
    .reduce((sum, client) => sum + client.value, 0);
  const conversionRate = Math.max(
    1,
    Math.round((clients.filter((client) => client.status === "Fechado").length / Math.max(clients.length, 1)) * 100)
  );

  return (
    <div className="grid overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KanbanCommandPill icon={<Target size={12} />} label="Gargalo" value={biggestBottleneck} tone="default" />
      <KanbanCommandPill icon={<Flame size={12} />} label="Prioridade" value={`${hotLeads} oportunidades`} tone="warning" />
      <KanbanCommandPill icon={<GitBranch size={12} />} label="Propostas" value={`${proposalLeads} abertas`} tone="default" />
      <KanbanCommandPill icon={<AlertTriangle size={12} />} label="Silenciosos" value={`${stalledLeads} oportunidades`} tone="danger" />
      <KanbanCommandPill icon={<BadgeDollarSign size={12} />} label="Receita prevista" value={money(expectedRevenue)} tone="success" />
      <KanbanCommandPill icon={<TrendingUp size={12} />} label="Conversão" value={`${conversionRate}%`} tone="info" />
    </div>
  );
}

function KanbanCommandPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "default" | "warning" | "danger" | "success" | "info";
}) {
  const tones = {
    default: "text-[var(--text-primary)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    success: "text-[var(--success)]",
    info: "text-[var(--info)]",
  };

  return (
    <div className={`min-w-0 border-b border-[var(--border-default)] px-3 py-2 last:border-b-0 sm:border-r xl:border-b-0 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
        {icon}
      </div>
      <p className="mt-0.5 truncate text-[11px] font-semibold">{value}</p>
    </div>
  );
}
