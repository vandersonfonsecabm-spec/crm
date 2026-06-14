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
    <div className="saas-panel rounded-2xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
            <GitBranch size={16} />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold">Comando do funil</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Leitura executiva do funil sem ocupar espaço das colunas.
            </p>
          </div>
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto xl:grid-cols-6">
          <KanbanCommandPill icon={<Target size={12} />} label="Gargalo" value={biggestBottleneck} tone="default" />
          <KanbanCommandPill icon={<Flame size={12} />} label="Prioridade" value={`${hotLeads} oportunidades`} tone="amber" />
          <KanbanCommandPill icon={<GitBranch size={12} />} label="Propostas" value={`${proposalLeads} abertas`} tone="default" />
          <KanbanCommandPill icon={<AlertTriangle size={12} />} label="Silenciosos" value={`${stalledLeads} oportunidades`} tone="rose" />
          <KanbanCommandPill icon={<BadgeDollarSign size={12} />} label="Receita prevista" value={money(expectedRevenue)} tone="emerald" />
          <KanbanCommandPill icon={<TrendingUp size={12} />} label="Conversão" value={`${conversionRate}%`} tone="sky" />
        </div>
      </div>
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
  tone: "default" | "amber" | "violet" | "rose" | "emerald" | "sky";
}) {
  const tones = {
    default: "metric-card text-slate-200",
    amber: "metric-card metric-forecast text-amber-100",
    violet: "metric-card text-slate-200",
    rose: "metric-card metric-risk text-rose-100",
    emerald: "metric-card metric-pipeline text-emerald-100",
    sky: "metric-card metric-revenue text-sky-100",
  };

  return (
    <div className={`rounded-xl px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] opacity-65">{label}</p>
        {icon}
      </div>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
