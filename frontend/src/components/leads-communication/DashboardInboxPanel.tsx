import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Filter, History, Inbox, MessageCircle, MoreHorizontal, PanelRightOpen, RefreshCw, Search, Send, StickyNote, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { AuthSession, CommunicationConversation, CommunicationMessage, ConversationStatus, LeadsCommunicationUser, ReplyLease } from "../../services/crmApi";
import {
  ApiHttpError,
  acquireCommunicationReplyLease,
  assignCommunicationConversation,
  assumeCommunicationConversation,
  closeCommunicationConversation,
  createCommunicationNote,
  fetchCommunicationConversation,
  fetchCommunicationConversationHistory,
  fetchCommunicationConversations,
  fetchCommunicationMessages,
  fetchCommunicationNotes,
  fetchCommunicationTeamUsers,
  markCommunicationConversationPending,
  markCommunicationConversationRead,
  releaseCommunicationReplyLease,
  reopenCommunicationConversation,
  renewCommunicationReplyLease,
  returnCommunicationConversationToQueue,
  sendSimulatedCommunicationMessage,
  waitCommunicationConversationForCustomer,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Pagination, Select, Surface, Textarea } from "../ui";
import { CommunicationChannelBadge } from "./CommunicationChannelBadge";
import { canUseSimulatedReply, getChannelPresentation } from "./communicationChannels";
import { CommunicationDrawer, CommunicationModal } from "./CommunicationOverlay";
import { ConversationSlaBadge, ConversationStatusBadge, DetailRow } from "./communicationPresentation";
import { channelLabel, conversationStatusLabels, formatCommunicationDate, formatCommunicationTime, initials } from "./communicationFormatters";
import InboxCommercialPanel from "./InboxCommercialPanel";
import "./LeadsCommunication.css";

type InboxPanelProps = {
  authSession: AuthSession;
  initialConversationId?: number | null;
  onOpenBusiness: (businessId: number) => void;
};

type QueueScope = "todas" | "minhas" | "sem-responsavel";
type SlaFilter = "" | "ATENCAO" | "CRITICO";
type MobileView = "list" | "conversation";
type ActionModal = { kind: "assign" | "queue" | "pending" | "close"; conversation: CommunicationConversation } | null;
type ComposerMode = "reply" | "note";

const conversationStates: ConversationStatus[] = ["NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"];

