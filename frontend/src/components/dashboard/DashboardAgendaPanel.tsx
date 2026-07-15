import { AlertTriangle, Bell, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Columns3, Edit3, List, Plus, RefreshCw, RotateCcw, StickyNote, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  cancelarAcompanhamento,
  concluirAcompanhamento,
  createAcompanhamento,
  fetchAcompanhamentos,
  reabrirAcompanhamento,
  updateAcompanhamento,
  type AcompanhamentoPayload,
  type ApiAcompanhamento,
  type ApiAcompanhamentoPrioridade,
  type ApiAcompanhamentoStatus,
  type ApiAcompanhamentoTipo,
  type AcompanhamentoQueryParams,
} from "../../services/crmApi";
import type { Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";
import { Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Pagination, SectionHeader, Select, Surface, Textarea, Toolbar } from "../ui";
import DashboardMetricStrip from "./DashboardMetricStrip";

type FollowUpGroup = {
  label: string;
  hint: string;
  clients: Client[];
};

type DashboardAgendaPanelProps = {
  clients: Client[];
  backendCaption: string;
  createRequestKey: number;
  todayRequestKey: number;
  followUpAgenda: FollowUpGroup[];
  recentActivities: RecentActivity[];
  smartAlerts: string[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
};

type AgendaForm = {
  clienteId: string;
  titulo: string;
  descricao: string;
  data: string;
  hora: string;
  prioridade: ApiAcompanhamentoPrioridade;
  tipo: ApiAcompanhamentoTipo;
  responsavel: string;
};

const PAGE_SIZE = 6;
const STATUSES: Array<"Todos" | ApiAcompanhamentoStatus> = ["Todos", "PENDENTE", "CONCLUIDO", "CANCELADO"];
const PRIORITIES: Array<"Todas" | ApiAcompanhamentoPrioridade> = ["Todas", "BAIXA", "MEDIA", "ALTA", "CRITICA"];
const TYPES: Array<"Todos" | ApiAcompanhamentoTipo> = ["Todos", "LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "VISITA", "OUTRO"];

const initialForm: AgendaForm = {
  clienteId: "",
  titulo: "",
  descricao: "",
  data: "",
  hora: "09:00",
  prioridade: "MEDIA",
  tipo: "LIGACAO",
  responsavel: "",
};

export default function DashboardAgendaPanel({
  clients,
  backendCaption,
  createRequestKey,
  todayRequestKey,
  recentActivities,
  smartAlerts,
  onSelectClient,
  onApplySmartFilter,
}: DashboardAgendaPanelProps) {
  const [items, setItems] = useState<ApiAcompanhamento[]>([]);
  const [periodItems, setPeriodItems] = useState<ApiAcompanhamento[]>([]);
  const [nextCommitment, setNextCommitment] = useState<ApiAcompanhamento | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"Todos" | ApiAcompanhamentoStatus>("Todos");
  const [priority, setPriority] = useState<"Todas" | ApiAcompanhamentoPrioridade>("Todas");
  const [type, setType] = useState<"Todos" | ApiAcompanhamentoTipo>("Todos");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyToday, setOnlyToday] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "week">("list");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [isContextLoading, setIsContextLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "reschedule" | null>(null);
  const [editing, setEditing] = useState<ApiAcompanhamento | null>(null);
  const [form, setForm] = useState<AgendaForm>(initialForm);
  const [formError, setFormError] = useState("");
  const handledCreateRequest = useRef(createRequestKey);
  const handledTodayRequest = useRef(todayRequestKey);
  const mutationInFlight = useRef(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const periodQuery = useMemo(() => ({ dataInicial: weekStart.toISOString(), dataFinal: weekEnd.toISOString() }), [weekEnd, weekStart]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (handledCreateRequest.current === createRequestKey) return;
    handledCreateRequest.current = createRequestKey;
    setEditing(null);
    setForm({ ...initialForm, clienteId: clients[0] ? String(clients[0].backendId || clients[0].id) : "" });
    setFormError("");
    setModalMode("create");
  }, [clients, createRequestKey]);

  useEffect(() => {
    if (handledTodayRequest.current === todayRequestKey) return;
    handledTodayRequest.current = todayRequestKey;
    setWeekStart(startOfWeek(new Date()));
    setOnlyToday(true);
    setOnlyLate(false);
    setStatus("Todos");
    setPriority("Todas");
    setPage(1);
  }, [todayRequestKey]);

  useEffect(() => {
    let ignore = false;

    async function loadAgenda() {
      setIsLoading(true);
      setError("");

      try {
        const params: AcompanhamentoQueryParams = {
          busca: debouncedSearch,
          clienteId: clientFilter === "Todos" ? undefined : Number(clientFilter),
          status: status === "Todos" ? undefined : status,
          prioridade: priority === "Todas" ? undefined : priority,
          tipo: type === "Todos" ? undefined : type,
          atrasados: onlyLate || undefined,
          hoje: onlyToday || undefined,
          ...periodQuery,
        };
        const list = viewMode === "week"
          ? await fetchAllAcompanhamentos(params)
          : await fetchAcompanhamentos({ ...params, page, limit: PAGE_SIZE });

        if (ignore) return;
        if (Array.isArray(list)) {
          setItems(list);
          setTotal(list.length);
        } else {
          setItems(list.data);
          setTotal(list.pagination.total);
        }
      } catch (loadError) {
        if (ignore) return;
        console.error("Falha ao carregar acompanhamentos", loadError);
        setError("Nao foi possivel carregar os acompanhamentos.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void loadAgenda();

    return () => {
      ignore = true;
    };
  }, [clientFilter, debouncedSearch, onlyLate, onlyToday, page, periodQuery, priority, refreshKey, status, type, viewMode]);

  useEffect(() => {
    let ignore = false;

    async function loadAgendaContext() {
      setIsContextLoading(true);
      try {
        const [period, next] = await Promise.all([
          fetchAllAcompanhamentos(periodQuery),
          fetchAcompanhamentos({ dataInicial: new Date().toISOString(), status: "PENDENTE", page: 1, limit: 1 }),
        ]);
        if (ignore) return;
        setPeriodItems(period);
        setNextCommitment(next.data[0] ?? null);
      } catch (contextError) {
        if (ignore) return;
        console.error("Falha ao carregar contexto da agenda", contextError);
        setPeriodItems([]);
        setNextCommitment(null);
      } finally {
        if (!ignore) setIsContextLoading(false);
      }
    }

    void loadAgendaContext();
    return () => {
      ignore = true;
    };
  }, [periodQuery, refreshKey]);

  const hasFilters =
    Boolean(debouncedSearch) || clientFilter !== "Todos" || status !== "Todos" || priority !== "Todas" || type !== "Todos" || onlyLate || onlyToday;

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        id: String(client.backendId || client.id),
        label: `${client.name} - ${client.company}`,
      })),
    [clients],
  );

  const statusCounts = useMemo(() => agendaStatusCounts(periodItems), [periodItems]);
  const upcomingThisWeek = useMemo(
    () => periodItems
      .filter((item) => item.status === "PENDENTE" && !item.atrasado)
      .sort((first, second) => new Date(first.dataHora).getTime() - new Date(second.dataHora).getTime())
      .slice(0, 4),
    [periodItems],
  );

  function moveWeek(offset: number) {
    setWeekStart((current) => addDays(current, offset * 7));
    setOnlyToday(false);
    setPage(1);
  }

  function goToToday() {
    setWeekStart(startOfWeek(new Date()));
    setOnlyToday(true);
    setOnlyLate(false);
    setStatus("Todos");
    setPriority("Todas");
    setPage(1);
  }

  function selectAgendaStatus(next: AgendaStatusKey) {
    if (next === "today") setWeekStart(startOfWeek(new Date()));
    setOnlyToday(next === "today");
    setOnlyLate(next === "late");
    setPriority(next === "critical" ? "CRITICA" : "Todas");
    setStatus(next === "done" ? "CONCLUIDO" : next === "pending" || next === "critical" ? "PENDENTE" : "Todos");
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...initialForm, clienteId: clientOptions[0]?.id ?? "" });
    setFormError("");
    setModalMode("create");
  }

  function openEdit(item: ApiAcompanhamento) {
    setEditing(item);
    setForm(acompanhamentoToForm(item));
    setFormError("");
    setModalMode("edit");
  }

  function openReschedule(item: ApiAcompanhamento) {
    setEditing(item);
    setForm(acompanhamentoToForm(item));
    setFormError("");
    setModalMode("reschedule");
  }

  async function submitForm() {
    const validation = validateForm(form, modalMode === "reschedule");
    if (validation) {
      setFormError(validation);
      return;
    }
    if (mutationInFlight.current) return;

    mutationInFlight.current = true;
    setIsSubmitting(true);
    setFormError("");

    try {
      const payload = formToPayload(form);

      if (modalMode === "create") {
        await createAcompanhamento(payload);
        setToast("Acompanhamento criado com sucesso.");
      } else if (editing) {
        await updateAcompanhamento(editing.id, modalMode === "reschedule" ? { dataHora: payload.dataHora } : payload);
        setToast(modalMode === "reschedule" ? "Acompanhamento reagendado com sucesso." : "Acompanhamento atualizado com sucesso.");
      }

      setModalMode(null);
      setEditing(null);
      setRefreshKey((current) => current + 1);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "";
      setFormError(toFriendlyAgendaError(message));
    } finally {
      mutationInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  async function runAction(item: ApiAcompanhamento, action: "concluir" | "reabrir" | "cancelar") {
    if (mutationInFlight.current) return;

    mutationInFlight.current = true;
    setIsSubmitting(true);

    try {
      if (action === "concluir") {
        await concluirAcompanhamento(item.id);
        setToast("Acompanhamento concluido.");
      } else if (action === "reabrir") {
        await reabrirAcompanhamento(item.id);
        setToast("Acompanhamento reaberto.");
      } else {
        await cancelarAcompanhamento(item.id);
        setToast("Acompanhamento cancelado.");
      }

      setRefreshKey((current) => current + 1);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "";
      setToast(toFriendlyAgendaError(message));
    } finally {
      mutationInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  if (error) {
    return (
      <Surface>
        <ErrorState description="Verifique a conexão e tente novamente em instantes." onRetry={() => setRefreshKey((current) => current + 1)} title={error} />
      </Surface>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-3 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--shadow-md)]">
          {toast}
        </div>
      )}

      <Surface className="overflow-hidden">
        <Toolbar className="min-h-12 gap-3 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <IconButton aria-label="Semana anterior" onClick={() => moveWeek(-1)} variant="secondary"><ChevronLeft size={14} /></IconButton>
            <div className="min-w-[154px] text-center">
              <p className="text-[11px] font-semibold text-[var(--text-primary)]">{formatWeekLabel(weekStart, weekEnd)}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Semana comercial</p>
            </div>
            <IconButton aria-label="Próxima semana" onClick={() => moveWeek(1)} variant="secondary"><ChevronRight size={14} /></IconButton>
            <Button onClick={goToToday} size="sm" variant="ghost">Hoje</Button>
          </div>

          <div aria-label="Visualização da agenda" className="flex rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1" role="group">
            <button aria-pressed={viewMode === "list"} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${viewMode === "list" ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`} onClick={() => { setViewMode("list"); setPage(1); }} type="button">
              <List size={13} /> Lista
            </button>
            <button aria-pressed={viewMode === "week"} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${viewMode === "week" ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`} onClick={() => { setViewMode("week"); setPage(1); }} type="button">
              <Columns3 size={13} /> Semana
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">
            <RefreshCw aria-hidden="true" size={12} /> {backendCaption}
          </span>
        </Toolbar>
      </Surface>

      <AgendaNextCommitment
        disabled={isSubmitting}
        isLoading={isContextLoading}
        item={nextCommitment}
        onComplete={(item) => void runAction(item, "concluir")}
        onOpen={openEdit}
        onSchedule={openCreate}
      />

      <DashboardMetricStrip metrics={[
        { label: "Acompanhamentos hoje", value: String(statusCounts.today), context: "Agenda imediata", icon: <Bell size={15} />, tone: "info", onClick: goToToday, actionLabel: "Filtrar" },
        { label: "Sem contato", value: String(clients.filter((client) => client.lastContactDays >= 7).length), context: "Retomar relação", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Propostas", value: String(clients.filter((client) => client.status === "Proposta").length), context: "Janelas abertas", icon: <Target size={15} />, tone: "warning" },
        { label: "Notas recentes", value: String(clients.reduce((sum, client) => sum + client.notes.length, 0)), context: "Histórico comercial", icon: <StickyNote size={15} /> },
      ]} />

      <AgendaStatusSummary
        active={onlyToday ? "today" : onlyLate ? "late" : priority === "CRITICA" && status === "PENDENTE" ? "critical" : status === "CONCLUIDO" ? "done" : status === "PENDENTE" ? "pending" : status === "Todos" ? "all" : null}
        counts={statusCounts}
        onSelect={selectAgendaStatus}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader
            description={viewMode === "list" ? "Contatos e retornos da semana, com filtros e ações preservados." : "Acompanhamentos agrupados por dia para leitura temporal rápida."}
            icon={<CalendarDays size={15} />}
            title={viewMode === "list" ? "Agenda da semana" : "Visão semanal"}
          />

          <div className="border-b border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
            <Toolbar className="items-end justify-start">
              <Input aria-label="Buscar cliente ou título" containerClassName="min-w-[240px] flex-[1_1_300px]" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou título" value={search} />

              <Select aria-label="Filtrar por status" className="w-auto min-w-[132px]" onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} value={status}>
              {STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
              </Select>

              <Select aria-label="Filtrar por prioridade" className="w-auto min-w-[145px]" onChange={(event) => { setPriority(event.target.value as typeof priority); setPage(1); }} value={priority}>
              {PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}
              </Select>

              <Select aria-label="Filtrar por tipo" className="w-auto min-w-[130px]" onChange={(event) => { setType(event.target.value as typeof type); setPage(1); }} value={type}>
              {TYPES.map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}
              </Select>

              <Select aria-label="Filtrar por cliente" className="w-auto min-w-[190px]" onChange={(event) => { setClientFilter(event.target.value); setPage(1); }} value={clientFilter}>
              <option value="Todos">Todos os clientes</option>
              {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
              </Select>

              <Button disabled={!hasFilters} leftIcon={<RotateCcw size={13} />} onClick={() => { setSearch(""); setDebouncedSearch(""); setStatus("Todos"); setPriority("Todas"); setType("Todos"); setClientFilter("Todos"); setOnlyLate(false); setOnlyToday(false); setPage(1); }} size="sm" variant="ghost">
                Limpar filtros
              </Button>
            </Toolbar>
          </div>

          <div aria-busy={isLoading} className={viewMode === "list" ? "divide-y divide-[var(--border-default)]" : ""}>
            {isLoading && <LoadingState className="p-4" label="Carregando acompanhamentos" rows={4} />}
            {!isLoading && items.length === 0 && <EmptyState description={hasFilters ? "Ajuste ou limpe os filtros para ampliar a consulta." : "Crie um acompanhamento para organizar o próximo contato comercial."} title={hasFilters ? "Nenhum acompanhamento para os filtros" : "Nenhum acompanhamento encontrado"} />}
            {!isLoading && viewMode === "list" && items.map((item) => (
              <AgendaRow
                key={item.id}
                item={item}
                disabled={isSubmitting}
                onSelectClient={onSelectClient}
                onEdit={openEdit}
                onReschedule={openReschedule}
                onAction={runAction}
              />
            ))}
            {!isLoading && viewMode === "week" && items.length > 0 && (
              <AgendaWeekView
                disabled={isSubmitting}
                items={items}
                weekStart={weekStart}
                onAction={runAction}
                onEdit={openEdit}
                onReschedule={openReschedule}
                onSelectClient={onSelectClient}
              />
            )}
          </div>

          {viewMode === "list" && <Pagination disabled={isLoading} itemLabel="acompanhamentos" onPageChange={setPage} page={page} total={total} totalPages={totalPages} visibleCount={items.length} />}
        </Surface>

        <Surface className="min-w-0 self-start overflow-hidden">
          <SectionHeader description="Contexto temporal e sinais que pedem ação." icon={<Clock size={15} />} title="Painel operacional" />
          <SideSection title="Próximos nesta semana">
            {upcomingThisWeek.length === 0 && <p className="px-4 py-3 text-[11px] text-[var(--text-muted)]">Nenhum acompanhamento pendente.</p>}
            {upcomingThisWeek.map((item) => (
              <button key={item.id} className="w-full px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-muted)]" onClick={() => onSelectClient(item.clienteId)} type="button">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{item.titulo}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{item.cliente?.nome ?? "Cliente"} · {formatDateTime(item.dataHora)}</p>
              </button>
            ))}
          </SideSection>

          <SideSection title="Alertas operacionais">
            {smartAlerts.map((alert, index) => (
              <button key={alert} onClick={() => onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")} className="w-full px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-muted)]" type="button">
                <p className="text-xs font-medium text-[var(--text-secondary)]">{alert}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Aplicar filtro inteligente</p>
              </button>
            ))}
          </SideSection>

          <SideSection title="Atividades recentes">
            {recentActivities.length === 0 && <p className="px-4 py-3 text-[11px] text-[var(--text-muted)]">Nenhuma atividade recente registrada.</p>}
            {recentActivities.slice(0, 4).map((activity) => (
              <div key={activity.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{activity.client}</p>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{activity.date}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">{activity.text}</p>
              </div>
            ))}
          </SideSection>
        </Surface>
      </section>

      {modalMode && (
        <AgendaModal
          mode={modalMode}
          form={form}
          clients={clientOptions}
          error={formError}
          isSubmitting={isSubmitting}
          setForm={setForm}
          onClose={() => {
            if (isSubmitting) return;
            setModalMode(null);
            setEditing(null);
            setFormError("");
          }}
          onSubmit={submitForm}
        />
      )}
    </div>
  );
}

function AgendaNextCommitment({
  disabled,
  isLoading,
  item,
  onComplete,
  onOpen,
  onSchedule,
}: {
  disabled: boolean;
  isLoading: boolean;
  item: ApiAcompanhamento | null;
  onComplete: (item: ApiAcompanhamento) => void;
  onOpen: (item: ApiAcompanhamento) => void;
  onSchedule: () => void;
}) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-subtle)] text-[var(--primary)]">
            <Clock size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-[var(--text-muted)]">Próximo compromisso</p>
            {isLoading ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Carregando agenda...</p>
            ) : item ? (
              <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-primary)]">
                {formatTime(item.dataHora)} · {item.cliente?.nome ?? "Cliente"} · {typeLabel(item.tipo)} · {item.titulo}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Nenhum compromisso futuro agendado.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {item ? (
            <>
              <Button onClick={() => onOpen(item)} size="sm" variant="secondary">Abrir</Button>
              <Button disabled={disabled} onClick={() => onComplete(item)} size="sm" variant="subtle">Concluir</Button>
            </>
          ) : (
            <Button leftIcon={<Plus size={13} />} onClick={onSchedule} size="sm">Agendar</Button>
          )}
        </div>
      </div>
    </Surface>
  );
}

