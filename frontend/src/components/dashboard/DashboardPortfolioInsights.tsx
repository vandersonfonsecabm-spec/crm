import { Activity, AlertTriangle, Flame } from "lucide-react";
import type { Client } from "../../types/dashboard";

type DashboardPortfolioInsightsProps = {
  clients: Client[];
  money: (value: number) => string;
  getPriority: (client: Client) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  enterpriseHealthClass: (client: Client) => string;
  enterpriseHealthLabel: (client: Client) => string;
  onSelectClient: (clientId: number) => void;
  onOpenClient: (clientId: number) => void;
};

export default function DashboardPortfolioInsights({
  clients,
  money,
  getPriority,
  getRisk,
  getLeadScore,
  enterpriseHealthClass,
  enterpriseHealthLabel,
  onSelectClient,
  onOpenClient,
}: DashboardPortfolioInsightsProps) {
  const activeClientsCount = clients.filter((client) => client.status !== "Perdido").length;
  const highAttentionCount = clients.filter((client) => client.hot || getPriority(client) === "Alta").length;
  const highRiskCount = clients.filter((client) => getRisk(client) === "Alto").length;

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="premium-panel rounded-2xl p-4 transition-all duration-300 hover:border-cyan-200/18">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Qualidade da carteira</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Sinais rápidos de saúde comercial, prioridade e risco.
            </p>
          </div>

          <span className="rounded-full border border-emerald-400/10 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
            padrão premium
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-sky-300/12 bg-sky-300/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500">Carteira ativa</p>
              <Activity size={14} className="text-sky-300" />
            </div>

            <p className="mt-2 text-xl font-semibold">{activeClientsCount}</p>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-300"
                style={{
                  width: `${Math.min(100, (activeClientsCount / Math.max(clients.length, 1)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-rose-400/12 bg-rose-500/[0.05] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-rose-100/70">Alta atenção</p>
              <Flame size={14} className="text-rose-300" />
            </div>

            <p className="mt-2 text-xl font-semibold text-rose-50">{highAttentionCount}</p>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-rose-300"
                style={{ width: `${Math.min(100, highAttentionCount * 14)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-400/12 bg-amber-500/[0.05] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-amber-100/70">Requer ação</p>
              <AlertTriangle size={14} className="text-amber-300" />
            </div>

            <p className="mt-2 text-xl font-semibold text-amber-50">{highRiskCount}</p>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-300"
                style={{ width: `${Math.min(100, highRiskCount * 18)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {clients
            .filter((client) => client.hot || getLeadScore(client) >= 80)
            .slice(0, 3)
            .map((client) => (
              <button
                key={client.id}
                onClick={() => onSelectClient(client.id)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition-all duration-200 hover:-translate-y-px hover:border-cyan-200/18 hover:bg-cyan-300/[0.045]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                    {getLeadScore(client)}
                  </span>
                </div>

                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {client.company} • {money(client.value)}
                </p>
              </button>
            ))}
        </div>
      </div>

      <div className="premium-panel rounded-2xl p-4 transition-all duration-300 hover:border-cyan-200/18">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Sinais da carteira</p>
          <span className="text-[11px] text-slate-500">top leads</span>
        </div>

        <div className="space-y-2">
          {clients
            .slice()
            .sort((a, b) => getLeadScore(b) - getLeadScore(a))
            .slice(0, 3)
            .map((client) => (
              <button
                key={client.id}
                onClick={() => onOpenClient(client.id)}
                className="w-full rounded-xl border border-white/10 bg-black/20 p-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-cyan-200/18 hover:bg-cyan-300/[0.04]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">{client.company}</p>
                  </div>

                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${enterpriseHealthClass(client)}`}>
                    {enterpriseHealthLabel(client)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{money(client.value)}</span>
                  <span>{getLeadScore(client)}/100</span>
                </div>
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
