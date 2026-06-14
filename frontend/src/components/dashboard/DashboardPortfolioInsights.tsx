import { Activity, AlertTriangle, Flame } from "lucide-react";
import type { ReactNode } from "react";
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
    <section className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="saas-panel rounded-2xl p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Leitura executiva</p>
            <p className="mt-1 text-[11px] text-slate-500">Saúde, atenção e risco sem disputar com os indicadores principais.</p>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px] font-semibold">síntese</span>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <InsightMetric
            icon={<Activity size={14} className="text-sky-300" />}
            label="Carteira ativa"
            value={String(activeClientsCount)}
            progress={Math.min(100, (activeClientsCount / Math.max(clients.length, 1)) * 100)}
            tone="sky"
          />
          <InsightMetric
            icon={<Flame size={14} className="text-rose-300" />}
            label="Alta atenção"
            value={String(highAttentionCount)}
            progress={Math.min(100, highAttentionCount * 14)}
            tone="rose"
          />
          <InsightMetric
            icon={<AlertTriangle size={14} className="text-amber-300" />}
            label="Requer ação"
            value={String(highRiskCount)}
            progress={Math.min(100, highRiskCount * 18)}
            tone="amber"
          />
        </div>

        <div className="mt-3 grid gap-2">
          {clients
            .filter((client) => client.hot || getLeadScore(client) >= 80)
            .slice(0, 2)
            .map((client) => (
              <button
                key={client.id}
                onClick={() => onSelectClient(client.id)}
                className="saas-row rounded-xl px-3 py-2 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                  <span className="saas-chip rounded-full px-2 py-0.5 text-[9px]">{getLeadScore(client)}</span>
                </div>

                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {client.company} | {money(client.value)}
                </p>
              </button>
            ))}
        </div>
      </div>

      <div className="saas-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Prioridades comerciais</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Oportunidades que pedem decisão rápida.</p>
          </div>
          <span className="text-[11px] text-slate-500">top 3</span>
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
                className="saas-row w-full rounded-xl p-2.5 text-left"
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

function InsightMetric({
  icon,
  label,
  value,
  progress,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  progress: number;
  tone: "sky" | "rose" | "amber";
}) {
  const classes = {
    sky: "metric-revenue text-sky-100",
    rose: "metric-risk text-rose-100",
    amber: "metric-forecast text-amber-100",
  };

  const barClasses = {
    sky: "bg-sky-300",
    rose: "bg-rose-300",
    amber: "bg-amber-300",
  };

  return (
    <div className={`metric-card rounded-xl px-3 py-2.5 ${classes[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="truncate text-[9px] uppercase tracking-[0.12em] opacity-70">{label}</p>
        {icon}
      </div>

      <p className="mt-1 text-base font-semibold">{value}</p>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${barClasses[tone]}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
