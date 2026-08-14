import { AlertCircle, ChevronRight, LockKeyhole, Plus } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAcompanhamentoResumo, fetchNegociosKanban } from "../../services/crmApi";
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
import { buildCommercialProcessModel, businessStageLabels, type CommercialProcessSnapshot } from "./DashboardCommercialProcessModel";

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
  onOpenBusiness?: (businessId: number) => void;
};

type CommercialSnapshot = {
  process: CommercialProcessSnapshot;
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
  onOpenBusiness,
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
  const [snapshot, setSnapshot] = useState<CommercialSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<"loading" | "ready" | "error">("loading");
  const requestSequence = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!isAuthorized) {
      setSnapshotState("error");
      return;
    }
    setSnapshotState("loading");
    try {
      const [businesses, stalled, agenda] = await Promise.all([
        fetchNegociosKanban({ page: 1, limit: 100 }),
        fetchNegociosKanban({ page: 1, limit: 6, filtroOperacional: "PARADOS" }),
        fetchAcompanhamentoResumo(),
      ]);
      if (sequence !== requestSequence.current) return;
      setSnapshot({ process: buildCommercialProcessModel(businesses.resumo, stalled, agenda) });
      setSnapshotState("ready");
    } catch {
      if (sequence === requestSequence.current) setSnapshotState("error");
    }
  }, [isAuthorized]);

  useEffect(() => {
    void loadSnapshot();
    return () => { requestSequence.current += 1; };
  }, [loadSnapshot]);

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
          onOpenBusiness={onOpenBusiness}
          snapshot={snapshot}
          snapshotState={snapshotState}
          onRetrySnapshot={loadSnapshot}
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
  snapshot,
  snapshotState,
  onRetrySnapshot,
  onOpenBusiness,
}: {
  model: CommercialControlCenterModel<Client>;
  money: (value: number) => string;
  onOpenAgenda: (clientId: number, origin: HTMLButtonElement) => void;
  onOpenPriority: (clientId: number, origin: HTMLButtonElement) => void;
  onOpenProposals: () => void;
  onOpenRiskClients: () => void;
  agendaHeadingRef: RefObject<HTMLHeadingElement | null>;
  priorityHeadingRef: RefObject<HTMLHeadingElement | null>;
  snapshot: CommercialSnapshot | null;
  snapshotState: "loading" | "ready" | "error";
  onRetrySnapshot: () => void;
  onOpenBusiness?: (businessId: number) => void;
}) {
  return (
    <>
      <CommercialProcessSection snapshot={snapshot} state={snapshotState} onRetry={onRetrySnapshot} onOpenBusiness={onOpenBusiness} />
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

function CommercialProcessSection({
  snapshot,
  state,
  onRetry,
  onOpenBusiness,
}: {
  snapshot: CommercialSnapshot | null;
  state: "loading" | "ready" | "error";
  onRetry: () => void;
  onOpenBusiness?: (businessId: number) => void;
}) {
  if (state === "loading") {
    return <section aria-label="Carregando processo comercial" className="commercial-process commercial-process-loading" aria-busy="true"><span className="sr-only">Carregando funil comercial</span><div className="commercial-process-skeleton" /><div className="commercial-process-skeleton" /></section>;
  }

  if (state === "error" || !snapshot) {
    return <section aria-label="Processo comercial indisponível" className="commercial-process commercial-process-error" role="status"><div><strong>Processo comercial indisponível</strong><span>O resumo de Negócios e Agenda não pôde ser consultado agora.</span></div><Button onClick={onRetry} size="sm" variant="ghost">Tentar novamente</Button></section>;
  }

  const process = snapshot.process;
  const stageRows = process.stages;
  const maxStage = Math.max(...stageRows.map((row) => row.total), 1);
  const openBusinesses = process.open;
  const overdue = process.overdue;

  return (
    <section aria-labelledby="commercial-process-title" className="commercial-process">
      <header className="commercial-process-heading">
        <div><p className="commercial-process-kicker">Snapshot atual</p><h2 id="commercial-process-title">Processo comercial</h2><p>Funil de Negócios e gargalos que pedem ação.</p></div>
        <Link className="commercial-heading-link" to={getDashboardPath("kanban")}>Abrir Negócios <ChevronRight aria-hidden="true" size={14} /></Link>
      </header>

      <dl className="commercial-process-metrics" aria-label="Resumo do processo comercial">
        <div><dt>Negócios abertos</dt><dd>{openBusinesses}</dd></div>
        <div><dt>Ganhos</dt><dd>{process.won}</dd></div>
        <div><dt>Perdidos</dt><dd>{process.lost}</dd></div>
        <div><dt>Acompanhamentos atrasados</dt><dd className={overdue > 0 ? "commercial-process-danger" : ""}>{overdue}</dd></div>
      </dl>

      <div className="commercial-process-grid">
        <div className="commercial-funnel" aria-labelledby="commercial-funnel-title">
          <div className="commercial-process-subheading"><h3 id="commercial-funnel-title">Funil comercial</h3><span>{process.total} negócios</span></div>
          <ul>
            {stageRows.map((row) => <li key={row.stage}><div><span>{businessStageLabels[row.stage]}</span><strong>{row.total}</strong></div><div aria-hidden="true" className="commercial-funnel-track"><span style={{ width: `${Math.round((row.total / maxStage) * 100)}%` }} /></div></li>)}
          </ul>
        </div>
        <div className="commercial-bottlenecks" aria-labelledby="commercial-bottlenecks-title">
          <div className="commercial-process-subheading"><h3 id="commercial-bottlenecks-title">Gargalos</h3><span>{process.stalledTotal} no critério atual</span></div>
          {process.stalled.length > 0 ? <ul>{process.stalled.slice(0, 4).map((business) => <li key={business.id}><div><strong>{business.titulo || business.cliente?.nome || "Negócio sem título"}</strong><span>{business.motivoParado === "PROXIMA_ACAO_ATRASADA" ? "Próxima ação atrasada" : "Sem próxima ação"} · {business.cliente?.nome || "Cliente não informado"}</span></div>{onOpenBusiness ? <Button aria-label={`Abrir negócio ${business.titulo || business.id}`} onClick={() => onOpenBusiness(business.id)} size="sm" variant="ghost">Abrir</Button> : null}</li>)}</ul> : <p className="commercial-process-empty" role="status">Nenhum negócio parado no critério atual.</p>}
        </div>
      </div>
    </section>
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
