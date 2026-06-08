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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Comando do Kanban</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Leitura executiva do funil sem ocupar espaco das colunas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <KanbanCommandPill label="Gargalo" value={biggestBottleneck} tone="default" />
          <KanbanCommandPill label="Prioridade" value={`${hotLeads} leads`} tone="amber" />
          <KanbanCommandPill label="Propostas" value={`${proposalLeads} abertas`} tone="violet" />
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
    default: "border-white/10 bg-black/20 text-slate-200",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    violet: "border-violet-400/10 bg-violet-500/[0.055] text-violet-100",
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    emerald: "border-emerald-400/10 bg-emerald-500/[0.055] text-emerald-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[9px] opacity-65">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
