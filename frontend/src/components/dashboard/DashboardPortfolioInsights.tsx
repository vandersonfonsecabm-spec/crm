import { AlertTriangle, ArrowRight, Clock3, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiDashboardSummary } from "../../services/crmApi";
import type { Client, SmartFilterType, Status } from "../../types/dashboard";
import { classifyNextFollowUp, formatNextFollowUp } from "../../utils/followUpProjection";
import { Badge, Button, EmptyState, SectionHeader, Surface } from "../ui";

type DashboardPortfolioInsightsProps = {
  clients: Client[];
  money: (value: number) => string;
  getPriority: (client: Client) => string;
  getRisk: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  enterpriseHealthLabel: (client: Client) => string;
  onOpenClient: (clientId: number) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
  summary: ApiDashboardSummary | null;
};

const pipelineStages: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

export default function DashboardPortfolioInsights({
  clients,
  money,
  getPriority,
  getRisk,
  getLeadScore,
  enterpriseHealthLabel,
  onOpenClient,
  onApplySmartFilter,
  summary,
}: DashboardPortfolioInsightsProps) {
  const attentionClients = [...clients]
    .filter((client) => client.hot || getPriority(client) === "Alta" || getRisk(client) === "Alto" || client.lastContactDays >= 7)
    .sort((a, b) => attentionWeight(b, getPriority, getRisk, getLeadScore) - attentionWeight(a, getPriority, getRisk, getLeadScore))
    .slice(0, 5);
  const highRiskCount = summary?.analytics.highRiskCount ?? clients.filter((client) => getRisk(client) === "Alto").length;
  const highAttentionCount = summary?.analytics.hotCount ?? clients.filter((client) => client.hot || getPriority(client) === "Alta").length;
  const hotOpportunities = summary?.analytics.hotCount ?? clients.filter((client) => client.hot || client.value >= 12000).length;
  const silentClients = summary?.analytics.silentCount ?? clients.filter((client) => client.lastContactDays >= 7).length;
  const proposalValue = summary?.status.find((item) => item.status === "Proposta")?.valor
    ?? clients.filter((client) => client.status === "Proposta").reduce((sum, client) => sum + client.value, 0);
  const activeClients = summary?.analytics.activePipeline ?? clients.filter((client) => client.status !== "Fechado" && client.status !== "Perdido").length;
  const totalClients = summary?.indicadores.clientes ?? clients.length;
  const suggestedAction = highRiskCount > 0
    ? "Reativar clientes em risco antes de criar novas oportunidades."
    : (summary?.analytics.todayFollowUps ?? clients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TODAY").length) > 0
      ? "Priorizar acompanhamentos de hoje e propostas abertas."
      : "Revisar oportunidades quentes e manter cadência comercial.";

  return (
    <Surface className="min-w-0 overflow-hidden">
      <SectionHeader
        actions={<Badge variant={highAttentionCount > 0 ? "warning" : "success"}>{highAttentionCount} em atenção</Badge>}
        description="Clientes e oportunidades que pedem uma próxima ação."
        icon={<AlertTriangle size={16} />}
        title="Prioridades comerciais"
      />

      <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
        <div className="min-w-0">
          {attentionClients.length > 0 ? (
            <div className="divide-y divide-[var(--border-default)]">
              {attentionClients.map((client) => (
                <button
                  aria-label={`Abrir ${client.name}, próxima ação ${formatNextFollowUp(client.nextFollowUp)}`}
                  className="grid w-full min-w-0 gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] md:grid-cols-[minmax(0,1fr)_132px_124px] md:items-center"
                  key={client.id}
                  onClick={() => onOpenClient(client.id)}
                  type="button"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={client.name}>{client.name}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{client.company} · {attentionReason(client, getRisk)} · {enterpriseHealthLabel(client)}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] text-[var(--text-muted)]">Próxima ação</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-secondary)]">{formatNextFollowUp(client.nextFollowUp)}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <div className="text-right tabular-nums">
                      <p className="text-[11px] text-[var(--text-muted)]">{money(client.value)}</p>
                      <p className="text-[11px] font-medium text-[var(--text-secondary)]">Score {getLeadScore(client)}</p>
                    </div>
                    <ArrowRight aria-hidden="true" className="text-[var(--icon-muted)]" size={14} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState description="Não há clientes em risco, atrasados ou marcados como prioridade." title="Fila de atenção em dia" />
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] px-4 py-3">
            <Button onClick={() => onApplySmartFilter("risk")} size="sm" variant="ghost">Ver riscos ({highRiskCount})</Button>
            <Button onClick={() => onApplySmartFilter("proposal")} size="sm" variant="ghost">Ver propostas</Button>
            <Button onClick={() => onApplySmartFilter("silent")} size="sm" variant="ghost">Sem contato ({silentClients})</Button>
          </div>
        </div>

        <aside className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] p-4 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">Resumo comercial</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Distribuição atual do pipeline.</p>
            </div>
            <Target className="text-[var(--icon-muted)]" size={15} />
          </div>

          <div className="mt-4 space-y-3">
            {pipelineStages.map((stage) => {
              const stageSummary = summary?.status.find((item) => item.status === stage);
              const stageCount = stageSummary?.total ?? clients.filter((client) => client.status === stage).length;
              const stageValue = stageSummary?.valor
                ?? clients.filter((client) => client.status === stage).reduce((sum, client) => sum + client.value, 0);
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-medium text-[var(--text-secondary)]">{stage}</span>
                    <span className="text-[var(--text-muted)]">{stageCount} · {money(stageValue)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(stageCount > 0 ? 8 : 0, (stageCount / Math.max(totalClients, 1)) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-default)] pt-4">
            <SummaryValue icon={<Users size={13} />} label="Ativos" value={String(activeClients)} />
            <SummaryValue icon={<AlertTriangle size={13} />} label="Risco" value={String(highRiskCount)} />
            <SummaryValue label="Quentes" value={String(hotOpportunities)} />
            <SummaryValue icon={<Clock3 size={13} />} label="Propostas" value={money(proposalValue)} />
          </dl>

          <p className="mt-4 border-t border-[var(--border-default)] pt-3 text-[11px] leading-4 text-[var(--text-muted)]">
            <strong className="font-medium text-[var(--text-secondary)]">Ação sugerida:</strong> {suggestedAction}
          </p>

        </aside>
      </div>
    </Surface>
  );
}

function SummaryValue({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[var(--icon-muted)]">{icon}<dt className="text-[11px] text-[var(--text-muted)]">{label}</dt></div>
      <dd className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function attentionReason(client: Client, getRisk: (client: Client) => string) {
  if (getRisk(client) === "Alto") return "Risco alto";
  if (client.lastContactDays >= 7) return `${client.lastContactDays} dias sem contato`;
  if (client.status === "Proposta") return "Proposta em aberto";
  if (client.hot) return "Oportunidade quente";
  return "Prioridade comercial";
}

function attentionWeight(client: Client, getPriority: (client: Client) => string, getRisk: (client: Client) => string, getLeadScore: (client: Client) => number) {
  return (getRisk(client) === "Alto" ? 300 : 0) + (getPriority(client) === "Alta" ? 200 : 0) + (client.hot ? 100 : 0) + client.lastContactDays + getLeadScore(client);
}
