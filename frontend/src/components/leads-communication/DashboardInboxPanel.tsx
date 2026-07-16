import { Archive, Camera, Globe2, History, Inbox, MessageCircle, PanelRightOpen, RefreshCw, Search, Send, StickyNote, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthSession, CommunicationConversation, CommunicationMessage, ConversationStatus, LeadsCommunicationUser, ReplyLease } from "../../services/crmApi";
import {
  ApiHttpError,
  acquireCommunicationReplyLease,
  assignCommunicationConversation,
  assumeCommunicationConversation,
  createCommunicationNote,
  fetchCommunicationConversation,
  fetchCommunicationConversationHistory,
  fetchCommunicationConversations,
  fetchCommunicationMessages,
  fetchCommunicationNotes,
  fetchCommunicationTeamUsers,
  releaseCommunicationReplyLease,
  renewCommunicationReplyLease,
  returnCommunicationConversationToQueue,
  sendSimulatedCommunicationMessage,
  updateCommunicationConversationStatus,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Select, Surface, Textarea } from "../ui";
import { CommunicationDrawer, CommunicationModal } from "./CommunicationOverlay";
import { ConversationStatusBadge, DetailRow } from "./communicationPresentation";
import { channelLabel, conversationStatusLabels, formatCommunicationDate, formatCommunicationTime, initials } from "./communicationFormatters";
import "./LeadsCommunication.css";

type InboxPanelProps = {
  authSession: AuthSession;
  initialConversationId?: number | null;
};

type QueueView = "todas" | "minhas" | "sem-responsavel" | ConversationStatus;
type ActionModal = { kind: "assign" | "queue"; conversation: CommunicationConversation } | null;
type ComposerMode = "reply" | "note";

const conversationStates: ConversationStatus[] = ["NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"];

