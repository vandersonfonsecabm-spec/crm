import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Download, KanbanSquare, Plus, Users } from "lucide-react";

type DashboardQuickActionsProps = {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCreateClient: () => void;
  onGoToClients: () => void;
  onGoToKanban: () => void;
  onExportCsv: () => void;
};

export default function DashboardQuickActions({
  isOpen,
  onToggle,
  onClose,
  onCreateClient,
  onGoToClients,
  onGoToKanban,
  onExportCsv,
}: DashboardQuickActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (isOpen && !menuRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative z-[180]">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Abrir ações rápidas"
        onClick={onToggle}
        className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md"
        title="Esc fecha menus. Ctrl+K abre busca global."
        type="button"
      >
        <Plus size={16} />
      </button>

      {isOpen && (
        <div className="quick-actions-menu absolute right-0 top-11 z-[240] w-56 rounded-lg border p-2 shadow-lg" role="menu">
          <ActionItem icon={<Plus size={14} />} label="Novo cliente" onClick={onCreateClient} />
          <ActionItem icon={<Users size={14} />} label="Ir para carteira" onClick={onGoToClients} />
          <ActionItem icon={<KanbanSquare size={14} />} label="Abrir funil" onClick={onGoToKanban} />
          <ActionItem icon={<Download size={14} />} label="Exportar CSV" onClick={onExportCsv} />

          <div className="quick-actions-hint mt-2 rounded-md border px-3 py-2">
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
      className="quick-action-item flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-medium"
      role="menuitem"
      type="button"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-500">{icon}</span>
      {label}
    </button>
  );
}
