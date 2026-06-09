type DashboardQuickActionsProps = {
  isOpen: boolean;
  onToggle: () => void;
  onCreateClient: () => void;
  onGoToClients: () => void;
  onGoToKanban: () => void;
  onExportCsv: () => void;
};

export default function DashboardQuickActions({
  isOpen,
  onToggle,
  onCreateClient,
  onGoToClients,
  onGoToKanban,
  onExportCsv,
}: DashboardQuickActionsProps) {
  return (
    <div className="relative z-50">
      <button
        onClick={onToggle}
        className="rounded-xl border border-slate-500/16 bg-slate-900/55 px-3 py-2 text-[11px] text-slate-300 transition-all duration-200 hover:border-teal-300/20 hover:bg-slate-800/70 hover:text-slate-100"
        title="Esc fecha menus. Ctrl+K abre busca global."
      >
        Ações
      </button>

      {isOpen && (
        <div className="saas-panel absolute right-0 top-11 z-[120] w-52 rounded-2xl p-2 shadow-2xl shadow-black/45">
          <button
            onClick={onCreateClient}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
          >
            Novo cliente
          </button>

          <button
            onClick={onGoToClients}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
          >
            Ir para clientes
          </button>

          <button
            onClick={onGoToKanban}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
          >
            Abrir Kanban
          </button>

          <button
            onClick={onExportCsv}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-slate-800/70 hover:text-slate-100"
          >
            Exportar CSV
          </button>

          <div className="saas-card mt-2 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-400">Atalhos</p>
            <p className="mt-1 text-[10px] text-slate-600">Ctrl+K busca • Esc fecha menus</p>
          </div>
        </div>
      )}
    </div>
  );
}
