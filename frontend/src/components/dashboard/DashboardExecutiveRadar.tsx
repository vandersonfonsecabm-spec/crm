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

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KanbanSquare size={15} className="text-slate-400" />
          <div>
            <p className="text-sm font-semibold">Radar executivo</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Prioridades rapidas do funil</p>
          </div>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-400">ao vivo</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <RadarMetric label="Risco alto" value={`${highRiskClients.length} leads`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-200" />} />
        <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-200" />} />
        <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} acoes`} tone="sky" icon={<Activity size={12} className="text-sky-200" />} />
        <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-violet-200" />} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
        <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
        <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-200">Acao sugerida</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              {highRiskClients.length > 0
                ? "Reativar clientes em risco antes de criar novas oportunidades."
                : analytics.todayFollowUps > 0
                  ? "Priorizar follow-ups de hoje e propostas abertas."
                  : "Revisar oportunidades quentes e manter cadencia comercial."}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-400">
            prioridade
          </span>
        </div>
      </div>

      {topOpportunity && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold text-slate-200">{topOpportunity.name}</p>
              <p className="mt-0.5 truncate text-[9px] text-slate-500">{topOpportunity.company}</p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[9px] text-slate-500">Maior ticket</p>
              <p className="text-[10px] font-semibold text-slate-200">{money(topOpportunity.value)}</p>
            </div>
          </div>
        </div>
      )}

      {silentClients.length > 0 && (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[10px] text-slate-500">
          {silentClients.length} cliente(s) sem contato recente pedem atencao.
        </p>
      )}
    </div>
  );
}