export default function DashboardInboxPanel({ authSession, initialConversationId, onOpenBusiness }: InboxPanelProps) {
  const [queueScope, setQueueScope] = useState<QueueScope>("todas");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "">("");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("");
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>(initialConversationId ? "conversation" : "list");
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [teamUsers, setTeamUsers] = useState<LeadsCommunicationUser[]>([]);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const hasList = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const messageViewport = useRef<HTMLDivElement>(null);
  const conversationPanel = useRef<HTMLElement>(null);
  const selectedConversationButton = useRef<HTMLButtonElement>(null);
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const shouldScrollToLatest = useRef(true);
  const lastMessageId = useRef<number | null>(null);
  const manager = ["ADMIN", "GERENTE"].includes(authSession.papel ?? authSession.usuario.papel ?? "");
  const currentUserId = authSession.usuario.id ?? 0;

  useEffect(() => {
    let active = true;
    fetchCommunicationTeamUsers().then((response) => { if (active) setTeamUsers(response.data.filter((user) => user.ativo !== false)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const listQuery = useMemo(() => ({
    page,
    limit: 20,
    ...(queueScope === "minhas" ? { meus: true } : {}),
    ...(queueScope === "sem-responsavel" ? { semResponsavel: true } : {}),
    ...(statusFilter ? { estado: statusFilter } : {}),
    ...(slaFilter ? { sla: slaFilter } : {}),
    ...(responsavelId ? { responsavelId: Number(responsavelId) } : {}),
    ...(channelId ? { canalIntegracaoId: Number(channelId) } : {}),
    ...(leadId ? { leadId: Number(leadId) } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  }), [channelId, leadId, page, queueScope, responsavelId, search, slaFilter, statusFilter]);

  const loadList = useCallback(async (background = false) => {
    const sequence = ++listRequest.current;
    if (background || hasList.current) setListRefreshing(true); else setListLoading(true);
    if (!background) setListError("");
    try {
      const response = await fetchCommunicationConversations(listQuery);
      if (sequence !== listRequest.current) return;
      setList(response);
      hasList.current = true;
    } catch (error) {
      if (sequence === listRequest.current && !background) setListError(errorMessage(error));
    } finally {
      if (sequence === listRequest.current) { setListLoading(false); setListRefreshing(false); }
    }
  }, [listQuery]);

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
      } catch (error) {
        if (active && sequence === listRequest.current) setListError(errorMessage(error));
      } finally {
        if (active && sequence === listRequest.current) { setListLoading(false); setListRefreshing(false); }
      }
    }
    void loadInitialList();
    return () => { active = false; };
  }, [listQuery]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadList(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  const loadDetail = useCallback(async (id: number, background = false) => {
    const sequence = ++detailRequest.current;
    if (!background) {
      setDetailLoading(true);
      setDetailError("");
      setHasNewMessages(false);
      lastMessageId.current = null;
    }
    try {
      const { detail, historyList, messagePage, noteList } = await fetchConversationBundle(id);
      if (sequence !== detailRequest.current) return;
      const nextLastMessageId = messagePage.data.at(-1)?.id ?? null;
      const keepAtLatest = !background || isNearMessageEnd(messageViewport.current);
      shouldScrollToLatest.current = keepAtLatest;
      if (!keepAtLatest && lastMessageId.current && nextLastMessageId !== lastMessageId.current) {
        setHasNewMessages(true);
      }
      lastMessageId.current = nextLastMessageId;
      setConversation(detail);
      setMessages(messagePage.data);
      setNotes(noteList);
      setHistory(historyList);
      setLease(detail.reservaResposta);
      setLeaseOwned(detail.reservaResposta?.usuarioId === currentUserId);
      if (detail.naoLidas > 0 && (!background || keepAtLatest)) {
        void markCommunicationConversationRead(id).then(() => {
          setConversation((value) => value?.id === id ? { ...value, naoLidas: 0 } : value);
          void loadList(true);
        }).catch(() => undefined);
      }
    } catch (error) {
      if (sequence === detailRequest.current && !background) setDetailError(errorMessage(error));
    } finally {
      if (sequence === detailRequest.current && !background) setDetailLoading(false);
    }
  }, [currentUserId, loadList]);

  useEffect(() => {
    if (!selectedId) return;
    const conversationId = selectedId;
    const initialLoad = window.setTimeout(() => void loadDetail(conversationId), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDetail(conversationId, true);
    }, 7000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadDetail, selectedId]);

  useEffect(() => {
    const viewport = messageViewport.current;
    if (!viewport || !shouldScrollToLatest.current) return;
    viewport.scrollTop = viewport.scrollHeight;
    shouldScrollToLatest.current = false;
    setHasNewMessages(false);
  }, [messages, selectedId]);

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

  const leaseFromOther = Boolean(lease && lease.usuarioId !== currentUserId && new Date(lease.expiraEm).getTime() > Date.now());
  const canReplyDirectly = canUseSimulatedReply(conversation);
  const activeLeaseFromOther = leaseFromOther || !canReplyDirectly;
  const conversationIsMine = conversation?.responsavelId === currentUserId;
  const canChangeConversation = Boolean(conversation && (manager || conversationIsMine));
  const isClosed = conversation?.status === "ENCERRADA";
  const effectiveComposerMode: ComposerMode = canReplyDirectly ? composerMode : "note";
  const activeFilterCount = [
    queueScope !== "todas",
    Boolean(statusFilter),
    Boolean(slaFilter),
    Boolean(responsavelId),
    Boolean(channelId),
    Boolean(leadId),
    Boolean(search.trim()),
  ].filter(Boolean).length;
  const selectedChannel = getChannelPresentation(conversation?.canalIntegracao.tipo);

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
    if (!selectedId || !text || sending || isClosed || !canReplyDirectly) return;
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
    } catch (error) {
      setFeedback(error instanceof ApiHttpError && error.status === 409
        ? "Esta conversa acabou de ser assumida por outro atendente."
        : errorMessage(error));
      if (error instanceof ApiHttpError && error.status === 409) await Promise.all([loadDetail(conversation.id), loadList(true)]);
    }
    finally { setBusy(false); }
  }

  async function submitAction() {
    if (!actionModal) return;
    setActionError("");
    if (actionModal.kind === "assign" && !actionValue) { setActionError("Selecione um responsável."); return; }
    setBusy(true);
    try {
      if (actionModal.kind === "assign") await assignCommunicationConversation(actionModal.conversation.id, Number(actionValue), actionReason.trim() || undefined);
      if (actionModal.kind === "queue") await returnCommunicationConversationToQueue(actionModal.conversation.id, actionReason.trim() || undefined);
      if (actionModal.kind === "pending") await markCommunicationConversationPending(actionModal.conversation.id, actionReason.trim() || undefined);
      if (actionModal.kind === "close") await closeCommunicationConversation(actionModal.conversation.id, actionReason.trim() || undefined);
      const id = actionModal.conversation.id;
      const kind = actionModal.kind;
      setActionModal(null);
      setActionValue(""); setActionReason("");
      setFeedback({ assign: "Responsável atualizado.", queue: "Conversa devolvida à fila.", pending: "Conversa marcada como pendente.", close: "Conversa encerrada." }[kind]);
      await Promise.all([loadDetail(id), loadList(true)]);
    } catch (error) {
      setActionError(errorMessage(error));
      if (error instanceof ApiHttpError && error.status === 409) await Promise.all([loadDetail(actionModal.conversation.id), loadList(true)]);
    }
    finally { setBusy(false); }
  }

  async function waitForCustomer() {
    if (!conversation) return;
    setBusy(true);
    try {
      await waitCommunicationConversationForCustomer(conversation.id);
      setFeedback("Conversa aguardando o cliente.");
      await Promise.all([loadDetail(conversation.id), loadList(true)]);
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function reopenConversation() {
    if (!conversation) return;
    setBusy(true);
    try {
      await reopenCommunicationConversation(conversation.id);
      setFeedback("Conversa reaberta.");
      await Promise.all([loadDetail(conversation.id), loadList(true)]);
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function resetFilters() {
    setQueueScope("todas");
    setStatusFilter("");
    setSlaFilter("");
    setResponsavelId("");
    setChannelId("");
    setLeadId("");
    setSearch("");
    setPage(1);
  }

  function selectConversation(id: number) {
    setSelectedId(id);
    setMobileView("conversation");
    if (window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => conversationPanel.current?.focus());
    }
  }

  function returnToConversationList() {
    setMobileView("list");
    window.requestAnimationFrame(() => selectedConversationButton.current?.focus());
  }

  function scrollToLatestMessage() {
    const viewport = messageViewport.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    setHasNewMessages(false);
    if (conversation?.naoLidas) {
      void markCommunicationConversationRead(conversation.id).then(() => {
        setConversation((value) => value ? { ...value, naoLidas: 0 } : value);
        void loadList(true);
      }).catch(() => undefined);
    }
  }

  function closeActionsMenu() {
    if (actionsMenu.current) actionsMenu.current.open = false;
  }

  return (
    <div className="inbox-page space-y-3" data-testid="inbox-page">
      {feedback && <div aria-live="polite" className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">{feedback}</div>}
      <div className="inbox-command-bar flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border-default)] py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Fila multicanal</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Atendimentos inbound de Site, WhatsApp, Instagram e Messenger.</p>
        </div>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs tabular-nums text-[var(--text-muted)]">{list?.pagination.total ?? 0} conversas</span>
          <Button className="inbox-filter-trigger" leftIcon={<Filter size={14} />} onClick={() => setFiltersOpen(true)} size="sm" variant="secondary">
            Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
          <IconButton aria-label="Atualizar conversas" disabled={listRefreshing} onClick={() => void loadList()}>
            <RefreshCw className={listRefreshing ? "animate-spin motion-reduce:animate-none" : ""} size={14} />
          </IconButton>
        </div>
      </div>

      <Surface className="inbox-workspace grid min-h-[520px] overflow-hidden" data-mobile-view={mobileView}>
        <aside className="inbox-filters flex min-h-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-muted)]" aria-label="Filas e filtros">
          <InboxFilters
            channelId={channelId}
            channels={channels}
            leadId={leadId}
            onChannelChange={(value) => { setChannelId(value); setPage(1); }}
            onLeadChange={(value) => { setLeadId(value); setPage(1); }}
            onQueueScopeChange={(value) => { setQueueScope(value); setPage(1); }}
            onReset={resetFilters}
            onResponsibleChange={(value) => { setResponsavelId(value); setPage(1); }}
            onSlaChange={(value) => { setSlaFilter(value); setPage(1); }}
            onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
            queueScope={queueScope}
            responsavelId={responsavelId}
            responsibleOptions={responsibleOptions}
            slaFilter={slaFilter}
            statusFilter={statusFilter}
          />
        </aside>

        <section className="inbox-conversation-list flex min-h-0 flex-col border-r border-[var(--border-default)]" aria-label="Lista de conversas">
          <div className="border-b border-[var(--border-default)] p-3">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--icon-muted)]" size={14} />
              <input aria-label="Buscar conversas" className="h-10 w-full rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] pl-9 pr-3 text-xs outline-none focus:border-[var(--control-border-focus)] focus:ring-2 focus:ring-[var(--control-ring)]" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar contato ou interesse" value={search} />
            </div>
            {activeFilterCount > 0 && <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{activeFilterCount} {activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}</span><button className="font-semibold text-[var(--primary)] hover:underline" onClick={resetFilters} type="button">Limpar</button></div>}
          </div>
          <div aria-busy={listLoading || listRefreshing} className="min-h-0 flex-1 overflow-y-auto">{listLoading ? <LoadingState className="p-3" rows={7} /> : listError ? <ErrorState className="m-3" description={listError} onRetry={() => void loadList()} title="Falha ao carregar conversas" /> : list?.data.length ? list.data.map((item) => <ConversationListItem active={selectedId === item.id} buttonRef={selectedId === item.id ? selectedConversationButton : undefined} currentUserId={currentUserId} item={item} key={item.id} onClick={() => selectConversation(item.id)} />) : <EmptyState className="m-3" description={activeFilterCount ? "Remova ou ajuste os filtros para ampliar a busca." : "Novos atendimentos inbound aparecerão aqui."} icon={<Inbox size={18} />} title={activeFilterCount ? "Nenhuma conversa neste filtro" : "Nenhuma conversa na fila"} />}</div>
          <Pagination
            className="inbox-pagination"
            disabled={listLoading || listRefreshing}
            itemLabel="conversas"
            onPageChange={setPage}
            page={page}
            total={list?.pagination.total ?? 0}
            totalPages={list?.pagination.totalPages ?? 0}
            visibleCount={list?.data.length ?? 0}
          />
        </section>

        <section aria-label="Conversa selecionada" className="inbox-conversation flex min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]" ref={conversationPanel} tabIndex={-1}>
          {!selectedId ? <EmptyState className="m-auto max-w-sm" description="Escolha uma conversa para consultar mensagens, atendimento e contexto comercial." icon={<MessageCircle size={18} />} title="Selecione uma conversa" /> : detailLoading ? <LoadingState className="p-4" rows={6} /> : detailError ? <ErrorState className="m-4" description={detailError} onRetry={() => selectedId && void loadDetail(selectedId)} title="Falha ao abrir a conversa" /> : conversation && <>
            <p aria-live="polite" className="sr-only">Conversa de {conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "contato sem nome"} carregada.</p>
            <header className="shrink-0 border-b border-[var(--border-default)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconButton aria-label="Voltar para a lista de conversas" className="inbox-mobile-back" onClick={returnToConversationList}><ArrowLeft size={16} /></IconButton>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[11px] font-semibold">{initials(conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Contato sem nome"}</h2><CommunicationChannelBadge channel={conversation.canalIntegracao} /><ConversationStatusBadge status={conversation.status} /><ConversationSlaBadge sla={conversation.sla} /></div>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">Responsável: {conversation.responsavelPrincipal?.nome ?? "Fila compartilhada"} · Última atividade: {formatCommunicationTime(conversation.ultimaMensagemEm)}</p>
                  </div>
                </div>
                <div className="inbox-conversation-actions flex flex-wrap items-center justify-end gap-1">
                  {conversation.responsavelId === null && !isClosed && <Button disabled={busy} leftIcon={<UserPlus size={13} />} onClick={() => void assumeConversation()} size="sm">Assumir atendimento</Button>}
                  {!isClosed && (manager || conversationIsMine) && <Button onClick={() => { setActionModal({ kind: "assign", conversation }); setActionValue(String(conversation.responsavelId ?? "")); }} size="sm" variant="secondary">{conversation.responsavelId ? "Transferir" : "Atribuir"}</Button>}
                  <IconButton aria-label="Abrir contexto do Cliente, Lead e histórico" onClick={() => setContextOpen(true)}><PanelRightOpen size={15} /></IconButton>
                  {canChangeConversation && <details className="inbox-actions-menu relative" onKeyDown={(event) => { if (event.key === "Escape") { closeActionsMenu(); actionsMenu.current?.querySelector("summary")?.focus(); } }} ref={actionsMenu}>
                    <summary aria-label="Mais ações da conversa" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><MoreHorizontal aria-hidden="true" size={16} /></summary>
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-md">
                      {conversation.status === "EM_ATENDIMENTO" && <button disabled={busy} onClick={() => { closeActionsMenu(); void waitForCustomer(); }} type="button">Aguardar cliente</button>}
                      {["EM_ATENDIMENTO", "AGUARDANDO_CLIENTE"].includes(conversation.status) && <button onClick={() => { closeActionsMenu(); setActionModal({ kind: "pending", conversation }); }} type="button">Marcar pendente</button>}
                      {!isClosed && conversation.responsavelId !== null && <button onClick={() => { closeActionsMenu(); setActionModal({ kind: "queue", conversation }); }} type="button">Devolver à fila</button>}
                      {!isClosed && <button className="text-[var(--danger)]" onClick={() => { closeActionsMenu(); setActionModal({ kind: "close", conversation }); }} type="button"><CheckCircle2 aria-hidden="true" size={14} />Encerrar conversa</button>}
                      {isClosed && <button disabled={busy} onClick={() => { closeActionsMenu(); void reopenConversation(); }} type="button">Reabrir conversa</button>}
                    </div>
                  </details>}
                </div>
              </div>
            </header>

            {!canReplyDirectly && <div className="inbox-notice inbox-notice-info" role="status"><strong>{selectedChannel.label} inbound.</strong> Respostas por este canal ainda não estão habilitadas.</div>}
            {leaseFromOther && <div className="inbox-notice inbox-notice-warning"><strong>{lease?.nome ?? "Outro usuário"}</strong> está respondendo esta conversa. Reserva até {formatCommunicationTime(lease?.expiraEm)}.</div>}
            {leaseOwned && <div className="inbox-notice inbox-notice-success">Você está preparando uma resposta simulada. Isso não altera o responsável principal.</div>}

            <div className="relative min-h-0 flex-1">
              <div className="h-full overflow-y-auto bg-[var(--bg-muted)] px-4 py-3" ref={messageViewport}>
                {messages.length ? <MessageTimeline currentUserId={currentUserId} messages={messages} /> : <EmptyState description="As mensagens recebidas por este canal aparecerão aqui." icon={<MessageCircle size={18} />} title="Sem mensagens" />}
                {notes.length > 0 && <div className="mt-5 border-t border-[var(--border-default)] pt-3"><p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Notas internas</p><div className="space-y-2">{notes.map((note) => <article className="inbox-note rounded-md border px-3 py-2 text-xs" key={note.id}><p className="whitespace-pre-wrap text-[var(--text-primary)]">{note.conteudo}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{note.autor?.nome ?? "Usuário removido"} · {formatCommunicationDate(note.createdAt)}</p></article>)}</div></div>}
              </div>
              {hasNewMessages && <Button className="inbox-new-messages" onClick={scrollToLatestMessage} size="sm">Novas mensagens</Button>}
            </div>

            <footer className="shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              {canReplyDirectly && <div className="mb-2 flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1" role="group" aria-label="Modo do compositor"><button aria-pressed={composerMode === "reply"} className={`rounded px-3 py-1.5 text-xs font-medium ${composerMode === "reply" ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("reply"); setComposerText(""); setComposerError(""); }} type="button">Resposta simulada</button><button aria-pressed={composerMode === "note"} className={`rounded px-3 py-1.5 text-xs font-medium ${composerMode === "note" ? "bg-[var(--bg-surface)] text-[var(--warning)] shadow-sm" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("note"); setComposerText(""); setComposerError(""); }} type="button">Nota interna</button></div>}
              <Textarea aria-label={effectiveComposerMode === "reply" ? "Resposta simulada" : "Nota interna"} className={effectiveComposerMode === "note" ? "inbox-note-composer" : ""} disabled={(effectiveComposerMode === "reply" && (isClosed || activeLeaseFromOther)) || sending} error={composerError || undefined} helperText={effectiveComposerMode === "reply" ? isClosed ? "Conversa encerrada. O histórico permanece disponível." : "Simulação interna: nenhuma mensagem será enviada ao cliente." : "Nota interna — visível somente para a equipe."} maxLength={4000} onChange={(event) => { setComposerText(event.target.value); if (effectiveComposerMode === "reply" && event.target.value.trim()) void acquireLease(); }} onFocus={() => { if (effectiveComposerMode === "reply") void acquireLease(); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void (effectiveComposerMode === "reply" ? sendReply() : saveNote()); } }} placeholder={effectiveComposerMode === "reply" ? "Registrar resposta simulada..." : "Adicionar nota interna..."} value={composerText} />
              <div className="mt-2 flex justify-end"><Button disabled={sending || !composerText.trim() || (effectiveComposerMode === "reply" && (isClosed || activeLeaseFromOther))} leftIcon={effectiveComposerMode === "reply" ? <Send size={13} /> : <StickyNote size={13} />} onClick={() => void (effectiveComposerMode === "reply" ? sendReply() : saveNote())} size="sm">{sending ? "Salvando..." : effectiveComposerMode === "reply" ? "Registrar simulação" : "Adicionar nota"}</Button></div>
            </footer>
          </>}
        </section>
      </Surface>

      <CommunicationDrawer
        description="Combine escopo, estado, SLA, canal e responsável."
        footer={<div className="flex justify-between gap-2"><Button onClick={resetFilters} size="sm" variant="ghost">Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)} size="sm">Ver resultados</Button></div>}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        title="Filtrar conversas"
      >
        <InboxFilters
          channelId={channelId}
          channels={channels}
          leadId={leadId}
          onChannelChange={(value) => { setChannelId(value); setPage(1); }}
          onLeadChange={(value) => { setLeadId(value); setPage(1); }}
          onQueueScopeChange={(value) => { setQueueScope(value); setPage(1); }}
          onReset={resetFilters}
          onResponsibleChange={(value) => { setResponsavelId(value); setPage(1); }}
          onSlaChange={(value) => { setSlaFilter(value); setPage(1); }}
          onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
          queueScope={queueScope}
          responsavelId={responsavelId}
          responsibleOptions={responsibleOptions}
          showReset={false}
          slaFilter={slaFilter}
          statusFilter={statusFilter}
        />
      </CommunicationDrawer>

      <CommunicationDrawer description="Qualificação comercial, cadastro e histórico deste atendimento." onClose={() => setContextOpen(false)} open={contextOpen && Boolean(conversation)} title="Contexto do atendimento">
        {conversation && <div className="mb-4 border-b border-[var(--border-default)] pb-4"><InboxCommercialPanel conversationId={conversation.id} key={conversation.id} onOpenBusiness={onOpenBusiness} /></div>}
        {conversation && <div className="space-y-4"><section><h3 className="mb-1 text-xs font-semibold">Cliente</h3><dl><DetailRow label="Nome" value={conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Não informado"} /><DetailRow label="Telefone" value={conversation.contatoCanal.cliente?.telefone || "Não informado"} /><DetailRow label="E-mail" value={conversation.contatoCanal.cliente?.email || "Não informado"} /><DetailRow label="Empresa / propriedade" value={conversation.contatoCanal.cliente?.empresa || "Não informado"} /></dl></section><section><h3 className="mb-1 text-xs font-semibold">Lead</h3><dl><DetailRow label="Interesse" value={conversation.lead?.interesse ?? "Não informado"} /><DetailRow label="Origem" value={conversation.lead?.origem ?? "Não informado"} /><DetailRow label="Campanha" value={conversation.lead?.campanha ?? "Não informado"} /><DetailRow label="Página de origem" value={conversation.lead?.paginaOrigem ?? "Não informado"} /><DetailRow label="Responsável" value={conversation.lead?.responsavel?.nome ?? "Sem responsável"} /></dl></section><section><h3 className="mb-1 text-xs font-semibold">Conversa</h3><dl><DetailRow label="Canal" value={channelLabel(conversation.canalIntegracao.tipo, conversation.canalIntegracao.nome)} /><DetailRow label="Estado" value={<ConversationStatusBadge status={conversation.status} />} /><DetailRow label="SLA" value={<ConversationSlaBadge sla={conversation.sla} />} /><DetailRow label="Responsável" value={conversation.responsavelPrincipal?.nome ?? "Fila compartilhada"} /><DetailRow label="Criada em" value={formatCommunicationDate(conversation.createdAt)} /><DetailRow label="Última atividade" value={formatCommunicationDate(conversation.ultimaMensagemEm)} /></dl></section><section><div className="mb-2 flex items-center gap-2"><History size={13} /><h3 className="text-xs font-semibold">Histórico de atendimento</h3></div>{history.length ? <ol className="space-y-2">{history.map((entry) => <li className="rounded-md bg-[var(--bg-muted)] px-3 py-2 text-xs" key={entry.id}><p className="font-medium">{historyLabel(entry.acaoAtendimento ?? entry.tipo, entry.responsavelAnterior?.nome, entry.responsavelNovo?.nome, entry.estadoAnterior, entry.estadoNovo)}</p><p className="mt-0.5 text-[var(--text-muted)]">Por {entry.alteradoPor?.nome ?? "Usuário removido"} · {formatCommunicationDate(entry.createdAt)}</p>{entry.motivo && <p className="mt-1">{entry.motivo}</p>}</li>)}</ol> : <p className="text-xs text-[var(--text-muted)]">Nenhuma ação registrada.</p>}</section></div>}
      </CommunicationDrawer>

      <CommunicationModal description={actionModalDescription(actionModal?.kind)} footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setActionModal(null)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} onClick={() => void submitAction()} size="sm" variant={actionModal?.kind === "close" ? "destructive" : "primary"}>Confirmar</Button></div>} onClose={() => setActionModal(null)} open={Boolean(actionModal)} title={actionModalTitle(actionModal?.kind)}>{actionModal?.kind === "assign" && <Select error={actionError} label="Responsável" onChange={(event) => setActionValue(event.target.value)} value={actionValue}><option value="">Selecione</option>{teamUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select>}{actionModal?.kind !== "assign" && <Textarea error={actionError} label="Observação (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}{actionModal?.kind === "assign" && <Input className="mt-3" label="Observação (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}</CommunicationModal>
    </div>
  );
}

function InboxFilters({
  channelId,
  channels,
  leadId,
  onChannelChange,
  onLeadChange,
  onQueueScopeChange,
  onReset,
  onResponsibleChange,
  onSlaChange,
  onStatusChange,
  queueScope,
  responsavelId,
  responsibleOptions,
  showReset = true,
  slaFilter,
  statusFilter,
}: {
  channelId: string;
  channels: CommunicationConversation["canalIntegracao"][];
  leadId: string;
  onChannelChange: (value: string) => void;
  onLeadChange: (value: string) => void;
  onQueueScopeChange: (value: QueueScope) => void;
  onReset: () => void;
  onResponsibleChange: (value: string) => void;
  onSlaChange: (value: SlaFilter) => void;
  onStatusChange: (value: ConversationStatus | "") => void;
  queueScope: QueueScope;
  responsavelId: string;
  responsibleOptions: LeadsCommunicationUser[];
  showReset?: boolean;
  slaFilter: SlaFilter;
  statusFilter: ConversationStatus | "";
}) {
  return (
    <div className="inbox-filter-content min-h-0 flex-1 overflow-y-auto">
      <section className="border-b border-[var(--border-default)] p-3">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Escopo</h3>
        <div className="mt-2 space-y-1">
          <QueueButton active={queueScope === "todas"} icon={<Inbox size={14} />} label="Todas" onClick={() => onQueueScopeChange("todas")} />
          <QueueButton active={queueScope === "minhas"} icon={<MessageCircle size={14} />} label="Meu atendimento" onClick={() => onQueueScopeChange("minhas")} />
          <QueueButton active={queueScope === "sem-responsavel"} icon={<UserPlus size={14} />} label="Sem responsável" onClick={() => onQueueScopeChange("sem-responsavel")} />
        </div>
      </section>

      <section className="space-y-3 border-b border-[var(--border-default)] p-3">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Atendimento</h3>
        <Select aria-label="Estado da conversa" onChange={(event) => onStatusChange(event.target.value as ConversationStatus | "")} value={statusFilter}>
          <option value="">Todos os estados</option>
          {conversationStates.map((item) => <option key={item} value={item}>{conversationStatusLabels[item]}</option>)}
        </Select>
        <Select aria-label="Responsável" onChange={(event) => onResponsibleChange(event.target.value)} value={responsavelId}>
          <option value="">Todos os responsáveis</option>
          {responsibleOptions.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}
        </Select>
        <Select aria-label="Canal" onChange={(event) => onChannelChange(event.target.value)} value={channelId}>
          <option value="">Todos os canais disponíveis</option>
          {channels.map((channel) => <option key={channel.id} value={channel.id}>{channelLabel(channel.tipo, channel.nome)}{channel.modoTeste ? " · Teste" : ""}</option>)}
        </Select>
      </section>

      <section className="border-b border-[var(--border-default)] p-3">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">SLA</h3>
        <div className="mt-2 space-y-1">
          <QueueButton active={slaFilter === ""} icon={<Clock3 size={14} />} label="Qualquer prazo" onClick={() => onSlaChange("")} />
          <QueueButton active={slaFilter === "ATENCAO"} icon={<Clock3 size={14} />} label="Em atenção" onClick={() => onSlaChange("ATENCAO")} />
          <QueueButton active={slaFilter === "CRITICO"} icon={<AlertTriangle size={14} />} label="Crítico" onClick={() => onSlaChange("CRITICO")} />
        </div>
      </section>

      <section className="space-y-2 p-3">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Referência</h3>
        <Input aria-label="Filtrar por Lead" inputMode="numeric" onChange={(event) => onLeadChange(event.target.value.replace(/\D/g, ""))} placeholder="ID do Lead" value={leadId} />
        {showReset && <Button className="w-full" onClick={onReset} size="sm" variant="ghost">Limpar filtros</Button>}
      </section>
    </div>
  );
}

function QueueButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium transition-colors ${active ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"}`} onClick={onClick} type="button"><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">{icon}</span><span className="truncate">{label}</span></button>;
}

function ConversationListItem({ active, buttonRef, currentUserId, item, onClick }: { active: boolean; buttonRef?: RefObject<HTMLButtonElement | null>; currentUserId: number; item: CommunicationConversation; onClick: () => void }) {
  const otherLease = item.reservaResposta && item.reservaResposta.usuarioId !== currentUserId;
  const name = item.contatoCanal.cliente?.nome ?? item.contatoCanal.nome ?? "Contato sem nome";
  return <button aria-current={active ? "true" : undefined} className={`inbox-conversation-item w-full border-b border-[var(--border-default)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${active ? "is-selected bg-[var(--bg-muted)]" : "bg-[var(--bg-surface)]"}`} onClick={onClick} ref={buttonRef} type="button"><div className="flex items-start gap-2.5"><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-xs font-semibold">{initials(name)}{item.naoLidas > 0 && <span aria-label={`${item.naoLidas} mensagens não lidas`} className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[9px] font-bold text-white">{Math.min(item.naoLidas, 99)}</span>}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={`truncate text-xs text-[var(--text-primary)] ${item.naoLidas > 0 ? "font-bold" : "font-semibold"}`}>{name}</span><span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{formatCommunicationTime(item.ultimaMensagemEm ?? item.updatedAt)}</span></span><span className="mt-1 flex min-w-0 items-center justify-between gap-2"><CommunicationChannelBadge channel={item.canalIntegracao} /><span className={`truncate text-xs ${item.responsavel ? "text-[var(--text-muted)]" : "font-medium text-[var(--warning)]"}`}>{item.responsavel?.nome ?? "Sem responsável"}</span></span><span className="mt-1.5 line-clamp-2 text-xs leading-4 text-[var(--text-secondary)]">{item.ultimaMensagem?.texto ?? "Sem mensagens"}</span><span className="mt-2 flex flex-wrap items-center gap-1.5"><ConversationStatusBadge status={item.status} />{item.sla && <ConversationSlaBadge sla={item.sla} />}{otherLease && <Badge variant="warning">{item.reservaResposta?.nome ?? "Equipe"} respondendo</Badge>}</span></span></div></button>;
}

function MessageTimeline({ currentUserId, messages }: { currentUserId: number; messages: CommunicationMessage[] }) {
  return <div className="space-y-3">{messages.map((message, index) => { const outgoing = message.direcao === "SAIDA"; const mine = message.autor?.id === currentUserId; const previous = messages[index - 1]; const showDate = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString(); return <div key={message.id}>{showDate && <div className="my-3 flex items-center gap-3 text-xs text-[var(--text-muted)]"><span className="h-px flex-1 bg-[var(--border-default)]" /><span>{formatCommunicationDate(message.createdAt, false)}</span><span className="h-px flex-1 bg-[var(--border-default)]" /></div>}<article className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[76%] rounded-lg border px-3 py-2 ${outgoing ? mine ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50" : "border-[var(--border-default)] bg-[var(--bg-surface)]"}`}><p className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-primary)]">{message.texto || "Mensagem sem conteúdo"}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{outgoing ? `Respondido por ${message.autor?.nome ?? "Automação"} às ${formatCommunicationTime(message.createdAt)}` : `Recebida às ${formatCommunicationTime(message.createdAt)}`}{outgoing && message.statusEntrega ? ` · ${deliveryLabel(message.statusEntrega)}` : ""}</p></div></article></div>; })}</div>;
}

function deliveryLabel(status: string) {
  return ({ RECEBIDA: "Recebida", PENDENTE_ENVIO: "Pendente", ENVIADA: "Enviada", ENTREGUE: "Entregue", LIDA: "Lida", FALHOU: "Falhou" } as Record<string, string>)[status] ?? status;
}

function historyLabel(type: string, previous?: string, next?: string, previousState?: ConversationStatus | null, nextState?: ConversationStatus | null) {
  if (type === "ASSUMIR") return `${next ?? "Usuário"} assumiu a conversa`;
  if (type === "DESATRIBUIR" || type === "DEVOLVER_FILA") return `${previous ?? "Responsável"} devolveu à fila`;
  if (type === "TRANSFERIR") return `Transferida de ${previous ?? "Sem responsável"} para ${next ?? "Sem responsável"}`;
  if (type === "AGUARDAR_CLIENTE") return "Marcada como aguardando cliente";
  if (type === "MARCAR_PENDENTE") return "Marcada como pendente";
  if (type === "ENCERRAR") return "Conversa encerrada";
  if (type === "REABRIR") return `Conversa reaberta em ${nextState ? conversationStatusLabels[nextState] : "atendimento"}`;
  if (type === "ALTERAR_ESTADO" && previousState && nextState) return `${conversationStatusLabels[previousState]} → ${conversationStatusLabels[nextState]}`;
  return `Atribuída a ${next ?? "Sem responsável"}`;
}

function actionModalTitle(kind?: NonNullable<ActionModal>["kind"]) {
  return ({ assign: "Atualizar responsável", queue: "Devolver conversa à fila", pending: "Marcar como pendente", close: "Encerrar conversa" } as const)[kind ?? "assign"];
}

function actionModalDescription(kind?: NonNullable<ActionModal>["kind"]) {
  return ({
    assign: "Selecione um usuário ativo da mesma empresa.",
    queue: "A conversa ficará disponível para a fila compartilhada.",
    pending: "Use este estado quando houver uma ação interna ou retorno posterior.",
    close: "O atendimento será encerrado sem apagar mensagens ou histórico.",
  } as const)[kind ?? "assign"];
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `web-${crypto.randomUUID()}`;
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchConversationBundle(id: number) {
  const [detail, messagePage, noteList, historyList] = await Promise.all([
    fetchCommunicationConversation(id),
    fetchLatestCommunicationMessages(id),
    fetchCommunicationNotes(id),
    fetchCommunicationConversationHistory(id),
  ]);
  return { detail, historyList, messagePage, noteList };
}

async function fetchLatestCommunicationMessages(id: number) {
  const firstPage = await fetchCommunicationMessages(id, { page: 1, limit: 100 });
  if (firstPage.pagination.totalPages <= 1) return firstPage;

  const lastPageNumber = firstPage.pagination.totalPages;
  const lastPage = await fetchCommunicationMessages(id, { page: lastPageNumber, limit: 100 });
  if (lastPage.data.length >= 100 || lastPageNumber === 1) return lastPage;

  const previousPage = await fetchCommunicationMessages(id, { page: lastPageNumber - 1, limit: 100 });
  return {
    ...lastPage,
    data: [...previousPage.data, ...lastPage.data].slice(-100),
  };
}

function isNearMessageEnd(viewport: HTMLDivElement | null) {
  if (!viewport) return true;
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 72;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
