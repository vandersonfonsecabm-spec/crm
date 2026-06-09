import { useEffect, useMemo, useState } from "react";
import {
  actionIntensity,
  activitySignalLabel,
  customerFitLabel,
  enterpriseHealthClass,
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
import DashboardMetricsSection from "../components/dashboard/DashboardMetricsSection";
import DashboardHeader from "../components/dashboard/DashboardHeader";
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
import DashboardToast from "../components/dashboard/DashboardToast";
import useDashboardAnalytics from "../hooks/useDashboardAnalytics";
import useDashboardActions from "../hooks/useDashboardActions";
import { fetchClientesFromBackend } from "../services/crmApi";

import { emptyClient, loadClients, statusList } from "../data/mockClients";

import type { ActivePage, Client, KanbanOwner, SortBy, Status } from "../types/dashboard";

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>(loadClients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "Todos">("Todos");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [onlySilent, setOnlySilent] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [kanbanOwnerFilter, setKanbanOwnerFilter] = useState<KanbanOwner>("Todos");
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [isDraggingKanban, setIsDraggingKanban] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState<Client | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagText, setTagText] = useState("");
  const [page, setPage] = useState(1);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const [isBooting, setIsBooting] = useState(true);
  const [dataSource, setDataSource] = useState<"offline" | "backend">("offline");

  const pageSize = 4;

  const pageTitle =
    activePage === "dashboard"
      ? "Visão geral"
      : activePage === "comercial"
        ? "Central comercial"
        : activePage === "clientes"
          ? "Clientes"
          : activePage === "kanban"
            ? "Kanban"
            : activePage === "agenda"
              ? "Agenda"
              : "Automações";

  useEffect(() => {
    if (dataSource === "offline") {
      localStorage.setItem("crm-premium-clients", JSON.stringify(clients));
    }
  }, [clients, dataSource]);

  useEffect(() => {
    let ignore = false;

    async function loadBackendClients() {
      try {
        const backendClients = await fetchClientesFromBackend();
        if (!backendClients || ignore) return;

        setClients(backendClients);
        setSelectedId(backendClients[0]?.id ?? null);
        setDataSource("backend");
      } catch {
        setDataSource("offline");
      }
    }

    void loadBackendClients();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000 * 30);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsBooting(false), 650);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [activePage]);

  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedId) || null, [clients, selectedId]);

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
    dataSource,
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

  if (isBooting) {
    return (
      <div className="min-h-screen bg-[#050812] p-4 text-white">
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
    <div className="premium-shell min-h-screen select-none overflow-x-hidden text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar
          activePage={activePage}
          smartAlerts={smartAlerts}
          recentActivities={recentActivities}
          emptyClient={emptyClient}
          setActivePage={setActivePage}
          setOnlyHot={setOnlyHot}
          setStatusFilter={setStatusFilter}
          setCreating={setCreating}
          exportCsv={exportCsv}
          clearFilters={clearFilters}
          applySmartFilter={applySmartFilter}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-4 xl:px-5">
          <DashboardTopbar
            clients={clients}
            currentTime={currentTime}
            showQuickActions={showQuickActions}
            emptyClient={emptyClient}
            setSelectedId={setSelectedId}
            setActivePage={setActivePage}
            setShowQuickActions={setShowQuickActions}
            setCreating={setCreating}
            exportCsv={exportCsv}
          />

          <DashboardHeader
            activePage={activePage}
            pageTitle={pageTitle}
            onCreateClient={() => setCreating({ ...emptyClient })}
          />

          {activePage === "dashboard" && (
            <DashboardMetrics analytics={analytics} money={money} />
          )}

          {activePage === "dashboard" && (
            <DashboardPortfolioInsights
              clients={clients}
              money={money}
              getPriority={getPriority}
              getRisk={getRisk}
              getLeadScore={getLeadScore}
              enterpriseHealthClass={enterpriseHealthClass}
              enterpriseHealthLabel={enterpriseHealthLabel}
              onSelectClient={setSelectedId}
              onOpenClient={(clientId) => {
                setSelectedId(clientId);
                setActivePage("clientes");
              }}
            />
          )}

          <DashboardMetricsSection
            activePage={activePage}
            clients={clients}
            kanbanClients={kanbanClients}
            getRisk={getRisk}
          />

          {activePage !== "comercial" && activePage !== "dashboard" && activePage !== "agenda" && (
            <DashboardOperationalSearch
              activePage={activePage}
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

          <section
            className={`mt-4 ${
              activePage === "comercial"
                ? "space-y-4"
                : activePage === "agenda"
                  ? "space-y-4"
                : activePage === "dashboard"
                  ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
                  : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
            }`}
          >
            <div className="space-y-4">
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
                    getPriority={getPriority}
                    getRisk={getRisk}
                    getLeadScore={getLeadScore}
                    forecastLabel={forecastLabel}
                    idleLabel={idleLabel}
                    onSelectClient={setSelectedId}
                    onToggleFavorite={toggleFavorite}
                    onToggleHot={toggleHot}
                    onEditClient={setEditing}
                    onCopyText={copyText}
                    whatsappMessage={whatsappMessage}
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
                    onSelectClient={setSelectedId}
                  />
                </>
              )}
              {activePage === "dashboard" && (
                <DashboardFollowUpCalendar
                  todayFollowUps={analytics.todayFollowUps}
                  followUpAgenda={followUpAgenda}
                  money={money}
                  statusClass={statusClass}
                  onSelectClient={(clientId) => {
                    setSelectedId(clientId);
                    setActivePage("clientes");
                  }}
                />
              )}

              {activePage === "comercial" && (
                <DashboardControlCenter
                  clients={clients}
                  analytics={analytics}
                  smartAlerts={smartAlerts}
                  recentActivities={recentActivities}
                  emptyClient={emptyClient}
                  money={money}
                  statusClass={statusClass}
                  getPriority={getPriority}
                  getLeadScore={getLeadScore}
                  setSelectedId={setSelectedId}
                  setActivePage={setActivePage}
                  setCreating={setCreating}
                  applySmartFilter={applySmartFilter}
                />
              )}

              {activePage === "agenda" && (
                <DashboardAgendaPanel
                  clients={clients}
                  followUpAgenda={followUpAgenda}
                  recentActivities={recentActivities}
                  smartAlerts={smartAlerts}
                  money={money}
                  statusClass={statusClass}
                  onSelectClient={(clientId) => {
                    setSelectedId(clientId);
                    setActivePage("clientes");
                  }}
                  onApplySmartFilter={applySmartFilter}
                />
              )}

              <DashboardKanbanBoard
                activePage={activePage}
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
                setSelectedId={setSelectedId}
                setDragOverStatus={setDragOverStatus}
                setIsDraggingKanban={setIsDraggingKanban}
                changeStatus={changeStatus}
              />

              {activePage === "automacoes" && <DashboardAutomationsPanel />}
            </div>

            {activePage !== "comercial" && activePage !== "agenda" && (
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
                onClearSelectedClient={() => setSelectedId(null)}
                onSetNoteText={setNoteText}
                onSetTagText={setTagText}
                onAddNote={addNote}
                onAddTagToSelected={addTagToSelected}
                onRemoveTagFromSelected={removeTagFromSelected}
                onEditClient={setEditing}
                onCopyText={copyText}
                onApplySmartFilter={applySmartFilter}
              />
            )}
          </section>
        </main>
      </div>

      {editing && (
        <ClientModal title="Editar cliente" client={editing} setClient={setEditing} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => deleteClient(editing.id)} saveLabel="Salvar alterações" showDelete />
      )}

      {creating && (
        <ClientModal title="Novo cliente" client={creating} setClient={setCreating} onClose={() => setCreating(null)} onSave={createClient} saveLabel="Criar cliente" />
      )}

      <DashboardToast toast={toast} onClose={() => setToast("")} />
    </div>
  );
}
