import { AlertTriangle, CalendarClock, Clock3, GripVertical, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  fetchNegocioKanban,
  fetchNegociosKanban,
  updateNegocioKanbanStage,
} from "../../services/crmApi";
import type {
  AuthSession,
  BusinessOperationalFilter,
  BusinessStage,
  CommunicationBusiness,
  NegociosKanbanResponse,
} from "../../services/crmApi";
import { Button, ErrorState, Input, LoadingState, Pagination, Select, Surface } from "../ui";
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
};

const defaultNegociosKanbanAdapter: NegociosKanbanAdapter = {
  fetchNegocioKanban,
  fetchNegociosKanban,
  updateNegocioKanbanStage,
};

type Props = {
  authSession: AuthSession | null;
  initialBusinessId?: number | null;
  adapter?: NegociosKanbanAdapter;
  onInitialBusinessHandled?: () => void;
  onOpenAgenda: () => void;
  onToast: (message: string) => void;
};

export default function DashboardNegociosKanbanPanel({ adapter = defaultNegociosKanbanAdapter, authSession, initialBusinessId, onInitialBusinessHandled, onOpenAgenda, onToast }: Props) {
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
  const [detailLoading, setDetailLoading] = useState(false);
  const requestSequence = useRef(0);
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(query.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!initialBusinessId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setDetailLoading(true);
      adapter.fetchNegocioKanban(initialBusinessId)
        .then((business) => { if (active) setSelected(business); })
        .catch(() => { if (active) onToast("Não foi possível abrir o Negócio selecionado."); })
        .finally(() => {
          if (active) setDetailLoading(false);
          onInitialBusinessHandled?.();
        });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adapter, initialBusinessId, onInitialBusinessHandled, onToast]);

  async function openBusiness(business: CommunicationBusiness, trigger: HTMLElement) {
    detailTrigger.current = trigger;
    detailTriggerBusinessId.current = business.id;
    setSelected(business);
    setDetailLoading(true);
    try {
      setSelected(await adapter.fetchNegocioKanban(business.id));
    } catch {
      onToast("Não foi possível carregar todos os detalhes.");
    } finally {
      setDetailLoading(false);
    }
  }

  const closeBusiness = useCallback(() => {
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

  if (loading) return <LoadingState label="Carregando Kanban de Negócios" rows={5} />;
  if (error) return <ErrorState description="Tente novamente sem alterar os filtros." onRetry={() => void load()} title={error} />;

  const totalBusinesses = summary?.total ?? pagination.total;

  return (
    <section className="negocios-workspace space-y-3" aria-label="Kanban de Negócios">
      <NegociosKanbanToolbar
        operationalFilter={operationalFilter}
        onClear={() => { setQuery(""); setSearch(""); setStageFilter(""); setOperationalFilter(""); setPage(1); }}
        onOperationalFilterChange={(value) => { setOperationalFilter(value); setPage(1); }}
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

      {selected && <BusinessDrawer authSession={authSession} business={selected} isMoving={movingBusinessId === selected.id} loading={detailLoading} onClose={closeBusiness} onMoveBusiness={moveBusiness} onOpenAgenda={onOpenAgenda} />}
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
          <p className="negocios-card-value shrink-0">{formatBusinessValue(business.valor)}</p>
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

function BusinessDrawer({ authSession, business, isMoving, loading, onClose, onMoveBusiness, onOpenAgenda }: { authSession: AuthSession | null; business: CommunicationBusiness; isMoving: boolean; loading: boolean; onClose: () => void; onMoveBusiness: (id: number, stage: BusinessStage) => Promise<boolean>; onOpenAgenda: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const stageSelectRef = useRef<HTMLSelectElement>(null);
  const canMove = business.permissoes?.movimentar === true;

  const requestClose = useCallback(() => {
    if (isMoving) return;
    onClose();
  }, [isMoving, onClose]);

  function handleStageChange(nextStage: BusinessStage) {
    if (!canMove || isMoving || nextStage === business.etapa) return;
    void onMoveBusiness(business.id, nextStage).finally(() => {
      window.requestAnimationFrame(() => stageSelectRef.current?.focus({ preventScroll: true }));
    });
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
      <button aria-label="Fechar detalhes do Negócio" className="negocios-drawer-backdrop absolute inset-0 cursor-default" disabled={isMoving} onClick={requestClose} tabIndex={-1} type="button" />
      <aside aria-labelledby={`negocios-drawer-title-${business.id}`} aria-modal="true" className="negocios-drawer relative flex h-full w-full max-w-[760px] flex-col" ref={drawerRef} role="dialog">
        <header className="negocios-drawer-header flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="negocios-drawer-eyebrow">Negócio #{business.id} · {stageLabels[business.etapa]}</p>
            <h2 className="negocios-drawer-title mt-1 truncate" id={`negocios-drawer-title-${business.id}`}>{business.titulo || "Sem título"}</h2>
            <p className="negocios-drawer-client mt-1 truncate">{business.cliente?.nome || "Cliente não informado"}</p>
          </div>
          <Button aria-label="Fechar detalhes" disabled={isMoving} onClick={requestClose} ref={closeButtonRef} size="sm" variant="ghost"><X size={16} /></Button>
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
            <Detail label="Valor" value={formatBusinessValue(business.valor, "Não informado")} />
            <Detail label="Criado em" value={new Date(business.createdAt).toLocaleString("pt-BR")} />
          </dl>
          <section aria-labelledby={`negocios-move-stage-${business.id}`} className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]" id={`negocios-move-stage-${business.id}`}>Movimentar etapa</h3>
            <Select
              aria-busy={isMoving}
              containerClassName="mt-2 max-w-sm"
              disabled={!canMove || isMoving}
              helperText={canMove ? isMoving ? "Movendo Negócio..." : "Selecione a próxima etapa." : "Você não tem permissão para movimentar este Negócio."}
              label="Mover para etapa"
              onChange={(event) => handleStageChange(event.target.value as BusinessStage)}
              ref={stageSelectRef}
              value={business.etapa}
            >
              {stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
            </Select>
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Observação</h3>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">{business.observacao || "Nenhuma observação registrada."}</p>
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <BusinessStageTimingPanel business={business} key={business.id} onOpenAgenda={onOpenAgenda} />
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <CommercialProposalsPanel businessId={business.id} />
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

function formatBusinessValue(value: number | null, emptyLabel = "Sem valor") {
  if (value === null) return emptyLabel;
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatCompactDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
