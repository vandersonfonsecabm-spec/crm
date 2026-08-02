import { CalendarClock, ChevronRight } from "lucide-react";
import type { Client, SmartFilterType, Status } from "../../types/dashboard";
import { formatNextFollowUp } from "../../utils/followUpProjection";
import { Button, EmptyState, SectionHeader, Surface } from "../ui";

type FollowUpGroup = {
  label: string;
  hint: string;
  clients: Client[];
};

type DashboardControlCenterProps = {
  clients: Client[];
  analytics: {
    totalValue: number;
    forecastValue: number;
    hotCount: number;
    todayFollowUps: number;
  };
  backendCaption: string;
  emptyClient: Client;
  followUpAgenda: FollowUpGroup[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getPriority: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  setSelectedId: (clientId: number | null) => void;
  setCreating: (client: Client | null) => void;
  applySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardControlCenter({
  clients,
  analytics,
  backendCaption,
  emptyClient,
  followUpAgenda,
  money,
  statusClass,
  getPriority,
  getLeadScore,
  getRisk,
  setSelectedId,
  setCreating,
  applySmartFilter,
}: DashboardControlCenterProps) {
  const attentionClients = [...clients]
    .filter((client) => client.status !== "Fechado" && client.status !== "Perdido")
    .filter((client) => getRisk(client) === "Alto" || client.lastContactDays >= 7 || (client.hot && client.status === "Proposta") || getPriority(client) === "Alta")
    .sort((first, second) => attentionWeight(second, getPriority, getRisk, getLeadScore) - attentionWeight(first, getPriority, getRisk, getLeadScore))
    .slice(0, 6);
  const pipelineStages: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];
  const stageTotals = pipelineStages.map((status) => ({
    status,
    count: clients.filter((client) => client.status === status).length,
    value: clients.filter((client) => client.status === status).reduce((total, client) => total + client.value, 0),
  }));
  const pipelineValue = stageTotals.filter((stage) => stage.status !== "Fechado" && stage.status !== "Perdido").reduce((total, stage) => total + stage.value, 0);
  const riskValue = clients.filter((client) => getRisk(client) === "Alto").reduce((total, client) => total + client.value, 0);
  const nextClient = attentionClients[0] ?? followUpAgenda.flatMap((group) => group.clients)[0] ?? null;

  return (
    <div className="commercial-workbench space-y-3 pb-8">
      <Surface className="commercial-summary overflow-hidden">
        <div className="commercial-executive-heading">
          <div>
            <p className="commercial-eyebrow">Leitura executiva</p>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{backendCaption}</p>
          </div>
        </div>
        <dl className="commercial-metric-grid">
          <Metric label="Carteira total" value={money(analytics.totalValue)} detail={`${clients.length} registros carregados`} />
          <Metric label="Previsão aberta" value={money(analytics.forecastValue)} detail={`${analytics.hotCount} oportunidades prioritárias`} />
          <Metric label="Em risco alto" value={String(clients.filter((client) => getRisk(client) === "Alto").length)} detail={riskValue > 0 ? money(riskValue) : "Sem valor em risco"} tone={riskValue > 0 ? "danger" : undefined} />
          <Metric label="Agenda de hoje" value={String(analytics.todayFollowUps)} detail="Acompanhamentos previstos" />
        </dl>
      </Surface>

      <Surface className="commercial-immediate-focus overflow-hidden">
        {nextClient ? (
          <div className="commercial-focus-layout">
            <div className="min-w-0">
              <p className="commercial-eyebrow">Foco imediato</p>
              <div className="commercial-focus-name">
                <h2 className="truncate">{nextClient.name}</h2>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusClass(nextClient.status)}`}>{nextClient.status}</span>
              </div>
              <p className="mt-1 truncate text-[12px] text-[var(--text-secondary)]">{nextClient.company}</p>
            </div>
            <dl className="commercial-focus-details">
              <div><dt>Motivo</dt><dd>{attentionReason(nextClient, getRisk, getPriority)}</dd></div>
              <div><dt>Próxima ação</dt><dd>{formatNextFollowUp(nextClient.nextFollowUp)}</dd></div>
              <div><dt>Valor</dt><dd>{money(nextClient.value)}</dd></div>
            </dl>
            <Button className="commercial-focus-cta" onClick={() => setSelectedId(nextClient.id)} rightIcon={<ChevronRight aria-hidden="true" size={16} />} variant="primary">Abrir cliente</Button>
          </div>
        ) : (
          <div className="commercial-focus-empty">
            <div><p className="commercial-eyebrow">Foco imediato</p><h2>Nenhuma prioridade disponível</h2><p>Crie um cliente ou aguarde um acompanhamento previsto para começar a fila.</p></div>
            <Button onClick={() => setCreating({ ...emptyClient })} variant="primary">Novo cliente</Button>
          </div>
        )}
      </Surface>

      <Surface className="commercial-queue overflow-hidden">
        <SectionHeader
          actions={<Button onClick={() => applySmartFilter("risk")} size="sm" variant="ghost">Ver fila de risco</Button>}
          description="Registros que merecem decisão ou contato antes da próxima rodada comercial."
          title="Ações que exigem atenção"
        />
        {attentionClients.length > 0 ? (
          <div className="commercial-table" aria-label="Ações que exigem atenção">
            <div className="commercial-table-head">
              <span>Cliente</span><span>Motivo</span><span>Prazo</span><span>Valor</span><span className="sr-only">Ação</span>
            </div>
            {attentionClients.map((client) => (
              <button aria-label={`Abrir ${client.name}: ${attentionReason(client, getRisk, getPriority)}, ${formatNextFollowUp(client.nextFollowUp)}`} className="commercial-table-row" key={client.id} onClick={() => setSelectedId(client.id)} type="button">
                <span className="min-w-0 text-left"><strong className="block truncate">{client.name}</strong><small className="block truncate">{client.company}</small></span>
                <span className="commercial-row-reason text-left">{attentionReason(client, getRisk, getPriority)}</span>
                <span className="commercial-row-deadline text-left">{formatNextFollowUp(client.nextFollowUp)}</span>
                <span className="commercial-row-value">{money(client.value)}</span>
                <ChevronRight aria-hidden="true" className="commercial-row-arrow" size={16} />
              </button>
            ))}
          </div>
        ) : <EmptyState description="Não há registros críticos na página atual." title="Nenhuma ação pendente" />}
      </Surface>

      <Surface className="commercial-context-panel min-w-0 overflow-hidden">
        <section aria-label="Pipeline e previsão" className="commercial-pipeline-context">
          <SectionHeader
            description="Distribuição do valor carregado por etapa. Use como contexto para a fila, não como uma segunda prioridade."
            title="Pipeline e previsão"
          />
          <div className="commercial-pipeline-summary">
            <div><span>Pipeline em aberto</span><strong>{money(pipelineValue)}</strong></div>
            <div><span>Previsão aberta</span><strong>{money(analytics.forecastValue)}</strong></div>
          </div>
          <dl className="commercial-stage-list">
            {stageTotals.map((stage) => (
              <div className="commercial-stage-row" key={stage.status}>
                <span className={`commercial-stage-dot ${statusClass(stage.status)}`} aria-hidden="true" />
                <dt>{stage.status}</dt>
                <dd>{stage.count} {stage.count === 1 ? "registro" : "registros"}</dd>
                <strong>{money(stage.value)}</strong>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Agenda comercial" className="commercial-agenda-context">
          <SectionHeader
            actions={<span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"><CalendarClock aria-hidden="true" size={14} /> Hoje e próximos dias</span>}
            description="Acompanhamentos derivados da agenda comercial disponível nesta página."
            title="Agenda comercial"
          />
          <div className="commercial-agenda-list">
            {followUpAgenda.map((group) => (
              <section className="commercial-agenda-group" key={group.label}>
                <div className="commercial-agenda-group-head"><strong>{group.label}</strong><span>{group.hint}</span></div>
                {group.clients.length > 0 ? group.clients.slice(0, 3).map((client) => (
                  <button aria-label={`Abrir acompanhamento de ${client.name}, ${client.status}`} className="commercial-agenda-row" key={client.id} onClick={() => setSelectedId(client.id)} type="button">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(client.status)}`}>{client.status}</span>
                    <span className="min-w-0 flex-1 text-left"><strong className="block truncate">{client.name}</strong><small className="block truncate">{client.company}</small></span>
                    <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--text-muted)]">{money(client.value)}</span>
                  </button>
                )) : <p className="commercial-agenda-empty">Nenhum acompanhamento previsto.</p>}
              </section>
            ))}
          </div>
        </section>
      </Surface>
    </div>
  );
}

function Metric({ detail, label, tone, value }: { detail: string; label: string; tone?: "danger"; value: string }) {
  return <div className={tone ? "is-danger" : undefined}><dt>{label}</dt><dd>{value}</dd><p>{detail}</p></div>;
}

function attentionReason(client: Client, getRisk: (client: Client) => string, getPriority: (client: Client) => string) {
  if (getRisk(client) === "Alto") return "Risco alto";
  if (client.lastContactDays >= 7) return `${client.lastContactDays} dias sem contato`;
  if (client.hot && client.status === "Proposta") return "Proposta prioritária";
  if (getPriority(client) === "Alta") return "Prioridade alta";
  return "Revisar andamento";
}

function attentionWeight(client: Client, getPriority: (client: Client) => string, getRisk: (client: Client) => string, getLeadScore: (client: Client) => number) {
  return (getRisk(client) === "Alto" ? 400 : 0) + (client.lastContactDays >= 7 ? 300 : 0) + (client.hot && client.status === "Proposta" ? 200 : 0) + (getPriority(client) === "Alta" ? 100 : 0) + getLeadScore(client);
}
