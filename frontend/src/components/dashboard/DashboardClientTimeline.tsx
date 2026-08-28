import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  MessageSquareText,
  PhoneCall,
  Plus,
  RefreshCw,
  StickyNote,
  Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiHttpError, fetchCustomer360Timeline } from "../../services/crmApi";
import type { Customer360TimelineEvent, Customer360TimelineType } from "../../services/crmApi";
import type { Client } from "../../types/dashboard";
import { getChannelPresentation } from "../leads-communication/communicationChannels";

type DashboardClientTimelineProps = {
  selectedClient: Client;
  noteText: string;
  onSetNoteText: (value: string) => void;
  onAddNote: () => void;
  onNavigateContext: (destination: "INBOX" | "KANBAN" | "AGENDA", id: number) => void;
  onUnauthorized: () => void;
  readOnly?: boolean;
};

const FILTERS: Array<{ value: Customer360TimelineType; label: string }> = [
  { value: "TODOS", label: "Tudo" },
  { value: "MENSAGEM", label: "Mensagens" },
  { value: "LIGACAO", label: "Ligações" },
  { value: "VISITA", label: "Visitas" },
  { value: "PROPOSTA", label: "Propostas" },
  { value: "NEGOCIO", label: "Negócios" },
  { value: "ACOMPANHAMENTO", label: "Acompanhamentos" },
  { value: "NOTA", label: "Notas" },
  { value: "QUALIFICACAO", label: "Qualificações" },
];

export default function DashboardClientTimeline({
  selectedClient,
  noteText,
  onSetNoteText,
  onAddNote,
  onNavigateContext,
  onUnauthorized,
  readOnly = false,
}: DashboardClientTimelineProps) {
  const [events, setEvents] = useState<Customer360TimelineEvent[]>([]);
  const [filter, setFilter] = useState<Customer360TimelineType>("TODOS");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!selectedClient.backendId) return;
    let ignore = false;
    void fetchCustomer360Timeline(selectedClient.backendId, { tipo: filter, page, limit: 12 })
      .then((response) => {
        if (ignore) return;
        setEvents(response.data);
        setTotal(response.paginacao.total);
        setTotalPages(response.paginacao.totalPages);
        setError("");
      })
      .catch((nextError) => {
        if (ignore) return;
        if (nextError instanceof ApiHttpError && nextError.status === 401) {
          onUnauthorized();
          return;
        }
        setError(nextError instanceof ApiHttpError && nextError.status === 403
          ? "Você não tem permissão para consultar este histórico."
          : "Não foi possível carregar a linha do tempo.");
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filter, onUnauthorized, page, requestKey, selectedClient.backendId, selectedClient.notes.length]);

  function addNoteAndRefresh() {
    onAddNote();
    window.setTimeout(() => setRequestKey((value) => value + 1), 250);
  }

  function refresh() {
    setLoading(true);
    setError("");
    setRequestKey((value) => value + 1);
  }

  return (
    <section className="saas-card mt-3 overflow-hidden rounded-lg" aria-label="Linha do tempo do cliente">
      <div className="border-b border-[var(--border-default)] bg-slate-50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700"><StickyNote size={14} /></div>
            <div className="min-w-0"><p className="text-xs font-semibold">Linha do tempo</p><p className="mt-0.5 truncate text-[11px] text-slate-500">Eventos reais e origem rastreável</p></div>
          </div>
          <span className="saas-chip shrink-0 rounded-full px-2 py-1 text-[10px]">{total}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="sr-only" htmlFor="customer-timeline-filter">Filtrar histórico</label>
          <select id="customer-timeline-filter" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-teal-600" value={filter} onChange={(event) => { setLoading(true); setError(""); setFilter(event.target.value as Customer360TimelineType); setPage(1); }}>
            {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button aria-label="Atualizar linha do tempo" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 p-1.5 text-slate-600 hover:border-slate-400 hover:text-slate-900" onClick={refresh} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={13} /></button>
        </div>
      </div>

      {!readOnly ? <div className="border-b border-[var(--border-default)] p-3">
        <div className="flex gap-2">
          <input value={noteText} onChange={(event) => onSetNoteText(event.target.value)} placeholder="Registrar nota comercial..." className="min-h-11 min-w-0 flex-1 select-text rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          <button onClick={addNoteAndRefresh} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-950 hover:bg-white" type="button"><Plus size={12} />Adicionar</button>
        </div>
      </div> : null}

      <div className="p-3">
        {error ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3"><p className="text-[11px] text-amber-800">{error}</p><button className="mt-2 min-h-11 text-[11px] font-semibold text-amber-800 hover:text-amber-900" onClick={refresh} type="button">Tentar novamente</button></div>
        ) : loading ? (
          <div className="space-y-2" aria-label="Carregando linha do tempo">{[0, 1, 2].map((item) => <div className="h-[66px] animate-pulse rounded-md border border-slate-200 bg-slate-100" key={item} />)}</div>
        ) : events.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-5 text-center"><p className="text-[11px] font-medium text-slate-700">Nenhum evento neste filtro.</p><p className="mt-1 text-[10px] text-slate-500">Novas interações aparecerão aqui com sua origem.</p></div>
        ) : (
          <ol className="relative space-y-2 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-slate-700/50">
            {events.map((item) => <TimelineRow event={item} key={item.id} onNavigate={onNavigateContext} readOnly={readOnly} />)}
          </ol>
        )}

        {totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between border-t border-slate-700/35 pt-2.5">
            <button aria-label="Página anterior" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 p-1.5 text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} type="button"><ChevronLeft size={13} /></button>
            <span className="text-[10px] tabular-nums text-slate-600">Página {page} de {totalPages}</span>
            <button aria-label="Próxima página" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 p-1.5 text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35" disabled={page >= totalPages || loading} onClick={() => { setLoading(true); setPage((value) => Math.min(totalPages, value + 1)); }} type="button"><ChevronRight size={13} /></button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TimelineRow({ event, onNavigate, readOnly }: { event: Customer360TimelineEvent; onNavigate: (destination: "INBOX" | "KANBAN" | "AGENDA", id: number) => void; readOnly?: boolean }) {
  const meta = eventMeta(event.tipo);
  return (
    <li className="relative flex gap-2.5">
      <div className={`relative z-[1] mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${meta.tone}`}>{meta.icon}</div>
      <div className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-900">{event.titulo}</p><p className="mt-0.5 text-[10px] text-slate-500">{meta.label} · {event.origem.entidade}</p></div><time className="shrink-0 text-[10px] tabular-nums text-slate-500">{formatDateTime(event.data)}</time></div>
        {event.descricao ? <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">{event.descricao}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
          {event.status ? <span>{humanize(event.status)}</span> : null}
          {event.responsavel ? <span>{event.responsavel.nome}</span> : null}
          {event.canal ? <span>{timelineChannelLabel(event.canal)}</span> : null}
          {event.valor !== null ? <span className="font-medium text-emerald-700">{formatCurrency(event.valor)}</span> : null}
          {event.navegacao && !readOnly ? <button className="ml-auto min-h-11 font-semibold text-teal-700 hover:text-teal-900" onClick={() => onNavigate(event.navegacao!.destino, event.navegacao!.id)} type="button">Abrir contexto</button> : null}
          {event.navegacao && readOnly ? <span className="ml-auto text-[10px] text-slate-500">Contexto disponível após restaurar</span> : null}
        </div>
      </div>
    </li>
  );
}

