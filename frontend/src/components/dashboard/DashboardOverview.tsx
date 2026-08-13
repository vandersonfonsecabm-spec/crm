import { AlertCircle, ArrowRight, LockKeyhole } from "lucide-react";
import type { ApiDashboardSummary } from "../../services/crmApi";
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
  onRetry,
  attentionCount = null,
}: DashboardOverviewProps) {
  const model = buildDashboardOverviewModel({
    summary,
    isLoading: summaryLoadState === "loading",
    hasSummaryError: summaryLoadState === "error",
    isAuthorized,
  });

  return (
    <section className="crm-overview" aria-labelledby="crm-overview-title">
      <OverviewHeader onOpenCommercial={onOpenCommercial} showAction={model.state !== "fail-closed"} />

      {model.state === "loading" && <OverviewLoading />}
      {model.state === "error" && <OverviewState onRetry={onRetry} state="error" />}
      {model.state === "fail-closed" && <OverviewState state="fail-closed" />}
      {isDataState(model.state) && <OverviewData model={model} money={money} attentionCount={attentionCount} onOpenInbox={onOpenInbox} />}
    </section>
  );
}

function OverviewHeader({ onOpenCommercial, showAction }: { onOpenCommercial: () => void; showAction: boolean }) {
  return (
    <header className="crm-overview-header">
      <h1 className="crm-overview-title truncate" id="crm-overview-title">Visão Geral</h1>

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
}: {
  model: ReturnType<typeof buildDashboardOverviewModel>;
  money: (value: number) => string;
  attentionCount: number | null;
  onOpenInbox: () => void;
}) {
  return (
    <>
      {model.partialMessage && <p className="crm-overview-partial" role="status">{model.partialMessage}</p>}

      <dl aria-label="Indicadores da carteira" className="crm-overview-metrics">
        {model.metrics.map((metric) => <OverviewMetric key={metric.label} metric={metric} money={money} />)}
      </dl>

      <div className="crm-overview-main-grid">
        <OverviewDistribution model={model} money={money} />
        <OverviewAttention model={model} attentionCount={attentionCount} onOpenInbox={onOpenInbox} />
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

function OverviewAttention({ model, attentionCount, onOpenInbox }: { model: ReturnType<typeof buildDashboardOverviewModel>; attentionCount: number | null; onOpenInbox: () => void }) {
  return (
    <Surface className="crm-overview-attention" aria-labelledby="crm-overview-attention-title">
      <header className="crm-overview-section-heading">
        <h2 id="crm-overview-attention-title">Atenção</h2>
        {attentionCount !== null && attentionCount > 0 ? <Button onClick={onOpenInbox} size="sm" variant="ghost">Abrir Caixa de Entrada ({attentionCount})</Button> : null}
      </header>

      {model.attentionSignals.length > 0 ? (
        <ul className="crm-overview-signal-list">
          {model.attentionSignals.map((signal) => (
            <li data-overview-signal={signal.key} key={signal.key}>
              <strong>{signal.count}</strong>
              <span>{signal.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="crm-overview-inline-state" role="status">
          {attentionCount === null || !model.attentionKnown
            ? "Dados de atenção indisponíveis."
            : attentionCount > 0
              ? `${attentionCount} conversa${attentionCount === 1 ? "" : "s"} aguarda${attentionCount === 1 ? "" : "m"} atenção na Caixa de Entrada.`
              : "Nenhum sinal de atenção no resumo atual."}
        </p>
      )}
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

function isDataState(state: DashboardOverviewState) {
  return state === "ready" || state === "partial" || state === "empty";
}
