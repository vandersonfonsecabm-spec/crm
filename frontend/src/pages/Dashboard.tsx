import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  actionIntensity,
  activitySignalLabel,
  customerFitLabel,
  enterpriseHealthLabel,
  forecastLabel,
  getLeadScore,
  getPriority,
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
import DashboardMetrics from "../components/dashboard/DashboardMetrics";
import DashboardContextToolbar from "../components/dashboard/DashboardContextToolbar";
import DashboardMetricsSection from "../components/dashboard/DashboardMetricsSection";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import type { PageAction } from "../components/dashboard/DashboardHeader";
import DashboardPortfolioInsights from "../components/dashboard/DashboardPortfolioInsights";
import DashboardClientsTable from "../components/dashboard/DashboardClientsTable";
import DashboardClientsInsights from "../components/dashboard/DashboardClientsInsights";
import ClientModal from "../components/dashboard/ClientModal";
import DashboardFollowUpCalendar from "../components/dashboard/DashboardFollowUpCalendar";
import DashboardCustomerDrawer from "../components/dashboard/DashboardCustomerDrawer";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardTopbar from "../components/dashboard/DashboardTopbar";
import DashboardOperationalSearch from "../components/dashboard/DashboardOperationalSearch";
import DashboardControlCenter from "../components/dashboard/DashboardControlCenter";
import DashboardKanbanBoard from "../components/dashboard/DashboardKanbanBoard";
import DashboardAutomationsPanel from "../components/dashboard/DashboardAutomationsPanel";
import DashboardAgendaPanel from "../components/dashboard/DashboardAgendaPanel";
import DashboardInventoryPanel from "../components/dashboard/DashboardInventoryPanel";
import DashboardIntegrationsPanel from "../components/dashboard/DashboardIntegrationsPanel";
import DashboardInboxPanel from "../components/leads-communication/DashboardInboxPanel";
import DashboardLeadsPanel from "../components/leads-communication/DashboardLeadsPanel";
import DashboardToast from "../components/dashboard/DashboardToast";
import WhatsappExternalConfirmDialog from "../components/dashboard/WhatsappExternalConfirmDialog";
import type { WhatsappExternalRequest } from "../components/dashboard/WhatsappExternalConfirmDialog";
import useDashboardAnalytics from "../hooks/useDashboardAnalytics";
import useDashboardActions from "../hooks/useDashboardActions";
import { canAccessIntegrations, clearAuthSession, fetchAuthMe, fetchClientesFromBackend, fetchDashboardSummaryFromBackend, getAuthSession } from "../services/crmApi";
import type { ApiDashboardSummary, AuthSession } from "../services/crmApi";
import { isLeadsCommunicationEnabled } from "../config/featureFlags";
import { EmptyState } from "../components/ui";
import { LockKeyhole } from "lucide-react";

import { emptyClient, statusList } from "../data/clientDefaults";

import type { ActivePage, Client, KanbanOwner, SortBy, Status } from "../types/dashboard";
import {
  getDashboardPath,
  normalizeDashboardPathname,
  resolveDashboardPathname,
} from "../navigation/dashboardNavigation";

type DashboardProps = {
  onLogout: () => void;
};

