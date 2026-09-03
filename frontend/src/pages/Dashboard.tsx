/* eslint-disable react-hooks/set-state-in-effect -- route, polling and focus effects synchronize external dashboard state. */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  actionIntensity,
  activitySignalLabel,
  forecastLabel,
  getLeadScore,
  getRisk,
  idleLabel,
  initials,
  kanbanHeaderClass,
  leadOwner,
  money,
  nextActionLabel,
  priorityLabel,
  slaLabel,
  smartCardBorderClass,
  stageGuidance,
  statusClass,
  tagClass,
} from "../utils/dashboardHelpers";
import DashboardMetricsSection from "../components/dashboard/DashboardMetricsSection";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import type { PageAction } from "../components/dashboard/DashboardHeader";
import DashboardClientsTable from "../components/dashboard/DashboardClientsTable";
import ClientModal from "../components/dashboard/ClientModal";
import DashboardCustomerDrawer from "../components/dashboard/DashboardCustomerDrawer";
import { useDrawerFocusSession } from "../components/dashboard/useDrawerFocusSession";
import DashboardOverview from "../components/dashboard/DashboardOverview";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardTopbar from "../components/dashboard/DashboardTopbar";
import DashboardOperationalSearch from "../components/dashboard/DashboardOperationalSearch";
import DashboardControlCenter from "../components/dashboard/DashboardControlCenter";
import DashboardKanbanBoard from "../components/dashboard/DashboardKanbanBoard";
import { CommerceCatalogPanel, CommerceSettingsPanel } from "../components/ai-commerce";
import DashboardInboxPanel from "../components/leads-communication/DashboardInboxPanel";
import DashboardLeadsPanel from "../components/leads-communication/DashboardLeadsPanel";
import DashboardNegociosKanbanPanel from "../components/negocios/DashboardNegociosKanbanPanel";
import DashboardToast from "../components/dashboard/DashboardToast";
import WhatsappExternalConfirmDialog from "../components/dashboard/WhatsappExternalConfirmDialog";
import type { WhatsappExternalRequest } from "../components/dashboard/WhatsappExternalConfirmDialog";
import useDashboardAnalytics from "../hooks/useDashboardAnalytics";
import useDashboardActions from "../hooks/useDashboardActions";
import { ApiHttpError, canAccessIntegrations, clearAuthSession, CRM_DATA_CHANGED_EVENT, fetchClienteDetailFromBackend, fetchClientesFromBackend, fetchCommunicationAttentionSummary, fetchDashboardSummaryFromBackend, getAuthSession, resolveDashboardSession, shouldInvalidateAuthSession } from "../services/crmApi";
import type { ApiDashboardSummary, AuthSession, NotificationTargetKind } from "../services/crmApi";
import { resolveTenantFeatureAccess } from "../config/featureFlags";
import { Button, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { LockKeyhole } from "lucide-react";

import { emptyClient, statusList } from "../data/clientDefaults";

import type { ActivePage, Client, KanbanOwner, SortBy, Status } from "../types/dashboard";
import {
  getDashboardPath,
  normalizeDashboardPathname,
  resolveDashboardLocation,
} from "../navigation/dashboardNavigation";
import { resetDashboardPageScroll } from "../navigation/dashboardScroll";

type DashboardProps = {
  initialAuthSession?: AuthSession | null;
  onLogout: () => void;
};

const CLIENT_DATA_PAGES = new Set<ActivePage>([
  "dashboard",
  "comercial",
  "leads",
  "clientes",
  "kanban",
  "agenda",
]);

const LazyDashboardAgendaPanel = lazy(() => import("../components/dashboard/DashboardAgendaPanel"));
const LazyStockControlPanel = lazy(() => import("../components/stock/StockControlPanel"));
const LazyDashboardIntegrationsPanel = lazy(() => import("../components/dashboard/DashboardIntegrationsPanel"));
const LazyIntegrationStatusBoard = lazy(() => import("../components/integrations/IntegrationStatusBoard"));
const LazyDashboardSiteLeadIntegrationPanel = lazy(() => import("../components/dashboard/DashboardSiteLeadIntegrationPanel"));
const LazyDashboardUserSecurityPanel = lazy(() => import("../components/dashboard/DashboardUserSecurityPanel"));
const LazyDashboardAutomationsPanel = lazy(() => import("../components/dashboard/DashboardAutomationsPanel"));
const LazyDashboardPlatformTenantsPanel = lazy(() => import("../components/dashboard/DashboardPlatformTenantsPanel"));
const LazyDashboardPlatformObservabilityPanel = lazy(() => import("../components/dashboard/DashboardPlatformObservabilityPanel"));
const LazyWhatsAppConnectionPanel = lazy(async () => {
  const module = await import("../components/integrations/WhatsAppConnectionPanel");
  return { default: module.WhatsAppConnectionPanel };
});
// Shared only with the behavioral focus fixture so it exercises the production layout cycle.
// eslint-disable-next-line react-refresh/only-export-components
export function useCloseCustomerDrawerOnPageKeyChange(
  pageKey: string,
  invalidateSession: () => void,
  setDrawerOpen: (open: boolean) => void,
) {
  const previousPageKeyRef = useRef(pageKey);

  useLayoutEffect(() => {
    if (previousPageKeyRef.current === pageKey) return;
    previousPageKeyRef.current = pageKey;
    invalidateSession();
    setDrawerOpen(false);
  }, [invalidateSession, pageKey, setDrawerOpen]);
}

export default function Dashboard({ initialAuthSession, onLogout }: DashboardProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement | null>(null);
  const resolvedNavigation = resolveDashboardLocation(location);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "Todos">("Todos");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [onlySilent, setOnlySilent] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [kanbanOwnerFilter, setKanbanOwnerFilter] = useState<KanbanOwner>("Todos");
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [isDraggingKanban, setIsDraggingKanban] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState<Client | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagText, setTagText] = useState("");
  const [page, setPage] = useState(1);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("crm-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [inboxAttentionCount, setInboxAttentionCount] = useState<number | null>(null);
  const [inboxAttentionCountFresh, setInboxAttentionCountFresh] = useState(false);
  const [showArchivedClients, setShowArchivedClients] = useState(false);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [selectedClientDetail, setSelectedClientDetail] = useState<Client | null>(null);
  const lastClientLoadPageRef = useRef<ActivePage | null>(null);
  const [isBooting] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<ApiDashboardSummary | null>(null);
  const [dashboardSummaryLoadState, setDashboardSummaryLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [clientsLoadState, setClientsLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [clientPagination, setClientPagination] = useState({ page: 1, limit: 8, total: 0, totalPages: 0 });
  const [backendLoadError, setBackendLoadError] = useState("");
  const [backendLoadRequest, setBackendLoadRequest] = useState(0);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => initialAuthSession ?? getAuthSession());
  const [whatsappExternalRequest, setWhatsappExternalRequest] = useState<WhatsappExternalRequest | null>(null);
  const [blingReturnMessage, setBlingReturnMessage] = useState("");
  const [agendaCreateRequestKey, setAgendaCreateRequestKey] = useState(0);
  const [agendaTodayRequestKey, setAgendaTodayRequestKey] = useState(0);
  const [agendaFollowUpId, setAgendaFollowUpId] = useState<number | null>(null);
  const [agendaFollowUpRequestKey, setAgendaFollowUpRequestKey] = useState(0);
  const kanbanStageRequest = { group: "pipeline" as const, key: 0 };
  const [leadsCreateRequestKey, setLeadsCreateRequestKey] = useState(0);
  const [inboxConversationId, setInboxConversationId] = useState<number | null>(null);
  const [pendingSearchClientId, setPendingSearchClientId] = useState<number | null>(null);
  const [kanbanBusinessId, setKanbanBusinessId] = useState<number | null>(null);
  const [kanbanProposalId, setKanbanProposalId] = useState<number | null>(null);
  const canManageIntegrations = canAccessIntegrations(authSession);
  const canManageUsers = (authSession?.papel ?? authSession?.usuario.papel) === "ADMIN";
  const isPlatformOperator = authSession?.isPlatformOperator === true;
  const {
    leadsCommunication: leadsCommunicationEnabled,
    siteLeadCapture: siteLeadCaptureEnabled,
    negociosKanban: negociosKanbanEnabled,
    automations: automationsEnabled,
  } = resolveTenantFeatureAccess(authSession?.capabilities);
  const canManageLeads = ["ADMIN", "GERENTE"].includes(authSession?.papel ?? authSession?.usuario.papel ?? "");
  const aiCommerceEnabled = authSession?.capabilities?.aiCommerce === true;

  useEffect(() => {
    let refreshTimer: number | undefined;
    const refreshDashboardData = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => setBackendLoadRequest((current) => current + 1), 120);
    };
    window.addEventListener(CRM_DATA_CHANGED_EVENT, refreshDashboardData);
    return () => {
      window.removeEventListener(CRM_DATA_CHANGED_EVENT, refreshDashboardData);
      window.clearTimeout(refreshTimer);
    };
  }, []);
  const requestedActivePage = resolvedNavigation.page;
  const activePage = requestedActivePage === "integracoes" && !canManageIntegrations
    ? "comercial"
    : requestedActivePage === "platformTenants" && !isPlatformOperator
      ? "comercial"
      : requestedActivePage === "usuarios" && !canManageUsers
        ? "comercial"
        : requestedActivePage === "automacoes" && !automationsEnabled
          ? "comercial"
          : requestedActivePage;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const conversationId = Number(params.get("conversationId"));
    const followUpId = Number(params.get("acompanhamentoId"));
    const businessId = Number(params.get("negocioId"));
    const proposalId = Number(params.get("propostaId"));
    setInboxConversationId(activePage === "inbox" && Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null);
    setAgendaFollowUpId(activePage === "agenda" && Number.isInteger(followUpId) && followUpId > 0 ? followUpId : null);
    setKanbanBusinessId(activePage === "kanban" && Number.isInteger(businessId) && businessId > 0 ? businessId : null);
    setKanbanProposalId(activePage === "kanban" && Number.isInteger(proposalId) && proposalId > 0 ? proposalId : null);
  }, [activePage, location.search]);
  const isInboxPage = activePage === "inbox";
  const isWhatsAppIntegrationDetail = activePage === "integracoes" && resolvedNavigation.detail === "whatsapp";
  const usingNegociosKanban = activePage === "kanban" && negociosKanbanEnabled;
  const customerDrawerPageKey = `${activePage}:${location.pathname}${location.search}${location.hash}`;
  const {
    session: customerDrawerFocusSession,
    startSession: startCustomerDrawerFocusSession,
    isSessionActive: isCustomerDrawerFocusSessionActive,
    requestClose: requestCustomerDrawerFocusClose,
    settleClose: settleCustomerDrawerFocusClose,
    invalidateSession: invalidateCustomerDrawerFocusSession,
  } = useDrawerFocusSession(customerDrawerPageKey);
  useCloseCustomerDrawerOnPageKeyChange(
    customerDrawerPageKey,
    invalidateCustomerDrawerFocusSession,
    setIsCustomerDrawerOpen,
  );

  const pageSize = 8;


  useEffect(() => {
    try {
      window.localStorage.setItem("crm-sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      // Layout remains usable if storage is unavailable.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    setInboxAttentionCountFresh(false);
    if (!leadsCommunicationEnabled || !authSession) {
      setInboxAttentionCount(null);
      setInboxAttentionCountFresh(false);
      return;
    }
    let ignore = false;
    const loadAttention = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const summary = await fetchCommunicationAttentionSummary();
        if (!ignore) {
          setInboxAttentionCount(summary.pendentes);
          setInboxAttentionCountFresh(true);
        }
      } catch {
        // Preserve the last known count for the rail, but do not promote it into fresh page copy.
        if (!ignore) setInboxAttentionCountFresh(false);
      }
    };
    void loadAttention();
    const interval = window.setInterval(() => { void loadAttention(); }, 20000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadAttention();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      ignore = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSession, leadsCommunicationEnabled]);

  const handleSelectClient = useCallback((clientId: number | null, origin: HTMLElement | null = null, fallback: HTMLElement | null = null) => {
    setSelectedId(clientId);
    setSelectedClientDetail(null);
    if (clientId === null) {
      invalidateCustomerDrawerFocusSession();
      setIsCustomerDrawerOpen(false);
      return;
    }
    if (clientId !== null && ["dashboard", "comercial", "clientes", "kanban", "agenda"].includes(requestedActivePage)) {
      const activeElement = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      startCustomerDrawerFocusSession(origin ?? activeElement, fallback);
      setIsCustomerDrawerOpen(true);
    }
  }, [invalidateCustomerDrawerFocusSession, requestedActivePage, startCustomerDrawerFocusSession]);

  const handleCloseCustomerDrawer = useCallback((token: number) => {
    if (!requestCustomerDrawerFocusClose(token)) return;
    setIsCustomerDrawerOpen(false);
  }, [requestCustomerDrawerFocusClose]);

  const handleClearSelectedClient = useCallback(() => {
    invalidateCustomerDrawerFocusSession();
    setIsCustomerDrawerOpen(false);
    setSelectedId(null);
  }, [invalidateCustomerDrawerFocusSession]);

  const pageTitle = isWhatsAppIntegrationDetail ? "WhatsApp" : ({
    dashboard: "Visão Geral",
    comercial: "Painel Comercial",
    inbox: "Caixa de Entrada",
    leads: "Leads",
    clientes: "Clientes",
    kanban: "Negócios",
    agenda: "Agenda",
    estoque: "Estoque",
    integracoes: "Integrações e Dados",
    automacoes: "Automações",
    platformTenants: "Operações da Plataforma",
    usuarios: "Usuários e acessos",
    perfil: "Meu perfil e segurança",
  } satisfies Record<ActivePage, string>)[activePage];

  useEffect(() => {
    let ignore = false;

    async function loadBackendSession() {
      const savedSession = initialAuthSession ?? getAuthSession();
      setAuthSession(savedSession);
      setBackendLoadError("");
      setDashboardSummaryLoadState("loading");

      try {
        const refreshedSession = await resolveDashboardSession(initialAuthSession, backendLoadRequest);
        if (!ignore) setAuthSession(refreshedSession);

        try {
          const summary = await fetchDashboardSummaryFromBackend();
          if (!ignore) {
            setDashboardSummary(summary);
            setDashboardSummaryLoadState(summary ? "ready" : "error");
          }
        } catch {
          if (!ignore) {
            setDashboardSummary(null);
            setDashboardSummaryLoadState("error");
          }
        }
      } catch (error) {
        if (ignore) return;
        if (shouldInvalidateAuthSession(error)) {
          clearAuthSession();
          onLogout();
          return;
        }
        setDashboardSummaryLoadState("error");
        setBackendLoadError("Não foi possível carregar os dados agora. Sua sessão foi preservada.");
      }
    }

    void loadBackendSession();

    return () => {
      ignore = true;
    };
  }, [backendLoadRequest, initialAuthSession, onLogout]);

  useEffect(() => {
    const pageChanged = lastClientLoadPageRef.current !== activePage;
    lastClientLoadPageRef.current = activePage;

    if (!CLIENT_DATA_PAGES.has(activePage)) return;

    let ignore = false;
    const timeout = window.setTimeout(async () => {
      setClientsLoadState("loading");
      try {
        const result = await fetchClientesFromBackend({
          page,
          limit: pageSize,
          search: search.trim() || undefined,
          status: statusFilter === "Todos" ? undefined : statusFilter,
          arquivado: activePage === "clientes" ? showArchivedClients : false,
          favorito: onlyFavorites || undefined,
          quente: onlyHot || undefined,
          risco: onlyRisk || undefined,
          silencioso: onlySilent || undefined,
          sortBy,
        });
        if (ignore) return;
        if (!result) {
          setClientsLoadState("ready");
          return;
        }
        setClients(result.data);
        setClientPagination(result.pagination);
        setSelectedId((current) => current !== null && result.data.some((client) => client.id === current)
          ? current
          : result.data[0]?.id ?? null);
        setBackendLoadError("");
        setClientsLoadState("ready");
      } catch (error) {
        if (ignore) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          clearAuthSession();
          onLogout();
          return;
        }
        setClientsLoadState("error");
        setBackendLoadError("Não foi possível carregar os dados agora. Sua sessão foi preservada.");
      }
    }, pageChanged ? 0 : 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [
    backendLoadRequest,
    activePage,
    onLogout,
    onlyFavorites,
    onlyHot,
    onlyRisk,
    onlySilent,
    page,
    pageSize,
    search,
    sortBy,
    statusFilter,
    showArchivedClients,
  ]);

  useEffect(() => {
    if (!isCustomerDrawerOpen || selectedId === null) return;
    let ignore = false;
    fetchClienteDetailFromBackend(selectedId)
      .then((detail) => {
        if (ignore) return;
        setSelectedClientDetail(detail);
        setClients((current) => current.some((client) => client.id === selectedId)
          ? current.map((client) => client.id === selectedId ? detail : client)
          : current);
      })
      .catch((error) => {
        if (!ignore && shouldInvalidateAuthSession(error)) {
          clearAuthSession();
          onLogout();
        }
      });
    return () => {
      ignore = true;
    };
  }, [isCustomerDrawerOpen, onLogout, selectedId]);

  useEffect(() => {
    resetDashboardPageScroll(contentRef.current, window);
  }, [activePage]);


  const selectedClient = useMemo(
    () => selectedClientDetail?.id === selectedId
      ? selectedClientDetail
      : clients.find((client) => client.id === selectedId) || null,
    [clients, selectedClientDetail, selectedId],
  );
  const filteredClients = clients;

  const kanbanClients = useMemo(() => {
    if (kanbanOwnerFilter === "Todos") {
      return filteredClients;
    }

    return filteredClients.filter((client) => leadOwner(client) === kanbanOwnerFilter);
  }, [filteredClients, kanbanOwnerFilter]);

  const totalPages = Math.max(1, clientPagination.totalPages);
  const paginatedClients = filteredClients;

  const {
    analytics,
    kanbanEnterpriseStats,
    smartAlerts,
    activeFiltersCount,
  } = useDashboardAnalytics({
    clients,
    kanbanClients,
    search,
    statusFilter,
    onlyFavorites,
    onlyHot,
    onlyRisk,
    onlySilent,
    sortBy,
    summary: dashboardSummary,
  });

  const {
    toast,
    setToast,
    copyText,
    clearFilters: clearDashboardFilters,
    toggleFavorite,
    toggleHot,
    changeStatus,
    saveEdit,
    createClient,
    deleteClient,
    archiveClient,
    restoreClient,
    addNote,
    addTagToSelected,
    removeTagFromSelected,
    exportCsv,
    applySmartFilter,
    whatsappMessage,
  } = useDashboardActions({
    clients,
    setClients,
    selectedClient,
    setSelectedClientDetail,
    selectedId,
    setSelectedId,
    editing,
    setEditing,
    creating,
    setCreating,
    noteText,
    setNoteText,
    tagText,
    setTagText,
    setSearch,
    setStatusFilter,
    setOnlyFavorites,
    setOnlyHot,
    setOnlyRisk,
    setOnlySilent,
    setSortBy,
    setKanbanOwnerFilter,
    setPage,
  });

  const clearFilters = useCallback(() => {
    clearDashboardFilters();
    setShowArchivedClients(false);
  }, [clearDashboardFilters]);

  const handleShowArchivedClients = useCallback((archived: boolean) => {
    handleClearSelectedClient();
    setShowArchivedClients(archived);
    if (archived) {
      setStatusFilter("Todos");
      setOnlyFavorites(() => false);
      setOnlyHot(() => false);
      setOnlyRisk(false);
      setOnlySilent(false);
      setPage(1);
    }
  }, [handleClearSelectedClient]);

  const handleSetActivePage = useCallback((page: ActivePage) => {
    invalidateCustomerDrawerFocusSession();
    setIsCustomerDrawerOpen(false);
    if (page === "integracoes" && !canManageIntegrations) {
      setToast("Acesso negado para Integrações.");
      navigate(getDashboardPath("comercial"), { replace: true });
      return;
    }
    if ((page === "inbox" || page === "leads") && !leadsCommunicationEnabled) {
      setToast("Leads e Caixa de Entrada não estão habilitados neste ambiente.");
      return;
    }
    if (page === "platformTenants" && !isPlatformOperator) {
      setToast("Acesso restrito ao operador da plataforma.");
      navigate(getDashboardPath("comercial"), { replace: true });
      return;
    }
    if (page === "usuarios" && !canManageUsers) {
      setToast("Acesso restrito à administração de usuários.");
      navigate(getDashboardPath("comercial"), { replace: true });
      return;
    }
    if (page === "automacoes" && !automationsEnabled) {
      setToast("Automações não estão habilitadas neste ambiente.");
      navigate(getDashboardPath("comercial"), { replace: true });
      return;
    }

    const pathname = getDashboardPath(page);
    if (normalizeDashboardPathname(location.pathname) !== pathname) {
      navigate(pathname);
    }
  }, [automationsEnabled, canManageIntegrations, canManageUsers, invalidateCustomerDrawerFocusSession, isPlatformOperator, leadsCommunicationEnabled, location.pathname, navigate, setToast]);

  const handleSearchSelectClient = useCallback((clientId: number | null) => {
    if (clientId === null) return;
    if (activePage === "clientes") {
      handleSelectClient(clientId);
      return;
    }
    setPendingSearchClientId(clientId);
    handleSetActivePage("clientes");
  }, [activePage, handleSelectClient, handleSetActivePage]);

  useEffect(() => {
    if (activePage !== "clientes" || pendingSearchClientId === null) return;
    const clientId = pendingSearchClientId;
    setPendingSearchClientId(null);
    const main = document.getElementById("crm-main-content");
    handleSelectClient(clientId, main, main);
  }, [activePage, handleSelectClient, pendingSearchClientId]);

  const openInboxConversation = useCallback((conversationId: number) => {
    setInboxConversationId(conversationId);
    handleSetActivePage("inbox");
  }, [handleSetActivePage]);

  const consumeInboxConversationTarget = useCallback(() => {
    setInboxConversationId(null);
  }, []);

  const openKanbanBusiness = useCallback((businessId: number) => {
    setKanbanBusinessId(businessId);
    setKanbanProposalId(null);
    handleSetActivePage("kanban");
  }, [handleSetActivePage]);

  const consumeKanbanBusinessTarget = useCallback(() => {
    setKanbanBusinessId(null);
    setKanbanProposalId(null);
  }, []);

  const openTodayAgenda = useCallback(() => {
    setAgendaTodayRequestKey((current) => current + 1);
    handleSetActivePage("agenda");
  }, [handleSetActivePage]);

  const openNotificationTarget = useCallback((target: { tipo: NotificationTargetKind; id: number; rota: string }) => {
    invalidateCustomerDrawerFocusSession();
    setIsCustomerDrawerOpen(false);
    if (target.tipo === "CONVERSATION") {
      setInboxConversationId(target.id);
      navigate({ pathname: getDashboardPath("inbox"), search: `?conversationId=${encodeURIComponent(target.id)}` });
      return;
    }
    if (target.tipo === "FOLLOW_UP") {
      setAgendaFollowUpId(target.id);
      setAgendaFollowUpRequestKey((current) => current + 1);
      navigate({ pathname: getDashboardPath("agenda"), search: `?acompanhamentoId=${encodeURIComponent(target.id)}` });
      return;
    }
    if (target.tipo === "DEAL") {
      setKanbanBusinessId(target.id);
      navigate({ pathname: getDashboardPath("kanban"), search: `?negocioId=${encodeURIComponent(target.id)}` });
      return;
    }
    const kind = target.tipo === "ESTOQUE_LOTE" ? "lotes" : target.tipo === "ESTOQUE_PRODUTO" ? "produtos" : "fontes";
    navigate(`/estoque/${kind}/${encodeURIComponent(target.id)}`);
  }, [invalidateCustomerDrawerFocusSession, navigate]);

  const openCustomerContext = useCallback((destination: "INBOX" | "KANBAN" | "AGENDA", id: number) => {
    if (destination === "INBOX") {
      openInboxConversation(id);
      return;
    }
    if (destination === "KANBAN") {
      openKanbanBusiness(id);
      return;
    }
    setAgendaFollowUpId(id);
    setAgendaFollowUpRequestKey((current) => current + 1);
    navigate({ pathname: getDashboardPath("agenda"), search: `?acompanhamentoId=${encodeURIComponent(id)}` });
  }, [navigate, openInboxConversation, openKanbanBusiness]);

  useEffect(() => {
    if (!resolvedNavigation.isKnown || resolvedNavigation.needsReplace) {
      navigate({
        pathname: resolvedNavigation.pathname,
        search: resolvedNavigation.search,
        hash: resolvedNavigation.hash,
      }, { replace: true });
      return;
    }

    if (requestedActivePage === "integracoes" && !canManageIntegrations) {
      setToast("Acesso negado para Integrações.");
      navigate(getDashboardPath("comercial"), { replace: true });
    }
    if (requestedActivePage === "platformTenants" && !isPlatformOperator) {
      setToast("Acesso restrito ao operador da plataforma.");
      navigate(getDashboardPath("comercial"), { replace: true });
    }
    if (requestedActivePage === "usuarios" && !canManageUsers) {
      setToast("Acesso restrito à administração de usuários.");
      navigate(getDashboardPath("comercial"), { replace: true });
    }
    if (requestedActivePage === "automacoes" && !automationsEnabled) {
      setToast("Automações não estão habilitadas neste ambiente.");
      navigate(getDashboardPath("comercial"), { replace: true });
    }
  }, [
    automationsEnabled,
    canManageIntegrations,
    canManageUsers,
    isPlatformOperator,
    navigate,
    requestedActivePage,
    resolvedNavigation.isKnown,
    resolvedNavigation.needsReplace,
    resolvedNavigation.pathname,
    resolvedNavigation.search,
    resolvedNavigation.hash,
    setToast,
  ]);

  const backendCaption = dashboardSummary
    ? `${clientPagination.total} clientes encontrados`
    : "Dados sincronizados";

  const pageActions = useMemo<PageAction[]>(() => {
    const riskAction = {
      label: smartAlerts[0] || "Clientes em risco",
      onClick: () => applySmartFilter("risk"),
    };
    const silentAction = {
      label: smartAlerts[2] || "Clientes sem contato",
      onClick: () => applySmartFilter("silent"),
    };
    const resetAction = { label: "Resetar visão", onClick: clearFilters };

    const actionsByPage: Partial<Record<ActivePage, PageAction[]>> = {
      dashboard: [
        { label: "Oportunidades quentes", onClick: () => setOnlyHot(true) },
        { label: "Propostas abertas", onClick: () => setStatusFilter("Proposta") },
        resetAction,
      ],
      comercial: [
        { label: "Fila quente", onClick: () => setOnlyHot(true) },
        { label: "Focar propostas", onClick: () => setStatusFilter("Proposta") },
        riskAction,
        silentAction,
        resetAction,
      ],
      clientes: [
        { label: "Exportar página atual", onClick: exportCsv },
        ...(showArchivedClients ? [] : [riskAction, { label: "Propostas abertas", onClick: () => applySmartFilter("proposal") }, silentAction]),
        resetAction,
      ],
      kanban: [
        { label: "Oportunidades quentes", onClick: () => setOnlyHot(true) },
        { label: "Focar propostas", onClick: () => setStatusFilter("Proposta") },
        riskAction,
        silentAction,
        resetAction,
      ],
      agenda: [
        { label: "Novo cliente", onClick: () => setCreating({ ...emptyClient }) },
        { label: "Sem contato", onClick: () => applySmartFilter("silent") },
        { label: "Propostas hoje", onClick: () => applySmartFilter("proposal") },
        riskAction,
        resetAction,
      ],
    };

    return actionsByPage[activePage] ?? [];
  }, [activePage, applySmartFilter, clearFilters, exportCsv, showArchivedClients, smartAlerts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const blingStatus = url.searchParams.get("bling");
    if (!blingStatus) return;

    const motivo = url.searchParams.get("motivo") || "";
    const message = blingStatus === "conectado"
      ? "Bling conectado com sucesso."
      : blingErrorMessage(motivo);

    url.searchParams.delete("bling");
    url.searchParams.delete("motivo");
    url.searchParams.delete("codigo");
    url.searchParams.delete("integracaoId");
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    const cleanLocation = `${url.pathname}${url.search}${url.hash}`;

    const timeout = window.setTimeout(() => {
      if (canManageIntegrations) {
        setBlingReturnMessage(message);
        navigate(getDashboardPath("integracoes"), { replace: true });
      } else {
        setToast(message);
        navigate(cleanLocation, { replace: true });
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [canManageIntegrations, navigate, setToast]);

  const requestExternalWhatsapp = useCallback((client: Client) => {
    setWhatsappExternalRequest({
      contactName: client.name,
      phone: client.phone,
      message: whatsappMessage(client),
    });
  }, [whatsappMessage]);

  const handleEditClient = useCallback((client: Client) => {
    invalidateCustomerDrawerFocusSession();
    setIsCustomerDrawerOpen(false);
    setEditing({ ...client });
  }, [invalidateCustomerDrawerFocusSession]);

  const customerDrawer = (
    <DashboardCustomerDrawer
      activePage={activePage}
      selectedClient={selectedClient}
      noteText={noteText}
      tagText={tagText}
      clients={clients}
      analytics={analytics}
      money={money}
      initials={initials}
      statusClass={statusClass}
      tagClass={tagClass}
      nextActionLabel={nextActionLabel}
      getLeadScore={getLeadScore}
      getRisk={getRisk}
      slaLabel={slaLabel}
      priorityLabel={priorityLabel}
      onClearSelectedClient={handleClearSelectedClient}
      onSetNoteText={setNoteText}
      onSetTagText={setTagText}
      onAddNote={addNote}
      onAddTagToSelected={addTagToSelected}
      onRemoveTagFromSelected={removeTagFromSelected}
      onEditClient={handleEditClient}
      onCopyText={copyText}
      onRequestWhatsapp={requestExternalWhatsapp}
      onNavigateContext={openCustomerContext}
      onUnauthorized={onLogout}
      canRestoreArchivedClients={canManageLeads}
      onApplySmartFilter={applySmartFilter}
      focusSession={customerDrawerFocusSession}
      isFocusSessionActive={isCustomerDrawerFocusSessionActive}
      onRequestFocusSessionClose={handleCloseCustomerDrawer}
      onFocusSessionSettled={settleCustomerDrawerFocusClose}
      overlay={["dashboard", "comercial", "clientes", "kanban", "agenda"].includes(activePage)}
      open={isCustomerDrawerOpen && selectedClient !== null}
    />
  );

  if (isBooting) {
    return (
      <div className="crm-workspace min-h-screen p-4">
        <div className="flex min-h-[calc(100vh-32px)] min-w-0 gap-4 overflow-x-hidden">
          <div className="premium-panel hidden w-60 rounded-2xl p-4 lg:block">
            <div className="mb-6 flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
                <div className="h-2 w-16 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-xl bg-white/[0.045]" />
              ))}
            </div>

            <div className="mt-6 h-28 animate-pulse rounded-2xl bg-white/[0.045]" />
            <div className="mt-3 h-36 animate-pulse rounded-2xl bg-white/[0.035]" />
          </div>

          <main className="flex-1 space-y-4">
            {activePage === "comercial" && (
              <p aria-live="polite" className="text-[12px] font-medium text-[var(--text-secondary)]" role="status">
                Carregando operação comercial
              </p>
            )}
            <div className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />

            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
                <div className="h-6 w-44 animate-pulse rounded-full bg-white/10" />
              </div>

              <div className="h-9 w-32 animate-pulse rounded-xl bg-white/10" />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>

            <div className="h-16 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-3">
                <div className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                <div className="h-52 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              </div>

              <div className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-workspace premium-shell min-h-screen">
      <a className="skip-link" href="#crm-main-content">Pular para o conteúdo</a>
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage={activePage}
          setActivePage={handleSetActivePage}
          authSession={authSession}
          canManageIntegrations={canManageIntegrations}
          canManageUsers={canManageUsers}
          isPlatformOperator={isPlatformOperator}
          leadsCommunicationEnabled={leadsCommunicationEnabled}
          automationsEnabled={automationsEnabled}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
          attentionCount={inboxAttentionCount}
        />

        <div className="crm-main min-w-0 flex-1 overflow-x-hidden">
          <DashboardTopbar
            showQuickActions={showQuickActions}
            emptyClient={emptyClient}
            setSelectedId={handleSearchSelectClient}
            setActivePage={handleSetActivePage}
            setShowQuickActions={setShowQuickActions}
            setCreating={setCreating}
            exportCsv={exportCsv}
            onLogout={onLogout}
            onOpenProfile={() => handleSetActivePage("perfil")}
            authSession={authSession}
            canManageIntegrations={canManageIntegrations}
            leadsCommunicationEnabled={leadsCommunicationEnabled}
            automationsEnabled={automationsEnabled}
            onOpenNotificationTarget={openNotificationTarget}
            canManageNotifications={authSession?.papel === "ADMIN" || authSession?.papel === "GERENTE"}
          />

          <main ref={contentRef} tabIndex={-1} className={`crm-content mx-auto w-full max-w-[1680px] px-4 pb-24 pt-5 sm:px-5 lg:px-7 lg:pb-8${isInboxPage ? " crm-content--inbox" : ""}`} id="crm-main-content">
          {backendLoadError && clients.length === 0 && activePage !== "dashboard" && activePage !== "comercial" && (
            <ErrorState
              className="mb-4 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]"
              description={backendLoadError}
              onRetry={() => setBackendLoadRequest((current) => current + 1)}
              title="Dados temporariamente indisponíveis"
            />
          )}
          {activePage !== "dashboard" && activePage !== "comercial" && (!isInboxPage || !leadsCommunicationEnabled) && (
            <DashboardHeader
              key={activePage}
              activePage={activePage}
              pageTitle={pageTitle}
              backendCaption={backendCaption}
              onCreateClient={() => setCreating({ ...emptyClient })}
              showCreateClient={activePage !== "estoque" && activePage !== "integracoes" && activePage !== "automacoes" && activePage !== "platformTenants" && activePage !== "kanban" && activePage !== "leads" && activePage !== "inbox" && activePage !== "usuarios" && activePage !== "perfil"}
              showBackendCaption={false}
              compact
              primaryAction={activePage === "agenda" ? { label: "Novo acompanhamento", onClick: () => setAgendaCreateRequestKey((current) => current + 1) } : activePage === "leads" && leadsCommunicationEnabled && canManageLeads ? { label: "Novo Lead", onClick: () => setLeadsCreateRequestKey((current) => current + 1) } : undefined}
              actions={usingNegociosKanban ? [] : pageActions}
              actionsPlacement={activePage === "clientes" ? "toolbar" : "header"}
            />
          )}

          {activePage === "dashboard" && (
            <DashboardOverview
              summary={dashboardSummary}
              summaryLoadState={dashboardSummaryLoadState}
              isAuthorized={authSession !== null}
              money={money}
              onOpenCommercial={() => handleSetActivePage("comercial")}
              onOpenInbox={() => handleSetActivePage("inbox")}
              onOpenAgenda={openTodayAgenda}
              onRetry={() => setBackendLoadRequest((current) => current + 1)}
              attentionCount={inboxAttentionCount}
              attentionCountFresh={inboxAttentionCountFresh}
            />
          )}

          {!["usuarios", "perfil"].includes(activePage) && activePage !== "dashboard" && activePage !== "comercial" && activePage !== "clientes" && activePage !== "agenda" && activePage !== "leads" && activePage !== "inbox" && !usingNegociosKanban && (
            <DashboardMetricsSection
              activePage={activePage}
              clients={clients}
              summary={dashboardSummary}
            />
          )}

          {!["usuarios", "perfil"].includes(activePage) && activePage !== "comercial" && activePage !== "dashboard" && activePage !== "agenda" && activePage !== "estoque" && activePage !== "integracoes" && activePage !== "leads" && activePage !== "inbox" && !usingNegociosKanban && (
            <DashboardOperationalSearch
              activePage={activePage}
              metadata={activePage === "clientes" || activePage === "kanban" ? backendCaption : undefined}
              filteredClientsCount={clientPagination.total}
              activeFiltersCount={activeFiltersCount}
              search={search}
              statusFilter={statusFilter}
              statusList={statusList}
              sortBy={sortBy}
              kanbanOwnerFilter={kanbanOwnerFilter}
              onlyFavorites={onlyFavorites}
              onlyHot={onlyHot}
              setSearch={setSearch}
              setPage={setPage}
              setStatusFilter={setStatusFilter}
              setSortBy={setSortBy}
              setKanbanOwnerFilter={setKanbanOwnerFilter}
              setOnlyFavorites={setOnlyFavorites}
              setOnlyHot={setOnlyHot}
              exportCsv={exportCsv}
              clearFilters={clearFilters}
              showArchived={showArchivedClients}
              setShowArchived={handleShowArchivedClients}
              pageActions={activePage === "clientes" ? pageActions : []}
            />
          )}

          {activePage !== "dashboard" && <section
            className={`${isInboxPage ? "inbox-route-section" : activePage === "comercial" ? "" : activePage === "clientes" || activePage === "kanban" || activePage === "estoque" || activePage === "integracoes" || activePage === "automacoes" ? "mt-3" : "mt-4"} ${
              isInboxPage
                ? ""
                : activePage === "comercial" || activePage === "leads" || activePage === "usuarios" || activePage === "perfil"
                ? "block"
                : activePage === "clientes" || activePage === "kanban"
                  ? "block"
                : activePage === "agenda"
                  ? "space-y-4"
                  : activePage === "estoque"
                    ? "space-y-3"
                    : activePage === "integracoes"
                      ? "space-y-3"
                : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
            }`}
          >
            <div className={isInboxPage ? "inbox-route-stack" : activePage === "comercial" || activePage === "leads" || activePage === "clientes" || activePage === "kanban" || activePage === "estoque" || activePage === "integracoes" || activePage === "automacoes" || activePage === "usuarios" || activePage === "perfil" ? "space-y-3" : "space-y-4"}>
              {(activePage === "leads" || activePage === "inbox") && !leadsCommunicationEnabled && (
                <EmptyState description="Este recurso permanece indisponível enquanto a feature flag local estiver desligada." icon={<LockKeyhole size={18} />} state="unavailable" title="Recurso não habilitado" />
              )}

              {activePage === "leads" && leadsCommunicationEnabled && authSession && (
                <DashboardLeadsPanel authSession={authSession} clients={clients} createRequestKey={leadsCreateRequestKey} onOpenConversation={openInboxConversation} />
              )}

              {activePage === "inbox" && leadsCommunicationEnabled && authSession && (
                <DashboardInboxPanel authSession={authSession} initialConversationId={inboxConversationId} onInitialConversationHandled={consumeInboxConversationTarget} onOpenBusiness={openKanbanBusiness} />
              )}
              {activePage === "usuarios" && authSession && (
                <Suspense fallback={<LoadingState rows={3} />}>
                  <LazyDashboardUserSecurityPanel mode="users" authSession={authSession} onToast={setToast} />
                </Suspense>
              )}
              {activePage === "perfil" && authSession && (
                <Suspense fallback={<LoadingState rows={3} />}>
                  <LazyDashboardUserSecurityPanel mode="profile" authSession={authSession} onToast={setToast} onLogout={onLogout} />
                </Suspense>
              )}
              {activePage === "clientes" && (
                <>
                  <DashboardClientsTable
                    paginatedClients={paginatedClients}
                    filteredClientsCount={clientPagination.total}
                    selectedId={selectedId}
                    page={page}
                    totalPages={totalPages}
                    initials={initials}
                    statusClass={statusClass}
                    getRisk={getRisk}
                    onSelectClient={handleSelectClient}
                    onToggleFavorite={toggleFavorite}
                    onToggleHot={toggleHot}
                    onRequestWhatsapp={requestExternalWhatsapp}
                    onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
                    onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
                    loadState={clientsLoadState}
                    onRetry={() => setBackendLoadRequest((current) => current + 1)}
                  />
                </>
              )}
              {activePage === "comercial" && !resolvedNavigation.detail && <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3" aria-label="Atalhos comerciais">
                <Button onClick={() => navigate("/catalogo-comercial")} size="sm" variant="secondary">Catálogo comercial</Button>
                <Button onClick={() => navigate("/configuracoes/ia-comercial")} size="sm" variant="ghost">Configurações da IA comercial</Button>
              </div>}
              {activePage === "comercial" && (resolvedNavigation.detail === "catalogo-comercial" || resolvedNavigation.detail === "catalogo-comercial-produtos") && <CommerceCatalogPanel enabled={aiCommerceEnabled} onOpenProduct={(id) => navigate(`/catalogo-comercial/produtos/${encodeURIComponent(id)}`)} />}
              {activePage === "comercial" && resolvedNavigation.detail?.startsWith("catalogo-comercial-produto:") && <CommerceCatalogPanel enabled={aiCommerceEnabled} productId={Number(resolvedNavigation.detail.split(":")[1])} onBack={() => navigate("/catalogo-comercial/produtos")} />}
              {activePage === "comercial" && resolvedNavigation.detail === "ia-comercial" && <CommerceSettingsPanel enabled={aiCommerceEnabled} />}
              {activePage === "comercial" && !resolvedNavigation.detail && (
                <DashboardControlCenter
                  clients={clients}
                  summary={dashboardSummary}
                  summaryLoadState={dashboardSummaryLoadState}
                  clientsLoadState={clientsLoadState}
                  isAuthorized={authSession !== null}
                  money={money}
                  getRisk={getRisk}
                  onCreateClient={() => setCreating({ ...emptyClient })}
                  setSelectedId={handleSelectClient}
                  onOpenRiskClients={() => {
                    applySmartFilter("risk");
                    handleSetActivePage("clientes");
                  }}
                  onOpenBusiness={openKanbanBusiness}
                  onOpenProposals={() => {
                    applySmartFilter("proposal");
                    handleSetActivePage("clientes");
                  }}
                  onRetry={() => setBackendLoadRequest((current) => current + 1)}
                />
              )}

              {activePage === "agenda" && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyDashboardAgendaPanel
                    clients={clients}
                    createRequestKey={agendaCreateRequestKey}
                    todayRequestKey={agendaTodayRequestKey}
                    initialFollowUpId={agendaFollowUpId}
                    initialFollowUpRequestKey={agendaFollowUpRequestKey}
                    onTodayRequestHandled={() => setAgendaTodayRequestKey(0)}
                    onSelectClient={handleSelectClient}
                  />
                </Suspense>
              )}

              {activePage === "estoque" && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyStockControlPanel detail={resolvedNavigation.detail} />
                </Suspense>
              )}

              {activePage === "integracoes" && canManageIntegrations && !isWhatsAppIntegrationDetail && (
                <Suspense fallback={<LoadingState rows={3} />}>
                  <LazyIntegrationStatusBoard onUnauthorized={onLogout} />
                </Suspense>
              )}
              {activePage === "integracoes" && canManageIntegrations && !isWhatsAppIntegrationDetail && siteLeadCaptureEnabled && (
                <Suspense fallback={<LoadingState rows={3} />}>
                  <LazyDashboardSiteLeadIntegrationPanel />
                </Suspense>
              )}
              {activePage === "integracoes" && canManageIntegrations && !isWhatsAppIntegrationDetail && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyDashboardIntegrationsPanel initialBlingNotice={blingReturnMessage} />
                </Suspense>
              )}
              {isWhatsAppIntegrationDetail && canManageIntegrations && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyWhatsAppConnectionPanel
                    onBack={() => navigate(getDashboardPath("integracoes"))}
                    onUnauthorized={onLogout}
                  />
                </Suspense>
              )}

              {usingNegociosKanban && authSession && (
                <DashboardNegociosKanbanPanel
                  authSession={authSession}
                  initialBusinessId={kanbanBusinessId}
                  initialProposalId={kanbanProposalId}
                  onInitialBusinessHandled={consumeKanbanBusinessTarget}
                  onOpenAgenda={() => handleSetActivePage("agenda")}
                  onToast={setToast}
                />
              )}

              {!negociosKanbanEnabled && <DashboardKanbanBoard
                key={`kanban-${kanbanStageRequest.key}`}
                activePage={activePage}
                initialStageGroup={kanbanStageRequest.group}
                clients={clients}
                kanbanClients={kanbanClients}
                totalClients={clientPagination.total}
                loadedPage={clientPagination.page}
                kanbanOwnerFilter={kanbanOwnerFilter}
                kanbanEnterpriseStats={kanbanEnterpriseStats}
                statusList={statusList}
                dragOverStatus={dragOverStatus}
                isDraggingKanban={isDraggingKanban}
                selectedId={selectedId}
                money={money}
                initials={initials}
                leadOwner={leadOwner}
                getLeadScore={getLeadScore}
                getRisk={getRisk}
                forecastLabel={forecastLabel}
                idleLabel={idleLabel}
                activitySignalLabel={activitySignalLabel}
                actionIntensity={actionIntensity}
                slaLabel={slaLabel}
                priorityLabel={priorityLabel}
                smartCardBorderClass={smartCardBorderClass}
                stageGuidance={stageGuidance}
                kanbanHeaderClass={kanbanHeaderClass}
                setSelectedId={handleSelectClient}
                setDragOverStatus={setDragOverStatus}
                setIsDraggingKanban={setIsDraggingKanban}
                changeStatus={changeStatus}
              />}

              {activePage === "automacoes" && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyDashboardAutomationsPanel />
                </Suspense>
              )}
              {activePage === "platformTenants" && isPlatformOperator && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyDashboardPlatformObservabilityPanel />
                </Suspense>
              )}
              {activePage === "platformTenants" && isPlatformOperator && (
                <Suspense fallback={<LoadingState rows={4} />}>
                  <LazyDashboardPlatformTenantsPanel />
                </Suspense>
              )}
            </div>

            {activePage !== "estoque" && activePage !== "integracoes" && activePage !== "platformTenants" && activePage !== "leads" && activePage !== "inbox" && activePage !== "usuarios" && activePage !== "perfil" && !usingNegociosKanban && customerDrawer}
          </section>}
          </main>
        </div>
      </div>

      {editing && (
        <ClientModal title={editing.archived ? "Cliente arquivado" : "Editar cliente"} client={editing} setClient={setEditing} onClose={() => setEditing(null)} onSave={saveEdit} onArchive={canManageLeads && !editing.archived ? () => archiveClient(editing.id) : undefined} onRestore={canManageLeads && editing.archived ? async () => { await restoreClient(editing); setBackendLoadRequest((current) => current + 1); } : undefined} onDelete={canManageLeads && editing.archived ? () => deleteClient(editing.id) : undefined} saveLabel="Salvar alterações" showDelete={canManageLeads && Boolean(editing.archived)} />
      )}

      {creating && (
        <ClientModal
          title="Novo cliente"
          client={creating}
          setClient={setCreating}
          onClose={() => setCreating(null)}
          onSave={createClient}
          saveLabel="Criar cliente"
        />
      )}

      <DashboardToast toast={toast} onClose={() => setToast("")} />

      <WhatsappExternalConfirmDialog
        request={whatsappExternalRequest}
        onClose={() => setWhatsappExternalRequest(null)}
      />
    </div>
  );
}

function blingErrorMessage(reason: string) {
  const normalized = reason.trim().toLowerCase();
  if (normalized === "configuracao") return "Não foi possível concluir a conexão com o Bling. Revise a configuração do conector.";
  if (normalized === "autorizacao") return "Não foi possível concluir a conexão com o Bling. A autorização não foi finalizada.";
  if (normalized === "state") return "Não foi possível concluir a conexão com o Bling. A autorização expirou ou é inválida.";
  if (normalized === "token") return "Não foi possível concluir a conexão com o Bling. Tente iniciar a conexão novamente.";
  return "Não foi possível concluir a conexão com o Bling.";
}
