import { Bell, Building2, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import DashboardCommandSearch from "./DashboardCommandSearch";
import DashboardQuickActions from "./DashboardQuickActions";
import type { AuthSession } from "../../services/crmApi";
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardTopbarProps = {
  clients: Client[];
  showQuickActions: boolean;
  emptyClient: Client;
  setSelectedId: (clientId: number | null) => void;
  setActivePage: (page: ActivePage) => void;
  setShowQuickActions: (value: boolean | ((current: boolean) => boolean)) => void;
  setCreating: (client: Client | null) => void;
  exportCsv: () => void;
  onLogout: () => void;
  authSession: AuthSession | null;
  canManageIntegrations: boolean;
};

export default function DashboardTopbar({
  clients,
  showQuickActions,
  emptyClient,
  setSelectedId,
  setActivePage,
  setShowQuickActions,
  setCreating,
  exportCsv,
  onLogout,
  authSession,
  canManageIntegrations,
}: DashboardTopbarProps) {
  return (
    <header className="topbar-shell sticky top-0 z-40 flex h-16 items-center border-b px-5 lg:px-7">
      <div className="topbar-content mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
        <div className="min-w-0 lg:w-[220px]">
          <p className="hidden text-[11px] font-medium text-slate-500 lg:block">Área de trabalho</p>
        </div>

        <DashboardCommandSearch
          clients={clients}
          onSelectClient={setSelectedId}
          onSetActivePage={setActivePage}
          onCloseQuickActions={() => setShowQuickActions(false)}
          canManageIntegrations={canManageIntegrations}
        />

        <div className="flex min-w-0 items-center justify-end gap-1.5 lg:w-[220px]">
          <DashboardQuickActions
            isOpen={showQuickActions}
            onToggle={() => setShowQuickActions((value) => !value)}
            onClose={() => setShowQuickActions(false)}
            onCreateClient={() => {
              setCreating({ ...emptyClient });
              setShowQuickActions(false);
            }}
            onGoToClients={() => {
              setActivePage("clientes");
              setShowQuickActions(false);
            }}
            onGoToKanban={() => {
              setActivePage("kanban");
              setShowQuickActions(false);
            }}
            onExportCsv={() => {
              exportCsv();
              setShowQuickActions(false);
            }}
          />

          <button
            aria-label="Notificações"
            className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md"
            title="Notificações"
            type="button"
          >
            <Bell size={16} />
          </button>

          <UserMenu authSession={authSession} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ authSession, onLogout }: { authSession: AuthSession | null; onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = authSession?.usuario.nome || "Usuário local";
  const roleLabel = getRoleLabel(authSession?.papel ?? authSession?.usuario.papel, authSession?.isDemo);
  const companyName = authSession?.empresa?.nome || (authSession?.isDemo ? "Ambiente de demonstração" : "CRM Agro SaaS");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Abrir menu do usuário"
        className="topbar-user-button flex h-9 items-center gap-2 rounded-md px-1.5 pr-2"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="user-avatar flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold">
          {getInitials(displayName)}
        </span>
        <span className="hidden max-w-[116px] truncate text-[11px] font-medium xl:block">{displayName}</span>
        <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="user-menu absolute right-0 top-11 z-[240] w-64 rounded-lg border p-2 shadow-lg" role="menu">
          <div className="border-b px-2.5 pb-3 pt-2">
            <p className="truncate text-[12px] font-semibold">{displayName}</p>
            <p className="mt-0.5 truncate text-[10px] text-slate-500">{roleLabel}</p>
          </div>

          <div className="my-1 flex items-start gap-2.5 rounded-md px-2.5 py-2.5">
            <Building2 size={14} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500">Empresa</p>
              <p className="truncate text-[11px] font-medium">{companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[11px] text-slate-500">
            <ShieldCheck size={14} />
            <span>Sessão protegida</span>
          </div>

          <button
            className="user-menu-logout mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] font-medium"
            onClick={onLogout}
            role="menuitem"
            type="button"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}

function getRoleLabel(role?: string, isDemo?: boolean) {
  if (isDemo) return "Demonstração";
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    GERENTE: "Gerente",
    VENDEDOR: "Vendedor",
  };
  return role ? labels[role] ?? role : "Operador";
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : words[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}
