import { AlertCircle, ChevronRight, LockKeyhole, Plus } from "lucide-react";
import { type RefObject, useRef } from "react";
import { Link } from "react-router-dom";
import type { ApiDashboardSummary } from "../../services/crmApi";
import type { Client } from "../../types/dashboard";
import { classifyNextFollowUp, formatNextFollowUp } from "../../utils/followUpProjection";
import { getDashboardPath } from "../../navigation/dashboardNavigation";
import { Button, Skeleton, Surface } from "../ui";
import {
  buildCommercialControlCenterModel,
  type CommercialAgendaItem,
  type CommercialControlCenterModel,
  type CommercialPriorityItem,
} from "./DashboardControlCenterModel";

type DashboardControlCenterProps = {
  clients: Client[];
  summary: ApiDashboardSummary | null;
  summaryLoadState: "loading" | "ready" | "error";
  clientsLoadState: "loading" | "ready" | "error";
  isAuthorized: boolean;
  money: (value: number) => string;
  getRisk: (client: Client) => string;
  onCreateClient: () => void;
  setSelectedId: (clientId: number | null, origin?: HTMLElement | null, fallback?: HTMLElement | null) => void;
  onOpenRiskClients: () => void;
  onOpenProposals: () => void;
  onRetry: () => void;
};

export default function DashboardControlCenter({
  clients,
  summary,
  summaryLoadState,
  clientsLoadState,
  isAuthorized,
  money,
  getRisk,
  onCreateClient,
  setSelectedId,
  onOpenRiskClients,
  onOpenProposals,
  onRetry,
}: DashboardControlCenterProps) {
  const model = buildCommercialControlCenterModel({
    clients,
    summary,
    summaryLoadState,
    clientsLoadState,
    isAuthorized,
    getRisk,
    classifyFollowUp: classifyNextFollowUp,
    formatFollowUp: formatNextFollowUp,
  });
  const priorityHeadingRef = useRef<HTMLHeadingElement>(null);
  const agendaHeadingRef = useRef<HTMLHeadingElement>(null);

  return (
    <section aria-labelledby="commercial-panel-title" className="commercial-workbench">
      <CommercialHeader onCreateClient={onCreateClient} showAction={model.state !== "fail-closed"} />

      {model.state === "loading" && <CommercialLoading />}
      {model.state === "error" && <CommercialState onRetry={onRetry} state="error" />}
      {model.state === "fail-closed" && <CommercialState state="fail-closed" />}
      {isDataState(model.state) && (
        <CommercialData
          model={model}
          money={money}
          onOpenAgenda={(clientId, origin) => setSelectedId(clientId, origin, agendaHeadingRef.current)}
          onOpenPriority={(clientId, origin) => setSelectedId(clientId, origin, priorityHeadingRef.current)}
          onOpenProposals={onOpenProposals}
          onOpenRiskClients={onOpenRiskClients}
          agendaHeadingRef={agendaHeadingRef}
          priorityHeadingRef={priorityHeadingRef}
        />
      )}
    </section>
  );
}

function CommercialHeader({ onCreateClient, showAction }: { onCreateClient: () => void; showAction: boolean }) {
  return (
    <header className="commercial-header">
      <h1 className="commercial-title truncate" id="commercial-panel-title">Painel Comercial</h1>

      {showAction && (
        <Button className="commercial-create-client" leftIcon={<Plus aria-hidden="true" size={14} />} onClick={onCreateClient} variant="primary">
          Novo cliente
        </Button>
      )}
    </header>
  );
}

