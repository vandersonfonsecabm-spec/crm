/* eslint-disable react-hooks/set-state-in-effect -- URL/deep-link and polling effects synchronize external inbox state. */
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Clock3, Filter, History, Inbox, MessageCircle, MoreHorizontal, PanelRightOpen, Paperclip, RefreshCw, Search, Send, StickyNote, UserPlus } from "lucide-react";
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
  snoozeCommunicationConversation,
  waitCommunicationConversationForCustomer,
} from "../../services/crmApi";
import { Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Pagination, Select, Surface, Textarea } from "../ui";
import { CommunicationChannelBadge } from "./CommunicationChannelBadge";
import { canUseSimulatedReply, getChannelPresentation } from "./communicationChannels";
import { CommunicationDrawer, CommunicationModal } from "./CommunicationOverlay";
import { ConversationSlaBadge, ConversationStatusBadge, DetailRow } from "./communicationPresentation";
import { channelLabel, conversationStatusLabels, formatCommunicationDate, formatCommunicationDateTime, formatCommunicationDayLabel, formatCommunicationTime, initials } from "./communicationFormatters";
import InboxCommercialPanel from "./InboxCommercialPanel";
import CommerceInboxAssistantPanel from "../ai-commerce/CommerceInboxAssistantPanel";
import "./LeadsCommunication.css";

type InboxPanelProps = {
  authSession: AuthSession;
  initialConversationId?: number | null;
  onInitialConversationHandled?: () => void;
  onOpenBusiness: (businessId: number) => void;
};

type QueueScope = "aguardando" | "todas" | "minhas" | "sem-responsavel" | "prioridade" | "lembrar-depois";
type SlaFilter = "" | "ATENCAO" | "CRITICO";
type MobileView = "list" | "conversation";
type ActionModal = { kind: "assign" | "queue" | "pending" | "snooze" | "close"; conversation: CommunicationConversation } | null;
type ComposerMode = "reply" | "note";

