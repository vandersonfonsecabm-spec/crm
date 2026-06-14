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
    <div className="relative z-[180]">
      <button
        onClick={onToggle}
        className="rounded-xl border border-slate-400/24 bg-slate-950/45 px-3 py-2 text-[11px] font-semibold text-slate-100 shadow-inner shadow-white/[0.02] transition-all duration-200 hover:border-teal-200/24 hover:bg-slate-900/80"
        title="Esc fecha menus. Ctrl+K abre busca global."
        type="button"
      >
        A&ccedil;&otilde;es
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 z-[240] w-56 rounded-2xl border border-slate-500/18 bg-slate-950/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <ActionItem icon={<Plus size={14} />} label="Novo cliente" onClick={onCreateClient} />
          <ActionItem icon={<Users size={14} />} label="Ir para clientes" onClick={onGoToClients} />
          <ActionItem icon={<KanbanSquare size={14} />} label="Abrir Kanban" onClick={onGoToKanban} />
          <ActionItem icon={<Download size={14} />} label="Exportar CSV" onClick={onExportCsv} />

          <div className="mt-2 rounded-xl border border-slate-500/12 bg-white/[0.035] px-3 py-2">
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
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-slate-100"
      type="button"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-slate-400">{icon}</span>
      {label}
    </button>
  );
}
