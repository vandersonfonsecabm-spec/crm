import { Download, RotateCcw, Search, Star, X } from "lucide-react";
import type { ActivePage, KanbanOwner, SortBy, Status } from "../../types/dashboard";
import { Button, FilterBar, Select, Surface } from "../ui";
import DashboardActionOverflow from "./DashboardActionOverflow";
import type { PageAction } from "./DashboardActionOverflow";

type DashboardOperationalSearchProps = {
  activePage: ActivePage;
  metadata?: string;
  filteredClientsCount: number;
  activeFiltersCount: number;
  search: string;
  statusFilter: Status | "Todos";
  statusList: Status[];
  sortBy: SortBy;
  kanbanOwnerFilter: KanbanOwner;
  onlyFavorites: boolean;
  onlyHot: boolean;
  setSearch: (value: string) => void;
  setPage: (value: number) => void;
  setStatusFilter: (value: Status | "Todos") => void;
  setSortBy: (value: SortBy) => void;
  setKanbanOwnerFilter: (value: KanbanOwner) => void;
  setOnlyFavorites: (callback: (value: boolean) => boolean) => void;
  setOnlyHot: (callback: (value: boolean) => boolean) => void;
  exportCsv: () => void;
  clearFilters: () => void;
  showArchived?: boolean;
  setShowArchived?: (value: boolean) => void;
  pageActions?: PageAction[];
};

export default function DashboardOperationalSearch({
  activePage,
  metadata,
  filteredClientsCount,
  activeFiltersCount,
  search,
  statusFilter,
  statusList,
  sortBy,
  kanbanOwnerFilter,
  onlyFavorites,
  onlyHot,
  setSearch,
  setPage,
  setStatusFilter,
  setSortBy,
  setKanbanOwnerFilter,
  setOnlyFavorites,
  setOnlyHot,
  exportCsv,
  clearFilters,
  showArchived = false,
  setShowArchived,
  pageActions = [],
}: DashboardOperationalSearchProps) {
  if (activePage === "automacoes") return null;
  const isClientsPage = activePage === "clientes";
  const toolbarStatus = metadata ?? `${filteredClientsCount} encontrados`;

  return (
    <Surface className={`mt-3 overflow-hidden ${isClientsPage ? "clientes-filters" : ""}`}>
      <FilterBar
        aria-label={`${isClientsPage ? "Buscar e filtrar clientes" : "Buscar e filtrar registros"}: ${toolbarStatus}${activeFiltersCount > 0 ? `, ${activeFiltersCount} filtro(s) ativo(s)` : ""}`}
        className="compositional-local-toolbar border-0 bg-transparent px-3 py-1.5 shadow-none"
      >
        <div
          className={`flex h-9 min-w-0 w-full basis-full items-center gap-2 rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] px-3 transition-colors hover:border-[var(--control-border-hover)] focus-within:border-[var(--control-border-focus)] focus-within:ring-2 focus-within:ring-[var(--control-ring)] sm:min-w-[280px] sm:w-auto sm:basis-auto ${
            activePage === "kanban" ? "flex-[1_1_280px]" : "flex-[1_1_380px]"
          }`}
        >
          <Search size={14} className="text-[var(--icon-muted)]" />

          <input
            aria-label={isClientsPage ? "Buscar clientes" : "Buscar registros"}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar cliente, empresa, telefone, e-mail ou tag..."
            className="w-full select-text bg-transparent text-xs text-[var(--control-text)] outline-none placeholder:text-[var(--control-placeholder)] focus-visible:outline-none"
          />

          {search.trim() && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="rounded-md p-1 text-[var(--icon-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
              title="Limpar busca"
              aria-label="Limpar busca"
              type="button"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Select
          className="min-w-[136px]"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as Status | "Todos");
            setPage(1);
          }}
          aria-label="Filtrar por status"
        >
          <option value="Todos">Todos os status</option>
          {statusList.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>

        {isClientsPage && setShowArchived ? (
          <Select
            className="min-w-[136px]"
            value={showArchived ? "arquivados" : "ativos"}
            onChange={(event) => {
              const archived = event.target.value === "arquivados";
              setShowArchived(archived);
              if (archived) setStatusFilter("Todos");
              setPage(1);
            }}
            aria-label="Exibição de clientes"
          >
            <option value="ativos">Clientes ativos</option>
            <option value="arquivados">Clientes arquivados</option>
          </Select>
        ) : null}

        <Select
          className="min-w-[120px]"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortBy)}
            aria-label={isClientsPage ? "Ordenar clientes" : "Ordenar registros"}
        >
          {isClientsPage ? (
            <>
              <option value="score">Ordem padrão</option>
              <option value="name">Nome</option>
              <option value="status">Status</option>
            </>
          ) : (
            <>
              <option value="score">Score</option>
              <option value="value">Maior valor</option>
              <option value="name">Nome</option>
              <option value="status">Status</option>
            </>
          )}
        </Select>

        {activePage === "kanban" && (
          <Select
            className="min-w-[150px]"
            value={kanbanOwnerFilter}
            onChange={(event) => setKanbanOwnerFilter(event.target.value as KanbanOwner)}
            aria-label="Filtrar por responsável"
          >
            <option value="Todos">Todos vendedores</option>
            <option value="Sem responsável">Sem responsável</option>
          </Select>
        )}

        {!showArchived && <Button
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((value) => !value)}
          className={onlyFavorites ? "border-[var(--filter-active-border)] bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""}
          leftIcon={<Star size={13} />}
          size="md"
          variant="secondary"
        >
          Favoritos
        </Button>}

        {!showArchived && <Button
          aria-pressed={onlyHot}
          onClick={() => setOnlyHot((value) => !value)}
          className={onlyHot ? isClientsPage ? "clientes-filter-hot" : "border-amber-300 bg-amber-50 text-amber-800" : ""}
          size="md"
          variant="secondary"
        >
          Quentes
        </Button>}

        {isClientsPage && pageActions.length > 0 && (
          <DashboardActionOverflow
            actions={pageActions}
            pageTitle="Clientes"
            triggerClassName="clientes-toolbar-more"
            triggerLabel="Mais"
          />
        )}

        {activeFiltersCount > 0 && !isClientsPage && (
          <Button
            leftIcon={<RotateCcw size={14} />}
            onClick={clearFilters}
            size="md"
            variant="ghost"
          >
            Limpar filtros
          </Button>
        )}

        {!isClientsPage && (
          <Button
            leftIcon={<Download size={14} />}
            onClick={exportCsv}
            size="md"
            variant="secondary"
          >
            CSV
          </Button>
        )}
      </FilterBar>
    </Surface>
  );
}
