import { ArrowRight, BriefcaseBusiness, FilterX, History, Search, UserPlus, UserRoundSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthSession, CommunicationConversation, CommunicationLead, LeadStatus, LeadsCommunicationUser } from "../../services/crmApi";
import {
  ApiHttpError,
  assignCommunicationLead,
  assumeCommunicationLead,
  convertCommunicationLeadToBusiness,
  createCommunicationLead,
  fetchCommunicationConversations,
  fetchCommunicationLead,
  fetchCommunicationLeadHistory,
  fetchCommunicationLeads,
  fetchCommunicationTeamUsers,
  returnCommunicationLeadToQueue,
  updateCommunicationLead,
} from "../../services/crmApi";
import type { Client } from "../../types/dashboard";
import { Button, EmptyState, ErrorState, FilterBar, Input, LoadingState, Pagination, Select, Surface, Textarea } from "../ui";
import { CommunicationDrawer, CommunicationModal } from "./CommunicationOverlay";
import { DetailRow, LeadStatusBadge } from "./communicationPresentation";
import { formatCommunicationDate, leadStatusLabels } from "./communicationFormatters";

type LeadsPanelProps = {
  authSession: AuthSession;
  clients: Client[];
  createRequestKey: number;
  onOpenConversation: (conversationId: number) => void;
};

type QuickView = "todos" | "meus" | "sem-responsavel";
type ActionModal = { kind: "assign" | "queue"; lead: CommunicationLead } | null;

const statusOptions: LeadStatus[] = ["NOVO", "EM_ATENDIMENTO", "QUALIFICADO", "DESQUALIFICADO"];

