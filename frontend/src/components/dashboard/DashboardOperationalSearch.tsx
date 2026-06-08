import { ArrowUpDown, Download, Search, X } from "lucide-react";
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
    <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-200">Busca operacional</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {filteredClientsCount} clientes encontrados • {activeFiltersCount} filtro(s) ativo(s)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-200">
              Filtros ativos
            </span>
          )}

          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition-all duration-200 focus-within:border-white/25 focus-within:bg-white/[0.06]">
          <Search size={14} className="text-slate-500" />

          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por cliente, empresa, telefone, email ou tag..."
            className="w-full select-text bg-transparent text-sm outline-none placeholder:text-slate-500"
          />

          {search.trim() && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as Status | "Todos"); setPage(1); }} className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none">
          <option value="Todos">Todos os status</option>
          {statusList.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>

        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none">
          <option value="score">Ordenar por score</option>
          <option value="value">Ordenar por valor</option>
          <option value="name">Ordenar por nome</option>
          <option value="status">Ordenar por status</option>
        </select>

        {activePage === "kanban" && (
          <select
            value={kanbanOwnerFilter}
            onChange={(event) => setKanbanOwnerFilter(event.target.value as KanbanOwner)}
            className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none"
          >
            <option value="Todos">Todos os vendedores</option>
            <option value="Ana">Ana</option>
            <option value="Marco">Marco</option>
            <option value="Bia">Bia</option>
            <option value="Time">Time</option>
          </select>
        )}

        <button onClick={() => setOnlyFavorites((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${onlyFavorites ? "border-amber-300/30 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.08)]" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"}`}>
          Favoritos
        </button>

        <button onClick={() => setOnlyHot((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${onlyHot ? "border-rose-300/30 bg-rose-400/10 text-rose-100 shadow-[0_0_18px_rgba(251,113,133,0.08)]" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"}`}>
          Quentes
        </button>

        <button onClick={clearFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
          <ArrowUpDown size={14} />
          Limpar
        </button>
      </div>
    </section>
  );
}