function timelineChannelLabel(channel: NonNullable<Customer360TimelineEvent["canal"]>) {
  const canonical = getChannelPresentation(channel.tipo).label;
  return channel.nome && channel.nome !== canonical ? `${canonical} · ${channel.nome}` : canonical;
}

function eventMeta(type: Customer360TimelineEvent["tipo"]): { icon: ReactNode; label: string; tone: string } {
  if (type === "MENSAGEM") return { icon: <MessageSquareText size={13} />, label: "Mensagem", tone: "border-sky-200 bg-sky-50 text-sky-700" };
  if (type === "LIGACAO") return { icon: <PhoneCall size={13} />, label: "Ligação", tone: "border-teal-200 bg-teal-50 text-teal-700" };
  if (type === "VISITA") return { icon: <MapPin size={13} />, label: "Visita", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  if (type === "PROPOSTA") return { icon: <FileText size={13} />, label: "Proposta", tone: "border-violet-200 bg-violet-50 text-violet-700" };
  if (type === "NEGOCIO") return { icon: <BriefcaseBusiness size={13} />, label: "Negócio", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (type === "QUALIFICACAO") return { icon: <Target size={13} />, label: "Qualificação", tone: "border-rose-200 bg-rose-50 text-rose-700" };
  if (type === "NOTA") return { icon: <StickyNote size={13} />, label: "Nota", tone: "border-slate-200 bg-slate-50 text-slate-700" };
  return { icon: <CalendarClock size={13} />, label: "Acompanhamento", tone: "border-cyan-200 bg-cyan-50 text-cyan-700" };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