function CommercialData({
  model,
  money,
  onOpenAgenda,
  onOpenPriority,
  onOpenProposals,
  onOpenRiskClients,
  agendaHeadingRef,
  priorityHeadingRef,
}: {
  model: CommercialControlCenterModel<Client>;
  money: (value: number) => string;
  onOpenAgenda: (clientId: number, origin: HTMLButtonElement) => void;
  onOpenPriority: (clientId: number, origin: HTMLButtonElement) => void;
  onOpenProposals: () => void;
  onOpenRiskClients: () => void;
  agendaHeadingRef: RefObject<HTMLHeadingElement | null>;
  priorityHeadingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <CommercialMetricStrip metrics={model.metrics} money={money} />
      <CommercialAttention attention={model.attention} onOpenProposals={onOpenProposals} onOpenRiskClients={onOpenRiskClients} />

      <div className="commercial-operational-grid">
        <Surface aria-labelledby="commercial-priority-title" className="commercial-priority">
          <PriorityHeading headingRef={priorityHeadingRef} />
          {model.priorityState === "loading" ? (
            <PriorityLoading />
          ) : model.priorities.length > 0 ? (
            <PriorityList items={model.priorities} onOpen={onOpenPriority} />
          ) : (
            <QueueEmpty />
          )}
        </Surface>

        <Surface aria-labelledby="commercial-agenda-title" className="commercial-agenda">
          <AgendaHeading headingRef={agendaHeadingRef} />
          {model.agendaState === "loading" ? (
            <AgendaLoading />
          ) : model.agenda.length > 0 ? (
            <AgendaList items={model.agenda} onOpen={onOpenAgenda} />
          ) : (
            <AgendaEmpty />
          )}
        </Surface>
      </div>
    </>
  );
}

