import { AlertTriangle, ArrowUpRight, Flame, Target, Users } from "lucide-react";
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
              Leitura rápida para ocupar a área operacional sem poluir a tabela.
            </p>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
            {baseClients.length} analisados
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="saas-tile saas-accent-emerald rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <Target size={14} className="text-emerald-300" />
              <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-100">Potencial</span>
            </div>
            <p className="text-[10px] text-emerald-100/60">Receita em carteira</p>
            <p className="mt-1 text-sm font-semibold text-emerald-100">{money(totalPotential)}</p>
          </div>

          <div className="saas-tile saas-accent-rose rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <Flame size={14} className="text-rose-300" />
              <span className="rounded-full bg-rose-300/10 px-2 py-0.5 text-[9px] text-rose-100">Quentes</span>
            </div>
            <p className="text-[10px] text-rose-100/60">Oportunidades prioritárias</p>
            <p className="mt-1 text-sm font-semibold text-rose-100">{hotClients.length} clientes</p>
          </div>

          <div className="saas-tile saas-accent-amber rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <AlertTriangle size={14} className="text-amber-300" />
              <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-100">Atenção</span>
            </div>
            <p className="text-[10px] text-amber-100/60">Clientes em risco alto</p>
            <p className="mt-1 text-sm font-semibold text-amber-100">{riskClients.length} clientes</p>
          </div>

          <div className="saas-tile saas-accent-sky rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <Users size={14} className="text-sky-300" />
              <span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-[9px] text-sky-100">Hoje</span>
            </div>
            <p className="text-[10px] text-sky-100/60">Follow-ups do dia</p>
            <p className="mt-1 text-sm font-semibold text-sky-100">{todayFollowUps.length} ações</p>
          </div>
        </div>
      </div>

      <div className="saas-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Inteligência comercial</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Destaques automáticos da carteira atual.
            </p>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
            Conversão {conversionRate}%
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-2">
            {topOpportunity && (
              <button
                onClick={() => onSelectClient(topOpportunity.id)}
                className="saas-row w-full rounded-xl p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500">Maior oportunidade</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-100">{topOpportunity.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">{topOpportunity.company}</p>
                  </div>

                  <ArrowUpRight size={14} className="shrink-0 text-slate-500" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-100">{money(topOpportunity.value)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] ${statusClass(topOpportunity.status)}`}>
                    {topOpportunity.status}
                  </span>
                </div>
              </button>
            )}

            {bestScore && (
              <button
                onClick={() => onSelectClient(bestScore.id)}
                className="saas-row w-full rounded-xl p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500">Melhor score</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-100">{bestScore.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">{bestScore.company}</p>
                  </div>

                  <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
                    {getLeadScore(bestScore)}
                  </span>
                </div>
              </button>
            )}
          </div>

          <div className="saas-card rounded-xl p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">Distribuição por status</p>
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
                      <span className="text-slate-500">{count} • {percentage}%</span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white/60" style={{ width: `${percentage}%` }} />
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
