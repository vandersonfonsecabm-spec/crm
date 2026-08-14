import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, LockKeyhole, MessageSquareText, Target } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiAcompanhamentoResumo, ApiDashboardSummary } from "../../services/crmApi";
import { fetchAcompanhamentoResumo } from "../../services/crmApi";
import { Button, Surface } from "../ui";
import {
  buildDashboardOverviewModel,
  type DashboardOverviewMetric,
  type DashboardOverviewState,
} from "./DashboardOverviewModel";

type DashboardOverviewProps = {
  summary: ApiDashboardSummary | null;
  summaryLoadState: "loading" | "ready" | "error";
  isAuthorized: boolean;
  money: (value: number) => string;
  onOpenCommercial: () => void;
  onOpenInbox?: () => void;
  onOpenAgenda?: () => void;
  onRetry: () => void;
  attentionCount?: number | null;
};

export default function DashboardOverview({
  summary,
  summaryLoadState,
  isAuthorized,
  money,
  onOpenCommercial,
  onOpenInbox = onOpenCommercial,
  onOpenAgenda = onOpenCommercial,
  onRetry,
  attentionCount = null,
}: DashboardOverviewProps) {
  const model = buildDashboardOverviewModel({
    summary,
    isLoading: summaryLoadState === "loading",
    hasSummaryError: summaryLoadState === "error",
    isAuthorized,
  });
  const [agendaSummary, setAgendaSummary] = useState<ApiAcompanhamentoResumo | null>(null);
  const [agendaLoadState, setAgendaLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    if (!isAuthorized || summaryLoadState !== "ready") {
      setAgendaLoadState(isAuthorized ? "loading" : "error");
      return () => { active = false; };
    }

    setAgendaLoadState("loading");
    void fetchAcompanhamentoResumo()
      .then((response) => {
        if (!active) return;
        setAgendaSummary(response);
        setAgendaLoadState("ready");
      })
      .catch(() => {
        if (!active) return;
        setAgendaLoadState("error");
      });

    return () => { active = false; };
  }, [isAuthorized, summaryLoadState]);

  return (
    <section className="crm-overview" aria-labelledby="crm-overview-title">
      <OverviewHeader onOpenCommercial={onOpenCommercial} showAction={model.state !== "fail-closed"} />

      {model.state === "loading" && <OverviewLoading />}
      {model.state === "error" && <OverviewState onRetry={onRetry} state="error" />}
      {model.state === "fail-closed" && <OverviewState state="fail-closed" />}
      {isDataState(model.state) && (
        <OverviewData
          agendaLoadState={agendaLoadState}
          agendaSummary={agendaSummary}
          model={model}
          money={money}
          attentionCount={attentionCount}
          onOpenAgenda={onOpenAgenda}
          onOpenInbox={onOpenInbox}
          summary={summary}
        />
      )}
    </section>
  );
}

function OverviewHeader({ onOpenCommercial, showAction }: { onOpenCommercial: () => void; showAction: boolean }) {
  return (
    <header className="crm-overview-header">
      <div className="crm-overview-heading-copy">
        <h1 className="crm-overview-title truncate" id="crm-overview-title">Visão Geral</h1>
        <p className="crm-overview-context">Agora · {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      </div>

      {showAction && (
        <Button className="crm-overview-cta" onClick={onOpenCommercial} rightIcon={<ArrowRight aria-hidden="true" size={14} />} size="md" variant="primary">
          Abrir Painel Comercial
        </Button>
      )}
    </header>
  );
}

function OverviewLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando Visão Geral" className="crm-overview-loading" role="status">
      <span className="sr-only">Carregando Visão Geral</span>
      <div className="crm-overview-loading-metrics">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} />)}
      </div>
      <div className="crm-overview-loading-grid">
        <div />
        <div />
      </div>
    </div>
  );
}

