import { Download, Flame, RotateCcw, Search, SlidersHorizontal, Star, X } from "lucide-react";
import type { ActivePage, KanbanOwner, SortBy, Status } from "../../types/dashboard";
import { Button, FilterBar, Select, Surface, Toolbar } from "../ui";

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
}: DashboardOperationalSearchProps) {
  if (activePage === "automacoes") return null;

  return (
    <Surface className="mt-3 overflow-hidden">
      <Toolbar className="border-b border-[var(--border-default)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--icon-default)]">
            <SlidersHorizontal size={15} />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {activePage === "clientes" ? "Filtro da carteira" : "Busca operacional"}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {filteredClientsCount} encontrados · {activeFiltersCount > 0 ? `${activeFiltersCount} filtro(s) ativo(s)` : "Sem filtros ativos"}{metadata ? ` · ${metadata}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            leftIcon={<Download size={14} />}
            onClick={exportCsv}
            size="sm"
            variant="secondary"
          >
            CSV
          </Button>
        </div>
      </Toolbar>

      <FilterBar className="border-0 bg-transparent p-3 shadow-none">
        <div
          className={`flex h-9 min-w-[280px] items-center gap-2 rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] px-3 transition-colors hover:border-[var(--control-border-hover)] focus-within:border-[var(--control-border-focus)] focus-within:ring-2 focus-within:ring-[var(--control-ring)] ${
            activePage === "kanban" ? "flex-[1_1_280px]" : "flex-[1_1_380px]"
          }`}
        >
          <Search size={14} className="text-[var(--icon-muted)]" />

          <input
            aria-label="Buscar clientes"
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

        <Select
          className="min-w-[120px]"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortBy)}
          aria-label="Ordenar clientes"
        >
          <option value="score">Score</option>
          <option value="value">Maior valor</option>
          <option value="name">Nome</option>
          <option value="status">Status</option>
        </Select>

        {activePage === "kanban" && (
          <Select
            className="min-w-[150px]"
            value={kanbanOwnerFilter}
            onChange={(event) => setKanbanOwnerFilter(event.target.value as KanbanOwner)}
            aria-label="Filtrar por responsável"
          >
            <option value="Todos">Todos vendedores</option>
            <option value="Ana">Ana</option>
            <option value="Marco">Marco</option>
            <option value="Bia">Bia</option>
            <option value="Time">Time</option>
          </Select>
        )}

        <Button
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((value) => !value)}
          className={onlyFavorites ? "border-[var(--filter-active-border)] bg-[var(--filter-active-bg)] text-[var(--filter-active-text)]" : ""}
          leftIcon={<Star size={13} />}
          size="sm"
          variant="secondary"
        >
          Favoritos
        </Button>

        <Button
          aria-pressed={onlyHot}
          onClick={() => setOnlyHot((value) => !value)}
          className={onlyHot ? "border-amber-300 bg-amber-50 text-amber-800" : ""}
          leftIcon={<Flame size={13} />}
          size="sm"
          variant="secondary"
        >
          Quentes
        </Button>

        {activeFiltersCount > 0 && (
          <Button
            leftIcon={<RotateCcw size={14} />}
            onClick={clearFilters}
            size="sm"
            variant="ghost"
          >
            Limpar filtros
          </Button>
        )}
      </FilterBar>
    </Surface>
  );
}
