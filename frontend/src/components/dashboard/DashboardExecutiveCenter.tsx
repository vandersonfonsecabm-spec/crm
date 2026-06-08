import DashboardExecutiveAnalytics from "./DashboardExecutiveAnalytics";
import DashboardExecutiveSummary from "./DashboardExecutiveSummary";
import type { Analytics, Client } from "../../types/dashboard";

type DashboardExecutiveCenterProps = {
  analytics: Analytics;
  clients: Client[];
  money: (value: number) => string;
  initials: (name: string) => string;
  leadOwner: (client: Client) => string;
  getLeadScore: (client: Client) => number;
};

export default function DashboardExecutiveCenter({
  analytics,
  clients,
  money,
  initials,
  leadOwner,
  getLeadScore,
}: DashboardExecutiveCenterProps) {
  const hotLeads = clients.filter((client) => client.hot || getLeadScore(client) >= 80).length;
  const activePipeline = clients.filter((client) => client.status !== "Fechado" && client.status !== "Perdido").length;
  const riskSignal = clients.filter((client) => client.lastContactDays >= 7).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.035] to-transparent px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Centro executivo</p>

              <span className="rounded-full border border-emerald-300/15 bg-emerald-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-emerald-100">
                visão consolidada
              </span>
            </div>

            <p className="mt-0.5 text-[10px] text-slate-500">
              Analytics, prioridade comercial e resumo de performance em um único bloco.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ExecutiveSignal label="Pipeline" value={`${activePipeline} ativos`} />
            <ExecutiveSignal label="Quentes" value={`${hotLeads} leads`} />
            <ExecutiveSignal label="Atenção" value={`${riskSignal} sinais`} />
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <DashboardExecutiveAnalytics
          analytics={analytics}
          clients={clients}
          money={money}
          initials={initials}
          leadOwner={leadOwner}
          getLeadScore={getLeadScore}
        />

        <DashboardExecutiveSummary analytics={analytics} />
      </div>
    </section>
  );
}

function ExecutiveSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-right">
      <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}
