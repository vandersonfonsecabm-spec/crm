import { AlertTriangle, ArrowUpRight, Gauge, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiDashboardSummary } from "../../services/crmApi";
import type { Client, Status } from "../../types/dashboard";
import { classifyNextFollowUp } from "../../utils/followUpProjection";
import { Badge, SectionHeader, Surface } from "../ui";

type DashboardClientsInsightsProps = {
  clients: Client[];
  filteredClients: Client[];
  statusList: Status[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  onSelectClient: (clientId: number) => void;
  summary: ApiDashboardSummary | null;
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
  summary,
}: DashboardClientsInsightsProps) {
  const baseClients = filteredClients.length > 0 ? filteredClients : clients;
  const totalPotential = summary?.analytics.totalValue ?? baseClients.reduce((sum, client) => sum + client.value, 0);
  const hotClients = summary?.analytics.hotCount ?? baseClients.filter((client) => client.hot || getLeadScore(client) >= 80).length;
  const riskClients = summary?.analytics.highRiskCount ?? baseClients.filter((client) => getRisk(client) === "Alto").length;
  const todayFollowUps = summary?.analytics.todayFollowUps ?? baseClients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TODAY").length;
  const topOpportunity = [...baseClients].sort((a, b) => b.value - a.value)[0] || null;
  const bestScore = [...baseClients].sort((a, b) => getLeadScore(b) - getLeadScore(a))[0] || null;
  const totalClients = summary?.indicadores.clientes ?? clients.length;
  const conversionRate = summary?.analytics.conversionRate
    ?? Math.round((clients.filter((client) => client.status === "Fechado").length / Math.max(1, clients.length)) * 100);

  return (
    <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-label="Leituras complementares da carteira">
      <Surface className="overflow-hidden">
        <SectionHeader
          actions={<Badge variant="neutral">{baseClients.length} nesta página</Badge>}
          description="Indicadores globais da carteira; destaques usam a página atual."
          icon={<Users size={16} />}
          title="Resumo da carteira"
        />
        <div className="grid grid-cols-2">
          <SummaryMetric caption="Receita em carteira" icon={<Target size={14} />} label="Potencial" value={money(totalPotential)} />
          <SummaryMetric caption="Oportunidades prioritárias" className="border-l border-[var(--border-default)]" label="Quentes" tone="warning" value={`${hotClients} clientes`} />
          <SummaryMetric caption="Risco alto" className="border-t border-[var(--border-default)]" icon={<AlertTriangle size={14} />} label="Atenção" tone="danger" value={`${riskClients} clientes`} />
          <SummaryMetric caption="Acompanhamentos do dia" className="border-l border-t border-[var(--border-default)]" icon={<Users size={14} />} label="Hoje" tone="info" value={`${todayFollowUps} ações`} />
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <SectionHeader
          actions={<Badge variant="neutral">Conversão {conversionRate}%</Badge>}
          description="Oportunidades de maior impacto e distribuição do funil."
          icon={<Gauge size={16} />}
          title="Inteligência comercial"
        />
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.8fr)_minmax(240px,1.2fr)]">
          <div className="min-w-0 divide-y divide-[var(--border-default)]">
            {topOpportunity && (
              <InsightButton
                badge={topOpportunity.status}
                badgeClass={statusClass(topOpportunity.status)}
                label="Maior oportunidade na página"
                onClick={() => onSelectClient(topOpportunity.id)}
                subtitle={topOpportunity.company}
                title={topOpportunity.name}
                value={money(topOpportunity.value)}
              />
            )}
            {bestScore && (
              <InsightButton
                badge="Score"
                badgeClass="border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                label="Melhor score na página"
                onClick={() => onSelectClient(bestScore.id)}
                subtitle={bestScore.company}
                title={bestScore.name}
                value={`${getLeadScore(bestScore)}/100`}
              />
            )}
          </div>

          <div className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] p-4 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Distribuição por status</p>
              <span className="text-[11px] text-[var(--text-muted)]">{totalClients} total</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {statusList.map((status) => {
                const count = summary?.status.find((item) => item.status === status)?.total
                  ?? clients.filter((client) => client.status === status).length;
                const percentage = Math.round((count / Math.max(1, totalClients)) * 100);
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-medium text-[var(--text-secondary)]">{status}</span>
                      <span className="tabular-nums text-[var(--text-muted)]">{count} · {percentage}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                      <div className="h-full rounded-full bg-[var(--border-strong)]" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Surface>
    </section>
  );
}

function SummaryMetric({ caption, className = "", icon, label, tone = "default", value }: { caption: string; className?: string; icon?: ReactNode; label: string; tone?: "default" | "warning" | "danger" | "info"; value: string }) {
  const toneClass = tone === "warning" ? "text-[var(--warning)]" : tone === "danger" ? "text-[var(--danger)]" : tone === "info" ? "text-[var(--info)]" : "text-[var(--text-primary)]";
  return (
    <div className={`min-w-0 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-[var(--icon-muted)]">
        <p className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</p>
        {icon}
      </div>
      <p className={`mt-1.5 truncate text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{caption}</p>
    </div>
  );
}

function InsightButton({ badge, badgeClass, label, onClick, subtitle, title, value }: { badge: string; badgeClass: string; label: string; onClick: () => void; subtitle: string; title: string; value: string }) {
  return (
    <button
      aria-label={`${label}: ${title}`}
      className="group w-full px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <ArrowUpRight aria-hidden="true" className="shrink-0 text-[var(--icon-muted)] group-hover:text-[var(--primary)]" size={14} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-[var(--primary)]">{value}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badgeClass}`}>{badge}</span>
      </div>
    </button>
  );
}
