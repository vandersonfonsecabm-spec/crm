import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardClientsTable from "../../src/components/dashboard/DashboardClientsTable";
import DashboardCustomerDrawer from "../../src/components/dashboard/DashboardCustomerDrawer";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import DashboardOperationalSearch from "../../src/components/dashboard/DashboardOperationalSearch";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { emptyClient, statusList } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { Analytics, Client, Status } from "../../src/types/dashboard";

function localDate(offset: number, hour: number) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString();
}

const clients: Client[] = [
  {
    ...emptyClient,
    id: 801,
    name: "Cooperativa Horizonte",
    company: "Conta local sintética",
    city: "Rondonópolis",
    state: "MT",
    phone: "(66) 99999-1001",
    email: "contato@horizonte.test",
    status: "Proposta",
    favorite: true,
    hot: true,
    lastContactDays: 9,
    nextFollowUp: localDate(-1, 15),
    tags: ["Safra", "Prioritário"],
    notes: [{ id: 1, text: "Nota local de referência", date: "2026-08-09" }],
  },
  {
    ...emptyClient,
    id: 802,
    name: "Fazenda Aurora",
    company: "Conta local sintética",
    city: "Sorriso",
    state: "MT",
    phone: "(66) 99999-1002",
    email: "contato@aurora.test",
    status: "Contato",
    lastContactDays: 1,
    nextFollowUp: localDate(0, 11),
    tags: ["Visita"],
  },
  {
    ...emptyClient,
    id: 803,
    name: "Grupo Campo Alto",
    company: "Conta local sintética",
    city: "Rio Verde",
    state: "GO",
    phone: "(64) 99999-1003",
    email: "contato@campoalto.test",
    status: "Novo",
    lastContactDays: 0,
    nextFollowUp: localDate(3, 14),
    tags: [],
  },
];

const analytics: Analytics = {
  totalValue: 0,
  wonValue: 0,
  forecastValue: 0,
  hotCount: 1,
  averageScore: 0,
  todayFollowUps: 1,
};

const noOp = () => undefined;
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };
const setSearch = (value: string) => { void value; };
const setStatus = (value: Status | "Todos") => { void value; };
const setSort = (value: "score" | "value" | "name" | "status") => { void value; };
const setBoolean = (callback: (value: boolean) => boolean) => { void callback; };
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const statusClass = (status: Status) => status === "Proposta" ? "border-[var(--warning-border)] bg-[var(--warning-subtle)] text-[var(--warning)]" : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]";
const tagClass = () => "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]";

const pageActions = [
  { label: "Exportar página atual", onClick: noOp },
  { label: "Clientes em risco", onClick: noOp },
  { label: "Propostas abertas", onClick: noOp },
  { label: "Clientes sem contato", onClick: noOp },
  { label: "Resetar visão", onClick: noOp },
];

export function CompositionalLote5ClientesFixture() {
  const selectedClient = clients[0];
  // O padrão preserva o drawer visível para a referência visual; ?drawer=0
  // libera a tabela e a toolbar para a QA focal de ações de overflow.
  const isDrawerOpen = new URLSearchParams(window.location.search).get("drawer") !== "0";

  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="5" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="clientes"
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled={false}
          setActivePage={noOp}
        />

        <div className="crm-main min-w-0">
          <DashboardTopbar
            authSession={null}
            canManageIntegrations={false}
            emptyClient={emptyClient}
            exportCsv={noOp}
            leadsCommunicationEnabled={false}
            onLogout={noOp}
            onOpenProfile={noOp}
            readOnly
            setActivePage={noOp}
            setCreating={noOp}
            setSelectedId={noOp}
            setShowQuickActions={setQuickActions}
            showQuickActions={false}
          />

          <main className="crm-content min-h-0 flex-1 overflow-y-auto" aria-label="Referência local de Clientes">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-7">
              <DashboardHeader
                actions={pageActions}
                actionsPlacement="toolbar"
                activePage="clientes"
                backendCaption="3 clientes encontrados"
                compact
                onCreateClient={noOp}
                pageTitle="Clientes"
                showBackendCaption={false}
              />

              <DashboardOperationalSearch
                activeFiltersCount={2}
                activePage="clientes"
                clearFilters={noOp}
                exportCsv={noOp}
                filteredClientsCount={clients.length}
                kanbanOwnerFilter="Todos"
                metadata="3 clientes encontrados"
                onlyFavorites
                onlyHot
                pageActions={pageActions}
                search=""
                setKanbanOwnerFilter={noOp}
                setOnlyFavorites={setBoolean}
                setOnlyHot={setBoolean}
                setPage={noOp}
                setSearch={setSearch}
                setSortBy={setSort}
                setStatusFilter={setStatus}
                sortBy="score"
                statusFilter="Todos"
                statusList={statusList}
              />

              <section className="mt-3" aria-label="Tabela operacional de clientes">
                <DashboardClientsTable
                  filteredClientsCount={clients.length}
                  getRisk={(client) => client.id === selectedClient.id ? "Alto" : "Baixo"}
                  initials={initials}
                  onNextPage={noOp}
                  onPreviousPage={noOp}
                  onRequestWhatsapp={noOp}
                  onSelectClient={noOp}
                  onToggleFavorite={noOp}
                  onToggleHot={noOp}
                  page={1}
                  paginatedClients={clients}
                  selectedId={selectedClient.id}
                  statusClass={statusClass}
                  totalPages={1}
                />
              </section>
            </div>
          </main>
        </div>
      </div>

      <DashboardCustomerDrawer
        activePage="clientes"
        analytics={analytics}
        clients={clients}
        focusSession={{ token: 1 }}
        getLeadScore={() => 0}
        getRisk={(client) => client.id === selectedClient.id ? "Alto" : "Baixo"}
        initials={initials}
        isFocusSessionActive={() => true}
        money={(value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        nextActionLabel={() => ""}
        noteText=""
        onAddNote={noOp}
        onAddTagToSelected={noOp}
        onApplySmartFilter={noOp}
        onClearSelectedClient={noOp}
        onCopyText={noOp}
        onEditClient={noOp}
        onFocusSessionSettled={noOp}
        onNavigateContext={noOp}
        onRemoveTagFromSelected={noOp}
        onRequestFocusSessionClose={noOp}
        onRequestWhatsapp={noOp}
        onSetNoteText={noOp}
        onSetTagText={noOp}
        onUnauthorized={noOp}
        open={isDrawerOpen}
        overlay={isDrawerOpen}
        priorityLabel={() => ""}
        selectedClient={selectedClient}
        slaLabel={() => ""}
        statusClass={statusClass}
        tagClass={tagClass}
        tagText=""
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote5ClientesFixture /></MemoryRouter>);