const conversationStates: ConversationStatus[] = ["NOVA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "PENDENTE", "ENCERRADA"];

export default function DashboardInboxPanel({ authSession, initialConversationId, onInitialConversationHandled, onOpenBusiness }: InboxPanelProps) {
  const [queueScope, setQueueScope] = useState<QueueScope>("aguardando");
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
  const [snoozeDateTime, setSnoozeDateTime] = useState(() => defaultSnoozeDateTime());
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [teamUsers, setTeamUsers] = useState<LeadsCommunicationUser[]>([]);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const syncedInitialConversationId = useRef<number | null | undefined>(undefined);
  const hasList = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const messageViewport = useRef<HTMLDivElement>(null);
  const conversationPanel = useRef<HTMLElement>(null);
  const conversationHeadingRef = useRef<HTMLHeadingElement>(null);
  const inboxHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedConversationButton = useRef<HTMLButtonElement>(null);
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const actionModalTriggerRef = useRef<HTMLElement>(null);
  const shouldScrollToLatest = useRef(true);
  const lastMessageId = useRef<number | null>(null);
  const manager = ["ADMIN", "GERENTE"].includes(authSession.papel ?? authSession.usuario.papel ?? "");
  const currentUserId = authSession.usuario.id ?? 0;
  const compactInboxContext = useCompactInboxContext();

  useEffect(() => {
    let active = true;
    fetchCommunicationTeamUsers().then((response) => { if (active) setTeamUsers(response.data.filter((user) => user.ativo !== false)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const listQuery = useMemo(() => ({
    page,
    limit: queueScope === "aguardando" || queueScope === "prioridade" ? 100 : 20,
    ...(queueScope === "aguardando" ? { fila: "AGUARDANDO_RESPOSTA" as const } : {}),
    ...(queueScope === "prioridade" ? { fila: "PRIORIDADE" as const } : {}),
    ...(queueScope === "lembrar-depois" ? { fila: "LEMBRAR_DEPOIS" as const } : {}),
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
      const lastAvailablePage = Math.max(1, response.pagination.totalPages);
      if (listQuery.page > lastAvailablePage) {
        setPage(lastAvailablePage);
        return;
      }
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
        const lastAvailablePage = Math.max(1, response.pagination.totalPages);
        if (listQuery.page > lastAvailablePage) {
          setPage(lastAvailablePage);
          return;
        }
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

  // The dashboard can receive a new conversation target after this panel has
  // already mounted (for example, a notification clicked while Inbox is open).
  // Keep the local selection synchronized with that durable route intent.
  useEffect(() => {
    if (syncedInitialConversationId.current === initialConversationId) return;
    syncedInitialConversationId.current = initialConversationId;
    if (!initialConversationId) return;
    setComposerText("");
    setComposerError("");
    idempotencyKey.current = null;
    setLease(null);
    setLeaseOwned(false);
    setSelectedId(initialConversationId);
    setMobileView("conversation");
    onInitialConversationHandled?.();
  }, [initialConversationId, onInitialConversationHandled]);

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
  // Assignment is visible but collaborative replies remain supported by the
  // backend; only an active reply lease from another operator blocks sending.
  const activeLeaseFromOther = leaseFromOther || !canReplyDirectly;
  const conversationIsMine = conversation?.responsavelId === currentUserId;
  const canChangeConversation = Boolean(conversation && (manager || conversationIsMine));
  const isClosed = conversation?.status === "ENCERRADA";
  const effectiveComposerMode: ComposerMode = canReplyDirectly ? composerMode : "note";
  const activeFilterCount = [
    Boolean(statusFilter),
    Boolean(slaFilter),
    Boolean(responsavelId),
    Boolean(channelId),
    Boolean(leadId),
    Boolean(search.trim()),
  ].filter(Boolean).length;
  const selectedChannel = getChannelPresentation(conversation?.canalIntegracao.tipo);
  const latestInboundMessage = useMemo(() => [...messages].reverse().find((message) => message.direcao === "ENTRADA") ?? null, [messages]);
  const hasInlineContext = Boolean(conversation && !compactInboxContext);
  const hasContextDrawer = Boolean(conversation && compactInboxContext && contextOpen);
  const selectedSlaException = isSlaException(conversation?.sla ?? null);

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

  async function sendReply(sendNext = false) {
    const text = composerText.trim();
    if (!selectedId || !text || sending || isClosed || !canReplyDirectly) return;
    if (activeLeaseFromOther) return;
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
      if (sendNext && queueScope === "aguardando") {
        try {
          const next = await fetchCommunicationConversations({ ...listQuery, page: 1, limit: 100, fila: "AGUARDANDO_RESPOSTA" });
          const nextConversation = next.data.find((item) => item.id !== selectedId);
          if (nextConversation) {
            selectConversation(nextConversation.id);
            focusConversationHeading();
            setFeedback("Resposta registrada. Próxima pendência aberta.");
          } else {
            setSelectedId(null);
            setConversation(null);
            setMobileView("list");
            focusInboxHeading();
            setFeedback("Resposta registrada. Não há outra pendência nesta fila.");
          }
        } catch (error) {
          focusInboxHeading();
          setFeedback(`Resposta registrada. ${errorMessage(error)}`);
        }
        await loadList(true);
      } else {
        await Promise.all([loadDetail(selectedId), loadList(true)]);
      }
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
      focusConversationHeading();
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
      if (actionModal.kind === "snooze") {
        if (!snoozeDateTime) { setActionError("Escolha quando lembrar desta conversa."); setBusy(false); return; }
        const parsed = new Date(snoozeDateTime);
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) { setActionError("Escolha um horário futuro."); setBusy(false); return; }
        await snoozeCommunicationConversation(actionModal.conversation.id, parsed.toISOString(), actionReason.trim() || undefined);
      }
      if (actionModal.kind === "close") await closeCommunicationConversation(actionModal.conversation.id, actionReason.trim() || undefined);
      const id = actionModal.conversation.id;
      const kind = actionModal.kind;
      setActionModal(null);
      setActionValue(""); setActionReason("");
      setFeedback({ assign: "Responsável atualizado.", queue: "Conversa devolvida à fila.", pending: "Conversa marcada como pendente.", snooze: "Conversa adiada; ela voltará à fila no horário escolhido.", close: "Conversa encerrada." }[kind]);
      await Promise.all([loadDetail(id), loadList(true)]);
      focusConversationHeading();
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

  async function openNextPending() {
    if (queueScope !== "aguardando" || busy || sending) return;
    if (composerText.trim()) {
      setFeedback("Envie ou descarte a resposta em edição antes de abrir a próxima pendência.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetchCommunicationConversations({ ...listQuery, page: 1, limit: 100, fila: "AGUARDANDO_RESPOSTA" });
      const next = response.data.find((item) => item.id !== selectedId);
      if (next) {
        selectConversation(next.id);
        focusConversationHeading();
        setFeedback("Próxima pendência aberta.");
      } else {
        setFeedback("Não há outra conversa aguardando resposta.");
        focusInboxHeading();
      }
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function resetSecondaryFilters() {
    setStatusFilter("");
    setSlaFilter("");
    setResponsavelId("");
    setChannelId("");
    setLeadId("");
    setSearch("");
    setPage(1);
  }

  function selectConversation(id: number) {
    if (id !== selectedId) {
      setComposerText("");
      setComposerError("");
      idempotencyKey.current = null;
      setLease(null);
      setLeaseOwned(false);
    }
    setSelectedId(id);
    setMobileView("conversation");
    if (window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => conversationPanel.current?.focus());
    }
  }

  function returnToConversationList() {
    setMobileView("list");
    window.requestAnimationFrame(() => (selectedConversationButton.current ?? inboxHeadingRef.current)?.focus({ preventScroll: true }));
  }

  function scrollToLatestMessage() {
    const viewport = messageViewport.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    setHasNewMessages(false);
    window.requestAnimationFrame(() => viewport.focus({ preventScroll: true }));
    if (conversation?.naoLidas) {
      void markCommunicationConversationRead(conversation.id).then(() => {
        setConversation((value) => value ? { ...value, naoLidas: 0 } : value);
        void loadList(true);
      }).catch(() => undefined);
    }
  }

  function closeActionsMenu() {
    if (actionsMenu.current) actionsMenu.current.open = false;
    actionModalTriggerRef.current?.focus({ preventScroll: true });
  }

  function focusConversationHeading() {
    window.requestAnimationFrame(() => (conversationHeadingRef.current ?? conversationPanel.current)?.focus({ preventScroll: true }));
  }

  function focusInboxHeading() {
    window.requestAnimationFrame(() => inboxHeadingRef.current?.focus({ preventScroll: true }));
  }

  return (
    <div className="inbox-page" data-testid="inbox-page">
      {feedback && <div aria-live="polite" className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">{feedback}</div>}
      <InboxQueueToolbar
        activeFilterCount={activeFilterCount}
        filtersTriggerRef={filtersTriggerRef}
        filtersOpen={filtersOpen}
        headingRef={inboxHeadingRef}
        onOpenFilters={() => setFiltersOpen(true)}
        onQueueScopeChange={(value) => { setQueueScope(value); setPage(1); }}
        onRefresh={() => void loadList()}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        refreshing={listRefreshing}
        queueScope={queueScope}
        search={search}
        total={list?.pagination.total ?? 0}
      />

      <Surface className={`inbox-workspace ${hasInlineContext ? "has-context" : "without-context"} grid min-h-[520px] overflow-hidden`} data-mobile-view={mobileView}>
        <aside className="inbox-filters flex min-h-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-muted)]" aria-label="Filas e filtros">
          <InboxFilters
            channelId={channelId}
            channels={channels}
            leadId={leadId}
            onChannelChange={(value) => { setChannelId(value); setPage(1); }}
            onLeadChange={(value) => { setLeadId(value); setPage(1); }}
            onReset={resetSecondaryFilters}
            onResponsibleChange={(value) => { setResponsavelId(value); setPage(1); }}
            onSlaChange={(value) => { setSlaFilter(value); setPage(1); }}
            onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
            responsavelId={responsavelId}
            responsibleOptions={responsibleOptions}
            slaFilter={slaFilter}
            statusFilter={statusFilter}
          />
        </aside>

        <section className="inbox-conversation-list flex min-h-0 flex-col border-r border-[var(--border-default)]" aria-label="Lista de conversas">
          {activeFilterCount > 0 && <div className="inbox-list-filter-summary flex items-center justify-between gap-2 border-b border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-muted)]"><span>Filtros ativos · {activeFilterCount}</span><button className="font-semibold text-[var(--primary)] hover:underline" onClick={resetSecondaryFilters} type="button">Limpar</button></div>}
          <div aria-busy={listLoading || listRefreshing} className="inbox-list-scroll min-h-0 flex-1 overflow-y-auto">{listLoading ? <LoadingState className="p-3" rows={7} /> : listError ? <ErrorState className="m-3" description={listError} onRetry={() => void loadList()} title="Falha ao carregar conversas" /> : list?.data.length ? list.data.map((item) => <ConversationListItem active={selectedId === item.id} buttonRef={selectedId === item.id ? selectedConversationButton : undefined} currentUserId={currentUserId} item={item} key={item.id} onClick={() => selectConversation(item.id)} queueScope={queueScope} />) : <EmptyState className="m-3" description={activeFilterCount ? "Remova ou ajuste os filtros para ampliar a busca." : queueEmptyCopy(queueScope).description} icon={<Inbox size={18} />} title={activeFilterCount ? "Nenhuma conversa neste filtro" : queueEmptyCopy(queueScope).title} />}</div>
          {Boolean(list?.pagination.total) && <Pagination
            className="inbox-pagination"
            disabled={listLoading || listRefreshing}
            itemLabel="conversas"
            nextLabel="Próxima página"
            onPageChange={setPage}
            page={page}
            previousLabel="Página anterior"
            total={list?.pagination.total ?? 0}
            totalPages={list?.pagination.totalPages ?? 0}
            visibleCount={list?.data.length ?? 0}
          />}
        </section>

        <section aria-label="Conversa selecionada" className="inbox-conversation flex min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]" ref={conversationPanel} tabIndex={-1}>
          {!selectedId ? <EmptyState className="m-auto max-w-sm" description="Escolha uma conversa para consultar mensagens, atendimento e contexto comercial." icon={<MessageCircle size={18} />} title="Selecione uma conversa" /> : detailLoading ? <LoadingState className="p-4" rows={6} /> : detailError ? <ErrorState className="m-4" description={detailError} onRetry={() => selectedId && void loadDetail(selectedId)} title="Falha ao abrir a conversa" /> : conversation && <>
            <p aria-live="polite" className="sr-only">Conversa de {conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "contato sem nome"} carregada.</p>
            <header className="inbox-conversation-header shrink-0 border-b border-[var(--border-default)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconButton aria-label="Voltar para a lista de conversas" className="inbox-mobile-back" onClick={returnToConversationList}><ArrowLeft size={16} /></IconButton>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[11px] font-semibold">{initials(conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2" data-sla-exception={selectedSlaException ? "true" : "false"}><h2 className="truncate text-sm font-semibold text-[var(--text-primary)]" ref={conversationHeadingRef} tabIndex={-1}>{conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Contato sem nome"}</h2><CommunicationChannelBadge channel={conversation.canalIntegracao} /><ConversationStatusBadge status={conversation.status} />{selectedSlaException && <ConversationSlaBadge sla={conversation.sla} />}</div>
                    {conversation.canalIntegracao.tipo === "EMAIL" && conversation.emailSubject && <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]">{conversation.emailSubject}</p>}
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">Responsável: {conversation.responsavelPrincipal?.nome ?? "Fila compartilhada"} · Última atividade: <time dateTime={validTimestamp(conversation.ultimaMensagemEm) ?? undefined} aria-label={`Última atividade: ${formatCommunicationDateTime(conversation.ultimaMensagemEm)}`}>{formatCommunicationTime(conversation.ultimaMensagemEm) || "—"}</time></p>
                  </div>
                </div>
                <div className="inbox-conversation-actions flex flex-wrap items-center justify-end gap-1">
                  {conversation.responsavelId === null && !isClosed && <Button disabled={busy} leftIcon={<UserPlus size={13} />} onClick={() => void assumeConversation()} size="sm">Assumir atendimento</Button>}
                  {queueScope === "aguardando" && <Button aria-label="Abrir próxima pendência" disabled={busy || sending} leftIcon={<ArrowRight size={13} />} onClick={() => void openNextPending()} size="sm" variant="secondary">Próxima</Button>}
                  {compactInboxContext && <IconButton aria-controls={hasContextDrawer ? "inbox-conversation-context" : undefined} aria-expanded={hasContextDrawer} aria-label={hasContextDrawer ? "Ocultar contexto do Cliente, Lead e histórico" : "Abrir contexto do Cliente, Lead e histórico"} onClick={() => setContextOpen((open) => !open)} ref={contextTriggerRef}><PanelRightOpen size={15} /></IconButton>}
                  {canChangeConversation && <details className="inbox-actions-menu relative" onKeyDown={(event) => { if (event.key === "Escape") { closeActionsMenu(); actionsMenu.current?.querySelector("summary")?.focus(); } }} ref={actionsMenu}>
                    <summary aria-label="Mais ações da conversa" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" ref={actionModalTriggerRef}><MoreHorizontal aria-hidden="true" size={16} /></summary>
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-md">
                      {!isClosed && (manager || conversationIsMine) && <button disabled={busy} onClick={() => { closeActionsMenu(); setActionModal({ kind: "assign", conversation }); setActionValue(String(conversation.responsavelId ?? "")); }} type="button">{conversation.responsavelId ? "Transferir" : "Atribuir"}</button>}
                      {conversation.status === "EM_ATENDIMENTO" && <button disabled={busy} onClick={() => { closeActionsMenu(); void waitForCustomer(); }} type="button">Aguardar cliente</button>}
                      {["EM_ATENDIMENTO", "AGUARDANDO_CLIENTE"].includes(conversation.status) && <button disabled={busy} onClick={() => { closeActionsMenu(); setActionModal({ kind: "pending", conversation }); }} type="button">Pendente sem prazo</button>}
                      {!isClosed && <button disabled={busy} onClick={() => { closeActionsMenu(); setSnoozeDateTime(defaultSnoozeDateTime()); setActionModal({ kind: "snooze", conversation }); }} type="button"><CalendarClock aria-hidden="true" size={14} />Agendar lembrete</button>}
                      {!isClosed && conversation.responsavelId !== null && <button disabled={busy} onClick={() => { closeActionsMenu(); setActionModal({ kind: "queue", conversation }); }} type="button">Devolver à fila</button>}
                      {!isClosed && <button disabled={busy} className="text-[var(--danger)]" onClick={() => { closeActionsMenu(); setActionModal({ kind: "close", conversation }); }} type="button"><CheckCircle2 aria-hidden="true" size={14} />Encerrar conversa</button>}
                      {(isClosed || conversation.status === "PENDENTE") && <button disabled={busy} onClick={() => { closeActionsMenu(); void reopenConversation(); }} type="button">Reabrir conversa</button>}
                    </div>
                  </details>}
                </div>
              </div>
            </header>

            {!canReplyDirectly && <div className="inbox-notice inbox-notice-info" role="status"><strong>{selectedChannel.label} inbound.</strong> {conversation.canalIntegracao.tipo === "EMAIL" ? "Respostas por e-mail ainda não estão habilitadas." : "Respostas por este canal ainda não estão habilitadas."}</div>}
            {leaseFromOther && <div className="inbox-notice inbox-notice-warning"><strong>{lease?.nome ?? "Outro usuário"}</strong> está respondendo esta conversa. Reserva até {formatCommunicationTime(lease?.expiraEm)}.</div>}
            {leaseOwned && <div className="inbox-notice inbox-notice-success">Você está preparando uma resposta simulada. Isso não altera o responsável principal.</div>}

            <div className="relative min-h-0 flex-1">
              <div aria-label="Histórico de mensagens" className="inbox-message-viewport h-full overflow-y-auto bg-[var(--bg-muted)] px-4 py-3" ref={messageViewport} tabIndex={-1}>
                {messages.length ? <MessageTimeline currentUserId={currentUserId} messages={messages} /> : <EmptyState description="As mensagens recebidas por este canal aparecerão aqui." icon={<MessageCircle size={18} />} title="Sem mensagens" />}
                {notes.length > 0 && <div className="mt-5 border-t border-[var(--border-default)] pt-3"><p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Notas internas</p><div className="space-y-2">{notes.map((note) => <article className="inbox-note rounded-md border px-3 py-2 text-xs" key={note.id}><p className="whitespace-pre-wrap text-[var(--text-primary)]">{note.conteudo}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{note.autor?.nome ?? "Usuário removido"} · <time dateTime={validTimestamp(note.createdAt) ?? undefined} aria-label={`Nota de ${note.autor?.nome ?? "usuário removido"} em ${formatCommunicationDateTime(note.createdAt)}`}>{formatCommunicationTime(note.createdAt) || "—"}</time></p></article>)}</div></div>}
              </div>
              {hasNewMessages && <div aria-live="polite" className="inbox-new-messages" role="status"><Button onClick={scrollToLatestMessage} size="sm">Novas mensagens disponíveis</Button></div>}
            </div>

            <footer className="inbox-composer shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              {canReplyDirectly && <div className="mb-2 flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1" role="group" aria-label="Modo do compositor"><button aria-pressed={composerMode === "reply"} className={`rounded px-3 py-1.5 text-xs font-medium ${composerMode === "reply" ? "bg-[var(--bg-surface)] text-[var(--primary)]" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("reply"); setComposerText(""); setComposerError(""); }} type="button">Resposta simulada</button><button aria-pressed={composerMode === "note"} className={`rounded px-3 py-1.5 text-xs font-medium ${composerMode === "note" ? "bg-[var(--bg-surface)] text-[var(--warning)]" : "text-[var(--text-secondary)]"}`} onClick={() => { setComposerMode("note"); setComposerText(""); setComposerError(""); }} type="button">Nota interna</button></div>}
              <Textarea aria-label={effectiveComposerMode === "reply" ? "Resposta simulada" : "Nota interna"} className={effectiveComposerMode === "note" ? "inbox-note-composer" : ""} disabled={(effectiveComposerMode === "reply" && (isClosed || activeLeaseFromOther)) || sending} error={composerError || undefined} helperText={effectiveComposerMode === "reply" ? isClosed ? "Conversa encerrada. O histórico permanece disponível." : "Simulação interna: nenhuma mensagem será enviada ao cliente." : "Nota interna — visível somente para a equipe."} maxLength={4000} onChange={(event) => { setComposerText(event.target.value); if (effectiveComposerMode === "reply" && event.target.value.trim()) void acquireLease(); }} onFocus={() => { if (effectiveComposerMode === "reply") void acquireLease(); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void (effectiveComposerMode === "reply" ? sendReply() : saveNote()); } }} placeholder={effectiveComposerMode === "reply" ? "Registrar resposta simulada..." : "Adicionar nota interna..."} value={composerText} />
              <div className="mt-2 flex flex-wrap justify-end gap-2"><Button disabled={sending || !composerText.trim() || (effectiveComposerMode === "reply" && (isClosed || activeLeaseFromOther))} leftIcon={effectiveComposerMode === "reply" ? <Send size={13} /> : <StickyNote size={13} />} onClick={() => void (effectiveComposerMode === "reply" ? sendReply() : saveNote())} size="sm">{sending ? "Salvando..." : effectiveComposerMode === "reply" ? "Registrar simulação" : "Adicionar nota"}</Button>{effectiveComposerMode === "reply" && queueScope === "aguardando" && <Button disabled={sending || !composerText.trim() || isClosed || activeLeaseFromOther} leftIcon={<ArrowRight size={13} />} onClick={() => void sendReply(true)} size="sm" variant="secondary">Enviar e próxima</Button>}</div>
            </footer>
          </>}
        </section>
        {hasInlineContext && conversation && <aside aria-label="Contexto comercial" className="inbox-context-pane" id="inbox-conversation-context"><InboxContextContent conversation={conversation} history={history} latestInboundMessage={latestInboundMessage} onInsertComposer={setComposerText} onOpenBusiness={onOpenBusiness} /></aside>}
      </Surface>

      <CommunicationDrawer
        description="Refine por estado, SLA, canal, responsável ou Lead."
        footer={<div className="flex justify-between gap-2"><Button onClick={resetSecondaryFilters} size="sm" variant="ghost">Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)} size="sm">Ver resultados</Button></div>}
        id="inbox-filters-drawer"
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        title="Filtrar conversas"
        triggerRef={filtersTriggerRef}
      >
        <InboxFilters
          channelId={channelId}
          channels={channels}
          leadId={leadId}
          onChannelChange={(value) => { setChannelId(value); setPage(1); }}
          onLeadChange={(value) => { setLeadId(value); setPage(1); }}
          onReset={resetSecondaryFilters}
          onResponsibleChange={(value) => { setResponsavelId(value); setPage(1); }}
          onSlaChange={(value) => { setSlaFilter(value); setPage(1); }}
          onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
          responsavelId={responsavelId}
          responsibleOptions={responsibleOptions}
          showReset={false}
          slaFilter={slaFilter}
          statusFilter={statusFilter}
        />
      </CommunicationDrawer>

      <CommunicationDrawer description="Dados e histórico da conversa selecionada." id="inbox-conversation-context" onClose={() => setContextOpen(false)} open={hasContextDrawer} title="Contexto do atendimento" triggerRef={contextTriggerRef}>
        {conversation && <InboxContextContent conversation={conversation} history={history} latestInboundMessage={latestInboundMessage} onInsertComposer={setComposerText} onOpenBusiness={onOpenBusiness} />}
      </CommunicationDrawer>

      <CommunicationModal description={actionModalDescription(actionModal?.kind)} footer={<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setActionModal(null)} size="sm" variant="ghost">Cancelar</Button><Button disabled={busy} onClick={() => void submitAction()} size="sm" variant={actionModal?.kind === "close" ? "destructive" : "primary"}>Confirmar</Button></div>} onClose={() => setActionModal(null)} open={Boolean(actionModal)} title={actionModalTitle(actionModal?.kind)} triggerRef={actionModalTriggerRef}>
        {actionError && <p aria-live="assertive" className="mb-3 rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]" role="alert">{actionError}</p>}
        {actionModal?.kind === "assign" && <Select error={actionError} label="Responsável" onChange={(event) => setActionValue(event.target.value)} value={actionValue}><option value="">Selecione</option>{teamUsers.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</Select>}
        {actionModal?.kind === "snooze" && <Input error={actionError} helperText="O horário é salvo no servidor e a conversa volta à fila quando vencer." label="Lembrar em" onChange={(event) => { setSnoozeDateTime(event.target.value); setActionError(""); }} type="datetime-local" value={snoozeDateTime} />}
        {actionModal?.kind !== "assign" && <Textarea error={actionModal?.kind === "snooze" ? undefined : actionError} label="Observação (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}
        {actionModal?.kind === "assign" && <Input className="mt-3" label="Observação (opcional)" maxLength={240} onChange={(event) => setActionReason(event.target.value)} value={actionReason} />}
      </CommunicationModal>
    </div>
  );
}

type InboxQueueToolbarProps = {
  activeFilterCount: number;
  filtersTriggerRef: RefObject<HTMLButtonElement | null>;
  filtersOpen: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onOpenFilters: () => void;
  onQueueScopeChange: (value: QueueScope) => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  queueScope: QueueScope;
  refreshing: boolean;
  search: string;
  total: number;
};

export function InboxQueueToolbar({ activeFilterCount, filtersOpen, filtersTriggerRef, headingRef, onOpenFilters, onQueueScopeChange, onRefresh, onSearchChange, queueScope, refreshing, search, total }: InboxQueueToolbarProps) {
  return (
    <div className="inbox-command-bar" role="search">
      <div className="inbox-command-leading">
        <h1 className="inbox-command-title" ref={headingRef} tabIndex={-1}>Caixa de entrada</h1>
        <span aria-live="polite" className="sr-only">{total === 0 ? `Nenhuma conversa em ${queueLabel(queueScope)}.` : `${total} ${total === 1 ? "conversa" : "conversas"} em ${queueLabel(queueScope)}.`}</span>
        <Select aria-label="Fila da caixa de entrada" className="inbox-queue-select" data-testid="inbox-queue-selector" onChange={(event) => onQueueScopeChange(event.target.value as QueueScope)} value={queueScope}>
          <optgroup label="Filas principais">
            <option value="aguardando">{queueOptionLabel("aguardando", queueScope, total)}</option>
            <option value="minhas">Minhas</option>
            <option value="sem-responsavel">Não atribuídas</option>
            <option value="todas">Todas</option>
          </optgroup>
          <optgroup label="Outras filas">
            <option value="lembrar-depois">Lembrar depois</option>
            <option value="prioridade">Prioridade / SLA</option>
          </optgroup>
        </Select>
      </div>
      <div className="inbox-command-search">
        <Search aria-hidden="true" className="inbox-command-search-icon" size={15} />
        <Input aria-label="Buscar conversas" className="pl-9" onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar contato ou interesse" value={search} />
      </div>
      <div className="inbox-command-actions">
        <Button aria-controls={filtersOpen ? "inbox-filters-drawer" : undefined} aria-expanded={filtersOpen} className="inbox-filter-trigger" leftIcon={<Filter size={14} />} onClick={onOpenFilters} ref={filtersTriggerRef} size="md" variant="secondary">
          Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </Button>
        <IconButton aria-label="Atualizar conversas" disabled={refreshing} onClick={onRefresh} size="md">
          <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function InboxContextContent({ conversation, history, latestInboundMessage = null, onInsertComposer, onOpenBusiness, showCommercialPanel = true }: { conversation: CommunicationConversation; history: Awaited<ReturnType<typeof fetchCommunicationConversationHistory>>; latestInboundMessage?: Pick<CommunicationMessage, "id" | "texto"> | null; onInsertComposer?: (text: string) => void; onOpenBusiness: (businessId: number) => void; showCommercialPanel?: boolean }) {
  return (
    <div className="inbox-context-content">
      <section className="inbox-context-profile">
        <h3>Identidade</h3>
        <dl><DetailRow label="Nome" value={conversation.contatoCanal.cliente?.nome ?? conversation.contatoCanal.nome ?? "Não informado"} /><DetailRow label="Empresa" value={conversation.contatoCanal.cliente?.empresa || "Não informado"} /><DetailRow label="Telefone" value={conversation.contatoCanal.cliente?.telefone || "Não informado"} /><DetailRow label="E-mail" value={conversation.contatoCanal.cliente?.email || "Não informado"} /><DetailRow label="Interesse" value={conversation.lead?.interesse ?? "Não informado"} /></dl>
      </section>
      <details className="inbox-context-disclosure">
        <summary>Origem</summary>
        <dl><DetailRow label="Origem" value={conversation.lead?.origem ?? "Não informado"} /><DetailRow label="Campanha" value={conversation.lead?.campanha ?? "Não informado"} /><DetailRow label="Página de origem" value={conversation.lead?.paginaOrigem ?? "Não informado"} /><DetailRow label="Responsável do lead" value={conversation.lead?.responsavel?.nome ?? "Sem responsável"} /></dl>
      </details>
      <details className="inbox-context-disclosure">
        <summary>Atendimento</summary>
        <dl><DetailRow label="Canal" value={channelLabel(conversation.canalIntegracao.tipo, conversation.canalIntegracao.nome)} /><DetailRow label="Estado" value={<ConversationStatusBadge status={conversation.status} />} /><DetailRow label="SLA" value={<ConversationSlaBadge sla={conversation.sla} />} /><DetailRow label="Responsável" value={conversation.responsavelPrincipal?.nome ?? "Fila compartilhada"} /><DetailRow label="Criada em" value={<AccessibleCommunicationDate label="Criada em" value={conversation.createdAt} />} /><DetailRow label="Última atividade" value={<AccessibleCommunicationDate label="Última atividade" value={conversation.ultimaMensagemEm} />} />{conversation.lembrarDepoisEm && <DetailRow label="Lembrar depois" value={<AccessibleCommunicationDate label="Lembrar depois" value={conversation.lembrarDepoisEm} />} />}</dl>
      </details>
      {showCommercialPanel && <details className="inbox-context-disclosure"><summary>Comercial</summary><div className="inbox-context-commercial"><InboxCommercialPanel conversationId={conversation.id} key={conversation.id} onOpenBusiness={onOpenBusiness} /><CommerceInboxAssistantPanel conversationId={conversation.id} conversationRevision={latestInboundMessage?.id ?? null} latestMessage={latestInboundMessage?.texto ?? null} messageRevision={latestInboundMessage?.id ?? null} onInsertComposer={onInsertComposer} sourceMessageId={latestInboundMessage?.id ?? null} /></div></details>}
      <section className="inbox-context-section inbox-context-history">
        <div className="mb-2 flex items-center gap-2"><History size={13} /><h4>Histórico de atendimento</h4></div>
        {history.length ? <ol className="space-y-2">{history.map((entry) => <li className="inbox-context-history-item" key={entry.id}><p className="font-medium">{historyLabel(entry.acaoAtendimento ?? entry.tipo, entry.responsavelAnterior?.nome, entry.responsavelNovo?.nome, entry.estadoAnterior, entry.estadoNovo)}</p><p className="mt-0.5 text-[var(--text-muted)]">Por {entry.alteradoPor?.nome ?? "Usuário removido"} · <AccessibleCommunicationDate label="Histórico" value={entry.createdAt} /></p>{entry.motivo && <p className="mt-1">{entry.motivo}</p>}</li>)}</ol> : <p className="text-xs text-[var(--text-muted)]">Nenhuma ação registrada.</p>}
      </section>
    </div>
  );
}

function AccessibleCommunicationDate({ label, value }: { label: string; value?: string | null }) {
  const timestamp = validTimestamp(value);
  return <time dateTime={timestamp ?? undefined} aria-label={`${label}: ${formatCommunicationDateTime(value)}`}>{formatCommunicationDate(value)}</time>;
}

function InboxFilters({
  channelId,
  channels,
  leadId,
  onChannelChange,
  onLeadChange,
  onReset,
  onResponsibleChange,
  onSlaChange,
  onStatusChange,
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
  onReset: () => void;
  onResponsibleChange: (value: string) => void;
  onSlaChange: (value: SlaFilter) => void;
  onStatusChange: (value: ConversationStatus | "") => void;
  responsavelId: string;
  responsibleOptions: LeadsCommunicationUser[];
  showReset?: boolean;
  slaFilter: SlaFilter;
  statusFilter: ConversationStatus | "";
}) {
  return (
    <div className="inbox-filter-content min-h-0 flex-1 overflow-y-auto">
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
  return <button aria-pressed={active} className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium transition-colors ${active ? "bg-[var(--bg-surface)] text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"}`} onClick={onClick} type="button"><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">{icon}</span><span className="truncate">{label}</span></button>;
}

function isSlaException(sla: CommunicationConversation["sla"]) {
  return Boolean(sla && ["ATENCAO", "ATRASADO", "CRITICO"].includes(sla.status));
}

export function ConversationListItem({ active, buttonRef, currentUserId, item, onClick, queueScope }: { active: boolean; buttonRef?: RefObject<HTMLButtonElement | null>; currentUserId: number; item: CommunicationConversation; onClick: () => void; queueScope: QueueScope }) {
  const [renderNow, setRenderNow] = useState(() => Date.now());
  const otherLease = item.reservaResposta && item.reservaResposta.usuarioId !== currentUserId;
  const name = item.contatoCanal.cliente?.nome ?? item.contatoCanal.nome ?? "Contato sem nome";
  const slaException = isSlaException(item.sla);
  const listTimestamp = item.ultimaMensagemEm ?? item.updatedAt;
  const reminderTimestamp = validTimestamp(item.lembrarDepoisEm);
  useEffect(() => {
    if (!reminderTimestamp) return;
    const timer = window.setInterval(() => setRenderNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [reminderTimestamp]);
  const reminderDue = reminderTimestamp ? new Date(reminderTimestamp).getTime() <= renderNow : false;
  const showStatus = queueScope !== "aguardando" && queueScope !== "lembrar-depois" && !slaException && !otherLease && !reminderTimestamp;
  const exceptionalIndicator = slaException
    ? <ConversationSlaBadge sla={item.sla} />
    : reminderTimestamp
      ? <time className={reminderDue ? "inbox-conversation-status-text inbox-conversation-reminder is-overdue" : "inbox-conversation-status-text"} dateTime={reminderTimestamp} aria-label={`${reminderDue ? "Retorno vencido" : "Lembrar depois"} em ${formatCommunicationDateTime(reminderTimestamp)}`}>{reminderDue ? "Retorno vencido" : reminderDisplayLabel(reminderTimestamp)}</time>
      : showStatus
        ? <span className="inbox-conversation-status-text">{conversationStatusLabels[item.status]}</span>
        : null;
  const leaseIndicator = otherLease ? <span className="inbox-conversation-status-text">{item.reservaResposta?.nome ?? "Equipe"} respondendo</span> : null;
  return <button aria-current={active ? "true" : undefined} className={`inbox-conversation-item w-full border-b border-[var(--border-default)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${active ? "is-selected bg-[var(--bg-muted)]" : "bg-[var(--bg-surface)]"}`} onClick={onClick} ref={buttonRef} type="button"><div className="flex items-start gap-2.5"><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-xs font-semibold">{initials(name)}{item.naoLidas > 0 && <span aria-label={`${item.naoLidas} mensagens não lidas`} className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[9px] font-bold !text-white">{Math.min(item.naoLidas, 99)}</span>}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={`inbox-conversation-name truncate text-xs text-[var(--text-primary)] ${item.naoLidas > 0 ? "font-bold" : "font-semibold"}`}>{name}</span><time className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]" dateTime={validTimestamp(listTimestamp) ?? undefined} aria-label={`Última atividade: ${formatCommunicationDateTime(listTimestamp)}`}>{formatCommunicationTime(listTimestamp) || "—"}</time></span><span className="mt-1 flex min-w-0 items-center justify-between gap-2"><span className="inbox-conversation-channel-meta truncate">{channelLabel(item.canalIntegracao.tipo, item.canalIntegracao.nome)}{item.canalIntegracao.modoTeste ? " · Teste" : ""}</span><span className={`truncate text-xs ${item.responsavel ? "text-[var(--text-muted)]" : "font-medium text-[var(--warning)]"}`}>{item.responsavel?.nome ?? "Sem responsável"}</span></span>{item.canalIntegracao.tipo === "EMAIL" && item.emailSubject && <span className="mt-1.5 block truncate text-xs font-semibold text-[var(--text-primary)]">{item.emailSubject}</span>}<span className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--text-secondary)]">{item.ultimaMensagem?.texto ?? "Sem mensagens"}</span>{(exceptionalIndicator || leaseIndicator) && <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">{exceptionalIndicator}{leaseIndicator}</span>}</span></div></button>;
}

export function MessageTimeline({ currentUserId, messages }: { currentUserId: number; messages: CommunicationMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message, index) => {
        const outgoing = message.direcao === "SAIDA";
        const simulated = outgoing && message.simulada;
        const mine = message.autor?.id === currentUserId;
        const previous = messages[index - 1];
        const timestamp = messageTimestamp(message);
        const previousTimestamp = previous ? messageTimestamp(previous) : null;
        const currentDay = localDayKey(timestamp);
        const previousDay = localDayKey(previousTimestamp);
        const showDate = Boolean(currentDay && currentDay !== previousDay);
        const email = message.emailMetadata;
        const bubbleTone = outgoing
          ? mine
            ? "border-[var(--brand-border)] bg-[var(--brand-subtle)]"
            : "border-[var(--info-border)] bg-[var(--info-subtle)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)]";

        return (
          <div key={message.id}>
            {showDate && <div className="my-3 flex items-center gap-3 text-xs text-[var(--text-muted)]"><span className="h-px flex-1 bg-[var(--border-default)]" /><time dateTime={timestamp ?? undefined}>{formatCommunicationDayLabel(timestamp)}</time><span className="h-px flex-1 bg-[var(--border-default)]" /></div>}
            <article className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[76%] rounded-lg border px-3 py-2 ${bubbleTone}`}>
                {email?.subject && <p className="mb-1 break-words text-xs font-semibold text-[var(--text-primary)]">{email.subject}</p>}
                {email && <p className="mb-1 break-words text-xs text-[var(--text-muted)]">De {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}</p>}
                <p className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-primary)]">{message.texto || "Mensagem sem conteúdo"}</p>
                {email && email.attachmentCount > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-[var(--text-secondary)]"><Paperclip aria-hidden={true} size={12} />{email.attachmentCount} {email.attachmentCount === 1 ? "anexo" : "anexos"}</p>}
                <p className="mt-1 flex justify-end text-[11px] text-[var(--text-muted)]"><span className="sr-only">{simulated ? `Simulação registrada por ${message.autor?.nome ?? "Automação"}; não enviada em ${formatCommunicationDateTime(timestamp)}. ` : outgoing ? `Respondido por ${message.autor?.nome ?? "Automação"}. ` : "Recebida. "}</span>{simulated && <span aria-hidden="true" className="mr-1">Simulação ·</span>}<time dateTime={timestamp ?? undefined} aria-label={simulated ? `Simulação registrada; não enviada em ${formatCommunicationDateTime(timestamp)}` : `${outgoing ? "Enviada" : "Recebida"} em ${formatCommunicationDateTime(timestamp)}`}>{formatCommunicationTime(timestamp) || "—"}</time></p>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
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
  return ({ assign: "Atualizar responsável", queue: "Devolver conversa à fila", pending: "Pendente sem prazo", snooze: "Agendar lembrete", close: "Encerrar conversa" } as const)[kind ?? "assign"];
}

function actionModalDescription(kind?: NonNullable<ActionModal>["kind"]) {
  return ({
    assign: "Selecione um usuário ativo da mesma empresa.",
    queue: "A conversa ficará disponível para a fila compartilhada.",
    pending: "Use este estado quando houver uma ação interna ou retorno posterior.",
    snooze: "A conversa sairá da fila e voltará no horário escolhido.",
    close: "O atendimento será encerrado sem apagar mensagens ou histórico.",
  } as const)[kind ?? "assign"];
}

function queueLabel(scope: QueueScope) {
  return ({
    aguardando: "Aguardando resposta",
    todas: "Todas",
    minhas: "Meu atendimento",
    "sem-responsavel": "Sem responsável",
    prioridade: "Prioridade / SLA",
    "lembrar-depois": "Lembrar depois",
  } as const)[scope];
}

function queueOptionLabel(scope: QueueScope, activeScope: QueueScope, total: number) {
  return scope === activeScope ? `${queueLabel(scope)} · ${total}` : queueLabel(scope);
}

function queueEmptyCopy(scope: QueueScope) {
  return ({
    aguardando: { title: "A fila está em dia", description: "Não há conversas aguardando resposta." },
    minhas: { title: "Nenhuma conversa atribuída", description: "Você não tem conversas atribuídas." },
    "sem-responsavel": { title: "Nenhuma conversa sem responsável", description: "Não há conversas sem responsável." },
    prioridade: { title: "Nenhuma prioridade ativa", description: "Não há conversas com prioridade ou SLA neste momento." },
    "lembrar-depois": { title: "Nenhum lembrete agendado", description: "Não há conversas aguardando um lembrete." },
    todas: { title: "Nenhuma conversa", description: "Novos atendimentos inbound aparecerão aqui." },
  } as const)[scope];
}

function reminderDisplayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return `Lembrar ${formatCommunicationTime(value)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate();
  if (isTomorrow) return `Amanhã ${formatCommunicationTime(value)}`;
  const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
  return `${shortDate} ${formatCommunicationTime(value)}`;
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

function defaultSnoozeDateTime() {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function validTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? value : null;
}

function messageTimestamp(message: CommunicationMessage) {
  return validTimestamp(message.enviadaEm || message.createdAt);
}

function localDayKey(value?: string | null) {
  const timestamp = validTimestamp(value);
  return timestamp ? new Intl.DateTimeFormat("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp)) : null;
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

function useCompactInboxContext() {
  const query = "(max-width: 1359px)";
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return compact;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