function OverviewState({
  state,
  onRetry,
}: {
  state: Extract<DashboardOverviewState, "error" | "fail-closed">;
  onRetry?: () => void;
}) {
  const isFailClosed = state === "fail-closed";

  return (
    <div className="crm-overview-state" role="alert">
      {isFailClosed ? <LockKeyhole aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <div>
        <h2>{isFailClosed ? "Visão Geral restrita" : "Visão Geral indisponível"}</h2>
        <p>{isFailClosed ? "A sessão atual não permite visualizar a carteira." : "Não foi possível carregar os dados da carteira."}</p>
        {!isFailClosed && onRetry && (
          <Button className="crm-overview-retry" onClick={onRetry} size="md" variant="secondary">
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}

function OverviewData({
  model,
  money,
  attentionCount,
  onOpenInbox,
  onOpenAgenda,
  summary,
  agendaSummary,
  agendaLoadState,
}: {
  model: ReturnType<typeof buildDashboardOverviewModel>;
  money: (value: number) => string;
  attentionCount: number | null;
  onOpenInbox: () => void;
  onOpenAgenda: () => void;
  summary: ApiDashboardSummary | null;
  agendaSummary: ApiAcompanhamentoResumo | null;
  agendaLoadState: "loading" | "ready" | "error";
}) {
  const analytics = summary?.analytics;
  const kpis: DashboardOverviewMetric[] = [
    { label: "Aguardando resposta", kind: "count", value: attentionCount },
    { label: "Acompanhamentos hoje", kind: "count", value: readMetric(analytics?.todayFollowUps) },
    { label: "Acompanhamentos atrasados", kind: "count", value: readMetric(agendaSummary?.indicadores.atrasados) },
    { label: "Clientes em alto risco", kind: "count", value: readMetric(analytics?.highRiskCount) },
  ];

  return (
    <>
      {model.partialMessage && <p className="crm-overview-partial" role="status">{model.partialMessage}</p>}

      <dl aria-label="Indicadores da carteira" className="crm-overview-metrics">
        {kpis.map((metric) => <OverviewMetric key={metric.label} metric={metric} money={money} />)}
      </dl>

      <div className="crm-overview-action-grid">
        <OverviewAttention model={model} attentionCount={attentionCount} onOpenInbox={onOpenInbox} summary={summary} onOpenAgenda={onOpenAgenda} />
        <OverviewToday agendaLoadState={agendaLoadState} agendaSummary={agendaSummary} onOpenAgenda={onOpenAgenda} summary={summary} />
      </div>

      <div className="crm-overview-support-grid">
        <OverviewDistribution model={model} money={money} />
        <OverviewRecent summary={summary} />
      </div>
    </>
  );
}

function OverviewDistribution({
  model,
  money,
}: {
  model: ReturnType<typeof buildDashboardOverviewModel>;
  money: (value: number) => string;
}) {
  return (
    <Surface className="crm-overview-distribution" aria-labelledby="crm-overview-distribution-title">
      <header className="crm-overview-section-heading">
        <h2 id="crm-overview-distribution-title">Carteira por status</h2>
      </header>

      {model.statusRows ? (
        <ul className="crm-overview-stage-list">
          {model.statusRows.map((stage) => (
            <li key={stage.stage}>
              <div className="crm-overview-stage-summary">
                <strong>{stage.stage}</strong>
                <span>{stage.total} {stage.total === 1 ? "cliente" : "clientes"} · {money(stage.value)}</span>
              </div>
              <div
                aria-label={`${stage.stage}: ${stage.total} ${stage.total === 1 ? "cliente" : "clientes"}, ${money(stage.value)}`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(stage.percentage)}
                aria-valuetext={`${stage.stage}: ${stage.total} ${stage.total === 1 ? "cliente" : "clientes"}, ${money(stage.value)}`}
                className="crm-overview-stage-bar"
                role="progressbar"
              >
                <span style={{ width: `${stage.percentage}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="crm-overview-inline-state" role="status">Distribuição por status indisponível.</p>
      )}
    </Surface>
  );
}

function OverviewAttention({ model, attentionCount, onOpenInbox, summary, onOpenAgenda }: { model: ReturnType<typeof buildDashboardOverviewModel>; attentionCount: number | null; onOpenInbox: () => void; summary: ApiDashboardSummary | null; onOpenAgenda: () => void }) {
  const todayFollowUps = readMetric(summary?.analytics.todayFollowUps);

  return (
    <Surface className="crm-overview-attention" aria-labelledby="crm-overview-attention-title">
      <header className="crm-overview-section-heading">
        <div>
          <h2 id="crm-overview-attention-title">Atenção</h2>
          <p className="crm-overview-section-subtitle">O que merece ação agora</p>
        </div>
      </header>

      <ul className="crm-overview-priority-list">
        {attentionCount !== null && attentionCount > 0 ? (
          <li className="crm-overview-priority-item crm-overview-priority-critical">
            <MessageSquareText aria-hidden="true" size={16} />
            <div><strong>{attentionCount} conversa{attentionCount === 1 ? "" : "s"} aguardando resposta</strong><span>Fila operacional da Caixa de Entrada</span></div>
            <Button aria-label="Abrir conversas aguardando resposta" onClick={onOpenInbox} size="sm" variant="ghost">Abrir</Button>
          </li>
        ) : attentionCount === 0 ? (
          <li className="crm-overview-priority-item"><CheckCircle2 aria-hidden="true" size={16} /><div><strong>Caixa de Entrada em dia</strong><span>Nenhuma conversa aguarda resposta agora</span></div></li>
        ) : null}
        {todayFollowUps !== null && todayFollowUps > 0 ? (
          <li className="crm-overview-priority-item">
            <CalendarClock aria-hidden="true" size={16} />
            <div><strong>{todayFollowUps} acompanhamento{todayFollowUps === 1 ? "" : "s"} hoje</strong><span>Há compromissos para concluir no dia</span></div>
            <Button aria-label="Abrir acompanhamentos de hoje" onClick={onOpenAgenda} size="sm" variant="ghost">Agenda</Button>
          </li>
        ) : null}
        {model.attentionSignals.map((signal) => (
          <li data-overview-signal={signal.key} key={signal.key} className="crm-overview-priority-item">
            <Target aria-hidden="true" size={16} />
            <div><strong>{signal.count} · {signal.label}</strong><span>Indicador do resumo da carteira</span></div>
          </li>
        ))}
      </ul>
      {attentionCount === null && <p className="crm-overview-inline-state" role="status">A fila de atenção não pôde ser consultada agora.</p>}
      {attentionCount === 0 && todayFollowUps === 0 && model.attentionSignals.length === 0 && <p className="crm-overview-inline-state" role="status">Nenhum sinal de atenção no resumo atual.</p>}
    </Surface>
  );
}

function OverviewToday({ agendaSummary, agendaLoadState, summary, onOpenAgenda }: { agendaSummary: ApiAcompanhamentoResumo | null; agendaLoadState: "loading" | "ready" | "error"; summary: ApiDashboardSummary | null; onOpenAgenda: () => void }) {
  const today = agendaSummary?.indicadores.paraHoje ?? summary?.analytics.todayFollowUps ?? null;
  const overdue = agendaSummary?.indicadores.atrasados ?? null;
  return (
    <Surface className="crm-overview-today" aria-labelledby="crm-overview-today-title">
      <header className="crm-overview-section-heading">
        <div><h2 id="crm-overview-today-title">Hoje</h2><p className="crm-overview-section-subtitle">Agenda e próximos acompanhamentos</p></div>
        <Button aria-label="Abrir Agenda" onClick={onOpenAgenda} size="sm" variant="ghost">Abrir Agenda</Button>
      </header>
      <div className="crm-overview-today-summary">
        <div><span>Para hoje</span><strong>{today === null ? "Indisponível" : today}</strong></div>
        <div><span>Atrasados</span><strong className={overdue && overdue > 0 ? "crm-overview-number-danger" : ""}>{agendaLoadState === "loading" ? "…" : overdue === null ? "Indisponível" : overdue}</strong></div>
      </div>
      <p className="crm-overview-inline-state" role="status">
        {agendaLoadState === "loading" ? "Carregando a agenda…" : agendaLoadState === "error" || today === null || overdue === null ? "A agenda não pôde ser consultada agora." : today === 0 && overdue === 0 ? "Nenhum acompanhamento precisa de ação hoje." : "Use a Agenda para revisar os itens por prazo e responsável."}
      </p>
    </Surface>
  );
}

function OverviewRecent({ summary }: { summary: ApiDashboardSummary | null }) {
  const events = summary?.atividadesRecentes?.slice(0, 5) ?? [];
  return (
    <Surface className="crm-overview-recent" aria-labelledby="crm-overview-recent-title">
      <header className="crm-overview-section-heading"><div><h2 id="crm-overview-recent-title">Movimento recente</h2><p className="crm-overview-section-subtitle">Notas comerciais úteis para o contexto</p></div></header>
      {events.length > 0 ? (
        <ul className="crm-overview-recent-list">
          {events.map((event) => <li key={event.id}><MessageSquareText aria-hidden="true" size={14} /><div><strong>{event.cliente}</strong><span>{event.texto}</span></div><time dateTime={event.createdAt}>{formatShortDate(event.createdAt)}</time></li>)}
        </ul>
      ) : <p className="crm-overview-inline-state" role="status">Nenhuma nota recente no resumo.</p>}
    </Surface>
  );
}

function OverviewMetric({ metric, money }: { metric: DashboardOverviewMetric; money: (value: number) => string }) {
  return (
    <div>
      <dt>{metric.label}</dt>
      <dd>{metric.value === null ? "Indisponível" : metric.kind === "money" ? money(metric.value) : String(metric.value)}</dd>
    </div>
  );
}

function readMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date) : "";
}

function isDataState(state: DashboardOverviewState) {
  return state === "ready" || state === "partial" || state === "empty";
}