export default function Dashboard({ onLogout }: DashboardProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedNavigation = resolveDashboardPathname(location.pathname);
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
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [dashboardSummary, setDashboardSummary] = useState<ApiDashboardSummary | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getAuthSession());
  const [whatsappExternalRequest, setWhatsappExternalRequest] = useState<WhatsappExternalRequest | null>(null);
  const [blingReturnMessage, setBlingReturnMessage] = useState("");
  const [agendaCreateRequestKey, setAgendaCreateRequestKey] = useState(0);
  const [agendaTodayRequestKey, setAgendaTodayRequestKey] = useState(0);
  const [kanbanStageRequest, setKanbanStageRequest] = useState<{ group: "pipeline" | "resultado"; key: number }>({ group: "pipeline", key: 0 });
  const [leadsCreateRequestKey, setLeadsCreateRequestKey] = useState(0);
  const [inboxConversationId, setInboxConversationId] = useState<number | null>(null);
  const canManageIntegrations = canAccessIntegrations(authSession);
  const leadsCommunicationEnabled = isLeadsCommunicationEnabled();
  const canManageLeads = ["ADMIN", "GERENTE"].includes(authSession?.papel ?? authSession?.usuario.papel ?? "");
  const requestedActivePage = resolvedNavigation.page;
  const activePage = requestedActivePage === "integracoes" && !canManageIntegrations ? "dashboard" : requestedActivePage;

  const pageSize = 4;

  const handleSelectClient = useCallback((clientId: number | null) => {
    setSelectedId(clientId);
    if (clientId !== null && ["dashboard", "comercial", "clientes", "kanban", "agenda"].includes(requestedActivePage)) {
      setIsCustomerDrawerOpen(true);
    }
  }, [requestedActivePage]);

  const handleCloseCustomerDrawer = useCallback(() => {
    setIsCustomerDrawerOpen(false);
  }, []);

  const pageTitle = ({
    dashboard: "Visão Geral",
    comercial: "Central Comercial",
    inbox: "Caixa de Entrada",
    leads: "Leads",
    clientes: "Clientes",
    kanban: "Negócios",
    agenda: "Agenda",
    estoque: "Estoque",
    integracoes: "Integrações e Dados",
    automacoes: "Automações",
  } satisfies Record<ActivePage, string>)[activePage];

  useEffect(() => {
    let ignore = false;

    async function loadBackendClients() {
      const savedSession = getAuthSession();
      setAuthSession(savedSession);

      try {
        const refreshedSession = await fetchAuthMe();
        if (!ignore) setAuthSession(refreshedSession);

        const backendClients = await fetchClientesFromBackend();
        if (ignore) return;
        if (!backendClients) throw new Error("Dados indisponiveis.");

        setClients(backendClients);
        setSelectedId(backendClients[0]?.id ?? null);

        try {
          const summary = await fetchDashboardSummaryFromBackend();
          if (!ignore) setDashboardSummary(summary);
        } catch {
          if (!ignore) setDashboardSummary(null);
        }
      } catch {
        if (ignore) return;
        clearAuthSession();
        onLogout();
      }
    }

    void loadBackendClients();

    return () => {
      ignore = true;
    };
  }, [onLogout]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsBooting(false), 650);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [activePage]);


  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedId) || null, [clients, selectedId]);
  const priorityClient = useMemo(() => {
    return [...clients]
      .filter((client) => client.hot || getPriority(client) === "Alta" || getRisk(client) === "Alto" || client.lastContactDays >= 7)
      .sort((first, second) => priorityWeight(second) - priorityWeight(first))[0] ?? null;
  }, [clients]);

  const filteredClients = useMemo(() => {
    const result = clients.filter((client) => {
      const term = search.toLowerCase();

      const matchSearch =
        client.name.toLowerCase().includes(term) ||
        client.company.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        client.phone.includes(term) ||
        client.tags.some((tag) => tag.toLowerCase().includes(term));

      const matchStatus = statusFilter === "Todos" || client.status === statusFilter;
      const matchFavorite = !onlyFavorites || client.favorite;
      const matchHot = !onlyHot || client.hot;
      const matchRisk = !onlyRisk || getRisk(client) === "Alto";
      const matchSilent = !onlySilent || client.lastContactDays >= 7;

      return matchSearch && matchStatus && matchFavorite && matchHot && matchRisk && matchSilent;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "score") return getLeadScore(b) - getLeadScore(a);
      if (sortBy === "value") return b.value - a.value;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return a.status.localeCompare(b.status);
    });
  }, [clients, onlyFavorites, onlyHot, onlyRisk, onlySilent, search, sortBy, statusFilter]);

  const kanbanClients = useMemo(() => {
    if (kanbanOwnerFilter === "Todos") {
      return filteredClients;
    }

    return filteredClients.filter((client) => leadOwner(client) === kanbanOwnerFilter);
  }, [filteredClients, kanbanOwnerFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const paginatedClients = filteredClients.slice((page - 1) * pageSize, page * pageSize);

  const {
    analytics,
    kanbanEnterpriseStats,
    recentActivities,
    followUpAgenda,
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
  });

  const {
    toast,
    setToast,
    copyText,
    clearFilters,
    toggleFavorite,
    toggleHot,
    changeStatus,
    saveEdit,
    createClient,
    deleteClient,
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

  const handleSetActivePage = useCallback((page: ActivePage) => {
    setIsCustomerDrawerOpen(false);
    if (page === "integracoes" && !canManageIntegrations) {
      setToast("Acesso negado para Integrações.");
      navigate(getDashboardPath("dashboard"), { replace: true });
      return;
    }
    if ((page === "inbox" || page === "leads") && !leadsCommunicationEnabled) {
      setToast("Leads e Caixa de Entrada não estão habilitados neste ambiente.");
      return;
    }

    const pathname = getDashboardPath(page);
    if (normalizeDashboardPathname(location.pathname) !== pathname) {
      navigate(pathname);
    }
  }, [canManageIntegrations, leadsCommunicationEnabled, location.pathname, navigate, setToast]);

  const openInboxConversation = useCallback((conversationId: number) => {
    setInboxConversationId(conversationId);
    handleSetActivePage("inbox");
  }, [handleSetActivePage]);

  useEffect(() => {
    if (!resolvedNavigation.isKnown || resolvedNavigation.needsReplace) {
      navigate(resolvedNavigation.pathname, { replace: true });
      return;
    }

    if (requestedActivePage === "integracoes" && !canManageIntegrations) {
      setToast("Acesso negado para Integrações.");
      navigate(getDashboardPath("dashboard"), { replace: true });
    }
  }, [
    canManageIntegrations,
    navigate,
    requestedActivePage,
    resolvedNavigation.isKnown,
    resolvedNavigation.needsReplace,
    resolvedNavigation.pathname,
    setToast,
  ]);

  const backendCaption = dashboardSummary
    ? `${clients.length} clientes sincronizados`
    : "Dados sincronizados";

  const openKanbanWithStatus = useCallback((nextStatus: Status | "Todos") => {
    clearFilters();
    setStatusFilter(nextStatus);
    setKanbanStageRequest((current) => ({
      group: nextStatus === "Fechado" || nextStatus === "Perdido" ? "resultado" : "pipeline",
      key: current.key + 1,
    }));
    handleSetActivePage("kanban");
  }, [clearFilters, handleSetActivePage]);

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
        { label: "Exportar clientes", onClick: exportCsv },
        riskAction,
        { label: "Propostas abertas", onClick: () => applySmartFilter("proposal") },
        silentAction,
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
  }, [activePage, applySmartFilter, clearFilters, exportCsv, smartAlerts]);

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
    setIsCustomerDrawerOpen(false);
    setEditing({ ...client });
  }, []);

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
      customerFitLabel={customerFitLabel}
      leadOwner={leadOwner}
      nextActionLabel={nextActionLabel}
      getLeadScore={getLeadScore}
      getRisk={getRisk}
      slaLabel={slaLabel}
      priorityLabel={priorityLabel}
      whatsappMessage={whatsappMessage}
      onClearSelectedClient={["dashboard", "comercial", "clientes", "kanban", "agenda"].includes(activePage) ? handleCloseCustomerDrawer : () => setSelectedId(null)}
      onSetNoteText={setNoteText}
      onSetTagText={setTagText}
      onAddNote={addNote}
      onAddTagToSelected={addTagToSelected}
      onRemoveTagFromSelected={removeTagFromSelected}
      onEditClient={handleEditClient}
      onCopyText={copyText}
      onRequestWhatsapp={requestExternalWhatsapp}
      onApplySmartFilter={applySmartFilter}
      overlay={["dashboard", "comercial", "clientes", "kanban", "agenda"].includes(activePage)}
      open={isCustomerDrawerOpen}
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
    <div className="crm-workspace premium-shell min-h-screen select-none overflow-x-hidden">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage={activePage}
          setActivePage={handleSetActivePage}
          authSession={authSession}
          canManageIntegrations={canManageIntegrations}
          leadsCommunicationEnabled={leadsCommunicationEnabled}
        />

        <div className="crm-main min-w-0 flex-1 overflow-x-hidden">
          <DashboardTopbar
            clients={clients}
            showQuickActions={showQuickActions}
            emptyClient={emptyClient}
            setSelectedId={handleSelectClient}
            setActivePage={handleSetActivePage}
            setShowQuickActions={setShowQuickActions}
            setCreating={setCreating}
            exportCsv={exportCsv}
            onLogout={onLogout}
            authSession={authSession}
            canManageIntegrations={canManageIntegrations}
            leadsCommunicationEnabled={leadsCommunicationEnabled}
          />

          <main className="crm-content mx-auto w-full max-w-[1680px] px-5 pb-8 pt-5 lg:px-7">
          <DashboardHeader
            key={activePage}
            activePage={activePage}
            pageTitle={pageTitle}
            backendCaption={
              backendCaption
            }
            onCreateClient={() => setCreating({ ...emptyClient })}
            showCreateClient={activePage !== "estoque" && activePage !== "integracoes" && activePage !== "automacoes" && activePage !== "kanban" && activePage !== "leads" && activePage !== "inbox"}
            showBackendCaption={false}
            compact
            primaryAction={activePage === "agenda" ? { label: "Novo acompanhamento", onClick: () => setAgendaCreateRequestKey((current) => current + 1) } : activePage === "leads" && leadsCommunicationEnabled && canManageLeads ? { label: "Novo Lead", onClick: () => setLeadsCreateRequestKey((current) => current + 1) } : undefined}
            actions={pageActions}
          />

          {activePage === "dashboard" && (
            <section className="dashboard-overview space-y-3" aria-label="Resumo operacional">
              <DashboardContextToolbar
                backendCaption={backendCaption}
                priorityClient={priorityClient}
                money={money}
                onOpenPriority={handleSelectClient}
                onOpenCommercialQueue={() => handleSetActivePage("comercial")}
              />
              <DashboardMetrics
                analytics={analytics}
                money={money}
                onOpenPipeline={() => openKanbanWithStatus("Todos")}
                onOpenWon={() => openKanbanWithStatus("Fechado")}
                onOpenForecast={() => openKanbanWithStatus("Proposta")}
                onOpenTodayAgenda={() => {
                  setAgendaTodayRequestKey((current) => current + 1);
                  handleSetActivePage("agenda");
                }}
              />
            </section>
          )}

          {activePage === "dashboard" && (
            <section className="dashboard-overview-grid mt-3 grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.68fr)_minmax(320px,0.78fr)]">
              <DashboardPortfolioInsights
                clients={clients}
                money={money}
                getPriority={getPriority}
                getRisk={getRisk}
                getLeadScore={getLeadScore}
                enterpriseHealthLabel={enterpriseHealthLabel}
                onOpenClient={handleSelectClient}
                onApplySmartFilter={applySmartFilter}
              />
              <DashboardFollowUpCalendar
                todayFollowUps={analytics.todayFollowUps}
                followUpAgenda={followUpAgenda}
                money={money}
                statusClass={statusClass}
                onSelectClient={handleSelectClient}
              />
              {customerDrawer}
            </section>
          )}

          {activePage !== "agenda" && activePage !== "leads" && activePage !== "inbox" && (
            <DashboardMetricsSection
              activePage={activePage}
              clients={clients}
              kanbanClients={kanbanClients}
              getRisk={getRisk}
            />
          )}

          {activePage !== "comercial" && activePage !== "dashboard" && activePage !== "agenda" && activePage !== "estoque" && activePage !== "integracoes" && activePage !== "leads" && activePage !== "inbox" && (
            <DashboardOperationalSearch
              activePage={activePage}
              metadata={activePage === "clientes" || activePage === "kanban" ? backendCaption : undefined}
              filteredClientsCount={filteredClients.length}
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
            />
          )}

          {activePage !== "dashboard" && <section
            className={`${activePage === "comercial" || activePage === "clientes" || activePage === "kanban" || activePage === "estoque" || activePage === "integracoes" || activePage === "automacoes" ? "mt-3" : "mt-4"} ${
              activePage === "comercial" || activePage === "leads" || activePage === "inbox"
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
            <div className={activePage === "comercial" || activePage === "leads" || activePage === "inbox" || activePage === "clientes" || activePage === "kanban" || activePage === "estoque" || activePage === "integracoes" || activePage === "automacoes" ? "space-y-3" : "space-y-4"}>
              {(activePage === "leads" || activePage === "inbox") && !leadsCommunicationEnabled && (
                <EmptyState description="Este recurso permanece indisponível enquanto a feature flag local estiver desligada." icon={<LockKeyhole size={18} />} title="Recurso não habilitado" />
              )}

              {activePage === "leads" && leadsCommunicationEnabled && authSession && (
                <DashboardLeadsPanel authSession={authSession} clients={clients} createRequestKey={leadsCreateRequestKey} onOpenConversation={openInboxConversation} />
              )}

              {activePage === "inbox" && leadsCommunicationEnabled && authSession && (
                <DashboardInboxPanel authSession={authSession} initialConversationId={inboxConversationId} />
              )}
              {activePage === "clientes" && (
                <>
                  <DashboardClientsTable
                    paginatedClients={paginatedClients}
                    filteredClientsCount={filteredClients.length}
                    selectedId={selectedId}
                    page={page}
                    totalPages={totalPages}
                    money={money}
                    initials={initials}
                    statusClass={statusClass}
                    leadOwner={leadOwner}
                    getPriority={getPriority}
                    getRisk={getRisk}
                    getLeadScore={getLeadScore}
                    forecastLabel={forecastLabel}
                    idleLabel={idleLabel}
                    onSelectClient={handleSelectClient}
                    onToggleFavorite={toggleFavorite}
                    onToggleHot={toggleHot}
                    onEditClient={setEditing}
                    onCopyText={copyText}
                    onRequestWhatsapp={requestExternalWhatsapp}
                    onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
                    onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
                  />

                  <DashboardClientsInsights
                    clients={clients}
                    filteredClients={filteredClients}
                    statusList={statusList}
                    money={money}
                    statusClass={statusClass}
                    getRisk={getRisk}
                    getLeadScore={getLeadScore}
                    onSelectClient={handleSelectClient}
                  />
                </>
              )}
              {activePage === "comercial" && (
                <DashboardControlCenter
                  clients={clients}
                  analytics={analytics}
                  backendCaption={backendCaption}
                  smartAlerts={smartAlerts}
                  recentActivities={recentActivities}
                  emptyClient={emptyClient}
                  money={money}
                  statusClass={statusClass}
                  getPriority={getPriority}
                  getLeadScore={getLeadScore}
                  setSelectedId={handleSelectClient}
                  setCreating={setCreating}
                  applySmartFilter={applySmartFilter}
                />
              )}

              {activePage === "agenda" && (
                <DashboardAgendaPanel
                  clients={clients}
                  backendCaption={backendCaption}
                  createRequestKey={agendaCreateRequestKey}
                  todayRequestKey={agendaTodayRequestKey}
                  followUpAgenda={followUpAgenda}
                  recentActivities={recentActivities}
                  smartAlerts={smartAlerts}
                  money={money}
                  statusClass={statusClass}
                  onSelectClient={handleSelectClient}
                  onApplySmartFilter={applySmartFilter}
                />
              )}

              {activePage === "estoque" && <DashboardInventoryPanel onOpenIntegrations={() => handleSetActivePage("integracoes")} />}

              {activePage === "integracoes" && canManageIntegrations && <DashboardIntegrationsPanel initialBlingNotice={blingReturnMessage} />}

              <DashboardKanbanBoard
                key={`kanban-${kanbanStageRequest.key}`}
                activePage={activePage}
                initialStageGroup={kanbanStageRequest.group}
                clients={clients}
                kanbanClients={kanbanClients}
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
              />

              {activePage === "automacoes" && <DashboardAutomationsPanel />}
            </div>

            {activePage !== "estoque" && activePage !== "integracoes" && activePage !== "leads" && activePage !== "inbox" && customerDrawer}
          </section>}
          </main>
        </div>
      </div>

      {editing && (
        <ClientModal title="Editar cliente" client={editing} setClient={setEditing} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => deleteClient(editing.id)} saveLabel="Salvar alterações" showDelete />
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

function priorityWeight(client: Client) {
  return (getRisk(client) === "Alto" ? 300 : 0)
    + (getPriority(client) === "Alta" ? 200 : 0)
    + (client.hot ? 100 : 0)
    + client.lastContactDays
    + getLeadScore(client);
}
