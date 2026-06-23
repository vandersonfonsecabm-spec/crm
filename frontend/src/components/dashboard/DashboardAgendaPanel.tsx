import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock, Edit3, Loader2, Plus, RotateCcw, Search, X } from "lucide-react";
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
      <section className="saas-panel rounded-2xl p-4">
        <PanelTitle icon={<AlertTriangle size={15} className="text-rose-300" />} title="Agenda" hint="Acompanhamentos persistentes da carteira." />
        <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] p-3">
          <p className="text-sm font-semibold text-rose-100">{error}</p>
          <button className="premium-ghost mt-3 rounded-xl px-3 py-2 text-xs text-slate-200" onClick={() => setRefreshKey((current) => current + 1)} type="button">
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-teal-300/20 bg-slate-950/95 px-4 py-3 text-xs font-semibold text-teal-100 shadow-2xl">
          {toast}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-5">
        <AgendaMetric icon={<Clock size={15} />} title="Pendentes" value={String(summary?.indicadores.pendentes ?? 0)} caption="Fila aberta" tone="pipeline" />
        <AgendaMetric icon={<CalendarDays size={15} />} title="Hoje" value={String(summary?.indicadores.paraHoje ?? 0)} caption="Acoes do dia" tone="revenue" />
        <AgendaMetric icon={<AlertTriangle size={15} />} title="Atrasados" value={String(summary?.indicadores.atrasados ?? 0)} caption="Pedir atencao" tone="risk" />
        <AgendaMetric icon={<Bell size={15} />} title="Criticos" value={String(summary?.indicadores.criticos ?? 0)} caption="Prioridade alta" tone="risk" />
        <AgendaMetric icon={<CheckCircle2 size={15} />} title="Concluidos" value={String(summary?.indicadores.concluidosPeriodo ?? 0)} caption="Periodo atual" tone="revenue" />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="saas-panel min-w-0 rounded-2xl p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <PanelTitle icon={<CalendarDays size={15} className="text-sky-300" />} title="Agenda e acompanhamentos" hint="Contatos, retornos e janelas comerciais com persistencia real." />
            <button className="premium-button inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold" onClick={openCreate} type="button">
              <Plus size={14} />
              Novo acompanhamento
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_140px_140px_140px]">
            <label className="premium-ghost flex h-10 min-w-0 items-center gap-2 rounded-xl px-3 text-xs text-slate-400">
              <Search size={14} className="shrink-0" />
              <input className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou titulo" value={search} />
            </label>

            <select className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none" onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} value={status}>
              {STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>

            <select className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none" onChange={(event) => { setPriority(event.target.value as typeof priority); setPage(1); }} value={priority}>
              {PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}
            </select>

            <select className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none" onChange={(event) => { setType(event.target.value as typeof type); setPage(1); }} value={type}>
              {TYPES.map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}
            </select>

            <select className="premium-ghost h-10 rounded-xl px-3 text-xs text-slate-200 outline-none md:col-span-2 xl:col-span-1" onChange={(event) => { setClientFilter(event.target.value); setPage(1); }} value={clientFilter}>
              <option value="Todos">Todos os clientes</option>
              {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
            </select>

            <label className="premium-ghost flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-slate-300">
              <input checked={onlyToday} className="h-4 w-4 accent-teal-300" onChange={(event) => { setOnlyToday(event.target.checked); setOnlyLate(false); setPage(1); }} type="checkbox" />
              Hoje
            </label>

            <label className="premium-ghost flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-slate-300">
              <input checked={onlyLate} className="h-4 w-4 accent-rose-300" onChange={(event) => { setOnlyLate(event.target.checked); setOnlyToday(false); setPage(1); }} type="checkbox" />
              Atrasados
            </label>

            {hasFilters && (
              <button className="premium-ghost h-10 rounded-xl px-3 text-xs font-semibold text-slate-200" onClick={() => { setSearch(""); setDebouncedSearch(""); setStatus("Todos"); setPriority("Todas"); setType("Todos"); setClientFilter("Todos"); setOnlyLate(false); setOnlyToday(false); setPage(1); }} type="button">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {isLoading && Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />)}
            {!isLoading && items.length === 0 && <EmptyLine text={hasFilters ? "Nenhum acompanhamento encontrado para os filtros selecionados." : "Nenhum acompanhamento encontrado."} />}
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

          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{total} acompanhamento{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <button className="premium-ghost rounded-xl px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Anterior</button>
              <span className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">{total === 0 ? "0/0" : `${page}/${totalPages}`}</span>
              <button className="premium-ghost rounded-xl px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40" disabled={total === 0 || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">Proxima</button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <SidePanel title="Proximos acompanhamentos" icon={<Clock size={15} className="text-sky-300" />}>
            {(summary?.proximos ?? []).length === 0 && <EmptyLine text="Nenhum acompanhamento pendente." />}
            {(summary?.proximos ?? []).map((item) => (
              <button key={item.id} className="saas-row w-full rounded-xl px-3 py-2 text-left" onClick={() => onSelectClient(item.clienteId)} type="button">
                <p className="truncate text-xs font-semibold text-slate-100">{item.titulo}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{item.cliente?.nome ?? "Cliente"} - {formatDateTime(item.dataHora)}</p>
              </button>
            ))}
          </SidePanel>

          <SidePanel title="Alertas operacionais" icon={<AlertTriangle size={15} className="text-rose-300" />}>
            {smartAlerts.map((alert, index) => (
              <button key={alert} onClick={() => onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")} className="saas-row w-full rounded-xl p-3 text-left transition" type="button">
                <p className="text-xs font-semibold text-slate-200">{alert}</p>
                <p className="mt-1 text-[10px] text-slate-500">Aplicar filtro inteligente</p>
              </button>
            ))}
          </SidePanel>

          <SidePanel title="Atividades recentes" icon={<Bell size={15} className="text-amber-300" />}>
            {recentActivities.length === 0 && <EmptyLine text="Nenhuma atividade recente registrada." />}
            {recentActivities.slice(0, 4).map((activity) => (
              <div key={activity.id} className="metric-card rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-100">{activity.client}</p>
                  <span className="shrink-0 text-[10px] text-slate-500">{activity.date}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">{activity.text}</p>
              </div>
            ))}
          </SidePanel>
        </div>
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
    <article className="saas-row rounded-2xl p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`saas-chip ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
            <span className={`saas-chip ${priorityTone(item.prioridade)}`}>{priorityLabel(item.prioridade)}</span>
            <span className="saas-chip text-slate-300">{typeLabel(item.tipo)}</span>
            {item.atrasado && <span className="saas-chip border-rose-300/15 bg-rose-300/[0.07] text-rose-100">Atrasado</span>}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-100">{item.titulo}</p>
          <p className="mt-1 text-xs text-slate-500">{item.cliente?.nome ?? "Cliente"} - {item.cliente?.empresa || "Carteira comercial"}</p>
          {item.descricao && <p className="mt-2 break-words text-[11px] leading-relaxed text-slate-500">{item.descricao}</p>}
        </div>

        <div className="grid shrink-0 gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:w-56">
          <Info label="Data" value={formatDateTime(item.dataHora)} />
          <Info label="Responsavel" value={item.responsavel || "Equipe"} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
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
  const fieldClass = "w-full rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-slate-400/24 focus:border-teal-300/28 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="saas-panel max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">Registre o proximo contato comercial com persistencia real.</p>
          </div>
          <button className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200 disabled:opacity-50" disabled={isSubmitting} onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {!isReschedule && (
            <>
              <Field label="Cliente">
                <select className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, clienteId: event.target.value })} value={form.clienteId}>
                  <option value="">Selecione</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
                </select>
              </Field>
              <Field label="Titulo">
                <input className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, titulo: event.target.value })} value={form.titulo} />
              </Field>
            </>
          )}

          <Field label="Data">
            <input className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, data: event.target.value })} type="date" value={form.data} />
          </Field>
          <Field label="Horario">
            <input className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, hora: event.target.value })} type="time" value={form.hora} />
          </Field>

          {!isReschedule && (
            <>
              <Field label="Prioridade">
                <select className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, prioridade: event.target.value as ApiAcompanhamentoPrioridade })} value={form.prioridade}>
                  {PRIORITIES.filter((item) => item !== "Todas").map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}
                </select>
              </Field>
              <Field label="Tipo">
                <select className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, tipo: event.target.value as ApiAcompanhamentoTipo })} value={form.tipo}>
                  {TYPES.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}
                </select>
              </Field>
              <Field label="Responsavel">
                <input className={fieldClass} disabled={isSubmitting} onChange={(event) => setForm({ ...form, responsavel: event.target.value })} value={form.responsavel} />
              </Field>
              <Field label="Descricao">
                <textarea className={`${fieldClass} min-h-[80px] resize-none`} disabled={isSubmitting} onChange={(event) => setForm({ ...form, descricao: event.target.value })} value={form.descricao} />
              </Field>
            </>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] px-3 py-2 text-xs text-rose-100">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-500/16 bg-slate-950/25 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900/70 disabled:opacity-50" disabled={isSubmitting} onClick={onClose} type="button">Cancelar</button>
          <button className="premium-button inline-flex min-w-36 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-60" disabled={isSubmitting} onClick={onSubmit} type="button">
            {isSubmitting && <Loader2 size={13} className="animate-spin" />}
            {isSubmitting ? "Salvando" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgendaMetric({ icon, title, value, caption, tone }: { icon: ReactNode; title: string; value: string; caption: string; tone: "pipeline" | "revenue" | "risk" }) {
  const toneClass = {
    pipeline: "metric-pipeline text-teal-100",
    revenue: "metric-revenue text-sky-100",
    risk: "metric-risk text-rose-100",
  };

  return (
    <div className={`metric-card rounded-2xl p-3 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{title}</p>
          <p className="mt-1.5 truncate text-base font-semibold">{value}</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{caption}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.11] bg-white/[0.045]">{icon}</div>
      </div>
    </div>
  );
}

function SidePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="saas-panel rounded-2xl p-4">
      <PanelTitle icon={icon} title={title} hint="Dados sincronizados com a operacao comercial." />
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function PanelTitle({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/55">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-950/24 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ActionButton({ children, icon, disabled, onClick }: { children: ReactNode; icon?: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="saas-action inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-45" disabled={disabled} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-500/18 bg-slate-950/25 px-3 py-3">
      <p className="text-[11px] text-slate-500">{text}</p>
    </div>
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
  if (status === "PENDENTE") return "border-sky-300/15 bg-sky-300/[0.07] text-sky-100";
  if (status === "CONCLUIDO") return "border-teal-300/15 bg-teal-300/[0.07] text-teal-100";
  return "border-slate-400/15 bg-slate-400/[0.07] text-slate-300";
}

function priorityTone(priority: ApiAcompanhamentoPrioridade) {
  if (priority === "CRITICA") return "border-rose-300/15 bg-rose-300/[0.07] text-rose-100";
  if (priority === "ALTA") return "border-amber-300/15 bg-amber-300/[0.07] text-amber-100";
  if (priority === "MEDIA") return "border-sky-300/15 bg-sky-300/[0.07] text-sky-100";
  return "border-slate-400/15 bg-slate-400/[0.07] text-slate-300";
}