export default function DashboardInboxPanel({ authSession, initialConversationId }: InboxPanelProps) {
  const [queueView, setQueueView] = useState<QueueView>("todas");
  const [responsavelId, setResponsavelId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Awaited<ReturnType<typeof fetchCommunicationConversations>> | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialConversationId ?? null);
  const [conversation, setConversation] = useState<CommunicationConversation | null>(null);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof fetchCommunicationNotes>>>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchCommunicationConversationHistory>>>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [composerText, setComposerText] = useState("");
  const [composerError, setComposerError] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lease, setLease] = useState<ReplyLease | null>(null);
  const [leaseOwned, setLeaseOwned] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [teamUsers, setTeamUsers] = useState<LeadsCommunicationUser[]>([]);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const hasList = useRef(false);
  const selectedIdRef = useRef<number | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const messageViewport = useRef<HTMLDivElement>(null);
  const manager = ["ADMIN", "GERENTE"].includes(authSession.papel ?? authSession.usuario.papel ?? "");
  const currentUserId = authSession.usuario.id ?? 0;

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    if (!manager) return;
    let active = true;
    fetchCommunicationTeamUsers().then((response) => { if (active) setTeamUsers(response.data.filter((user) => user.ativo !== false)); }).catch(() => undefined);
    return () => { active = false; };
  }, [manager]);

  const listQuery = useMemo(() => ({
    page,
    limit: 20,
    ...(queueView === "minhas" ? { meus: true } : {}),
    ...(queueView === "sem-responsavel" ? { semResponsavel: true } : {}),
    ...(conversationStates.includes(queueView as ConversationStatus) ? { estado: queueView as ConversationStatus } : {}),
    ...(responsavelId ? { responsavelId: Number(responsavelId) } : {}),
    ...(channelId ? { canalIntegracaoId: Number(channelId) } : {}),
    ...(leadId ? { leadId: Number(leadId) } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  }), [channelId, leadId, page, queueView, responsavelId, search]);

  const loadList = useCallback(async (background = false) => {
    const sequence = ++listRequest.current;
    if (background || hasList.current) setListRefreshing(true); else setListLoading(true);
    if (!background) setListError("");
    try {
      const response = await fetchCommunicationConversations(listQuery);
      if (sequence !== listRequest.current) return;
      setList(response);
      hasList.current = true;
      const currentSelectedId = selectedIdRef.current;
      if (!currentSelectedId && response.data.length) setSelectedId(response.data[0].id);
      if (currentSelectedId && !response.data.some((item) => item.id === currentSelectedId) && page === 1) setSelectedId(response.data[0]?.id ?? null);
    } catch (error) {
      if (sequence === listRequest.current && !background) setListError(errorMessage(error));
    } finally {
      if (sequence === listRequest.current) { setListLoading(false); setListRefreshing(false); }
    }
  }, [listQuery, page]);

  useEffect(() => {
    let active = true;
    const sequence = ++listRequest.current;
    async function loadInitialList() {
      if (hasList.current) setListRefreshing(true); else setListLoading(true);
      setListError("");
      try {
        const response = await fetchCommunicationConversations(listQuery);
        if (!active || sequence !== listRequest.current) return;
        setList(response);
        hasList.current = true;
        const currentSelectedId = selectedIdRef.current;
        if (!currentSelectedId && response.data.length) setSelectedId(response.data[0].id);
        if (currentSelectedId && !response.data.some((item) => item.id === currentSelectedId) && page === 1) setSelectedId(response.data[0]?.id ?? null);
      } catch (error) {
        if (active && sequence === listRequest.current) setListError(errorMessage(error));
      } finally {
        if (active && sequence === listRequest.current) { setListLoading(false); setListRefreshing(false); }
      }
    }
    void loadInitialList();
    return () => { active = false; };
  }, [listQuery, page]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadList(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  const loadDetail = useCallback(async (id: number, background = false) => {
    const sequence = ++detailRequest.current;
    if (!background) { setDetailLoading(true); setDetailError(""); }
    try {
      const { detail, historyList, messagePage, noteList } = await fetchConversationBundle(id);
      if (sequence !== detailRequest.current) return;
      setConversation(detail);
      setMessages(messagePage.data);
      setNotes(noteList);
      setHistory(historyList);
      setLease(detail.reservaResposta);
      setLeaseOwned(detail.reservaResposta?.usuarioId === currentUserId);
    } catch (error) {
      if (sequence === detailRequest.current && !background) setDetailError(errorMessage(error));
    } finally {
      if (sequence === detailRequest.current && !background) setDetailLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedId) return;
    const conversationId = selectedId;
    let active = true;
    const sequence = ++detailRequest.current;
    async function loadInitialDetail() {
      setDetailLoading(true);
      setDetailError("");
      try {
        const { detail, historyList, messagePage, noteList } = await fetchConversationBundle(conversationId);
        if (!active || sequence !== detailRequest.current) return;
        setConversation(detail);
        setMessages(messagePage.data);
        setNotes(noteList);
        setHistory(historyList);
        setLease(detail.reservaResposta);
        setLeaseOwned(detail.reservaResposta?.usuarioId === currentUserId);
      } catch (error) {
        if (active && sequence === detailRequest.current) setDetailError(errorMessage(error));
      } finally {
        if (active && sequence === detailRequest.current) setDetailLoading(false);
      }
    }
    void loadInitialDetail();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDetail(conversationId, true);
    }, 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [currentUserId, loadDetail, selectedId]);

  useEffect(() => {
    const viewport = messageViewport.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, notes, composerMode]);

  useEffect(() => {
    if (!selectedId || !leaseOwned || !composerText.trim() || document.visibilityState !== "visible") return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || !composerText.trim()) return;
      try {
        const response = await renewCommunicationReplyLease(selectedId);
        setLease(response.reservaResposta);
      } catch (error) {
        handleLeaseError(error);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [composerText, leaseOwned, selectedId]);

  useEffect(() => {
    const conversationId = selectedId;
    return () => {
      if (conversationId && leaseOwned) void releaseCommunicationReplyLease(conversationId).catch(() => undefined);
    };
  }, [leaseOwned, selectedId]);

  const channels = useMemo(() => {
    const values = new Map<number, CommunicationConversation["canalIntegracao"]>();
    list?.data.forEach((item) => values.set(item.canalIntegracao.id, item.canalIntegracao));
    return [...values.values()];
  }, [list]);

  const responsibleOptions = useMemo(() => {
    const values = new Map<number, LeadsCommunicationUser>();
    teamUsers.forEach((user) => values.set(user.id, user));
    list?.data.forEach((item) => { if (item.responsavel) values.set(item.responsavel.id, item.responsavel); });
    return [...values.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [list, teamUsers]);

  const activeLeaseFromOther = Boolean(lease && lease.usuarioId !== currentUserId && new Date(lease.expiraEm).getTime() > Date.now());
  const conversationIsMine = conversation?.responsavelId === currentUserId;
  const canChangeConversation = Boolean(conversation && (manager || conversationIsMine));
  const isClosed = conversation?.status === "ENCERRADA";

  async function acquireLease() {
    if (!selectedId || isClosed || composerMode !== "reply" || leaseOwned || activeLeaseFromOther) return;
    try {
      const response = await acquireCommunicationReplyLease(selectedId);
      setLease(response.reservaResposta);
      setLeaseOwned(true);
      setComposerError("");
    } catch (error) {
      handleLeaseError(error);
    }
  }

  function handleLeaseError(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 409) {
      const nextLease = error.details?.reservaResposta as ReplyLease | undefined;
      setLease(nextLease ?? null);
      setLeaseOwned(false);
      setComposerError(nextLease?.nome ? `${nextLease.nome} está respondendo esta conversa.` : error.message);
      return;
    }
    setComposerError(errorMessage(error));
  }

  async function sendReply() {
    const text = composerText.trim();
    if (!selectedId || !text || sending || isClosed) return;
    setSending(true);
    setComposerError("");
    if (!idempotencyKey.current) idempotencyKey.current = createIdempotencyKey();
    try {
      await sendSimulatedCommunicationMessage(selectedId, { externalId: idempotencyKey.current, texto: text });
      setComposerText("");
      idempotencyKey.current = null;
      setLease(null);
      setLeaseOwned(false);
      setFeedback("Resposta simulada registrada com autoria.");
      await Promise.all([loadDetail(selectedId), loadList(true)]);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 409) handleLeaseError(error);
      else setComposerError(errorMessage(error));
    } finally { setSending(false); }
  }

  async function saveNote() {
    const text = composerText.trim();
    if (!selectedId || !text || sending) return;
    setSending(true);
    setComposerError("");
    try {
      await createCommunicationNote(selectedId, text);
      setComposerText("");
      setFeedback("Nota interna adicionada.");
      await loadDetail(selectedId);
    } catch (error) { setComposerError(errorMessage(error)); }
    finally { setSending(false); }
  }

  async function assumeConversation() {
    if (!conversation) return;
    setBusy(true);
    try {
      await assumeCommunicationConversation(conversation.id);
      setFeedback("Conversa assumida.");
      await Promise.all([loadDetail(conversation.id), loadList(true)]);
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submitAction() {
    if (!actionModal) return;
    setActionError("");
    if (actionModal.kind === "assign" && !actionValue) { setActionError("Selecione um responsável."); return; }
    if (actionModal.kind === "queue" && !actionReason.trim()) { setActionError("Informe o motivo da devolução."); return; }
    setBusy(true);
    try {
      if (actionModal.kind === "assign") await assignCommunicationConversation(actionModal.conversation.id, Number(actionValue), actionReason.trim() || undefined);
      else await returnCommunicationConversationToQueue(actionModal.conversation.id, actionReason.trim());
      const id = actionModal.conversation.id;
      setActionModal(null);
      setActionValue(""); setActionReason("");
      setFeedback(actionModal.kind === "assign" ? "Responsável atualizado." : "Conversa devolvida à fila.");
      await Promise.all([loadDetail(id), loadList(true)]);
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changeState(next: ConversationStatus) {
    if (!conversation) return;
    setBusy(true);
    try {
      await updateCommunicationConversationStatus(conversation.id, next);
      await Promise.all([loadDetail(conversation.id), loadList(true)]);
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function resetFilters() {
    setQueueView("todas"); setResponsavelId(""); setChannelId(""); setLeadId(""); setSearch(""); setPage(1);
  }

  return (
    <div className="space-y-3" data-testid="inbox-page">
      {feedback && <div aria-live="polite" className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">{feedback}</div>}
      <Surface className="inbox-workspace grid min-h-[520px] overflow-hidden">
        <aside className="inbox-filters flex min-h-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-muted)]" aria-label="Filas e filtros">
          <div className="border-b border-[var(--border-default)] px-3 py-3"><p className="text-xs font-semibold text-[var(--text-primary)]">Filas</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Atendimento compartilhado</p></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <QueueButton active={queueView === "todas"} icon={<Inbox size={14} />} label="Todas" onClick={() => { setQueueView("todas"); setPage(1); }} />
            <QueueButton active={queueView === "minhas"} icon={<MessageCircle size={14} />} label="Minhas" onClick={() => { setQueueView("minhas"); setPage(1); }} />
            <QueueButton active={queueView === "sem-responsavel"} icon={<UserPlus size={14} />} label="Sem responsável" onClick={() => { setQueueView("sem-responsavel"); setPage(1); }} />
            <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">Estado</p>
            {conversationStates.map((item) => <QueueButton active={queueView === item} icon={item === "ENCERRADA" ? <Archive size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />} key={item} label={conversationStatusLabels[item]} onClick={() => { setQueueView(item); setPage(1); }} />)}
          </div>
          <div className="space-y-2 border-t border-[var(--border-default)] p-3"><Select aria-label="Responsável" onChange={(event) => setResponsavelId(event.target.value)} value={responsavelId}><option value="">Todos responsáveis</option>{responsibleOptions.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select><Select aria-label="Canal" onChange={(event) => setChannelId(event.target.value)} value={channelId}><option value="">Todos os canais</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channelLabel(channel.tipo, channel.nome)}</option>)}</Select><Input aria-label="Filtrar por Lead" inputMode="numeric" onChange={(event) => setLeadId(event.target.value.replace(/\D/g, ""))} placeholder="ID do Lead" value={leadId} /><Button onClick={resetFilters} size="sm" variant="ghost">Limpar filtros</Button></div>
        </aside>

        <section className="inbox-conversation-list flex min-h-0 flex-col border-r border-[var(--border-default)]" aria-label="Lista de conversas">
          <div className="flex items-center gap-2 border-b border-[var(--border-default)] p-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--icon-muted)]" size={13} /><input aria-label="Buscar conversas" className="h-9 w-full rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] pl-8 pr-3 text-xs outline-none focus:border-[var(--control-border-focus)] focus:ring-2 focus:ring-[var(--control-ring)]" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Contato ou interesse" value={search} /></div><IconButton aria-label="Atualizar conversas" disabled={listRefreshing} onClick={() => void loadList(true)}><RefreshCw className={listRefreshing ? "animate-spin" : ""} size={14} /></IconButton></div>
          <div className="min-h-0 flex-1 overflow-y-auto">{listLoading ? <LoadingState className="p-3" rows={7} /> : listError ? <ErrorState className="m-3" description={listError} onRetry={() => void loadList()} title="Falha ao carregar conversas" /> : list?.data.length ? list.data.map((item) => <ConversationListItem active={selectedId === item.id} currentUserId={currentUserId} item={item} key={item.id} onClick={() => setSelectedId(item.id)} />) : <EmptyState className="m-3" description="Ajuste a fila ou os filtros para localizar outros atendimentos." icon={<Inbox size={18} />} title="Nenhuma conversa encontrada" />}</div>
          <div className="flex items-center justify-between border-t border-[var(--border-default)] px-3 py-2 text-[11px] text-[var(--text-muted)]"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Anterior</button><span className="tabular-nums">{list?.pagination.total ?? 0} conversas</span><button disabled={page >= Math.max(1, list?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} type="button">Próxima</button></div>
        </section>

        <section className="inbox-conversation flex min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]" aria-label="Conversa selecionada">
          {!selectedId ? <EmptyState className="m-auto max-w-sm" description="Escolha uma conversa para consultar o histórico e responder." icon={<MessageCircle size={18} />} title="Selecione uma conversa" /> : detailLoading ? <LoadingState className="p-4" rows={6} /> : detailError ? <ErrorState className="m-4" description={detailError} onRetry={() => selectedId && void loadDetail(selectedId)} title="Falha ao abrir a conversa" /> : conversation && <>
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[11px] font-semibold">{initials(conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome)}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Contato sem nome"}</h2><ChannelBadge conversation={conversation} /><ConversationStatusBadge status={conversation.status} /></div><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">Conversa: {conversation.responsavelPrincipal?.nome ?? "Sem responsável"} · Lead: {conversation.lead?.responsavel?.nome ?? "Sem responsável"}</p></div></div><div className="flex items-center gap-1">{conversation.responsavelId === null && <Button disabled={busy} onClick={() => void assumeConversation()} size="sm">Assumir</Button>}{manager && <Button onClick={() => { setActionModal({ kind: "assign", conversation }); setActionValue(String(conversation.responsavelId ?? "")); }} size="sm" variant="secondary">{conversation.responsavelId ? "Transferir" : "Atribuir"}</Button>}{(manager || conversationIsMine) && conversation.responsavelId !== null && <Button onClick={() => setActionModal({ kind: "queue", conversation })} size="sm" variant="ghost">Devolver</Button>}<IconButton aria-label="Abrir contexto do Cliente e Lead" onClick={() => setContextOpen(true)}><PanelRightOpen size={15} /></IconButton></div></header>

            {activeLeaseFromOther && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800"><strong>{lease?.nome ?? "Outro usuário"}</strong> está respondendo esta conversa. Reserva até {formatCommunicationTime(lease?.expiraEm)}.</div>}
            {leaseOwned && <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] text-emerald-800">Você está preparando uma resposta. Isso não altera o responsável principal.</div>}

            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-muted)] px-4 py-3" ref={messageViewport}>{messages.length ? <MessageTimeline currentUserId={currentUserId} messages={messages} /> : <EmptyState description="As mensagens simuladas desta conversa aparecerão aqui." icon={<MessageCircle size={18} />} title="Sem mensagens" />}{composerMode === "note" && notes.length > 0 && <div className="mt-4 border-t border-[var(--border-default)] pt-3"><p className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">Notas internas</p><div className="space-y-2">{notes.map((note) => <article className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px]" key={note.id}><p className="whitespace-pre-wrap text-amber-950">{note.conteudo}</p><p className="mt-1 text-amber-700">{note.autor?.nome ?? "Usuário removido"} · {formatCommunicationDate(note.createdAt)}</p></article>)}</div></div>}</div>

            <footer className="shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-3"><div className="mb-2 flex items-center justify-between gap-3"><div className="flex rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1" role="group" aria-label="Modo do compositor"><button aria-pressed={composerMode === "reply"} className={`rounded px-2.5 py-1 text-[11px] font-medium ${composerMode === "reply" ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("reply"); setComposerText(""); setComposerError(""); }} type="button">Resposta</button><button aria-pressed={composerMode === "note"} className={`rounded px-2.5 py-1 text-[11px] font-medium ${composerMode === "note" ? "bg-amber-50 text-amber-800 shadow-sm" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("note"); setComposerText(""); setComposerError(""); }} type="button">Nota interna</button></div>{canChangeConversation && <Select aria-label="Estado da conversa" className="h-8" containerClassName="w-48" disabled={busy} onChange={(event) => void changeState(event.target.value as ConversationStatus)} value={conversation.status}>{conversationStates.map((item) => <option key={item} value={item}>{conversationStatusLabels[item]}</option>)}</Select>}</div><Textarea aria-label={composerMode === "reply" ? "Resposta" : "Nota interna"} className={composerMode === "note" ? "border-amber-200 bg-amber-50" : ""} disabled={(composerMode === "reply" && (isClosed || activeLeaseFromOther)) || sending} error={composerError || undefined} helperText={composerMode === "reply" ? isClosed ? "Conversa encerrada. O histórico permanece disponível." : "Ctrl+Enter ou Cmd+Enter envia. Enter cria uma nova linha." : "Nota interna — não será enviada ao cliente."} maxLength={4000} onChange={(event) => { setComposerText(event.target.value); if (event.target.value.trim()) void acquireLease(); }} onFocus={() => void acquireLease()} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void (composerMode === "reply" ? sendReply() : saveNote()); } }} placeholder={composerMode === "reply" ? "Digite uma resposta simulada..." : "Registre uma nota para a equipe..."} value={composerText} /><div className="mt-2 flex justify-end"><Button disabled={sending || !composerText.trim() || (composerMode === "reply" && (isClosed || activeLeaseFromOther))} leftIcon={composerMode === "reply" ? <Send size={13} /> : <StickyNote size={13} />} onClick={() => void (composerMode === "reply" ? sendReply() : saveNote())} size="sm">{sending ? "Salvando..." : composerMode === "reply" ? "Enviar" : "Adicionar nota"}</Button></div></footer>
          </>}
        </section>
      </Surface>

      <CommunicationDrawer description="Cadastro consolidado, Lead e histórico deste atendimento." onClose={() => setContextOpen(false)} open={contextOpen && Boolean(conversation)} title="Contexto do atendimento">
        {conversation && <div className="space-y-4"><section><h3 className="mb-1 text-xs font-semibold">Cliente</h3><dl><DetailRow label="Nome" value={conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Não informado"} /><DetailRow label="Telefone" value={conversation.contatoCanal.cliente?.telefone || "Não informado"} /><DetailRow label="E-mail" value={conversation.contatoCanal.cliente?.email || "Não informado"} /><DetailRow label="Empresa / propriedade" value={conversation.contatoCanal.cliente?.empresa || "Não informado"} /></dl></section><section><h3 className="mb-1 text-xs font-semibold">Lead</h3><dl><DetailRow label="Interesse" value={conversation.lead?.interesse ?? "Não informado"} /><DetailRow label="Origem" value={conversation.lead?.origem ?? "Não informado"} /><DetailRow label="Campanha" value={conversation.lead?.campanha ?? "Não informado"} /><DetailRow label="Responsável" value={conversation.lead?.responsavel?.nome ?? "Sem responsável"} /></dl></section><section><h3 className="mb-1 text-xs font-semibold">Conversa</h3><dl><DetailRow label="Canal" value={channelLabel(conversation.canalIntegracao.tipo, conversation.canalIntegracao.nome)} /><DetailRow label="Estado" value={<ConversationStatusBadge status={conversation.status} />} /><DetailRow label="Responsável" value={conversation.responsavelPrincipal?.nome ?? "Sem responsável"} /><DetailRow label="Criada em" value={formatCommunicationDate(conversation.createdAt)} /><DetailRow label="Última atividade" value={formatCommunicationDate(conversation.ultimaMensagemEm)} /></dl></section><section><div className="mb-2 flex items-center gap-2"><History size={13} /><h3 className="text-xs font-semibold">Histórico de atribuição</h3></div>{history.length ? <ol className="space-y-2">{history.map((entry) => <li className="rounded-md bg-[var(--bg-muted)] px-3 py-2 text-[11px]" key={entry.id}><p className="font-medium">{historyLabel(entry.tipo, entry.responsavelAnterior?.nome, entry.responsavelNovo?.nome)}</p><p className="mt-0.5 text-[var(--text-muted)]">Por {entry.alteradoPor?.nome ?? "Usuário removido"} · {formatCommunicationDate(entry.createdAt)}</p>{entry.motivo && <p className="mt-1">{entry.motivo}</p>}</li>)}</ol> : <p className="text-[11px] text-[var(--text-muted)]">Nenhuma alteração registrada.</p>}</section></div>}
      </CommunicationDrawer>

      <CommunicationModal description={actionModal?.kind === "queue" ? "O motivo ficará registrado no histórico." : "Selecione um usuário ativo da mesma empresa."} footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setActionModal(null)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} onClick={() => void submitAction()} size="sm">Confirmar</Button></div>} onClose={() => setActionModal(null)} open={Boolean(actionModal)} title={actionModal?.kind === "queue" ? "Devolver conversa à fila" : "Atualizar responsável"}>{actionModal?.kind === "assign" && <Select error={actionError} label="Responsável" onChange={(event) => setActionValue(event.target.value)} value={actionValue}><option value="">Selecione</option>{teamUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select>}{actionModal?.kind === "queue" && <Textarea error={actionError} label="Motivo" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}{actionModal?.kind === "assign" && <Input className="mt-3" label="Motivo (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}</CommunicationModal>
    </div>
  );
}

function QueueButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[11px] font-medium transition-colors ${active ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"}`} onClick={onClick} type="button"><span className="flex h-5 w-5 items-center justify-center">{icon}</span><span className="truncate">{label}</span></button>;
}

function ConversationListItem({ active, currentUserId, item, onClick }: { active: boolean; currentUserId: number; item: CommunicationConversation; onClick: () => void }) {
  const otherLease = item.reservaResposta && item.reservaResposta.usuarioId !== currentUserId;
  const name = item.contatoCanal.cliente?.nome ?? item.contatoCanal.nome ?? "Contato sem nome";
  return <button aria-current={active ? "true" : undefined} className={`w-full border-b border-[var(--border-default)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${active ? "bg-[var(--bg-muted)] shadow-[inset_3px_0_0_var(--primary)]" : "bg-[var(--bg-surface)]"}`} onClick={onClick} type="button"><div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[10px] font-semibold">{initials(name)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-[var(--text-primary)]">{name}</span><span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{formatCommunicationTime(item.ultimaMensagemEm ?? item.updatedAt)}</span></span><span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]"><span>{channelLabel(item.canalIntegracao.tipo, item.canalIntegracao.nome)}</span><span aria-hidden="true">·</span><span className={item.responsavel ? "" : "text-[var(--warning)]"}>{item.responsavel?.nome ?? "Sem responsável"}</span></span><span className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">{item.ultimaMensagem?.texto ?? "Sem mensagens"}</span><span className="mt-2 flex flex-wrap items-center gap-1.5"><ConversationStatusBadge status={item.status} />{otherLease && <Badge variant="warning">{item.reservaResposta?.nome ?? "Equipe"} respondendo</Badge>}</span></span></div></button>;
}

function MessageTimeline({ currentUserId, messages }: { currentUserId: number; messages: CommunicationMessage[] }) {
  return <div className="space-y-3">{messages.map((message, index) => { const outgoing = message.direcao === "SAIDA"; const mine = message.autor?.id === currentUserId; const previous = messages[index - 1]; const showDate = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString(); return <div key={message.id}>{showDate && <div className="my-3 flex items-center gap-3 text-[10px] text-[var(--text-muted)]"><span className="h-px flex-1 bg-[var(--border-default)]" /><span>{formatCommunicationDate(message.createdAt, false)}</span><span className="h-px flex-1 bg-[var(--border-default)]" /></div>}<article className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[76%] rounded-lg border px-3 py-2 ${outgoing ? mine ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50" : "border-[var(--border-default)] bg-[var(--bg-surface)]"}`}><p className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-primary)]">{message.texto || "Mensagem sem conteúdo"}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{outgoing ? `Respondido por ${message.autor?.nome ?? "Automação"} às ${formatCommunicationTime(message.createdAt)}` : `Recebida às ${formatCommunicationTime(message.createdAt)}`}{outgoing && message.statusEntrega ? ` · ${deliveryLabel(message.statusEntrega)}` : ""}</p></div></article></div>; })}</div>;
}

function ChannelBadge({ conversation }: { conversation: CommunicationConversation }) {
  const label = channelLabel(conversation.canalIntegracao.tipo, conversation.canalIntegracao.nome);
  const icon = label === "Instagram" ? <Camera size={11} /> : label === "Facebook" ? <UsersRound size={11} /> : label === "Site" ? <Globe2 size={11} /> : <MessageCircle size={11} />;
  return <Badge className="gap-1" variant="neutral">{icon}{label}{conversation.canalIntegracao.modoTeste ? " · simulado" : ""}</Badge>;
}

function deliveryLabel(status: string) {
  return ({ RECEBIDA: "Recebida", PENDENTE_ENVIO: "Pendente", ENVIADA: "Enviada", ENTREGUE: "Entregue", LIDA: "Lida", FALHOU: "Falhou" } as Record<string, string>)[status] ?? status;
}

function historyLabel(type: string, previous?: string, next?: string) {
  if (type === "ASSUMIR") return `${next ?? "Usuário"} assumiu a conversa`;
  if (type === "DESATRIBUIR") return `${previous ?? "Responsável"} devolveu à fila`;
  if (type === "TRANSFERIR") return `Transferida de ${previous ?? "Sem responsável"} para ${next ?? "Sem responsável"}`;
  return `Atribuída a ${next ?? "Sem responsável"}`;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `web-${crypto.randomUUID()}`;
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchConversationBundle(id: number) {
  const [detail, messagePage, noteList, historyList] = await Promise.all([
    fetchCommunicationConversation(id),
    fetchCommunicationMessages(id, { limit: 100 }),
    fetchCommunicationNotes(id),
    fetchCommunicationConversationHistory(id),
  ]);
  return { detail, historyList, messagePage, noteList };
}

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