export default function DashboardLeadsPanel({ authSession, clients, createRequestKey, onOpenConversation }: LeadsPanelProps) {
  const [quickView, setQuickView] = useState<QuickView>("todos");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [responsavelId, setResponsavelId] = useState("");
  const [origem, setOrigem] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ data: CommunicationLead[]; pagination: { page: number; limit: number; total: number; totalPages: number } } | null>(null);
  const [metrics, setMetrics] = useState({ novos: 0, semResponsavel: 0, emAtendimento: 0, qualificados: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<CommunicationLead | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<Awaited<ReturnType<typeof fetchCommunicationLeadHistory>>>([]);
  const [selectedConversations, setSelectedConversations] = useState<CommunicationConversation[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [teamUsers, setTeamUsers] = useState<LeadsCommunicationUser[]>([]);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversionLead, setConversionLead] = useState<CommunicationLead | null>(null);
  const [conversionForm, setConversionForm] = useState({ titulo: "", valor: "", observacao: "" });
  const [conversionError, setConversionError] = useState("");
  const [closedCreateRequestKey, setClosedCreateRequestKey] = useState(0);
  const [createForm, setCreateForm] = useState({ clienteId: "", interesse: "", origem: "", campanha: "", responsavelId: "" });
  const requestSequence = useRef(0);
  const conversionInFlight = useRef(false);
  const hasLoaded = useRef(false);
  const manager = ["ADMIN", "GERENTE"].includes(authSession.papel ?? authSession.usuario.papel ?? "");
  const currentUserId = authSession.usuario.id ?? 0;
  const createOpen = manager && createRequestKey > closedCreateRequestKey;

  useEffect(() => {
    if (!manager) return;
    let active = true;
    fetchCommunicationTeamUsers()
      .then((response) => { if (active) setTeamUsers(response.data.filter((user) => user.ativo !== false)); })
      .catch(() => { if (active) setTeamUsers([]); });
    return () => { active = false; };
  }, [manager]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    let active = true;
    async function loadLeads() {
      if (hasLoaded.current) setRefreshing(true); else setLoading(true);
      setError("");
      try {
        const response = await fetchCommunicationLeads({
          page,
          limit: 12,
          ...(quickView === "meus" ? { meus: true } : {}),
          ...(quickView === "sem-responsavel" ? { semResponsavel: true } : {}),
          ...(status ? { status } : {}),
          ...(responsavelId ? { responsavelId: Number(responsavelId) } : {}),
          ...(origem ? { origem } : {}),
          ...(clienteId ? { clienteId: Number(clienteId) } : {}),
          ...(search.trim() ? { q: search.trim() } : {}),
        });
        if (active && sequence === requestSequence.current) {
          setResult(response);
          hasLoaded.current = true;
        }
      } catch (nextError) {
        if (active && sequence === requestSequence.current) setError(errorMessage(nextError));
      } finally {
        if (active && sequence === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void loadLeads();
    return () => { active = false; };
  }, [clienteId, origem, page, quickView, refreshKey, responsavelId, search, status]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchCommunicationLeads({ status: "NOVO", limit: 1 }),
      fetchCommunicationLeads({ semResponsavel: true, limit: 1 }),
      fetchCommunicationLeads({ status: "EM_ATENDIMENTO", limit: 1 }),
      fetchCommunicationLeads({ status: "QUALIFICADO", limit: 1 }),
    ]).then(([novos, semResponsavel, emAtendimento, qualificados]) => {
      if (!active) return;
      setMetrics({ novos: novos.pagination.total, semResponsavel: semResponsavel.pagination.total, emAtendimento: emAtendimento.pagination.total, qualificados: qualificados.pagination.total });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [refreshKey]);

  const responsibleOptions = useMemo(() => {
    const users = new Map<number, LeadsCommunicationUser>();
    teamUsers.forEach((user) => users.set(user.id, user));
    result?.data.forEach((lead) => { if (lead.responsavel) users.set(lead.responsavel.id, lead.responsavel); });
    return [...users.values()].sort((first, second) => first.nome.localeCompare(second.nome));
  }, [result, teamUsers]);

  const origins = useMemo(() => [...new Set(result?.data.map((lead) => lead.origem).filter((value): value is string => Boolean(value)) ?? [])].sort(), [result]);

  async function openLead(lead: CommunicationLead) {
    setSelected(lead);
    setDrawerLoading(true);
    try {
      const [detail, history, conversations] = await Promise.all([
        fetchCommunicationLead(lead.id),
        fetchCommunicationLeadHistory(lead.id),
        fetchCommunicationConversations({ leadId: lead.id, limit: 20 }),
      ]);
      setSelected(detail);
      setSelectedHistory(history);
      setSelectedConversations(conversations.data);
    } catch (nextError) {
      setFeedback(errorMessage(nextError));
    } finally {
      setDrawerLoading(false);
    }
  }

  async function runAssume(lead: CommunicationLead) {
    setBusy(true);
    try {
      await assumeCommunicationLead(lead.id);
      setFeedback("Lead assumido. O histórico de atribuição foi atualizado.");
      await refreshLead(lead.id);
    } catch (nextError) {
      setFeedback(errorMessage(nextError));
    } finally { setBusy(false); }
  }

  async function refreshLead(id: number) {
    setRefreshKey((value) => value + 1);
    if (selected?.id === id) {
      const [detail, history] = await Promise.all([fetchCommunicationLead(id), fetchCommunicationLeadHistory(id)]);
      setSelected(detail);
      setSelectedHistory(history);
    }
  }

  async function submitAction() {
    if (!actionModal) return;
    setActionError("");
    if (actionModal.kind === "assign" && !actionValue) {
      setActionError("Selecione um responsável.");
      return;
    }
    if (actionModal.kind === "queue" && !actionReason.trim()) {
      setActionError("Informe o motivo da devolução.");
      return;
    }
    setBusy(true);
    try {
      if (actionModal.kind === "assign") await assignCommunicationLead(actionModal.lead.id, Number(actionValue), actionReason.trim() || undefined);
      else await returnCommunicationLeadToQueue(actionModal.lead.id, actionReason.trim());
      const id = actionModal.lead.id;
      setActionModal(null);
      setActionValue("");
      setActionReason("");
      setFeedback(actionModal.kind === "assign" ? "Responsável atualizado." : "Lead devolvido à fila.");
      await refreshLead(id);
    } catch (nextError) {
      setActionError(errorMessage(nextError));
    } finally { setBusy(false); }
  }

  async function submitCreate() {
    if (!createForm.clienteId) return;
    setBusy(true);
    setActionError("");
    try {
      const createdLead = await createCommunicationLead({
        clienteId: Number(createForm.clienteId),
        ...(createForm.interesse.trim() ? { interesse: createForm.interesse.trim() } : {}),
        ...(createForm.origem.trim() ? { origem: createForm.origem.trim() } : {}),
        ...(createForm.campanha.trim() ? { campanha: createForm.campanha.trim() } : {}),
        ...(createForm.responsavelId ? { responsavelId: Number(createForm.responsavelId) } : {}),
      });
      setClosedCreateRequestKey(createRequestKey);
      setCreateForm({ clienteId: "", interesse: "", origem: "", campanha: "", responsavelId: "" });
      setFeedback("Lead criado com sucesso.");
      setRefreshKey((value) => value + 1);
      await openLead(await fetchCommunicationLead(createdLead.id));
    } catch (nextError) {
      setActionError(errorMessage(nextError));
    } finally { setBusy(false); }
  }

  function openConversion(lead: CommunicationLead) {
    const parts = ["Oportunidade", lead.cliente.nome, lead.interesse].filter(Boolean);
    setConversionLead(lead);
    setConversionForm({ titulo: parts.join(" - ").slice(0, 200), valor: "", observacao: "" });
    setConversionError("");
  }

  async function submitConversion() {
    if (!conversionLead || !conversionForm.titulo.trim() || conversionInFlight.current) return;
    if (conversionForm.valor && (!Number.isSafeInteger(Number(conversionForm.valor)) || Number(conversionForm.valor) < 0)) {
      setConversionError("Informe um valor inteiro não negativo ou deixe o campo vazio.");
      return;
    }
    conversionInFlight.current = true;
    setBusy(true);
    setConversionError("");
    try {
      const result = await convertCommunicationLeadToBusiness(conversionLead.id, {
        titulo: conversionForm.titulo.trim(),
        ...(conversionForm.valor ? { valor: Number(conversionForm.valor) } : {}),
        ...(conversionForm.observacao.trim() ? { observacao: conversionForm.observacao.trim() } : {}),
      });
      setSelected(result.lead);
      setConversionLead(null);
      setFeedback(result.created ? "Lead convertido em Negócio." : "Este Lead já possui um Negócio vinculado.");
      setRefreshKey((value) => value + 1);
    } catch (nextError) {
      setConversionError(errorMessage(nextError));
    } finally {
      conversionInFlight.current = false;
      setBusy(false);
    }
  }

  function resetFilters() {
    setQuickView("todos");
    setStatus("");
    setResponsavelId("");
    setOrigem("");
    setClienteId("");
    setSearch("");
    setPage(1);
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);
  const selectedIsMine = selected?.responsavelId === currentUserId;
  const canEditSelected = Boolean(selected && (manager || selectedIsMine));
  const selectedBusiness = selected?.negocios?.[0] ?? null;
  const canConvertSelected = Boolean(selected && !selectedBusiness && selected.responsavelId !== null && selected.status !== "DESQUALIFICADO" && selected.status !== "CONVERTIDO" && (manager || selectedIsMine));

  return (
    <div className="space-y-3" data-testid="leads-page">
      {feedback && <div aria-live="polite" className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">{feedback}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LeadMetric label="Novos" value={metrics.novos} onClick={() => { setStatus("NOVO"); setQuickView("todos"); setPage(1); }} />
        <LeadMetric label="Sem responsável" value={metrics.semResponsavel} tone="warning" onClick={() => { setQuickView("sem-responsavel"); setStatus(""); setPage(1); }} />
        <LeadMetric label="Em atendimento" value={metrics.emAtendimento} onClick={() => { setStatus("EM_ATENDIMENTO"); setQuickView("todos"); setPage(1); }} />
        <LeadMetric label="Qualificados" value={metrics.qualificados} tone="success" onClick={() => { setStatus("QUALIFICADO"); setQuickView("todos"); setPage(1); }} />
      </div>

      <FilterBar aria-label="Filtros de Leads" className="items-end">
        <div className="flex h-9 rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] p-1" role="group" aria-label="Visualização rápida">
          {([['todos', 'Todos'], ['meus', 'Meus'], ['sem-responsavel', 'Sem responsável']] as const).map(([value, label]) => (
            <button aria-pressed={quickView === value} className={`rounded px-2.5 text-[11px] font-medium transition-colors ${quickView === value ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)]"}`} key={value} onClick={() => { setQuickView(value); setPage(1); }} type="button">{label}</button>
          ))}
        </div>
        <Input aria-label="Buscar Leads" className="w-52" containerClassName="w-52" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cliente, origem ou interesse" value={search} />
        <Select aria-label="Filtrar por status" containerClassName="w-40" onChange={(event) => { setStatus(event.target.value as LeadStatus | ""); setPage(1); }} value={status}>
          <option value="">Todos os status</option>{statusOptions.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}
        </Select>
        <Select aria-label="Filtrar por responsável" containerClassName="w-44" onChange={(event) => { setResponsavelId(event.target.value); setPage(1); }} value={responsavelId}>
          <option value="">Todos os responsáveis</option>{responsibleOptions.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}
        </Select>
        <Select aria-label="Filtrar por origem" containerClassName="w-36" onChange={(event) => { setOrigem(event.target.value); setPage(1); }} value={origem}>
          <option value="">Todas as origens</option>{origins.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Select aria-label="Filtrar por cliente" containerClassName="w-44" onChange={(event) => { setClienteId(event.target.value); setPage(1); }} value={clienteId}>
          <option value="">Todos os clientes</option>{clients.map((client) => <option key={client.backendId ?? client.id} value={client.backendId ?? client.id}>{client.name}</option>)}
        </Select>
        <Button leftIcon={<FilterX size={13} />} onClick={resetFilters} size="sm" variant="ghost">Limpar</Button>
      </FilterBar>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Fila de Leads</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{result?.pagination.total ?? 0} registros no escopo atual</p></div>
          {refreshing && <span className="text-[11px] text-[var(--text-muted)]">Atualizando...</span>}
        </div>
        {loading ? <LoadingState className="p-4" rows={6} /> : error ? <ErrorState className="m-4" description={error} onRetry={() => setRefreshKey((value) => value + 1)} title="Não foi possível carregar os Leads" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead className="bg-[var(--bg-muted)] text-[11px] text-[var(--text-secondary)]"><tr><th className="px-4 py-2.5 font-medium">Cliente</th><th className="px-3 py-2.5 font-medium">Interesse</th><th className="px-3 py-2.5 font-medium">Origem</th><th className="px-3 py-2.5 font-medium">Responsável</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Criado em</th><th className="px-3 py-2.5 text-right font-medium">Ações</th></tr></thead>
              <tbody className="divide-y divide-[var(--border-default)]">{result?.data.map((lead) => <LeadRow busy={busy} currentUserId={currentUserId} key={lead.id} lead={lead} manager={manager} onAssign={() => { setActionModal({ kind: "assign", lead }); setActionValue(String(lead.responsavelId ?? "")); }} onAssume={() => void runAssume(lead)} onOpen={() => void openLead(lead)} onQueue={() => setActionModal({ kind: "queue", lead })} />)}</tbody>
            </table>
            {result?.data.length === 0 && <EmptyState description="Ajuste os filtros ou crie um Lead vinculado a um Cliente existente." icon={<UserRoundSearch size={18} />} title="Nenhum Lead encontrado" />}
          </div>
        )}
        <Pagination disabled={loading || refreshing} itemLabel="Leads" onPageChange={setPage} page={page} total={result?.pagination.total ?? 0} totalPages={totalPages} visibleCount={result?.data.length ?? 0} />
      </Surface>

      <CommunicationDrawer description="Contexto comercial, conversas e histórico de responsabilidade." onClose={() => setSelected(null)} open={Boolean(selected)} title={selected?.cliente?.nome ?? "Detalhes do Lead"}>
        {drawerLoading || !selected ? <LoadingState rows={5} /> : <div className="space-y-4">
          <section><h3 className="mb-1 text-xs font-semibold text-[var(--text-primary)]">Resumo</h3><dl><DetailRow label="Status" value={<LeadStatusBadge status={selected.status} />} /><DetailRow label="Responsável" value={selected.responsavel?.nome ?? "Sem responsável"} /><DetailRow label="Interesse" value={selected.interesse ?? "Não informado"} /></dl></section>
          <section><h3 className="mb-1 text-xs font-semibold text-[var(--text-primary)]">Origem comercial</h3><dl><DetailRow label="Origem" value={selected.origem ?? "Não informado"} /><DetailRow label="Campanha" value={selected.campanha ?? "Não informado"} /></dl></section>
          <section><h3 className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Ações permitidas</h3><div className="flex flex-wrap gap-2">{selected.responsavelId === null && <Button disabled={busy} leftIcon={<UserPlus size={13} />} onClick={() => void runAssume(selected)} size="sm">Assumir</Button>}{manager && <Button onClick={() => { setActionModal({ kind: "assign", lead: selected }); setActionValue(String(selected.responsavelId ?? "")); }} size="sm" variant="secondary">{selected.responsavelId ? "Transferir" : "Atribuir"}</Button>}{(manager || selectedIsMine) && selected.responsavelId !== null && <Button onClick={() => setActionModal({ kind: "queue", lead: selected })} size="sm" variant="secondary">Devolver à fila</Button>}{canConvertSelected && <Button disabled={busy} leftIcon={<BriefcaseBusiness size={13} />} onClick={() => openConversion(selected)} size="sm">Converter em Negócio</Button>}</div>{selected.responsavelId === null && <p className="mt-2 text-[11px] text-[var(--text-muted)]">Assuma o Lead antes de convertê-lo em Negócio.</p>}</section>
          {selectedBusiness && <section className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3"><div className="mb-2 flex items-center gap-2"><BriefcaseBusiness size={14} /><h3 className="text-xs font-semibold text-[var(--text-primary)]">Negócio vinculado</h3></div><dl><DetailRow label="Título" value={selectedBusiness.titulo ?? `Negócio #${selectedBusiness.id}`} /><DetailRow label="Etapa" value={selectedBusiness.etapa} /><DetailRow label="Responsável" value={selectedBusiness.responsavel?.nome ?? "Sem responsável"} /><DetailRow label="Valor" value={selectedBusiness.valor === null ? "Não informado" : String(selectedBusiness.valor)} /><DetailRow label="Convertido por" value={selectedBusiness.convertidoPor?.nome ?? "Usuário removido"} /><DetailRow label="Convertido em" value={formatCommunicationDate(selectedBusiness.createdAt)} /></dl></section>}
          {canEditSelected && selected.status !== "CONVERTIDO" && <LeadEditor busy={busy} key={`${selected.id}-${selected.updatedAt}`} lead={selected} onSave={async (payload) => { setBusy(true); try { await updateCommunicationLead(selected.id, payload); setFeedback("Lead atualizado."); await refreshLead(selected.id); } catch (nextError) { setFeedback(errorMessage(nextError)); } finally { setBusy(false); } }} />}
          <section><div className="mb-2 flex items-center gap-2"><Search size={13} /><h3 className="text-xs font-semibold text-[var(--text-primary)]">Conversas relacionadas</h3></div>{selectedConversations.length ? <div className="space-y-2">{selectedConversations.map((conversation) => <button className="flex w-full items-center justify-between rounded-md border border-[var(--border-default)] px-3 py-2 text-left hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" key={conversation.id} onClick={() => onOpenConversation(conversation.id)} type="button"><span><span className="block text-[11px] font-medium text-[var(--text-primary)]">{conversation.canalIntegracao.nome}</span><span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{conversation.ultimaMensagem?.texto ?? "Sem mensagens"}</span></span><ArrowRight size={14} /></button>)}</div> : <p className="text-[11px] text-[var(--text-muted)]">Nenhuma conversa vinculada.</p>}</section>
          <section><div className="mb-2 flex items-center gap-2"><History size={13} /><h3 className="text-xs font-semibold text-[var(--text-primary)]">Histórico de atribuição</h3></div>{selectedHistory.length ? <ol className="space-y-2">{selectedHistory.map((entry) => <li className="rounded-md bg-[var(--bg-muted)] px-3 py-2 text-[11px]" key={entry.id}><p className="font-medium text-[var(--text-primary)]">{historyLabel(entry.tipo, entry.responsavelAnterior?.nome, entry.responsavelNovo?.nome)}</p><p className="mt-0.5 text-[var(--text-muted)]">Por {entry.alteradoPor?.nome ?? "Usuário removido"} · {formatCommunicationDate(entry.createdAt)}</p>{entry.motivo && <p className="mt-1 text-[var(--text-secondary)]">{entry.motivo}</p>}</li>)}</ol> : <p className="text-[11px] text-[var(--text-muted)]">Nenhuma alteração de responsável registrada.</p>}</section>
          <section><h3 className="mb-1 text-xs font-semibold text-[var(--text-primary)]">Datas importantes</h3><dl><DetailRow label="Criado em" value={formatCommunicationDate(selected.createdAt)} /><DetailRow label="Atualizado em" value={formatCommunicationDate(selected.updatedAt)} /><DetailRow label="Qualificado em" value={formatCommunicationDate(selected.qualificadoEm)} /></dl></section>
        </div>}
      </CommunicationDrawer>

      <CommunicationModal description={actionModal?.kind === "queue" ? "O motivo ficará registrado no histórico." : "Selecione um usuário ativo da mesma empresa."} footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setActionModal(null)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} onClick={() => void submitAction()} size="sm">Confirmar</Button></div>} onClose={() => setActionModal(null)} open={Boolean(actionModal)} title={actionModal?.kind === "queue" ? "Devolver Lead à fila" : "Atualizar responsável"}>
        {actionModal?.kind === "assign" && <Select error={actionError} label="Responsável" onChange={(event) => setActionValue(event.target.value)} value={actionValue}><option value="">Selecione</option>{teamUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select>}
        {actionModal?.kind === "queue" && <Textarea error={actionError} label="Motivo" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}
        {actionModal?.kind === "assign" && <Input className="mt-3" label="Motivo (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}
      </CommunicationModal>

      <CommunicationModal description="O Lead será vinculado a um Cliente existente e não criará um Negócio automaticamente." footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setClosedCreateRequestKey(createRequestKey)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy || !createForm.clienteId} onClick={() => void submitCreate()} size="sm">Criar Lead</Button></div>} onClose={() => setClosedCreateRequestKey(createRequestKey)} open={createOpen} title="Novo Lead">
        <div className="grid gap-3"><Select error={actionError} label="Cliente" onChange={(event) => setCreateForm((current) => ({ ...current, clienteId: event.target.value }))} value={createForm.clienteId}><option value="">Selecione um Cliente</option>{clients.map((client) => <option key={client.backendId ?? client.id} value={client.backendId ?? client.id}>{client.name}</option>)}</Select><Textarea label="Interesse" maxLength={500} onChange={(event) => setCreateForm((current) => ({ ...current, interesse: event.target.value }))} value={createForm.interesse} /><div className="grid gap-3 sm:grid-cols-2"><Input label="Origem" maxLength={160} onChange={(event) => setCreateForm((current) => ({ ...current, origem: event.target.value }))} value={createForm.origem} /><Input label="Campanha" maxLength={160} onChange={(event) => setCreateForm((current) => ({ ...current, campanha: event.target.value }))} value={createForm.campanha} /></div><Select label="Responsável (opcional)" onChange={(event) => setCreateForm((current) => ({ ...current, responsavelId: event.target.value }))} value={createForm.responsavelId}><option value="">Sem responsável</option>{teamUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select></div>
      </CommunicationModal>

      <CommunicationModal description="A conversão cria um Negócio vinculado, sem alterar o card do Kanban legado." footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setConversionLead(null)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy || !conversionForm.titulo.trim()} onClick={() => void submitConversion()} size="sm">Converter</Button></div>} onClose={() => { if (!busy) setConversionLead(null); }} open={Boolean(conversionLead)} title="Converter em Negócio">
        {conversionLead && <div className="grid gap-3"><div className="rounded-md bg-[var(--bg-muted)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><p><strong className="text-[var(--text-primary)]">Cliente:</strong> {conversionLead.cliente.nome}</p><p className="mt-1"><strong className="text-[var(--text-primary)]">Interesse:</strong> {conversionLead.interesse ?? "Não informado"}</p><p className="mt-1"><strong className="text-[var(--text-primary)]">Responsável:</strong> {conversionLead.responsavel?.nome ?? "Sem responsável"}</p></div><Input error={conversionError} label="Título" maxLength={200} onChange={(event) => setConversionForm((current) => ({ ...current, titulo: event.target.value }))} value={conversionForm.titulo} /><Input label="Valor estimado (opcional)" min="0" onChange={(event) => setConversionForm((current) => ({ ...current, valor: event.target.value }))} step="1" type="number" value={conversionForm.valor} /><Textarea label="Observação (opcional)" maxLength={1000} onChange={(event) => setConversionForm((current) => ({ ...current, observacao: event.target.value }))} value={conversionForm.observacao} /></div>}
      </CommunicationModal>
    </div>
  );
}

function LeadMetric({ label, onClick, tone = "neutral", value }: { label: string; onClick: () => void; tone?: "neutral" | "warning" | "success"; value: number }) {
  return <button className="metric-card flex min-h-20 items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" onClick={onClick} type="button"><span><span className="block text-[11px] font-medium text-[var(--text-muted)]">{label}</span><span className={`mt-1 block text-xl font-semibold tabular-nums ${tone === "warning" ? "text-[var(--warning)]" : tone === "success" ? "text-[var(--success)]" : "text-[var(--text-primary)]"}`}>{value}</span></span><ArrowRight size={14} className="text-[var(--icon-muted)]" /></button>;
}

function LeadRow({ busy, currentUserId, lead, manager, onAssign, onAssume, onOpen, onQueue }: { busy: boolean; currentUserId: number; lead: CommunicationLead; manager: boolean; onAssign: () => void; onAssume: () => void; onOpen: () => void; onQueue: () => void }) {
  const mine = lead.responsavelId === currentUserId;
  return <tr className="bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]"><td className="px-4 py-3"><button className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" onClick={onOpen} type="button"><span className="block text-xs font-semibold text-[var(--text-primary)]">{lead.cliente.nome}</span><span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Lead #{lead.id}</span></button></td><td className="max-w-56 px-3 py-3 text-[11px] text-[var(--text-secondary)]"><span className="line-clamp-2">{lead.interesse || "Não informado"}</span></td><td className="px-3 py-3 text-[11px] text-[var(--text-secondary)]">{lead.origem || "Não informado"}</td><td className="px-3 py-3 text-[11px]"><span className={lead.responsavel ? "text-[var(--text-primary)]" : "text-[var(--warning)]"}>{lead.responsavel?.nome ?? "Sem responsável"}</span></td><td className="px-3 py-3"><LeadStatusBadge status={lead.status} /></td><td className="px-3 py-3 text-[11px] tabular-nums text-[var(--text-muted)]">{formatCommunicationDate(lead.createdAt)}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button onClick={onOpen} size="sm" variant="ghost">Detalhes</Button>{lead.responsavelId === null && <Button disabled={busy} onClick={onAssume} size="sm" variant="secondary">Assumir</Button>}{manager && <Button onClick={onAssign} size="sm" variant="secondary">{lead.responsavelId ? "Transferir" : "Atribuir"}</Button>}{(manager || mine) && lead.responsavelId !== null && <Button onClick={onQueue} size="sm" variant="ghost">Devolver</Button>}</div></td></tr>;
}

function LeadEditor({ busy, lead, onSave }: { busy: boolean; lead: CommunicationLead; onSave: (payload: { interesse?: string | null; origem?: string | null; campanha?: string | null; status?: LeadStatus }) => Promise<void> }) {
  const [form, setForm] = useState({ interesse: lead.interesse ?? "", origem: lead.origem ?? "", campanha: lead.campanha ?? "", status: lead.status });
  return <section><h3 className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Atualização comercial</h3><div className="grid gap-2"><Textarea label="Interesse" maxLength={500} onChange={(event) => setForm((current) => ({ ...current, interesse: event.target.value }))} value={form.interesse} /><div className="grid gap-2 sm:grid-cols-2"><Input label="Origem" maxLength={160} onChange={(event) => setForm((current) => ({ ...current, origem: event.target.value }))} value={form.origem} /><Input label="Campanha" maxLength={160} onChange={(event) => setForm((current) => ({ ...current, campanha: event.target.value }))} value={form.campanha} /></div><Select label="Status" onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LeadStatus }))} value={form.status}>{statusOptions.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}</Select><div><Button disabled={busy} onClick={() => void onSave(form)} size="sm">Salvar alterações</Button></div></div></section>;
}

function historyLabel(type: string, previous?: string, next?: string) {
  if (type === "ASSUMIR") return `${next ?? "Usuário"} assumiu o Lead`;
  if (type === "DESATRIBUIR") return `${previous ?? "Responsável"} devolveu o Lead à fila`;
  if (type === "TRANSFERIR") return `Transferido de ${previous ?? "Sem responsável"} para ${next ?? "Sem responsável"}`;
  return `Atribuído a ${next ?? "Sem responsável"}`;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
