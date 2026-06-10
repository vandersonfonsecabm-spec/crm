import { Download, Flame, RotateCcw, Search, SlidersHorizontal, Star, X } from "lucide-react";
import type { ActivePage, KanbanOwner, SortBy, Status } from "../../types/dashboard";

type DashboardOperationalSearchProps = {
  activePage: ActivePage;
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
    <section className="saas-panel mt-4 rounded-2xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/55 text-slate-300">
            <SlidersHorizontal size={15} />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200">
              {activePage === "clientes" ? "Filtro da carteira" : "Busca operacional"}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {filteredClientsCount} encontrados - {activeFiltersCount} filtro(s) ativo(s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <span className="saas-chip rounded-full px-2 py-1 text-[10px] text-sky-100">
              filtros ativos
            </span>
          )}

          <button
            onClick={exportCsv}
            className="saas-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-300"
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[280px] flex-[1_1_420px] items-center gap-2 rounded-xl border border-slate-500/16 bg-slate-950/35 px-3 py-2 transition focus-within:border-teal-300/28 focus-within:bg-slate-900/70">
          <Search size={14} className="text-slate-500" />

          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar cliente, empresa, telefone, email ou tag..."
            className="w-full select-text bg-transparent text-sm outline-none placeholder:text-slate-600"
          />

          {search.trim() && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
              title="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as Status | "Todos");
            setPage(1);
          }}
          className="rounded-xl border border-slate-500/16 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-400/24"
        >
          <option value="Todos">Todos os status</option>
          {statusList.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortBy)}
          className="rounded-xl border border-slate-500/16 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-400/24"
        >
          <option value="score">Score</option>
          <option value="value">Maior valor</option>
          <option value="name">Nome</option>
          <option value="status">Status</option>
        </select>

        {activePage === "kanban" && (
          <select
            value={kanbanOwnerFilter}
            onChange={(event) => setKanbanOwnerFilter(event.target.value as KanbanOwner)}
            className="rounded-xl border border-slate-500/16 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-400/24"
          >
            <option value="Todos">Todos vendedores</option>
            <option value="Ana">Ana</option>
            <option value="Marco">Marco</option>
            <option value="Bia">Bia</option>
            <option value="Time">Time</option>
          </select>
        )}

        <button
          onClick={() => setOnlyFavorites((value) => !value)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${
            onlyFavorites
              ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
              : "border-slate-500/16 bg-slate-950/30 text-slate-300 hover:border-slate-400/24 hover:bg-slate-900/70"
          }`}
        >
          <Star size={13} />
          Favoritos
        </button>

        <button
          onClick={() => setOnlyHot((value) => !value)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${
            onlyHot
              ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
              : "border-slate-500/16 bg-slate-950/30 text-slate-300 hover:border-slate-400/24 hover:bg-slate-900/70"
          }`}
        >
          <Flame size={13} />
          Quentes
        </button>

        <button
          onClick={clearFilters}
          className="saas-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-300"
        >
          <RotateCcw size={14} />
          Limpar
        </button>
      </div>
    </section>
  );
}
