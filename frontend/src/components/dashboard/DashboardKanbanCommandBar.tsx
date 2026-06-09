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
        <div>
          <p className="text-sm font-semibold">Comando do Kanban</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Leitura executiva do funil sem ocupar espaço das colunas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <KanbanCommandPill label="Gargalo" value={biggestBottleneck} tone="default" />
          <KanbanCommandPill label="Prioridade" value={`${hotLeads} leads`} tone="amber" />
          <KanbanCommandPill label="Propostas" value={`${proposalLeads} abertas`} tone="default" />
          <KanbanCommandPill label="Silenciosos" value={`${stalledLeads} leads`} tone="rose" />
          <KanbanCommandPill label="Receita prevista" value={money(expectedRevenue)} tone="emerald" />
          <KanbanCommandPill label="Conversao" value={`${conversionRate}%`} tone="sky" />
        </div>
      </div>
    </div>
  );
}

function KanbanCommandPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "amber" | "violet" | "rose" | "emerald" | "sky";
}) {
  const tones = {
    default: "border-slate-500/16 bg-slate-950/25 text-slate-200",
    amber: "border-slate-500/16 bg-slate-950/25 text-amber-100 shadow-[inset_2px_0_0_rgba(214,162,58,0.42)]",
    violet: "border-slate-500/16 bg-slate-950/25 text-slate-200",
    rose: "border-slate-500/16 bg-slate-950/25 text-rose-100 shadow-[inset_2px_0_0_rgba(224,105,123,0.4)]",
    emerald: "border-slate-500/16 bg-slate-950/25 text-emerald-100 shadow-[inset_2px_0_0_rgba(16,185,129,0.42)]",
    sky: "border-slate-500/16 bg-slate-950/25 text-sky-100 shadow-[inset_2px_0_0_rgba(56,189,248,0.38)]",
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[9px] opacity-65">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
