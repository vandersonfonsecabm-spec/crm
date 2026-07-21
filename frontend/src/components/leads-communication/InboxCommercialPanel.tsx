import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Link2,
  PencilLine,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiHttpError,
  createInboxBusiness,
  fetchInboxCommercialContext,
  fetchInboxEligibleBusinesses,
  linkInboxBusiness,
  saveInboxCommercialQualification,
} from "../../services/crmApi";
import type {
  CommercialPriority,
  InboxCommercialBusiness,
  InboxCommercialContext,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Select, Textarea } from "../ui";
import { CommunicationModal } from "./CommunicationOverlay";

type Props = {
  conversationId: number;
  onOpenBusiness: (businessId: number) => void;
};

type QualificationForm = {
  interesse: string;
  prioridade: CommercialPriority;
  valorEstimado: string;
  proximaAcao: string;
  dataRetorno: string;
  observacao: string;
};

const priorities: Array<{ value: CommercialPriority; label: string }> = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica" },
];

export default function InboxCommercialPanel({ conversationId, onOpenBusiness }: Props) {
  const [context, setContext] = useState<InboxCommercialContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<QualificationForm>(emptyForm());
  const [businessQuery, setBusinessQuery] = useState("");
  const [businesses, setBusinesses] = useState<InboxCommercialBusiness[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [duplicateOptions, setDuplicateOptions] = useState<InboxCommercialBusiness[]>([]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchInboxCommercialContext(conversationId);
      setContext(next);
      setForm(formFromContext(next));
    } catch (nextError) {
      setError(commercialErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContext(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  const stateView = useMemo(() => commercialStateView(context?.estado), [context?.estado]);

  async function saveQualification() {
    if (!form.interesse.trim() || !form.proximaAcao.trim()) {
      setFormError("Informe o interesse e a próxima ação.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const next = await saveInboxCommercialQualification(conversationId, {
        interesse: form.interesse,
        prioridade: form.prioridade,
        valorEstimado: form.valorEstimado === "" ? null : Number(form.valorEstimado),
        proximaAcao: form.proximaAcao,
        dataRetorno: form.dataRetorno || null,
        observacao: form.observacao || null,
      });
      setContext(next);
      setForm(formFromContext(next));
      setEditing(false);
      setFeedback("Qualificação comercial salva.");
    } catch (nextError) {
      setFormError(commercialErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function loadBusinesses() {
    setBusinessesLoading(true);
    setFormError("");
    try {
      const response = await fetchInboxEligibleBusinesses(conversationId, businessQuery);
      setBusinesses(response.data);
    } catch (nextError) {
      setFormError(commercialErrorMessage(nextError));
    } finally {
      setBusinessesLoading(false);
    }
  }

  async function createBusiness(confirmDuplicate = false) {
    setBusy(true);
    setFormError("");
    try {
      const response = await createInboxBusiness(conversationId, {
        confirmarDuplicidade: confirmDuplicate,
        observacao: context?.qualificacao?.observacao,
      });
      setContext(response.contexto);
      setDuplicateOptions([]);
      setFeedback("Negócio criado e vinculado à conversa.");
    } catch (nextError) {
      if (nextError instanceof ApiHttpError && nextError.code === "COMMERCIAL_BUSINESS_DUPLICATE_CONFIRMATION_REQUIRED") {
        const candidates = nextError.details?.negocios;
        setDuplicateOptions(Array.isArray(candidates) ? candidates as InboxCommercialBusiness[] : []);
      } else {
        setFormError(commercialErrorMessage(nextError));
        if (nextError instanceof ApiHttpError && nextError.status === 409) await loadContext();
      }
    } finally {
      setBusy(false);
    }
  }

  async function linkBusiness(businessId: number) {
    setBusy(true);
    setFormError("");
    try {
      const response = await linkInboxBusiness(conversationId, businessId);
      setContext(response.contexto);
      setLinking(false);
      setFeedback("Negócio existente vinculado.");
    } catch (nextError) {
      setFormError(commercialErrorMessage(nextError));
      if (nextError instanceof ApiHttpError && nextError.status === 409) await loadContext();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Carregando contexto comercial" rows={4} />;
  if (error) return <ErrorState description="A conversa permanece disponível." onRetry={() => void loadContext()} title={error} />;
  if (!context) return null;

  return (
    <section aria-label="Qualificação comercial" className="space-y-3" data-testid="inbox-commercial-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BriefcaseBusiness aria-hidden="true" className="text-[var(--primary)]" size={15} />
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Contexto comercial</h3>
            <Badge variant={stateView.variant}>{stateView.label}</Badge>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">Qualifique o interesse antes de levar a oportunidade ao Kanban.</p>
        </div>
        <IconButton aria-label="Atualizar contexto comercial" onClick={() => void loadContext()} title="Atualizar contexto comercial"><RefreshCw size={13} /></IconButton>
      </div>

      {feedback && <div aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{feedback}</div>}
      {formError && <div aria-live="assertive" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">{formError}</div>}

      {context.estado === "SEM_CONTEXTO" ? (
        <EmptyState description="Vincule um Cliente e um Lead válidos antes de qualificar este atendimento." icon={<BriefcaseBusiness size={18} />} title="Contexto comercial incompleto" />
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5 text-[11px]">
            <FlowStep label="Lead" value={context.lead?.status === "CONVERTIDO" ? "Convertido" : context.qualificacao ? "Qualificado" : "A qualificar"} />
            <ArrowRight aria-hidden="true" className="text-[var(--icon-muted)]" size={13} />
            <FlowStep label="Próxima ação" value={context.qualificacao?.proximaAcao ?? "Não definida"} />
            <ArrowRight aria-hidden="true" className="text-[var(--icon-muted)]" size={13} />
            <FlowStep label="Negócio" value={context.negocio ? "Vinculado" : "Pendente"} />
          </div>

          {!editing && !linking && <CommercialSummary context={context} onOpenBusiness={onOpenBusiness} />}

          {editing && (
            <div className="space-y-3 border-t border-[var(--border-default)] pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input containerClassName="sm:col-span-2" label="Produto, serviço ou assunto" maxLength={500} onChange={(event) => setForm((value) => ({ ...value, interesse: event.target.value }))} placeholder="Ex.: pulverizador de barras" value={form.interesse} />
                <Select label="Prioridade" onChange={(event) => setForm((value) => ({ ...value, prioridade: event.target.value as CommercialPriority }))} value={form.prioridade}>{priorities.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</Select>
                <Input inputMode="numeric" label="Valor estimado" min="0" onChange={(event) => setForm((value) => ({ ...value, valorEstimado: event.target.value.replace(/\D/g, "") }))} placeholder="Opcional" type="number" value={form.valorEstimado} />
                <Input containerClassName="sm:col-span-2" label="Próxima ação" maxLength={240} onChange={(event) => setForm((value) => ({ ...value, proximaAcao: event.target.value }))} placeholder="Ex.: preparar proposta comercial" value={form.proximaAcao} />
                <Input label="Data de retorno" onChange={(event) => setForm((value) => ({ ...value, dataRetorno: event.target.value }))} type="date" value={form.dataRetorno} />
                <div className="hidden sm:block" />
                <Textarea containerClassName="sm:col-span-2" label="Observação curta" maxLength={500} onChange={(event) => setForm((value) => ({ ...value, observacao: event.target.value }))} placeholder="Opcional" rows={3} value={form.observacao} />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button disabled={busy} onClick={() => { setEditing(false); setForm(formFromContext(context)); setFormError(""); }} size="sm" variant="ghost">Cancelar</Button>
                <Button disabled={busy || !form.interesse.trim() || !form.proximaAcao.trim()} onClick={() => void saveQualification()} size="sm">{busy ? "Salvando..." : "Salvar qualificação"}</Button>
              </div>
            </div>
          )}

          {linking && (
            <div className="space-y-3 border-t border-[var(--border-default)] pt-3">
              <div className="flex gap-2">
                <Input aria-label="Buscar Negócio existente" containerClassName="min-w-0 flex-1" onChange={(event) => setBusinessQuery(event.target.value)} placeholder="Título ou responsável" value={businessQuery} />
                <Button disabled={businessesLoading} leftIcon={<Search size={13} />} onClick={() => void loadBusinesses()} size="sm" variant="secondary">Buscar</Button>
              </div>
              {businessesLoading ? <LoadingState label="Buscando Negócios" rows={3} /> : businesses.length ? (
                <div className="space-y-2">{businesses.map((business) => <BusinessOption business={business} busy={busy} key={business.id} onLink={linkBusiness} />)}</div>
              ) : <EmptyState description="A busca considera somente Negócios ativos deste Cliente." icon={<Search size={18} />} title="Nenhum Negócio listado" />}
              <div className="flex justify-end"><Button onClick={() => { setLinking(false); setBusinessQuery(""); setBusinesses([]); }} size="sm" variant="ghost">Voltar</Button></div>
            </div>
          )}

          {!editing && !linking && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-3">
              {context.permissoes.qualificar && <Button leftIcon={<PencilLine size={13} />} onClick={() => { setEditing(true); setFeedback(""); }} size="sm" variant={context.qualificacao ? "secondary" : "primary"}>Qualificar atendimento</Button>}
              {!context.negocio && <Button disabled={!context.permissoes.criarOuVincular || busy} leftIcon={<BriefcaseBusiness size={13} />} onClick={() => void createBusiness()} size="sm">Criar Negócio</Button>}
              {!context.negocio && <Button disabled={!context.permissoes.criarOuVincular || busy} leftIcon={<Link2 size={13} />} onClick={() => { setLinking(true); void loadBusinesses(); }} size="sm" variant="secondary">Vincular Negócio existente</Button>}
              {context.negocio && <Button leftIcon={<ExternalLink size={13} />} onClick={() => onOpenBusiness(context.negocio!.id)} size="sm">Abrir no Kanban</Button>}
              {!context.permissoes.qualificar && <span className="self-center text-[11px] text-[var(--text-muted)]">Somente o responsável atual ou um administrador pode alterar a qualificação.</span>}
              {!context.permissoes.criarOuVincular && !context.negocio && context.permissoes.qualificar && <span className="self-center text-[10px] text-[var(--text-muted)]">Disponível após qualificação e contato humano.</span>}
            </div>
          )}
        </>
      )}

      <CommunicationModal
        description="Revise as oportunidades ativas antes de confirmar uma nova criação."
        footer={<div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={() => setDuplicateOptions([])} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} onClick={() => void createBusiness(true)} size="sm">Criar outro Negócio</Button></div>}
        onClose={() => setDuplicateOptions([])}
        open={duplicateOptions.length > 0}
        title="Possível duplicidade"
      >
        <div className="space-y-3">
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={14} /><p>Este Cliente já possui Negócios em andamento. Você pode cancelar, abrir um deles no Kanban depois ou confirmar uma nova oportunidade.</p></div>
          {duplicateOptions.map((business) => <BusinessOption business={business} busy key={business.id} />)}
        </div>
      </CommunicationModal>
    </section>
  );
}

function CommercialSummary({ context, onOpenBusiness }: { context: InboxCommercialContext; onOpenBusiness: (id: number) => void }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--border-default)] pt-3 text-[11px]">
      <SummaryItem label="Cliente" value={context.cliente?.nome ?? "Não vinculado"} />
      <SummaryItem label="Responsável comercial" value={context.lead?.responsavel?.nome ?? "Sem responsável"} />
      <SummaryItem label="Origem" value={context.lead?.origem ?? context.cliente?.origem ?? "Não informada"} />
      <SummaryItem label="Interesse" value={context.qualificacao?.interesse ?? context.lead?.interesse ?? "Não informado"} />
      <SummaryItem label="Prioridade" value={context.qualificacao ? priorityLabel(context.qualificacao.prioridade) : "Não definida"} />
      <SummaryItem label="Valor estimado" value={context.qualificacao?.valorEstimado === null || context.qualificacao?.valorEstimado === undefined ? "Não informado" : formatMoney(context.qualificacao.valorEstimado)} />
      <SummaryItem label="Próxima ação" value={context.qualificacao?.proximaAcao ?? "Não definida"} />
      <SummaryItem label="Data de retorno" value={formatDate(context.qualificacao?.dataRetorno)} />
      <div className="col-span-2 rounded-md border border-[var(--border-default)] px-3 py-2.5">
        <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]"><BriefcaseBusiness size={12} /> Negócio vinculado</dt>
        <dd className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[var(--text-primary)]">
          <span className="font-medium">{context.negocio?.titulo ?? "Nenhum Negócio vinculado"}</span>
          {context.negocio && <Button leftIcon={<ExternalLink size={12} />} onClick={() => onOpenBusiness(context.negocio!.id)} size="sm" variant="ghost">Abrir no Kanban</Button>}
        </dd>
      </div>
      {context.historico.length > 0 && <div className="col-span-2 border-t border-[var(--border-default)] pt-3"><dt className="mb-2 text-[10px] font-medium text-[var(--text-muted)]">Histórico comercial</dt><dd className="space-y-2">{context.historico.slice(0, 4).map((entry) => <div className="flex items-start gap-2" key={entry.id}><CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={12} /><div className="min-w-0"><p className="font-medium text-[var(--text-primary)]">{historyLabel(entry.acao)}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{entry.autor?.nome ?? "Usuário removido"} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div></div>)}</dd></div>}
    </dl>
  );
}

function BusinessOption({ business, busy, onLink }: { business: InboxCommercialBusiness; busy: boolean; onLink?: (id: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-default)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{business.titulo ?? `Negócio #${business.id}`}</p>
        <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{business.etapa} · {business.responsavel?.nome ?? "Sem responsável"} · {business.valor === null ? "Valor não informado" : formatMoney(business.valor)}</p>
      </div>
      {onLink && <Button disabled={busy || !business.elegivel} onClick={() => onLink(business.id)} size="sm" variant="secondary">Vincular</Button>}
    </div>
  );
}

function FlowStep({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-[var(--text-muted)]">{label}</p><p className="mt-0.5 truncate font-medium text-[var(--text-primary)]" title={value}>{value}</p></div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  const Icon = label === "Próxima ação" || label === "Data de retorno" ? CalendarClock : label === "Responsável comercial" ? UserRound : null;
  return <div className="min-w-0"><dt className="flex items-center gap-1 text-[10px] font-medium text-[var(--text-muted)]">{Icon && <Icon size={11} />}{label}</dt><dd className="mt-1 break-words font-medium text-[var(--text-primary)]">{value}</dd></div>;
}

function emptyForm(): QualificationForm {
  return { interesse: "", prioridade: "MEDIA", valorEstimado: "", proximaAcao: "", dataRetorno: "", observacao: "" };
}

function formFromContext(context: InboxCommercialContext): QualificationForm {
  return {
    interesse: context.qualificacao?.interesse ?? context.lead?.interesse ?? "",
    prioridade: context.qualificacao?.prioridade ?? "MEDIA",
    valorEstimado: context.qualificacao?.valorEstimado === null || context.qualificacao?.valorEstimado === undefined ? "" : String(context.qualificacao.valorEstimado),
    proximaAcao: context.qualificacao?.proximaAcao ?? "",
    dataRetorno: context.qualificacao?.dataRetorno ? new Date(context.qualificacao.dataRetorno).toISOString().slice(0, 10) : "",
    observacao: context.qualificacao?.observacao ?? "",
  };
}

function commercialStateView(state?: InboxCommercialContext["estado"]) {
  if (state === "NEGOCIO_VINCULADO") return { label: "Negócio vinculado", variant: "success" as const };
  if (state === "QUALIFICADO") return { label: "Qualificado", variant: "primary" as const };
  if (state === "SEM_CONTEXTO") return { label: "Contexto incompleto", variant: "warning" as const };
  return { label: "Não qualificado", variant: "neutral" as const };
}

function priorityLabel(priority: CommercialPriority) {
  return priorities.find((item) => item.value === priority)?.label ?? priority;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Não definida";
  return new Date(value).toLocaleDateString("pt-BR");
}

function historyLabel(action: InboxCommercialContext["historico"][number]["acao"]) {
  if (action === "CRIAR_NEGOCIO") return "Negócio criado";
  if (action === "VINCULAR_NEGOCIO") return "Negócio existente vinculado";
  return "Atendimento qualificado";
}

function commercialErrorMessage(error: unknown) {
  if (!(error instanceof ApiHttpError)) return "Não foi possível atualizar o contexto comercial agora.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 403) return "Você não tem permissão para alterar esta qualificação.";
  if (error.status === 404) return "A conversa ou o contexto comercial não foi encontrado.";
  if (error.status === 409) return error.message || "O contexto comercial foi alterado por outro usuário.";
  if (error.status === 422) return error.message || "Revise os dados informados.";
  return "Não foi possível atualizar o contexto comercial agora.";
}
