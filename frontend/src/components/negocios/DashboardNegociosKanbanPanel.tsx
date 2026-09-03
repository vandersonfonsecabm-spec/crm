import { AlertTriangle, CalendarClock, Clock3, GripVertical, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  closeDealAsWon,
  fetchCanonicalCommercialState,
  fetchCanonicalSales,
  fetchCommercialProposal,
  fetchNegocioKanban,
  fetchNegociosKanban,
  markDealAsLost,
  reopenCanonicalDeal,
  updateNegocioKanbanStage,
} from "../../services/crmApi";
import type {
  AuthSession,
  BusinessOperationalFilter,
  BusinessStage,
  CanonicalCommercialState,
  CanonicalSale,
  CommunicationBusiness,
  NegociosKanbanResponse,
} from "../../services/crmApi";
import { buildCanonicalSalesCsv, downloadCanonicalSalesCsv, fetchAllCanonicalSales } from "../../utils/canonicalSalesCsv.js";
import { parseMoneyInputToCents } from "../../utils/commercialMoney.js";
import { Button, ErrorState, Input, LoadingState, Pagination, Select, Surface, Textarea } from "../ui";
import BusinessStageTimingPanel from "./BusinessStageTimingPanel";
import { formatBusinessDuration } from "./businessStagePresentation";
import CommercialProposalsPanel from "./CommercialProposalsPanel";
import "./DashboardNegocios.css";

