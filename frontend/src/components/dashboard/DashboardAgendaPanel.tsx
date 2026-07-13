import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock, Edit3, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  cancelarAcompanhamento,
  concluirAcompanhamento,
  createAcompanhamento,
  fetchAcompanhamentoResumo,
  fetchAcompanhamentos,
  reabrirAcompanhamento,
  updateAcompanhamento,
  type AcompanhamentoPayload,
  type ApiAcompanhamento,
  type ApiAcompanhamentoPrioridade,
  type ApiAcompanhamentoStatus,
  type ApiAcompanhamentoTipo,
  type ApiAcompanhamentoResumo,
} from "../../services/crmApi";
import type { Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";
import { Button, EmptyState, ErrorState, Input, LoadingState, Pagination, SectionHeader, Select, Surface, Textarea, Toolbar } from "../ui";

type FollowUpGroup = {
  label: string;
  hint: string;
  clients: Client[];
};

type DashboardAgendaPanelProps = {
  clients: Client[];
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
  recentActivities,
  smartAlerts,
  onSelectClient,
  onApplySmartFilter,
}: DashboardAgendaPanelProps) {
  const [items, setItems] = useState<ApiAcompanhamento[]>([]);
  const [summary, setSummary] = useState<ApiAcompanhamentoResumo | null>(null);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "reschedule" | null>(null);
  const [editing, setEditing] = useState<ApiAcompanhamento | null>(null);
  const [form, setForm] = useState<AgendaForm>(initialForm);
  const [formError, setFormError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
    let ignore = false;

    async function loadAgenda() {
      setIsLoading(true);
      setError("");

      try {
        const [list, resumo] = await Promise.all([
          fetchAcompanhamentos({
            busca: debouncedSearch,
            clienteId: clientFilter === "Todos" ? undefined : Number(clientFilter),
            status: status === "Todos" ? undefined : status,
            prioridade: priority === "Todas" ? undefined : priority,
            tipo: type === "Todos" ? undefined : type,
            atrasados: onlyLate || undefined,
            hoje: onlyToday || undefined,
            page,
            limit: PAGE_SIZE,
          }),
          fetchAcompanhamentoResumo(),
        ]);

        if (ignore) return;
        setItems(list.data);
        setTotal(list.pagination.total);
        setSummary(resumo);
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
  }, [clientFilter, debouncedSearch, onlyLate, onlyToday, page, priority, refreshKey, status, type]);

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
      setIsSubmitting(false);
    }
  }

  async function runAction(item: ApiAcompanhamento, action: "concluir" | "reabrir" | "cancelar") {
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

      <AgendaStatusSummary
        active={onlyToday ? "today" : onlyLate ? "late" : priority === "CRITICA" ? "critical" : status === "CONCLUIDO" ? "done" : status === "PENDENTE" ? "pending" : null}
        summary={summary}
        onSelect={(next) => {
          setOnlyToday(next === "today");
          setOnlyLate(next === "late");
          setPriority(next === "critical" ? "CRITICA" : "Todas");
          setStatus(next === "done" ? "CONCLUIDO" : next === "pending" ? "PENDENTE" : "Todos");
          setPage(1);
        }}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Surface className="min-w-0 overflow-hidden">
          <SectionHeader
            actions={<Button leftIcon={<Plus size={14} />} onClick={openCreate} size="sm">Novo acompanhamento</Button>}
            description="Contatos, retornos e janelas comerciais organizados por prioridade temporal."
            icon={<CalendarDays size={15} />}
            title="Agenda e acompanhamentos"
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

              <Button aria-pressed={onlyToday} className={onlyToday ? "border-[var(--filter-active-border)] bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""} onClick={() => { setOnlyToday((current) => !current); setOnlyLate(false); setPage(1); }} size="sm" variant="secondary">
              Hoje
              </Button>

              <Button aria-pressed={onlyLate} className={onlyLate ? "border-[var(--filter-active-border)] bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""} onClick={() => { setOnlyLate((current) => !current); setOnlyToday(false); setPage(1); }} size="sm" variant="secondary">
              Atrasados
              </Button>

              <Button disabled={!hasFilters} leftIcon={<RotateCcw size={13} />} onClick={() => { setSearch(""); setDebouncedSearch(""); setStatus("Todos"); setPriority("Todas"); setType("Todos"); setClientFilter("Todos"); setOnlyLate(false); setOnlyToday(false); setPage(1); }} size="sm" variant="ghost">
                Limpar filtros
              </Button>
            </Toolbar>
          </div>

          <div aria-busy={isLoading} className="divide-y divide-[var(--border-default)]">
            {isLoading && <LoadingState className="p-4" label="Carregando acompanhamentos" rows={4} />}
            {!isLoading && items.length === 0 && <EmptyState description={hasFilters ? "Ajuste ou limpe os filtros para ampliar a consulta." : "Crie um acompanhamento para organizar o próximo contato comercial."} title={hasFilters ? "Nenhum acompanhamento para os filtros" : "Nenhum acompanhamento encontrado"} />}
            {!isLoading && items.map((item) => (
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
          </div>

          <Pagination disabled={isLoading} itemLabel="acompanhamentos" onPageChange={setPage} page={page} total={total} totalPages={totalPages} visibleCount={items.length} />
        </Surface>

        <Surface className="min-w-0 self-start overflow-hidden">
          <SectionHeader description="Contexto temporal e sinais que pedem ação." icon={<Clock size={15} />} title="Painel operacional" />
          <SideSection title="Próximos acompanhamentos">
            {(summary?.proximos ?? []).length === 0 && <p className="px-4 py-3 text-[11px] text-[var(--text-muted)]">Nenhum acompanhamento pendente.</p>}
            {(summary?.proximos ?? []).map((item) => (
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div aria-labelledby="agenda-modal-title" aria-modal="true" className="saas-panel max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 text-white shadow-2xl" role="dialog">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" id="agenda-modal-title">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">Registre o proximo contato comercial com persistencia real.</p>
          </div>
          <button className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:opacity-50" disabled={isSubmitting} onClick={onClose} type="button">
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

type AgendaStatusKey = "pending" | "today" | "late" | "critical" | "done";

function AgendaStatusSummary({ active, summary, onSelect }: { active: AgendaStatusKey | null; summary: ApiAcompanhamentoResumo | null; onSelect: (status: AgendaStatusKey) => void }) {
  const items: Array<{ key: AgendaStatusKey; label: string; value: number; icon: ReactNode; tone: string }> = [
    { key: "pending", label: "Pendentes", value: summary?.indicadores.pendentes ?? 0, icon: <Clock size={14} />, tone: "text-[var(--text-secondary)]" },
    { key: "today", label: "Hoje", value: summary?.indicadores.paraHoje ?? 0, icon: <CalendarDays size={14} />, tone: "text-[var(--info)]" },
    { key: "late", label: "Atrasados", value: summary?.indicadores.atrasados ?? 0, icon: <AlertTriangle size={14} />, tone: "text-[var(--danger)]" },
    { key: "critical", label: "Críticos", value: summary?.indicadores.criticos ?? 0, icon: <Bell size={14} />, tone: "text-[var(--warning)]" },
    { key: "done", label: "Concluídos", value: summary?.indicadores.concluidosPeriodo ?? 0, icon: <CheckCircle2 size={14} />, tone: "text-[var(--success)]" },
  ];

  return (
    <Surface className="grid overflow-hidden sm:grid-cols-5" aria-label="Resumo de status da agenda">
      {items.map((item, index) => (
        <button
          aria-pressed={active === item.key}
          className={`flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] ${index > 0 ? "border-t border-[var(--border-default)] sm:border-l sm:border-t-0" : ""} ${active === item.key ? "bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""}`}
          key={item.key}
          onClick={() => onSelect(item.key)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.label}</span>
            <span className={`mt-0.5 block text-base font-semibold ${active === item.key ? "text-[var(--filter-active-text)]" : item.tone}`}>{item.value}</span>
          </span>
          <span className={active === item.key ? "text-[var(--filter-active-text)]" : item.tone}>{item.icon}</span>
        </button>
      ))}
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
    data: date.toISOString().slice(0, 10),
    hora: date.toISOString().slice(11, 16),
    prioridade: item.prioridade,
    tipo: item.tipo,
    responsavel: item.responsavel ?? "",
  };
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
