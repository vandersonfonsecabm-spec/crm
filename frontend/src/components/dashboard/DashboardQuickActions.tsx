import type { ReactNode } from "react";
import { Download, KanbanSquare, Plus, Users } from "lucide-react";

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
        className="rounded-xl border border-slate-500/16 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-300 transition-all duration-200 hover:border-teal-200/18 hover:bg-slate-900/70 hover:text-slate-100"
        title="Esc fecha menus. Ctrl+K abre busca global."
        type="button"
      >
        A&ccedil;&otilde;es
      </button>

      {isOpen && (
        <div className="saas-panel absolute right-0 top-11 z-[140] w-56 rounded-2xl p-2 shadow-2xl shadow-black/45">
          <ActionItem icon={<Plus size={14} />} label="Novo cliente" onClick={onCreateClient} />
          <ActionItem icon={<Users size={14} />} label="Ir para clientes" onClick={onGoToClients} />
          <ActionItem icon={<KanbanSquare size={14} />} label="Abrir Kanban" onClick={onGoToKanban} />
          <ActionItem icon={<Download size={14} />} label="Exportar CSV" onClick={onExportCsv} />

          <div className="saas-card mt-2 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-400">Atalhos</p>
            <p className="mt-1 text-[10px] text-slate-600">Ctrl+K busca global | Esc fecha menus</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-slate-100"
      type="button"
    >
      <span className="text-slate-500">{icon}</span>
      {label}
    </button>
  );
}