function CommercialMetricStrip({
  metrics,
  money,
}: {
  metrics: CommercialControlCenterModel<Client>["metrics"];
  money: (value: number) => string;
}) {
  return (
    <section aria-labelledby="commercial-summary-title" className="commercial-summary">
      <p className="commercial-summary-label" id="commercial-summary-title">Resumo da carteira</p>
      <dl className="commercial-metric-strip">
        {metrics.map((metric) => (
          <div data-commercial-metric={metric.key} data-commercial-value={metric.value === null ? "unavailable" : metric.value > 0 ? "present" : "zero"} key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>{metric.value === null ? "Indisponível" : metric.kind === "money" ? money(metric.value) : String(metric.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CommercialAttention({
  attention,
  onOpenProposals,
  onOpenRiskClients,
}: {
  attention: CommercialControlCenterModel<Client>["attention"];
  onOpenProposals: () => void;
  onOpenRiskClients: () => void;
}) {
  if (attention.highRiskCount === null || attention.highRiskCount === 0) return null;

  return (
    <section aria-label="Atenção" className="commercial-attention" role="status">
      <span className="commercial-attention-label">Atenção</span>
      <span className="commercial-attention-copy"><strong>{attention.highRiskCount}</strong> clientes em alto risco</span>
      <div className="commercial-attention-actions">
        <Button className="commercial-attention-action" onClick={onOpenRiskClients} size="sm" variant="ghost">Ver clientes em risco</Button>
        <Button className="commercial-attention-action" onClick={onOpenProposals} size="sm" variant="ghost">Ver propostas</Button>
      </div>
    </section>
  );
}

function PriorityHeading({ headingRef }: { headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="commercial-section-heading commercial-priority-heading">
      <h2 id="commercial-priority-title" ref={headingRef} tabIndex={-1}>
        Prioridades <span aria-hidden="true">—</span> <span className="commercial-section-scope">Página atual</span>
      </h2>
    </header>
  );
}

function PriorityList({
  items,
  onOpen,
}: {
  items: CommercialPriorityItem<Client>[];
  onOpen: (clientId: number, origin: HTMLButtonElement) => void;
}) {
  return (
    <>
      <div aria-hidden="true" className="commercial-queue-columns commercial-queue-table-head">
        <span>Cliente</span><span>Motivo</span><span>Prazo</span><span>Abrir</span>
      </div>
      <ol className="commercial-queue-list">
        {items.map((item) => (
          <li key={item.client.id}>
            <button
              aria-label={`Abrir ${item.client.name}: ${item.reasonLabel}, ${item.deadlineLabel}`}
              className="commercial-queue-columns commercial-queue-row"
              data-commercial-priority-id={item.client.id}
              data-timing={item.timing.toLowerCase()}
              onClick={(event) => onOpen(item.client.id, event.currentTarget)}
              type="button"
            >
              <span className="commercial-queue-client"><strong>{item.client.name}</strong><small>{item.client.company}</small></span>
              <span className="commercial-queue-reason">{item.reasonLabel}</span>
              <span className={`commercial-queue-deadline commercial-timing-${item.timing.toLowerCase()}`}>{item.deadlineLabel}</span>
              <span className="commercial-queue-action">Abrir <ChevronRight aria-hidden="true" size={14} /></span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function QueueEmpty() {
  return <p className="commercial-inline-empty" role="status">Nenhuma prioridade na página atual.</p>;
}

function AgendaHeading({ headingRef }: { headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="commercial-section-heading commercial-agenda-heading">
      <div className="commercial-agenda-heading-row">
        <h2 id="commercial-agenda-title" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          Hoje <span aria-hidden="true">—</span> <span className="commercial-section-scope">Página atual</span>
        </h2>
        <Link className="commercial-heading-link" to={getDashboardPath("agenda")}>Abrir Agenda <ChevronRight aria-hidden="true" size={14} /></Link>
      </div>
    </header>
  );
}

function AgendaList({ items, onOpen }: { items: CommercialAgendaItem<Client>[]; onOpen: (clientId: number, origin: HTMLButtonElement) => void }) {
  return (
    <ol className="commercial-agenda-list">
      {items.map((item) => (
        <li key={item.client.id}>
          <button
            aria-label={`Abrir compromisso de ${item.client.name}, ${item.deadlineLabel}`}
            className="commercial-agenda-row"
            data-timing={item.timing.toLowerCase()}
            onClick={(event) => onOpen(item.client.id, event.currentTarget)}
            type="button"
          >
            <span className={`commercial-agenda-time commercial-timing-${item.timing.toLowerCase()}`}>{item.deadlineLabel}</span>
            <span className="commercial-agenda-client"><strong>{item.client.name}</strong><small>{item.client.company}</small></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function AgendaEmpty() {
  return <p className="commercial-agenda-empty" role="status">Nenhum compromisso de hoje nesta página.</p>;
}

function CommercialLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando Painel Comercial" className="commercial-loading" role="status">
      <span className="sr-only">Carregando Painel Comercial</span>
      <div className="commercial-loading-metrics">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton className="commercial-loading-metric" key={index} />)}
      </div>
      <div className="commercial-operational-grid">
        <Surface className="commercial-priority">
          <PriorityHeading />
          <PriorityLoading />
        </Surface>
        <Surface className="commercial-agenda">
          <AgendaHeading />
          <AgendaLoading />
        </Surface>
      </div>
    </div>
  );
}

function PriorityLoading() {
  return <div aria-hidden="true" className="commercial-priority-loading">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} />)}</div>;
}

function AgendaLoading() {
  return <div aria-hidden="true" className="commercial-agenda-loading">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} />)}</div>;
}

function CommercialState({
  state,
  onRetry,
}: {
  state: "error" | "fail-closed";
  onRetry?: () => void;
}) {
  const restricted = state === "fail-closed";

  return (
    <div className="commercial-state" role="alert">
      {restricted ? <LockKeyhole aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <div>
        <h2>{restricted ? "Painel Comercial não confirmado" : "Leitura comercial indisponível"}</h2>
        <p>
          {restricted
            ? "O painel só é exibido após a confirmação da sessão comercial."
            : "Não foi possível obter os dados essenciais. Nenhum indicador, prioridade ou compromisso foi exibido."}
        </p>
        {!restricted && onRetry && <Button className="commercial-retry" onClick={onRetry} size="sm" variant="secondary">Tentar novamente</Button>}
      </div>
    </div>
  );
}

function isDataState(state: CommercialControlCenterModel<Client>["state"]) {
  return state === "ready" || state === "partial" || state === "empty";
}
