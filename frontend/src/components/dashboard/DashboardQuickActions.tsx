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
    <div className="relative">
      <button
        onClick={onToggle}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07]"
        title="Esc fecha menus. Ctrl+K abre busca global."
      >
        Ações
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-40 w-48 rounded-2xl border border-white/10 bg-[#0d111a] p-2 shadow-2xl">
          <button
            onClick={onCreateClient}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/10"
          >
            Novo cliente
          </button>

          <button
            onClick={onGoToClients}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/10"
          >
            Ir para clientes
          </button>

          <button
            onClick={onGoToKanban}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/10"
          >
            Abrir Kanban
          </button>

          <button
            onClick={onExportCsv}
            className="w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/10"
          >
            Exportar CSV
          </button>

          <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-400">Atalhos</p>
            <p className="mt-1 text-[10px] text-slate-600">Ctrl+K busca • Esc fecha menus</p>
          </div>
        </div>
      )}
    </div>
  );
}
