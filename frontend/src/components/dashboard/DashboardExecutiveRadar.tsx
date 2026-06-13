import { Activity, AlertTriangle, KanbanSquare, Sparkles, Target } from "lucide-react";
import type { Analytics, Client, SmartFilterType } from "../../types/dashboard";
import { FilterAction, RadarMetric } from "./DashboardDrawerPrimitives";

type DashboardExecutiveRadarProps = {
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  getRisk: (client: Client) => string;
  onApplySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardExecutiveRadar({
  clients,
  analytics,
  money,
  getRisk,
  onApplySmartFilter,
}: DashboardExecutiveRadarProps) {
  const hotOpportunities = clients.filter((client) => client.hot || client.value >= 12000);
  const silentClients = clients.filter((client) => client.lastContactDays >= 7);
  const highRiskClients = clients.filter((client) => getRisk(client) === "Alto");
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  const topOpportunity = [...clients].sort((a, b) => b.value - a.value)[0];
  const suggestedAction =
    highRiskClients.length > 0
      ? "Reativar clientes em risco antes de criar novas oportunidades."
      : analytics.todayFollowUps > 0
        ? "Priorizar follow-ups de hoje e propostas abertas."
        : "Revisar oportunidades quentes e manter cadência comercial.";

  return (
    <div className="saas-panel rounded-2xl p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.06] text-teal-100">
            <KanbanSquare size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">Radar executivo</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Prioridades rápidas do funil</p>
          </div>
        </div>

        <span className="saas-chip shrink-0 rounded-full px-2 py-1 text-[9px]">ao vivo</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <RadarMetric label="Risco alto" value={`${highRiskClients.length} leads`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-200" />} />
        <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-200" />} />
        <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} ações`} tone="sky" icon={<Activity size={12} className="text-sky-200" />} />
        <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-slate-300" />} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
        <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
        <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
      </div>

      <div className="metric-card mt-2 rounded-xl p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ação sugerida</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{suggestedAction}</p>
          </div>

          <span className="saas-chip shrink-0 rounded-full px-2 py-0.5 text-[9px]">prioridade</span>
        </div>
      </div>

      {topOpportunity && (
        <button
          type="button"
          className="saas-row mt-2 w-full rounded-xl p-2 text-left"
          onClick={() => onApplySmartFilter("proposal")}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold text-slate-200">{topOpportunity.name}</p>
              <p className="mt-0.5 truncate text-[9px] text-slate-500">{topOpportunity.company}</p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Maior ticket</p>
              <p className="text-[10px] font-semibold text-slate-200">{money(topOpportunity.value)}</p>
            </div>
          </div>
        </button>
      )}

      {silentClients.length > 0 && (
        <p className="metric-card mt-2 rounded-xl px-2 py-1.5 text-[10px] text-slate-500">
          {silentClients.length} cliente(s) sem contato recente pedem atenção.
        </p>
      )}
    </div>
  );
}