function AgendaWeekView({
  disabled,
  items,
  weekStart,
  onAction,
  onEdit,
  onReschedule,
  onSelectClient,
}: {
  disabled: boolean;
  items: ApiAcompanhamento[];
  weekStart: Date;
  onAction: (item: ApiAcompanhamento, action: "concluir" | "reabrir" | "cancelar") => void;
  onEdit: (item: ApiAcompanhamento) => void;
  onReschedule: (item: ApiAcompanhamento) => void;
  onSelectClient: (clientId: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return (
    <div>
      {days.map((day) => {
        const dayItems = items.filter((item) => isSameLocalDay(new Date(item.dataHora), day));
        return (
          <section className="grid border-b border-[var(--border-default)] last:border-b-0 md:grid-cols-[132px_minmax(0,1fr)]" key={day.toISOString()}>
            <header className="border-b border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 md:border-b-0 md:border-r">
              <p className="text-[11px] font-semibold capitalize text-[var(--text-primary)]">{formatWeekDay(day)}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{dayItems.length} {dayItems.length === 1 ? "compromisso" : "compromissos"}</p>
            </header>
            <div className="divide-y divide-[var(--border-default)]">
              {dayItems.length === 0 ? (
                <p className="px-4 py-4 text-[11px] text-[var(--text-muted)]">Sem acompanhamentos neste dia.</p>
              ) : dayItems.map((item) => (
                <AgendaRow
                  disabled={disabled}
                  item={item}
                  key={item.id}
                  onAction={onAction}
                  onEdit={onEdit}
                  onReschedule={onReschedule}
                  onSelectClient={onSelectClient}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AgendaRow({
  item,
  disabled,
  onSelectClient,
  onEdit,
  onReschedule,
  onAction,
}: {
  item: ApiAcompanhamento;
  disabled: boolean;
  onSelectClient: (clientId: number) => void;
  onEdit: (item: ApiAcompanhamento) => void;
  onReschedule: (item: ApiAcompanhamento) => void;
  onAction: (item: ApiAcompanhamento, action: "concluir" | "reabrir" | "cancelar") => void;
}) {
  return (
    <article className="px-4 py-3 transition-colors hover:bg-[var(--bg-muted)]">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[150px_minmax(0,1fr)_140px_120px] lg:items-center">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold ${item.atrasado ? "text-[var(--danger)]" : "text-[var(--primary)]"}`}>{formatDateTime(item.dataHora)}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{item.responsavel || "Equipe"}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{item.titulo}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{item.cliente?.nome ?? "Cliente"} · {item.cliente?.empresa || "Carteira comercial"}</p>
          {item.descricao && <p className="mt-1 line-clamp-1 text-[11px] text-[var(--text-muted)]">{item.descricao}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
          {item.atrasado && <span className="rounded-full border border-[var(--danger)] px-2 py-0.5 text-[10px] text-[var(--danger)]">Atrasado</span>}
        </div>
        <div className="min-w-0 text-left lg:text-right">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">{typeLabel(item.tipo)}</p>
          <p className={`mt-0.5 text-[11px] ${priorityTone(item.prioridade)}`}>{priorityLabel(item.prioridade)}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <ActionButton onClick={() => onSelectClient(item.clienteId)}>Cliente</ActionButton>
        <ActionButton onClick={() => onEdit(item)} icon={<Edit3 size={12} />}>Editar</ActionButton>
        <ActionButton onClick={() => onReschedule(item)} icon={<RotateCcw size={12} />}>Reagendar</ActionButton>
        {item.status === "CONCLUIDO" ? (
          <ActionButton disabled={disabled} onClick={() => onAction(item, "reabrir")}>Reabrir</ActionButton>
        ) : (
          <ActionButton disabled={disabled || item.status === "CANCELADO"} onClick={() => onAction(item, "concluir")}>Concluir</ActionButton>
        )}
        <ActionButton disabled={disabled || item.status === "CANCELADO"} onClick={() => onAction(item, "cancelar")}>Cancelar</ActionButton>
      </div>
    </article>
  );
}

function AgendaModal({
  mode,
  form,
  clients,
  error,
  isSubmitting,
  setForm,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit" | "reschedule";
  form: AgendaForm;
  clients: Array<{ id: string; label: string }>;
  error: string;
  isSubmitting: boolean;
  setForm: (form: AgendaForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isReschedule = mode === "reschedule";
  const title = mode === "create" ? "Novo acompanhamento" : isReschedule ? "Reagendar acompanhamento" : "Editar acompanhamento";
  const submitLabel = mode === "create" ? "Criar acompanhamento" : isReschedule ? "Salvar reagendamento" : "Salvar alteracoes";
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(isSubmitting);
  const restoreScrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (restoreScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreScrollFrameRef.current);
      restoreScrollFrameRef.current = null;
    }

    const documentElement = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
    const bodyPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    const previousStyles = {
      documentHadStyleAttribute: documentElement.hasAttribute("style"),
      documentOverflow: documentElement.style.overflow,
      bodyHadStyleAttribute: body.hasAttribute("style"),
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
    };

    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    documentElement.style.overflow = "hidden";

    const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hidden);

    const initialFocus = dialog.querySelector<HTMLElement>('select:not([disabled]), input:not([disabled]), textarea:not([disabled]), button:not([disabled])');
    initialFocus?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      documentElement.style.overflow = previousStyles.documentOverflow;
      body.style.overflow = previousStyles.bodyOverflow;
      body.style.position = previousStyles.bodyPosition;
      body.style.top = previousStyles.bodyTop;
      body.style.left = previousStyles.bodyLeft;
      body.style.width = previousStyles.bodyWidth;
      body.style.paddingRight = previousStyles.bodyPaddingRight;
      if (!previousStyles.documentHadStyleAttribute && documentElement.style.length === 0) {
        documentElement.removeAttribute("style");
      }
      if (!previousStyles.bodyHadStyleAttribute && body.style.length === 0) {
        body.removeAttribute("style");
      }

      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
      if (previousFocus?.isConnected && document.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      }
      restoreScrollFrameRef.current = window.requestAnimationFrame(() => {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
        restoreScrollFrameRef.current = null;
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div aria-labelledby="agenda-modal-title" aria-modal="true" className="saas-panel max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 text-white shadow-2xl" ref={dialogRef} role="dialog">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" id="agenda-modal-title">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">Registre o proximo contato comercial com persistencia real.</p>
          </div>
          <button aria-label="Fechar modal de acompanhamento" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:opacity-50" disabled={isSubmitting} onClick={onClose} title="Fechar" type="button">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {!isReschedule && (
            <>
              <Select disabled={isSubmitting} label="Cliente" onChange={(event) => setForm({ ...form, clienteId: event.target.value })} value={form.clienteId}>
                  <option value="">Selecione</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
              </Select>
              <Input disabled={isSubmitting} label="Título" onChange={(event) => setForm({ ...form, titulo: event.target.value })} value={form.titulo} />
            </>
          )}

          <Input disabled={isSubmitting} label="Data" onChange={(event) => setForm({ ...form, data: event.target.value })} type="date" value={form.data} />
          <Input disabled={isSubmitting} label="Horário" onChange={(event) => setForm({ ...form, hora: event.target.value })} type="time" value={form.hora} />

          {!isReschedule && (
            <>
              <Select disabled={isSubmitting} label="Prioridade" onChange={(event) => setForm({ ...form, prioridade: event.target.value as ApiAcompanhamentoPrioridade })} value={form.prioridade}>
                  {PRIORITIES.filter((item) => item !== "Todas").map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}
              </Select>
              <Select disabled={isSubmitting} label="Tipo" onChange={(event) => setForm({ ...form, tipo: event.target.value as ApiAcompanhamentoTipo })} value={form.tipo}>
                  {TYPES.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}
              </Select>
              <Input disabled={isSubmitting} label="Responsável" onChange={(event) => setForm({ ...form, responsavel: event.target.value })} value={form.responsavel} />
              <Textarea className="min-h-20 resize-none" disabled={isSubmitting} label="Descrição" onChange={(event) => setForm({ ...form, descricao: event.target.value })} value={form.descricao} />
            </>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] px-3 py-2 text-xs text-rose-100">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={isSubmitting} onClick={onClose} size="sm" variant="secondary">Cancelar</Button>
          <Button className="min-w-36" disabled={isSubmitting} loading={isSubmitting} onClick={onSubmit} size="sm">
            {isSubmitting ? "Salvando" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

type AgendaStatusKey = "all" | "pending" | "today" | "late" | "critical" | "done";
type AgendaStatusCounts = Record<AgendaStatusKey, number>;

function AgendaStatusSummary({ active, counts, onSelect }: { active: AgendaStatusKey | null; counts: AgendaStatusCounts; onSelect: (status: AgendaStatusKey) => void }) {
  const items: Array<{ key: AgendaStatusKey; label: string; value: number; icon: ReactNode; tone: string }> = [
    { key: "all", label: "Todos", value: counts.all, icon: <CalendarDays size={14} />, tone: "text-[var(--text-secondary)]" },
    { key: "pending", label: "Pendentes", value: counts.pending, icon: <Clock size={14} />, tone: "text-[var(--text-secondary)]" },
    { key: "today", label: "Hoje", value: counts.today, icon: <CalendarDays size={14} />, tone: "text-[var(--info)]" },
    { key: "late", label: "Atrasados", value: counts.late, icon: <AlertTriangle size={14} />, tone: "text-[var(--danger)]" },
    { key: "critical", label: "Críticos", value: counts.critical, icon: <Bell size={14} />, tone: "text-[var(--warning)]" },
    { key: "done", label: "Concluídos", value: counts.done, icon: <CheckCircle2 size={14} />, tone: "text-[var(--success)]" },
  ];

  return (
    <Surface className="overflow-x-auto" aria-label="Filtros de status da agenda">
      <div className="flex min-w-max items-stretch" role="tablist">
      {items.map((item, index) => (
        <button
          aria-selected={active === item.key}
          className={`flex min-w-[132px] items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] ${index > 0 ? "border-l border-[var(--border-default)]" : ""} ${active === item.key ? "bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""}`}
          key={item.key}
          onClick={() => onSelect(item.key)}
          role="tab"
          type="button"
        >
          <span className={`text-[11px] font-medium ${active === item.key ? "text-[var(--filter-active-text)]" : "text-[var(--text-secondary)]"}`}>{item.label}</span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${active === item.key ? "text-[var(--filter-active-text)]" : item.tone}`}>{item.icon}{item.value}</span>
        </button>
      ))}
      </div>
    </Surface>
  );
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--border-default)] last:border-b-0">
      <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold text-[var(--text-secondary)]">{title}</h3>
      <div className="divide-y divide-[var(--border-default)]">{children}</div>
    </section>
  );
}

function ActionButton({ children, icon, disabled, onClick }: { children: ReactNode; icon?: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--disabled-text)]" disabled={disabled} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  );
}

function acompanhamentoToForm(item: ApiAcompanhamento): AgendaForm {
  const date = new Date(item.dataHora);
  return {
    clienteId: String(item.clienteId),
    titulo: item.titulo,
    descricao: item.descricao ?? "",
    data: formatLocalDateInput(date),
    hora: `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
    prioridade: item.prioridade,
    tipo: item.tipo,
    responsavel: item.responsavel ?? "",
  };
}

function formatLocalDateInput(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formToPayload(form: AgendaForm): AcompanhamentoPayload {
  const dataHora = new Date(`${form.data}T${form.hora || "00:00"}:00`).toISOString();
  return {
    clienteId: Number(form.clienteId),
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim() || undefined,
    dataHora,
    prioridade: form.prioridade,
    tipo: form.tipo,
    responsavel: form.responsavel.trim() || undefined,
  };
}

function validateForm(form: AgendaForm, rescheduleOnly: boolean) {
  if (!form.data) return "Informe a data.";
  if (!form.hora) return "Informe o horario.";
  if (rescheduleOnly) return "";
  if (!form.clienteId) return "Selecione o cliente.";
  if (!form.titulo.trim()) return "Informe o titulo.";
  return "";
}

function toFriendlyAgendaError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("cliente")) return "Cliente selecionado nao esta disponivel.";
  if (normalized.includes("titulo")) return "Informe um titulo valido.";
  if (normalized.includes("data")) return "Informe uma data e horario validos.";
  if (normalized.includes("concluido")) return "Esse acompanhamento ja foi concluido.";
  return "Nao foi possivel concluir a acao agora.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: ApiAcompanhamentoStatus | "Todos") {
  if (status === "Todos") return "Todos";
  if (status === "PENDENTE") return "Pendente";
  if (status === "CONCLUIDO") return "Concluido";
  return "Cancelado";
}

function priorityLabel(priority: ApiAcompanhamentoPrioridade | "Todas") {
  if (priority === "Todas") return "Todas prioridades";
  if (priority === "BAIXA") return "Baixa";
  if (priority === "MEDIA") return "Media";
  if (priority === "ALTA") return "Alta";
  return "Critica";
}

function typeLabel(type: ApiAcompanhamentoTipo | "Todos") {
  if (type === "Todos") return "Todos os tipos";
  if (type === "LIGACAO") return "Ligacao";
  if (type === "WHATSAPP") return "WhatsApp";
  if (type === "EMAIL") return "E-mail";
  if (type === "REUNIAO") return "Reuniao";
  if (type === "VISITA") return "Visita";
  return "Outro";
}

function statusTone(status: ApiAcompanhamentoStatus) {
  if (status === "PENDENTE") return "border-[color:rgba(53,111,152,0.28)] text-[var(--info)]";
  if (status === "CONCLUIDO") return "border-[color:rgba(36,122,82,0.28)] text-[var(--success)]";
  return "border-[var(--border-strong)] text-[var(--text-muted)]";
}

function priorityTone(priority: ApiAcompanhamentoPrioridade) {
  if (priority === "CRITICA") return "text-[var(--danger)]";
  if (priority === "ALTA") return "text-[var(--warning)]";
  if (priority === "MEDIA") return "text-[var(--info)]";
  return "text-[var(--text-muted)]";
}

async function fetchAllAcompanhamentos(params: AcompanhamentoQueryParams) {
  const firstPage = await fetchAcompanhamentos({ ...params, page: 1, limit: 100 });
  if (firstPage.pagination.totalPages <= 1) return firstPage.data;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) =>
      fetchAcompanhamentos({ ...params, page: index + 2, limit: 100 }),
    ),
  );
  return [firstPage.data, ...remainingPages.map((result) => result.data)].flat();
}

function agendaStatusCounts(items: ApiAcompanhamento[]): AgendaStatusCounts {
  const now = new Date();
  return {
    all: items.length,
    pending: items.filter((item) => item.status === "PENDENTE").length,
    today: items.filter((item) => item.status === "PENDENTE" && isSameLocalDay(new Date(item.dataHora), now)).length,
    late: items.filter((item) => item.status === "PENDENTE" && new Date(item.dataHora).getTime() < now.getTime()).length,
    critical: items.filter((item) => item.status === "PENDENTE" && item.prioridade === "CRITICA").length,
    done: items.filter((item) => item.status === "CONCLUIDO").length,
  };
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function endOfWeek(value: Date) {
  const date = addDays(value, 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function isSameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function formatWeekLabel(start: Date, end: Date) {
  const startLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(start);
  const endLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(end);
  return `${startLabel} - ${endLabel}`;
}

function formatWeekDay(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