const stages: BusinessStage[] = ["NOVO", "CONTATO", "PROPOSTA", "FECHADO", "PERDIDO"];
const stageLabels: Record<BusinessStage, string> = {
  NOVO: "Novo",
  CONTATO: "Contato",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export type NegociosKanbanAdapter = {
  fetchNegocioKanban: typeof fetchNegocioKanban;
  fetchNegociosKanban: typeof fetchNegociosKanban;
  updateNegocioKanbanStage: typeof updateNegocioKanbanStage;
  fetchCommercialProposal?: typeof fetchCommercialProposal;
};

const defaultNegociosKanbanAdapter: NegociosKanbanAdapter = {
  fetchNegocioKanban,
  fetchNegociosKanban,
  updateNegocioKanbanStage,
  fetchCommercialProposal,
};

type Props = {
  authSession: AuthSession | null;
  initialBusinessId?: number | null;
  initialProposalId?: number | null;
  adapter?: NegociosKanbanAdapter;
  onInitialBusinessHandled?: () => void;
  onOpenAgenda: () => void;
  onToast: (message: string) => void;
};

export default function DashboardNegociosKanbanPanel({ adapter = defaultNegociosKanbanAdapter, authSession, initialBusinessId, initialProposalId, onInitialBusinessHandled, onOpenAgenda, onToast }: Props) {
  const [businesses, setBusinesses] = useState<CommunicationBusiness[]>([]);
  const [summary, setSummary] = useState<NegociosKanbanResponse["resumo"] | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<BusinessStage | "">("");
  const [operationalFilter, setOperationalFilter] = useState<BusinessOperationalFilter | "">("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dragOverStage, setDragOverStage] = useState<BusinessStage | null>(null);
  const [selected, setSelected] = useState<CommunicationBusiness | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestSequence = useRef(0);
  const detailRequestSequence = useRef(0);
  const drawerSessionSequence = useRef(0);
  const currentDrawerBusinessId = useRef<number | null>(null);
  const stageUpdates = useRef(new Set<number>());
  const detailTrigger = useRef<HTMLElement | null>(null);
  const detailTriggerBusinessId = useRef<number | null>(null);
  const workspaceFallbackFocus = useRef<HTMLInputElement>(null);
  const [movingBusinessId, setMovingBusinessId] = useState<number | null>(null);

  const load = useCallback(async (background = false) => {
    const sequence = ++requestSequence.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await adapter.fetchNegociosKanban({
        page,
        limit: 100,
        ...(stageFilter ? { etapa: stageFilter } : {}),
        ...(operationalFilter ? { filtroOperacional: operationalFilter } : {}),
        ...(search ? { q: search } : {}),
      });
      if (sequence !== requestSequence.current) return;
      setBusinesses(response.data);
      setSummary(response.resumo);
      setPagination({ total: response.pagination.total, totalPages: response.pagination.totalPages });
    } catch {
      if (sequence === requestSequence.current) setError("Não foi possível carregar os Negócios.");
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [adapter, operationalFilter, page, search, stageFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [load]);

  useEffect(() => () => {
    detailRequestSequence.current += 1;
    drawerSessionSequence.current += 1;
    currentDrawerBusinessId.current = null;
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(query.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!initialBusinessId && !initialProposalId) {
      return;
    }
    let active = true;
    const sequence = ++detailRequestSequence.current;
    const targetProposalId = initialProposalId;
    const timer = window.setTimeout(() => {
      async function openInitialTarget() {
        setDetailLoading(true);
        try {
          let business: CommunicationBusiness;
          if (initialBusinessId) {
            business = await adapter.fetchNegocioKanban(initialBusinessId);
          } else {
            if (!targetProposalId) throw new Error("PROPOSAL_TARGET_MISSING");
            const proposalFetcher = adapter.fetchCommercialProposal ?? fetchCommercialProposal;
            const proposal = await proposalFetcher(targetProposalId);
            if (!active || sequence !== detailRequestSequence.current) return;
            business = await adapter.fetchNegocioKanban(proposal.negocioId);
          }
          if (!active || sequence !== detailRequestSequence.current) return;
          drawerSessionSequence.current += 1;
          currentDrawerBusinessId.current = business.id;
          setSelectedProposalId(targetProposalId ?? null);
          setSelected(business);
          setDetailLoading(false);
          onInitialBusinessHandled?.();
        } catch {
          if (!active || sequence !== detailRequestSequence.current) return;
          onToast("Não foi possível abrir o Negócio selecionado.");
          setDetailLoading(false);
          onInitialBusinessHandled?.();
        }
      }
      void openInitialTarget();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (sequence === detailRequestSequence.current) detailRequestSequence.current += 1;
    };
  }, [adapter, initialBusinessId, initialProposalId, onInitialBusinessHandled, onToast]);

  async function openBusiness(business: CommunicationBusiness, trigger: HTMLElement) {
    const sequence = ++detailRequestSequence.current;
    drawerSessionSequence.current += 1;
    currentDrawerBusinessId.current = business.id;
    detailTrigger.current = trigger;
    detailTriggerBusinessId.current = business.id;
    setSelectedProposalId(null);
    setSelected(business);
    setDetailLoading(true);
    try {
      const detail = await adapter.fetchNegocioKanban(business.id);
      if (sequence === detailRequestSequence.current) setSelected(detail);
    } catch {
      if (sequence === detailRequestSequence.current) onToast("Não foi possível carregar todos os detalhes.");
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false);
    }
  }

  const closeBusiness = useCallback(() => {
    detailRequestSequence.current += 1;
    drawerSessionSequence.current += 1;
    currentDrawerBusinessId.current = null;
    setSelectedProposalId(null);
    setDetailLoading(false);
    const businessId = detailTriggerBusinessId.current;
    const originalTrigger = detailTrigger.current;
    detailTriggerBusinessId.current = null;
    detailTrigger.current = null;
    setSelected(null);
    window.setTimeout(() => {
      const currentCard = businessId === null
        ? null
        : document.querySelector<HTMLElement>('[data-negocio-card-id="' + businessId + '"]');
      if (currentCard?.isConnected) {
        currentCard.focus({ preventScroll: true });
        return;
      }
      if (originalTrigger?.isConnected) {
        originalTrigger.focus({ preventScroll: true });
        return;
      }
      workspaceFallbackFocus.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  async function moveBusiness(id: number, nextStage: BusinessStage): Promise<boolean> {
    const current = businesses.find((business) => business.id === id);
    if (!current || !current.permissoes?.movimentar || current.etapa === nextStage || stageUpdates.current.has(id)) return false;
    if (nextStage === "FECHADO" || nextStage === "PERDIDO") {
      const sequence = ++detailRequestSequence.current;
      if (currentDrawerBusinessId.current !== id) {
        drawerSessionSequence.current += 1;
        currentDrawerBusinessId.current = id;
      }
      setSelectedProposalId(null);
      setSelected(current);
      setDetailLoading(true);
      try {
        const detail = await adapter.fetchNegocioKanban(id);
        if (sequence !== detailRequestSequence.current) return false;
        setSelected(detail);
        onToast(nextStage === "FECHADO" ? "Conclua a venda pelo fechamento explícito do Negócio." : "Informe o motivo para marcar o Negócio como perdido.");
      } catch {
        if (sequence === detailRequestSequence.current) onToast("Não foi possível abrir o fechamento comercial.");
      } finally {
        if (sequence === detailRequestSequence.current) {
          setDetailLoading(false);
          setDragOverStage(null);
        }
      }
      return false;
    }
    stageUpdates.current.add(id);
    setMovingBusinessId(id);
    const snapshot = businesses;
    setBusinesses((items) => items.map((business) => business.id === id ? { ...business, etapa: nextStage } : business));
    try {
      const updated = await adapter.updateNegocioKanbanStage(id, nextStage, current.etapa);
      setBusinesses((items) => items.map((business) => business.id === id ? updated : business));
      setSelected((selectedBusiness) => selectedBusiness?.id === id ? { ...selectedBusiness, ...updated } : selectedBusiness);
      onToast(`Negócio movido para ${stageLabels[nextStage]}.`);
      await load(true);
      return true;
    } catch {
      setBusinesses(snapshot);
      onToast("Não foi possível mover o Negócio. A etapa anterior foi restaurada.");
      return false;
    } finally {
      stageUpdates.current.delete(id);
      setMovingBusinessId((movingId) => movingId === id ? null : movingId);
      setDragOverStage(null);
    }
  }

  async function refreshCanonicalBusiness(id: number, message: string, expectedDrawerSession: number) {
    if (expectedDrawerSession !== drawerSessionSequence.current || currentDrawerBusinessId.current !== id) return;
    const sequence = ++detailRequestSequence.current;
    setDetailLoading(true);
    try {
      const updated = await adapter.fetchNegocioKanban(id);
      if (sequence !== detailRequestSequence.current || expectedDrawerSession !== drawerSessionSequence.current || currentDrawerBusinessId.current !== id) return;
      setSelected(updated);
      setBusinesses((items) => items.map((business) => business.id === id ? updated : business));
      onToast(message);
      await load(true);
    } finally {
      if (sequence === detailRequestSequence.current && expectedDrawerSession === drawerSessionSequence.current) setDetailLoading(false);
    }
  }

  async function exportCanonicalSalesCsv() {
    if (!window.confirm("O CSV contém dados comerciais. Exporte apenas para finalidade legítima e armazenamento seguro.")) return;
    try {
      const sales = await fetchAllCanonicalSales(fetchCanonicalSales);
      if (!sales.length) {
        onToast("Nenhuma venda canônica disponível para exportação.");
        return;
      }
      downloadCanonicalSalesCsv(buildCanonicalSalesCsv(sales));
      onToast("Vendas canônicas exportadas em CSV.");
    } catch {
      onToast("Não foi possível exportar as vendas canônicas.");
    }
  }

  if (loading) return <LoadingState label="Carregando Kanban de Negócios" rows={5} />;
  if (error) return <ErrorState description="Tente novamente sem alterar os filtros." onRetry={() => void load()} title={error} />;

  const totalBusinesses = summary?.total ?? pagination.total;
  const activeDrawerSession = drawerSessionSequence.current;

  return (
    <section className="negocios-workspace space-y-3" aria-label="Kanban de Negócios">
      <NegociosKanbanToolbar
        operationalFilter={operationalFilter}
        onClear={() => { setQuery(""); setSearch(""); setStageFilter(""); setOperationalFilter(""); setPage(1); }}
        onOperationalFilterChange={(value) => { setOperationalFilter(value); setPage(1); }}
        onExportSales={() => void exportCanonicalSalesCsv()}
        onQueryChange={setQuery}
        onStageFilterChange={(value) => { setStageFilter(value); setPage(1); }}
        query={query}
        refreshing={refreshing}
        stageFilter={stageFilter}
        searchInputRef={workspaceFallbackFocus}
        total={totalBusinesses}
      />

      <NegociosKanbanBoard
        businesses={businesses}
        dragOverStage={dragOverStage}
        onDragOverStageChange={setDragOverStage}
        onMoveBusiness={(id, stage) => { void moveBusiness(id, stage); }}
        onOpenBusiness={openBusiness}
      />

      <Surface>
        <Pagination disabled={refreshing} itemLabel="Negócios" onPageChange={setPage} page={page} total={pagination.total} totalPages={pagination.totalPages} visibleCount={businesses.length} />
      </Surface>

      {selected && <BusinessDrawer authSession={authSession} business={selected} initialProposalId={selectedProposalId} isMoving={movingBusinessId === selected.id} key={selected.id} loading={detailLoading} onCanonicalChanged={(id, message) => refreshCanonicalBusiness(id, message, activeDrawerSession)} onClose={closeBusiness} onMoveBusiness={moveBusiness} onOpenAgenda={onOpenAgenda} />}
    </section>
  );
}

type NegociosKanbanToolbarProps = {
  total: number;
  refreshing: boolean;
  query: string;
  stageFilter: BusinessStage | "";
  operationalFilter: BusinessOperationalFilter | "";
  searchInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onStageFilterChange: (value: BusinessStage | "") => void;
  onOperationalFilterChange: (value: BusinessOperationalFilter | "") => void;
  onClear: () => void;
  onExportSales: () => void;
};

export function NegociosKanbanToolbar({
  total,
  refreshing,
  query,
  stageFilter,
  operationalFilter,
  searchInputRef,
  onQueryChange,
  onStageFilterChange,
  onOperationalFilterChange,
  onClear,
  onExportSales,
}: NegociosKanbanToolbarProps) {
  const totalLabel = total === 1 ? "negócio" : "negócios";

  return (
    <Surface className="negocios-command-surface overflow-hidden">
      <div aria-label="Filtros do pipeline" className="negocios-filterbar flex flex-wrap items-center gap-2 p-3" role="search">
        <div aria-label={`Total: ${total} ${totalLabel}`} aria-live="polite" className="negocios-total" role="status">
          <span>Total</span>
          <strong>{total}</strong>
          <span>{totalLabel}</span>
          {refreshing && <span className="negocios-total-refresh">Atualizando…</span>}
        </div>
        <Input aria-label="Buscar Negócios" containerClassName="min-w-[220px] flex-1" onChange={(event) => onQueryChange(event.target.value)} placeholder="Título ou Cliente" ref={searchInputRef} value={query} />
        <Select aria-label="Filtrar por etapa" containerClassName="w-48" onChange={(event) => onStageFilterChange(event.target.value as BusinessStage | "")} value={stageFilter}>
          <option value="">Todas as etapas</option>
          {stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
        </Select>
        <Select
          aria-label="Filtrar por situação operacional"
          containerClassName="w-56"
          onChange={(event) => onOperationalFilterChange(event.target.value as BusinessOperationalFilter | "")}
          value={operationalFilter}
        >
          <option value="">Todas as situações</option>
          <option value="PARADOS">Negócios parados</option>
          <option value="SEM_PROXIMA_ACAO">Sem próxima ação</option>
          <option value="PROXIMA_ACAO_ATRASADA">Próxima ação atrasada</option>
          <option value="PROXIMA_ACAO_HOJE">Próxima ação hoje</option>
        </Select>
        <Button disabled={!query && !stageFilter && !operationalFilter} onClick={onClear} size="md" variant="secondary">Limpar</Button>
        <Button onClick={onExportSales} size="md" variant="secondary">Exportar vendas CSV</Button>
      </div>
    </Surface>
  );
}

type NegociosKanbanBoardProps = {
  businesses: CommunicationBusiness[];
  dragOverStage: BusinessStage | null;
  onDragOverStageChange: (stage: BusinessStage | null) => void;
  onMoveBusiness: (id: number, stage: BusinessStage) => void;
  onOpenBusiness: (business: CommunicationBusiness, trigger: HTMLElement) => void;
};

export function NegociosKanbanBoard({
  businesses,
  dragOverStage,
  onDragOverStageChange,
  onMoveBusiness,
  onOpenBusiness,
}: NegociosKanbanBoardProps) {
  return (
    <div aria-label="Quadro de Negócios" className="negocios-board-scroll overflow-x-auto pb-1" data-negocios-board-scroll tabIndex={0}>
      <div className="negocios-board">
        {stages.map((stage) => {
          const stageBusinesses = businesses.filter((business) => business.etapa === stage);
          return (
            <section
              aria-labelledby={`negocios-stage-${stage}`}
              className={`negocios-stage ${dragOverStage === stage ? "is-drag-over" : ""}`}
              data-stage={stage}
              key={stage}
              onDragLeave={() => onDragOverStageChange(null)}
              onDragOver={(event) => { event.preventDefault(); onDragOverStageChange(stage); }}
              onDrop={(event) => {
                event.preventDefault();
                const id = Number(event.dataTransfer.getData("negocioId"));
                if (id) onMoveBusiness(id, stage);
              }}
            >
              <header className="negocios-stage-header">
                <h2 id={`negocios-stage-${stage}`}>{stageLabels[stage]}</h2>
                <span aria-label={stageBusinesses.length === 1 ? "1 negócio" : `${stageBusinesses.length} negócios`} className="negocios-stage-count">{stageBusinesses.length}</span>
              </header>
              <div className="negocios-stage-list space-y-2">
                {stageBusinesses.length === 0 && <p className="negocios-stage-empty">Sem negócios nesta etapa</p>}
                {stageBusinesses.map((business) => (
                  <BusinessCard business={business} key={business.id} onOpen={onOpenBusiness} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function BusinessCard({ business, onOpen }: { business: CommunicationBusiness; onOpen: (business: CommunicationBusiness, trigger: HTMLElement) => void }) {
  const canMove = business.permissoes?.movimentar === true;
  const currentStageTime = formatBusinessDuration(business.tempoEtapa?.atualSegundos);
  const nextAction = business.proximaAcao;
  const isNextActionOverdue = nextAction?.atrasada === true;
  const activeSale = business.contratoComercial?.vendaAtiva || null;
  const displayedValue = activeSale
    ? formatCents(activeSale.totalCentavos)
    : business.etapa === "FECHADO" ? "Venda não reconciliada" : formatBusinessValue(business.valor);
  return (
    <div
      aria-label={`Abrir Negócio ${business.titulo || business.id}`}
      className={`negocios-card ${business.negocioParado ? "is-stalled" : ""} ${isNextActionOverdue ? "is-overdue" : ""} ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      data-negocio-card-id={business.id}
      draggable={canMove}
      onClick={(event) => void onOpen(business, event.currentTarget)}
      onDragStart={(event) => { event.dataTransfer.setData("negocioId", String(business.id)); event.dataTransfer.effectAllowed = "move"; }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void onOpen(business, event.currentTarget); } }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="negocios-card-title truncate">{business.titulo || `Negócio #${business.id}`}</p>
          <p className="negocios-card-client mt-0.5 truncate">{business.cliente?.nome || "Cliente não informado"}</p>
        </div>
        {canMove && <GripVertical aria-hidden="true" className="shrink-0 text-[var(--icon-muted)]" size={14} />}
      </div>
      <div className="negocios-card-context mt-2 border-t border-[var(--border-default)] pt-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate">{business.responsavel?.nome || "Sem responsável"}</p>
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{activeSale ? "Realizado" : business.etapa === "FECHADO" ? "Legado" : "Estimado"}</p>
            <p className="negocios-card-value">{displayedValue}</p>
          </div>
        </div>
        <div className="negocios-card-rhythm mt-2 flex min-w-0 items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate" title={business.tempoEtapa?.estimado ? "Tempo estimado na etapa" : "Tempo na etapa atual"}>
            <Clock3 aria-hidden="true" className="shrink-0" size={12} />
            {business.tempoEtapa?.estimado ? "~ " : ""}{currentStageTime}
          </span>
          {business.negocioParado && (
            <span className="negocios-card-stalled inline-flex shrink-0 items-center gap-1" data-negocio-stalled title={business.motivoParado === "PROXIMA_ACAO_ATRASADA" ? "Próxima ação atrasada" : "Sem próxima ação"}>
              <AlertTriangle aria-hidden="true" size={11} />
              Parado
            </span>
          )}
        </div>
        <div className={`negocios-card-action mt-2 min-w-0 ${nextAction?.atrasada ? "is-overdue" : ""}`}>
          <p className="inline-flex items-center gap-1"><CalendarClock aria-hidden="true" size={11} /> Próxima ação</p>
          {nextAction ? (
            <p className="mt-0.5 font-medium" title={`${nextAction.titulo} · ${formatCompactDateTime(nextAction.dataHora)}`}>
              {nextAction.titulo} · {formatCompactDateTime(nextAction.dataHora)}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[var(--text-muted)]">Nenhuma ação agendada</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function BusinessDrawer({ authSession, business, initialProposalId = null, isMoving, loading, onCanonicalChanged, onClose, onMoveBusiness, onOpenAgenda }: { authSession: AuthSession | null; business: CommunicationBusiness; initialProposalId?: number | null; isMoving: boolean; loading: boolean; onCanonicalChanged: (id: number, message: string) => Promise<void>; onClose: () => void; onMoveBusiness: (id: number, stage: BusinessStage) => Promise<boolean>; onOpenAgenda: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const stageSelectRef = useRef<HTMLSelectElement>(null);
  const canMove = business.permissoes?.movimentar === true;
  const contract = business.contratoComercial ?? { revisao: 1, propostaPrincipalId: null, propostaVencedoraId: null, vendaAtivaId: null, propostaPrincipal: null, propostaVencedora: null, vendaAtiva: null, propostasAceitasCount: 0 };
  const [canonicalAction, setCanonicalAction] = useState<"proposal" | "manual" | "lost" | "reopen" | null>(null);
  const [canonicalReason, setCanonicalReason] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [canonicalError, setCanonicalError] = useState("");
  const [canonicalBusy, setCanonicalBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey(business.id));
  const [canonicalState, setCanonicalState] = useState<CanonicalCommercialState | null>(null);
  const [canonicalStateLoading, setCanonicalStateLoading] = useState(false);
  const [canonicalStateError, setCanonicalStateError] = useState("");
  const canonicalRequestSequence = useRef(0);
  const canonicalRequestController = useRef<AbortController | null>(null);
  const drawerMounted = useRef(true);

  const refreshCanonicalState = useCallback(async () => {
    if (!drawerMounted.current) return;
    const requestSequence = canonicalRequestSequence.current + 1;
    canonicalRequestSequence.current = requestSequence;
    canonicalRequestController.current?.abort();
    const controller = new AbortController();
    canonicalRequestController.current = controller;
    setCanonicalStateLoading(true);
    setCanonicalStateError("");
    try {
      const nextState = await fetchCanonicalCommercialState(business.id, { signal: controller.signal });
      if (!drawerMounted.current || controller.signal.aborted || canonicalRequestSequence.current !== requestSequence) return;
      setCanonicalState(nextState);
    } catch {
      if (!drawerMounted.current || controller.signal.aborted || canonicalRequestSequence.current !== requestSequence) return;
      setCanonicalStateError("Não foi possível carregar o histórico canônico.");
    } finally {
      if (drawerMounted.current && canonicalRequestSequence.current === requestSequence) {
        canonicalRequestController.current = null;
        setCanonicalStateLoading(false);
      }
    }
  }, [business.id]);

  useEffect(() => {
    drawerMounted.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshCanonicalState();
    });
    return () => {
      cancelled = true;
      drawerMounted.current = false;
      canonicalRequestSequence.current += 1;
      canonicalRequestController.current?.abort();
      canonicalRequestController.current = null;
    };
  }, [refreshCanonicalState]);

  const requestClose = useCallback(() => {
    if (isMoving || canonicalBusy) return;
    onClose();
  }, [canonicalBusy, isMoving, onClose]);

  function handleStageChange(nextStage: BusinessStage) {
    if (!canMove || isMoving || canonicalBusy || nextStage === business.etapa) return;
    void onMoveBusiness(business.id, nextStage).finally(() => {
      window.requestAnimationFrame(() => stageSelectRef.current?.focus({ preventScroll: true }));
    });
  }

  function beginCanonicalAction(action: "proposal" | "manual" | "lost" | "reopen") {
    setCanonicalAction(action);
    setCanonicalReason("");
    setManualValue("");
    setCanonicalError("");
    setIdempotencyKey(newIdempotencyKey(business.id));
  }

  async function confirmCanonicalAction() {
    if (!canonicalAction) return;
    setCanonicalError("");
    const reason = canonicalReason.trim();
    if ((canonicalAction === "lost" || canonicalAction === "reopen") && !reason) {
      setCanonicalError("Informe o motivo da operação.");
      return;
    }
    const manualCents = canonicalAction === "manual" ? parseMoneyInputToCents(manualValue) : null;
    if (canonicalAction === "manual" && manualCents === null) {
      setCanonicalError("Informe o valor final em BRL.");
      return;
    }
    setCanonicalBusy(true);
    try {
      if (canonicalAction === "proposal") {
        await closeDealAsWon(business.id, { origem: "ACCEPTED_PROPOSAL", idempotencyKey, contratoRevisao: contract.revisao });
        await onCanonicalChanged(business.id, "Venda registrada pela proposta vencedora.");
      } else if (canonicalAction === "manual") {
        await closeDealAsWon(business.id, { origem: "MANUAL_CLOSE", idempotencyKey, contratoRevisao: contract.revisao, valorFinalCentavos: manualCents ?? 0 });
        await onCanonicalChanged(business.id, "Venda manual registrada com snapshot.");
      } else if (canonicalAction === "lost") {
        await markDealAsLost(business.id, contract.revisao, reason);
        await onCanonicalChanged(business.id, "Negócio marcado como perdido com motivo registrado.");
      } else {
        await reopenCanonicalDeal(business.id, contract.revisao, reason);
        await onCanonicalChanged(business.id, "Negócio reaberto; o histórico anterior foi preservado.");
      }
      if (!drawerMounted.current) return;
      await refreshCanonicalState();
      setCanonicalAction(null);
      setCanonicalReason("");
      setManualValue("");
    } catch (error) {
      if (drawerMounted.current) setCanonicalError(error instanceof Error ? error.message : "Não foi possível concluir a operação comercial.");
    } finally {
      if (drawerMounted.current) setCanonicalBusy(false);
    }
  }

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  return (
    <div className="negocios-drawer-layer fixed inset-0 z-[220] flex justify-end" role="presentation">
      <button aria-label="Fechar detalhes do Negócio" className="negocios-drawer-backdrop absolute inset-0 cursor-default" disabled={isMoving || canonicalBusy} onClick={requestClose} tabIndex={-1} type="button" />
      <aside aria-labelledby={`negocios-drawer-title-${business.id}`} aria-modal="true" className="negocios-drawer relative flex h-full w-full max-w-[760px] flex-col" ref={drawerRef} role="dialog">
        <header className="negocios-drawer-header flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="negocios-drawer-eyebrow">Negócio #{business.id} · {stageLabels[business.etapa]}</p>
            <h2 className="negocios-drawer-title mt-1 truncate" id={`negocios-drawer-title-${business.id}`}>{business.titulo || "Sem título"}</h2>
            <p className="negocios-drawer-client mt-1 truncate">{business.cliente?.nome || "Cliente não informado"}</p>
          </div>
          <Button aria-label="Fechar detalhes" disabled={isMoving || canonicalBusy} onClick={requestClose} ref={closeButtonRef} size="sm" variant="ghost"><X size={16} /></Button>
        </header>
        <div className="negocios-drawer-body flex-1 overflow-y-auto p-4">
          {loading && <LoadingState label="Carregando detalhes" rows={2} />}
          <dl className="negocios-drawer-facts grid grid-cols-2 gap-x-4 gap-y-3">
            <Detail label="Etapa" value={stageLabels[business.etapa]} />
            <Detail label="Responsável" value={business.responsavel?.nome || "Sem responsável"} />
            <Detail label="Cliente" value={business.cliente?.nome || "Não informado"} />
            <Detail label="Empresa" value={business.cliente?.empresa || "Não informada"} />
            <Detail label="Lead" value={business.lead ? `#${business.lead.id} · ${business.lead.status}` : "Sem Lead de origem"} />
            <Detail label="Origem" value={business.lead?.origem || "Não informada"} />
            <Detail label="Valor estimado" value={formatBusinessValue(business.valor, "Não informado")} />
            <Detail label="Criado em" value={new Date(business.createdAt).toLocaleString("pt-BR")} />
          </dl>
          <section aria-labelledby={`negocios-move-stage-${business.id}`} className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]" id={`negocios-move-stage-${business.id}`}>Movimentar etapa</h3>
            <Select
              aria-busy={isMoving || canonicalBusy}
              containerClassName="mt-2 max-w-sm"
              disabled={!canMove || isMoving || canonicalBusy}
              helperText={canMove ? isMoving ? "Movendo Negócio..." : "Selecione a próxima etapa." : "Você não tem permissão para movimentar este Negócio."}
              label="Mover para etapa"
              onChange={(event) => handleStageChange(event.target.value as BusinessStage)}
              ref={stageSelectRef}
              value={business.etapa}
            >
              {stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
            </Select>
          </section>
          <section aria-labelledby={`negocios-sale-contract-${business.id}`} className="mt-5 border-t border-[var(--border-default)] pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]" id={`negocios-sale-contract-${business.id}`}>Contrato da venda</h3>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">A proposta aceita não vira receita até o fechamento explícito.</p>
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Revisão {contract.revisao}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--border-default)] text-[9px] max-[640px]:grid-cols-2">
              <SaleStep label="Estimativa" value={formatBusinessValue(business.valor, "Não informada")} />
              <SaleStep label="Principal" value={contract.propostaPrincipal?.codigo || "Não definida"} />
              <SaleStep label="Vencedora" value={contract.propostaVencedora?.codigo || "Não definida"} />
              <SaleStep label="Venda" value={contract.vendaAtiva ? formatCents(contract.vendaAtiva.totalCentavos) : "Não realizada"} />
            </div>
            {contract.vendaAtiva && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Venda ativa · revisão {contract.vendaAtiva.revisao}</p><p className="text-sm font-semibold tabular-nums text-emerald-950">{formatCents(contract.vendaAtiva.totalCentavos)}</p></div><p className="mt-1 text-[10px] text-emerald-800">Origem: {contract.vendaAtiva.origem === "ACCEPTED_PROPOSAL" ? `proposta ${contract.propostaVencedora?.codigo || "vencedora"}` : "fechamento manual"} · {new Date(contract.vendaAtiva.fechadoEm).toLocaleString("pt-BR")}</p></div>}
            <section aria-labelledby={`negocios-sale-history-${business.id}`} className="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]" id={`negocios-sale-history-${business.id}`}>Histórico da venda</h4>
                {canonicalStateLoading && <span className="text-[9px] text-[var(--text-muted)]">Carregando…</span>}
              </div>
              {canonicalStateError && <p aria-live="polite" className="mt-2 text-[10px] text-rose-700">{canonicalStateError}</p>}
              {!canonicalStateLoading && !canonicalStateError && <CanonicalSaleHistory sales={canonicalState?.vendas || []} />}
            </section>
            <div className="mt-3 flex flex-wrap gap-2">
              {business.permissoes?.fechar && contract.propostaVencedoraId && <Button disabled={canonicalBusy} onClick={() => beginCanonicalAction("proposal")} size="sm">Fechar com proposta vencedora</Button>}
              {business.permissoes?.fechar && !contract.propostaVencedoraId && contract.propostasAceitasCount === 0 && <Button disabled={canonicalBusy} onClick={() => beginCanonicalAction("manual")} size="sm">Fechar venda manual</Button>}
              {business.permissoes?.fechar && !contract.propostaVencedoraId && contract.propostasAceitasCount > 0 && <p className="self-center text-[10px] text-[var(--text-muted)]">Reconcilie a proposta aceita antes de fechar a venda.</p>}
              {business.permissoes?.marcarPerdido && !contract.propostaVencedoraId && contract.propostasAceitasCount === 0 && <Button disabled={canonicalBusy} onClick={() => beginCanonicalAction("lost")} size="sm" variant="secondary">Marcar como perdido</Button>}
              {business.permissoes?.marcarPerdido && !contract.propostaVencedoraId && contract.propostasAceitasCount > 0 && <p className="self-center text-[10px] text-[var(--text-muted)]">Reconcilie a proposta aceita antes de perder o Negócio.</p>}
              {business.permissoes?.marcarPerdido && contract.propostaVencedoraId && <p className="self-center text-[10px] text-[var(--text-muted)]">Remova a vencedora antes de marcar como perdido.</p>}
              {business.permissoes?.reabrir && <Button disabled={canonicalBusy} onClick={() => beginCanonicalAction("reopen")} size="sm" variant="secondary">Reabrir com auditoria</Button>}
            </div>
            {canonicalAction && <div className="mt-3 space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3">
              {canonicalAction === "manual" && <Input inputMode="decimal" label="Valor final (BRL)" onChange={(event) => { setManualValue(event.target.value); if (canonicalError) setCanonicalError(""); }} placeholder="0,00" value={manualValue} />}
              {(canonicalAction === "lost" || canonicalAction === "reopen") && <Textarea label="Motivo obrigatório" maxLength={500} onChange={(event) => { setCanonicalReason(event.target.value); if (canonicalError) setCanonicalError(""); }} rows={2} value={canonicalReason} />}
              {canonicalAction === "proposal" && <p className="text-[11px] text-[var(--text-secondary)]">O valor e os itens serão copiados da proposta vencedora {contract.propostaVencedora?.codigo}. Nenhum valor oculto será solicitado.</p>}
              {canonicalError && <p aria-live="assertive" className="text-[11px] text-rose-700">{canonicalError}</p>}
              <div className="flex justify-end gap-2"><Button disabled={canonicalBusy} onClick={() => { setCanonicalAction(null); setCanonicalError(""); }} size="sm" variant="ghost">Cancelar</Button><Button disabled={canonicalBusy} onClick={() => void confirmCanonicalAction()} size="sm">{canonicalBusy ? "Confirmando…" : "Confirmar operação"}</Button></div>
            </div>}
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Observação</h3>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">{business.observacao || "Nenhuma observação registrada."}</p>
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <BusinessStageTimingPanel business={business} key={business.id} onOpenAgenda={onOpenAgenda} />
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <CommercialProposalsPanel businessId={business.id} canCreate={business.permissoes?.movimentar === true && ["NOVO", "CONTATO", "PROPOSTA"].includes(business.etapa)} initialProposalId={initialProposalId} onChanged={() => void onCanonicalChanged(business.id, "Contrato comercial atualizado.")} />
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Conversas relacionadas</h3>
            {business.lead?.conversas?.length ? (
              <div className="mt-2 space-y-2">
                {business.lead.conversas.map((conversation) => (
                  <div className="rounded-md border border-[var(--border-default)] px-3 py-2 text-[11px]" key={conversation.id}>
                    <p className="font-medium text-[var(--text-primary)]">{conversation.canalIntegracao.nome}</p>
                    <p className="mt-0.5 text-[var(--text-muted)]">{conversation.status} · {new Date(conversation.updatedAt).toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-[11px] text-[var(--text-muted)]">Nenhuma conversa vinculada.</p>}
          </section>
          <div className="mt-5 flex items-center gap-2 border-t border-[var(--border-default)] pt-4 text-[11px] text-[var(--text-muted)]">
            <UserRound size={13} /> Sessão: {authSession?.usuario.nome || "Usuário autenticado"}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt>{label}</dt><dd>{value}</dd></div>;
}

function SaleStep({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[var(--bg-surface)] px-2.5 py-2"><p className="font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-1 truncate font-medium text-[var(--text-primary)]" title={value}>{value}</p></div>;
}

function CanonicalSaleHistory({ sales }: { sales: CanonicalSale[] }) {
  if (!sales.length) return <p className="mt-2 text-[10px] text-[var(--text-muted)]">Nenhuma venda canônica registrada.</p>;
  return (
    <div className="mt-2 space-y-2">
      {sales.map((sale) => (
        <article className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-2" key={sale.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-[var(--text-primary)]">Venda #{sale.id} · revisão {sale.revisao}</p>
            <span className={`text-[9px] font-semibold uppercase tracking-wide ${sale.status === "ACTIVE" ? "text-emerald-700" : "text-amber-700"}`}>{sale.status === "ACTIVE" ? "Ativa" : "Invalidada"}</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{sale.origem === "ACCEPTED_PROPOSAL" ? "Proposta vencedora" : "Fechamento manual"} · {formatCents(sale.totalCentavos)} · {new Date(sale.fechadoEm).toLocaleString("pt-BR")}</p>
          {sale.status === "INVALIDATED" && <p className="mt-1 text-[10px] text-amber-800">Motivo da invalidação: {sale.motivoInvalidacao || "não informado"}{sale.invalidadoEm ? ` · ${new Date(sale.invalidadoEm).toLocaleString("pt-BR")}` : ""}</p>}
          {(sale.historico || []).length > 0 && <div className="mt-1.5 border-t border-[var(--border-default)] pt-1.5">{sale.historico?.map((entry) => <p className="text-[9px] text-[var(--text-muted)]" key={entry.id}>{entry.acao === "CREATE" ? "Venda criada" : "Venda invalidada"}{entry.motivo ? ` · ${entry.motivo}` : ""} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</p>)}</div>}
        </article>
      ))}
    </div>
  );
}

function formatBusinessValue(value: number | null, emptyLabel = "Sem valor") {
  if (value === null) return emptyLabel;
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value / 100);
}

function newIdempotencyKey(businessId: number) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `deal-${businessId}-${random}`;
}

function formatCompactDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
