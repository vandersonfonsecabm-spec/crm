import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Copy,
  Edit3,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Tag,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiHttpError, fetchCustomer360 } from "../../services/crmApi";
import type { Customer360Overview } from "../../services/crmApi";
import type { Client, Status } from "../../types/dashboard";
import DashboardClientTimeline from "./DashboardClientTimeline";
import { SmallButton } from "./DashboardDrawerPrimitives";

type CustomerDestination = "INBOX" | "KANBAN" | "AGENDA";

type DashboardSelectedClientPanelProps = {
  selectedClient: Client;
  noteText: string;
  tagText: string;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  tagClass: (tag: string) => string;
  onSetNoteText: (value: string) => void;
  onSetTagText: (value: string) => void;
  onAddNote: () => void;
  onAddTagToSelected: () => void;
  onRemoveTagFromSelected: (tag: string) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onRequestWhatsapp: (client: Client) => void;
  onNavigateContext: (destination: CustomerDestination, id: number) => void;
  onUnauthorized: () => void;
  readOnly?: boolean;
  canRestore?: boolean;
};

export default function DashboardSelectedClientPanel({
  selectedClient,
  noteText,
  tagText,
  money,
  initials,
  statusClass,
  tagClass,
  onSetNoteText,
  onSetTagText,
  onAddNote,
  onAddTagToSelected,
  onRemoveTagFromSelected,
  onEditClient,
  onCopyText,
  onRequestWhatsapp,
  onNavigateContext,
  onUnauthorized,
  readOnly = false,
  canRestore = false,
}: DashboardSelectedClientPanelProps) {
  const [overview, setOverview] = useState<Customer360Overview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewRequest, setOverviewRequest] = useState(0);

  useEffect(() => {
    if (!selectedClient.backendId) return;
    let ignore = false;
    void fetchCustomer360(selectedClient.backendId)
      .then((response) => { if (!ignore) { setOverview(response); setOverviewError(""); } })
      .catch((error) => {
        if (ignore) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          onUnauthorized();
          return;
        }
        setOverviewError(error instanceof ApiHttpError && error.status === 403
          ? "Você não tem permissão para consultar este cliente."
          : "Não foi possível carregar o resumo 360° agora.");
      });
    return () => { ignore = true; };
  }, [onUnauthorized, overviewRequest, selectedClient.backendId, selectedClient.revision]);

  const customer = overview?.cliente;
  const summary = overview?.resumo;
  const location = [customer?.cidade || selectedClient.city, customer?.estado || selectedClient.state].filter(Boolean).join(" / ") || "Localização não informada";
  const document = formatDocument(customer?.cpfCnpj || selectedClient.cpfCnpj);

  function retryOverview() {
    setOverview(null);
    setOverviewError("");
    setOverviewRequest((value) => value + 1);
  }

  return (
    <div className="p-3">
      <section className="saas-card overflow-hidden rounded-lg" aria-label="Visão 360 graus do cliente">
        <div className="border-b border-[var(--border-default)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] text-xs font-bold text-[var(--primary)]">
                {initials(selectedClient.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-slate-900">{selectedClient.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{selectedClient.company || "Empresa não informada"}</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${selectedClient.archived ? "border-slate-300 bg-slate-100 text-slate-700" : statusClass(selectedClient.status)}`}>
              {selectedClient.archived ? "Arquivado" : selectedClient.status}
            </span>
          </div>

          <div className="mt-3 grid gap-1.5">
            <ContactRow icon={<Phone size={12} />} label="Telefone" value={selectedClient.phone || "Não informado"} onCopy={selectedClient.phone ? () => onCopyText(selectedClient.phone, "Telefone copiado.") : undefined} />
            <ContactRow icon={<Mail size={12} />} label="E-mail" value={selectedClient.email || "Não informado"} onCopy={selectedClient.email ? () => onCopyText(selectedClient.email, "E-mail copiado.") : undefined} />
            <ContactRow icon={<MapPin size={12} />} label="Cidade / UF" value={location} />
            <ContactRow icon={<Building2 size={12} />} label="CPF / CNPJ" value={document || "Não informado"} />
          </div>
        </div>

        {overviewError ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5">
            <p className="text-[11px] text-amber-800">{overviewError}</p>
            <button className="inline-flex min-h-11 items-center rounded-md px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={retryOverview} type="button">Tentar novamente</button>
          </div>
        ) : !overview ? (
          <div className="grid grid-cols-2 gap-px border-b border-[var(--border-default)] bg-[var(--border-default)]" aria-label="Carregando resumo do cliente">
            {[0, 1, 2, 3].map((item) => <div className="h-[58px] animate-pulse bg-[var(--bg-surface)] p-3" key={item}><div className="h-2 w-16 rounded bg-slate-200" /><div className="mt-2 h-3 w-10 rounded bg-slate-300" /></div>)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px border-b border-[var(--border-default)] bg-[var(--border-default)]">
              <SummaryStat
                label={`${readOnly ? "Pipeline histórico" : "Pipeline estimado"}${summary?.valorPipelineIncompleto ? " (parcial)" : ""}`}
                value={summary?.valorPipeline === null || summary?.valorPipeline === undefined ? "Não informado" : money(summary.valorPipeline)}
              />
              <SummaryStat label="Total vendido" value={money((summary?.totalVendidoCentavos || 0) / 100)} />
              <SummaryStat label={readOnly ? "Negócios no histórico" : "Negócios ativos"} value={String(summary?.negociosAtivos || 0)} />
              <SummaryStat label={readOnly ? "Propostas no histórico" : "Propostas abertas"} value={String(summary?.propostasAtivas || 0)} />
              <SummaryStat label={readOnly ? "Acompanhamentos no histórico" : "Acompanhamentos"} value={String(summary?.acompanhamentosPendentes || 0)} />
              <SummaryStat label="Última venda" value={summary?.ultimaVenda ? formatDate(summary.ultimaVenda.fechadoEm) : "Nenhuma"} />
            </div>

            <div className="border-b border-[var(--border-default)] px-3 py-2.5">
              <div className="grid gap-1.5">
                <ContextLine icon={<UserRound size={12} />} label="Responsável" value={summary?.responsavelComercial?.nome || "Não atribuído"} />
                <ContextLine icon={<CalendarClock size={12} />} label="Última atividade" value={summary?.ultimaAtividade ? formatDateTime(summary.ultimaAtividade) : "Sem atividade"} />
              </div>
              <div className="mt-2 grid gap-1.5">
                {overview.contexto.negocio ? (readOnly ? <ContextLine icon={<BriefcaseBusiness size={12} />} label="Negócio histórico" value={overview.contexto.negocio.titulo} /> : <ContextAction icon={<BriefcaseBusiness size={13} />} label="Negócio atual" value={overview.contexto.negocio.titulo} onClick={() => onNavigateContext("KANBAN", overview.contexto.negocio!.id)} />) : null}
                {overview.contexto.proposta ? (readOnly ? <ContextLine icon={<FileText size={12} />} label="Proposta histórica" value={`${overview.contexto.proposta.codigo} · ${overview.contexto.proposta.status}`} /> : <ContextAction icon={<FileText size={13} />} label="Proposta atual" value={`${overview.contexto.proposta.codigo} · ${overview.contexto.proposta.status}`} onClick={() => onNavigateContext("KANBAN", overview.contexto.proposta!.negocioId)} />) : null}
                {overview.contexto.proximoAcompanhamento ? (readOnly ? <ContextLine icon={<CalendarClock size={12} />} label="Acompanhamento histórico" value={`${overview.contexto.proximoAcompanhamento.titulo} · ${formatDateTime(overview.contexto.proximoAcompanhamento.dataHora)}`} /> : <ContextAction icon={<CalendarClock size={13} />} label="Próxima ação" value={`${overview.contexto.proximoAcompanhamento.titulo} · ${formatDateTime(overview.contexto.proximoAcompanhamento.dataHora)}`} onClick={() => onNavigateContext("AGENDA", overview.contexto.proximoAcompanhamento!.id)} />) : null}
              </div>
            </div>

            <details className="border-b border-[var(--border-default)] px-3 py-2.5">
                  <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-700 hover:text-slate-900">Vendas realizadas ({overview.comprasAnteriores.length})</summary>
              <div className="mt-2 space-y-1.5">
                {overview.comprasAnteriores.length ? overview.comprasAnteriores.map((purchase) => {
                  const content = <><span className="min-w-0"><span className="block truncate text-[11px] font-medium text-slate-700">{purchase.titulo}</span><span className="mt-0.5 block text-[10px] text-slate-600">{purchase.origem === "ACCEPTED_PROPOSAL" ? `Proposta ${purchase.proposta?.codigo || "vencedora"}` : "Fechamento manual"} · {formatDate(purchase.fechadoEm)}</span></span><span className="shrink-0 text-[11px] font-semibold text-emerald-700">{money(purchase.totalCentavos / 100)}</span></>;
                  return readOnly
                    ? <div className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left" key={purchase.id}>{content}</div>
                    : <button className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left hover:border-teal-300 hover:bg-teal-50" key={purchase.id} onClick={() => onNavigateContext("KANBAN", purchase.negocioId)} type="button">{content}</button>;
                }) : <p className="text-[11px] text-slate-600">Nenhuma venda realizada.</p>}
              </div>
            </details>
          </>
        )}

        {!readOnly ? <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => onRequestWhatsapp(selectedClient)} className="saas-action rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2 text-left text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100" type="button">
              <MessageCircle size={14} className="mb-1 text-emerald-700" /><p className="text-[10px] font-semibold">WhatsApp</p>
            </button>
            <QuickAction icon={<Phone size={13} />} label="Telefone" disabled={!selectedClient.phone} onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")} />
            <QuickAction icon={<Copy size={13} />} label="Resumo" onClick={() => onCopyText(`${selectedClient.name} | ${selectedClient.company} | ${location}`, "Resumo copiado.")} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedClient.tags.map((tag) => <button key={tag} onClick={() => onRemoveTagFromSelected(tag)} className={`rounded-full border px-2 py-0.5 text-[10px] transition hover:brightness-110 ${tagClass(tag)}`} title="Remover tag" type="button">{tag} ×</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2">
              <Tag size={12} className="shrink-0 text-slate-500" />
              <input value={tagText} onChange={(event) => onSetTagText(event.target.value)} placeholder="Nova tag..." className="min-w-0 flex-1 select-text bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-500" />
            </div>
            <button onClick={onAddTagToSelected} className="rounded-md border border-slate-200/14 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-white" type="button">Adicionar</button>
          </div>
          <div className="mt-3 border-t border-slate-700/35 pt-3">
            <SmallButton onClick={() => onEditClient(selectedClient)} icon={<Edit3 size={12} />} label="Editar cadastro" />
          </div>
        </div> : (
          <div className="border-t border-[var(--border-default)] px-3 py-3 text-[11px] text-[var(--text-muted)]">
            Cliente arquivado: ações comerciais e edição ficam bloqueadas até a restauração.
            {canRestore ? (
              <button type="button" onClick={() => onEditClient(selectedClient)} className="mt-2 inline-flex min-h-11 items-center rounded-md border border-teal-300/20 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                Abrir cadastro para restaurar
              </button>
            ) : <p className="mt-2 text-[11px] text-[var(--text-muted)]">Somente administradores e gerentes podem restaurar clientes arquivados.</p>}
          </div>
        )}
      </section>

      <DashboardClientTimeline
        selectedClient={selectedClient}
        noteText={noteText}
        onSetNoteText={onSetNoteText}
        onAddNote={readOnly ? () => undefined : onAddNote}
        onNavigateContext={onNavigateContext}
        onUnauthorized={onUnauthorized}
        readOnly={readOnly}
      />
    </div>
  );
}

function ContactRow({ icon, label, value, onCopy }: { icon: ReactNode; label: string; value: string; onCopy?: () => void }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"><span className="shrink-0 text-slate-500">{icon}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-medium text-slate-600">{label}</p><p className="truncate text-[11px] text-slate-700">{value}</p></div>{onCopy ? <button aria-label={`Copiar ${label.toLowerCase()}`} className="min-h-10 min-w-10 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onCopy} type="button"><Copy size={11} /></button> : null}</div>;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--bg-surface)] px-3 py-2.5"><p className="text-[10px] text-slate-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p></div>;
}

function ContextLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-2"><span className="text-slate-600">{icon}</span><span className="text-[10px] text-slate-600">{label}</span><span className="ml-auto truncate text-[11px] font-medium text-slate-700">{value}</span></div>;
}

function ContextAction({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: string; onClick: () => void }) {
  return <button className="flex min-h-11 w-full items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-left hover:border-teal-300 hover:bg-teal-50" onClick={onClick} type="button"><span className="shrink-0 text-teal-700">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[10px] text-slate-600">{label}</span><span className="block truncate text-[11px] font-medium text-slate-700">{value}</span></span><span aria-hidden="true" className="text-xs text-slate-600">›</span></button>;
}

function QuickAction({ icon, label, onClick, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button className="saas-action rounded-lg px-2 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick} type="button">{icon}<p className="mt-1 text-[10px] font-semibold">{label}</p></button>;
}

function formatDocument(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}
