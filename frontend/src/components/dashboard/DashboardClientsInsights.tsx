import { AlertTriangle, ArrowUpRight, Flame, Gauge, Target, Users } from "lucide-react";
import MetricCard from "./MetricCard";
import type { Client, Status } from "../../types/dashboard";

type DashboardClientsInsightsProps = {
  clients: Client[];
  filteredClients: Client[];
  statusList: Status[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardClientsInsights({
  clients,
  filteredClients,
  statusList,
  money,
  statusClass,
  getRisk,
  getLeadScore,
  onSelectClient,
}: DashboardClientsInsightsProps) {
  const baseClients = filteredClients.length > 0 ? filteredClients : clients;
  const totalPotential = baseClients.reduce((sum, client) => sum + client.value, 0);
  const hotClients = baseClients.filter((client) => client.hot || getLeadScore(client) >= 80);
  const riskClients = baseClients.filter((client) => getRisk(client) === "Alto");
  const todayFollowUps = baseClients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje");
  const topOpportunity = [...baseClients].sort((a, b) => b.value - a.value)[0] || null;
  const bestScore = [...baseClients].sort((a, b) => getLeadScore(b) - getLeadScore(a))[0] || null;

  const wonClients = clients.filter((client) => client.status === "Fechado").length;
  const conversionRate = Math.round((wonClients / Math.max(1, clients.length)) * 100);

  return (
    <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
      <div className="saas-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Resumo da carteira</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Leitura rapida da carteira atual, sem disputar atencao com a lista.
            </p>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
            {baseClients.length} analisados
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <MetricCard compact title="Potencial" value={money(totalPotential)} caption="Receita em carteira" icon={<Target size={14} />} tone="pipeline" />
          <MetricCard compact title="Quentes" value={`${hotClients.length} clientes`} caption="Oportunidades prioritarias" icon={<Flame size={14} />} tone="risk" />
          <MetricCard compact title="Atencao" value={`${riskClients.length} clientes`} caption="Risco alto" icon={<AlertTriangle size={14} />} tone="forecast" />
          <MetricCard compact title="Hoje" value={`${todayFollowUps.length} acoes`} caption="Follow-ups do dia" icon={<Users size={14} />} tone="revenue" />
        </div>
      </div>

      <div className="saas-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Inteligencia comercial</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Destaques automaticos da carteira atual.
            </p>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
            Conversao {conversionRate}%
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-2">
            {topOpportunity && (
              <InsightButton
                label="Maior oportunidade"
                title={topOpportunity.name}
                subtitle={topOpportunity.company}
                value={money(topOpportunity.value)}
                badge={topOpportunity.status}
                badgeClass={statusClass(topOpportunity.status)}
                onClick={() => onSelectClient(topOpportunity.id)}
              />
            )}

            {bestScore && (
              <InsightButton
                label="Melhor score"
                title={bestScore.name}
                subtitle={bestScore.company}
                value={`${getLeadScore(bestScore)}/100`}
                badge="score"
                badgeClass="border-teal-300/20 bg-teal-300/[0.08] text-teal-100"
                onClick={() => onSelectClient(bestScore.id)}
              />
            )}
          </div>

          <div className="metric-card rounded-xl p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge size={14} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-200">Distribuicao por status</p>
              </div>
              <span className="text-[10px] text-slate-500">{clients.length} total</span>
            </div>

            <div className="space-y-2">
              {statusList.map((status) => {
                const count = clients.filter((client) => client.status === status).length;
                const percentage = Math.round((count / Math.max(1, clients.length)) * 100);

                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">{status}</span>
                      <span className="text-slate-500">
                        {count} - {percentage}%
                      </span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-slate-300" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InsightButton({
  label,
  title,
  subtitle,
  value,
  badge,
  badgeClass,
  onClick,
}: {
  label: string;
  title: string;
  subtitle: string;
  value: string;
  badge: string;
  badgeClass: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="saas-row w-full rounded-xl p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-100">{title}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</p>
        </div>

        <ArrowUpRight size={14} className="shrink-0 text-slate-500" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-teal-100">{value}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${badgeClass}`}>
          {badge}
        </span>
      </div>
    </button>
  );
}
