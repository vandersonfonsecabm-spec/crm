import { Building2, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import DashboardCommandSearch from "./DashboardCommandSearch";
import DashboardNotifications from "./DashboardNotifications";
import DashboardQuickActions from "./DashboardQuickActions";
import type { AuthSession, NotificationTargetKind } from "../../services/crmApi";
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardTopbarProps = {
  showQuickActions: boolean;
  emptyClient: Client;
  setSelectedId: (clientId: number | null) => void;
  setActivePage: (page: ActivePage) => void;
  setShowQuickActions: (value: boolean | ((current: boolean) => boolean)) => void;
  setCreating: (client: Client | null) => void;
  exportCsv: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  authSession: AuthSession | null;
  canManageIntegrations: boolean;
  leadsCommunicationEnabled: boolean;
  onOpenNotificationTarget: (target: { tipo: NotificationTargetKind; id: number; rota: string }) => void;
  canManageNotifications: boolean;
  readOnly?: boolean;
};

export default function DashboardTopbar({
  showQuickActions,
  emptyClient,
  setSelectedId,
  setActivePage,
  setShowQuickActions,
  setCreating,
  exportCsv,
  onLogout,
  onOpenProfile,
  authSession,
  canManageIntegrations,
  leadsCommunicationEnabled,
  onOpenNotificationTarget,
  canManageNotifications,
  readOnly = false,
}: DashboardTopbarProps) {
  return (
    <header className="topbar-shell sticky top-0 z-40 flex h-[52px] items-center border-b px-5 lg:px-7">
      <div className="topbar-content relative mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
        <div className="topbar-search-container flex min-w-0 flex-1 md:absolute md:left-1/2 md:w-[min(46vw,520px)] md:-translate-x-1/2">
          <DashboardCommandSearch
            onSelectClient={setSelectedId}
            onSetActivePage={setActivePage}
            onCloseQuickActions={() => setShowQuickActions(false)}
            canManageIntegrations={canManageIntegrations}
            leadsCommunicationEnabled={leadsCommunicationEnabled}
            readOnly={readOnly}
          />
        </div>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
          {!readOnly && (
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
          )}

          {!readOnly && <DashboardNotifications canManage={canManageNotifications} onOpenTarget={onOpenNotificationTarget} />}

          <UserMenu authSession={authSession} onLogout={onLogout} onOpenProfile={onOpenProfile} readOnly={readOnly} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ authSession, onLogout, onOpenProfile, readOnly = false }: { authSession: AuthSession | null; onLogout: () => void; onOpenProfile: () => void; readOnly?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const displayName = authSession?.usuario.nome || "Usuário";
  const userEmail = authSession?.usuario.email;
  const roleLabel = getRoleLabel(authSession?.papel ?? authSession?.usuario.papel);
  const companyName = authSession?.empresa?.nome || "CRM Agro SaaS";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) menuItemsRef.current[0]?.focus({ preventScroll: true });
  }, [isOpen]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const current = document.activeElement as HTMLButtonElement | null;
    const index = current ? items.indexOf(current) : -1;
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }
    if (!items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown"
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus({ preventScroll: true });
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus({ preventScroll: true });
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        aria-expanded={readOnly ? false : isOpen}
        aria-haspopup="menu"
        aria-label={readOnly ? "Menu do usuário indisponível na fixture" : "Abrir menu do usuário"}
        className="topbar-user-button flex h-11 items-center gap-2 rounded-md px-1.5 pr-2"
        onClick={() => setIsOpen((current) => !current)}
        ref={buttonRef}
        disabled={readOnly}
        type="button"
      >
        <span className="user-avatar flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold">
          {getInitials(displayName)}
        </span>
        <span className="hidden max-w-[116px] truncate text-[11px] font-medium xl:block">{displayName}</span>
        <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && !readOnly && (
        <div id="crm-user-menu" className="user-menu absolute right-0 top-11 z-[240] w-64 rounded-lg border p-2 shadow-lg" onKeyDown={handleMenuKeyDown} role="menu" aria-label="Menu do usuário">
          <div className="border-b px-2.5 pb-3 pt-2">
            <p className="truncate text-[12px] font-semibold">{displayName}</p>
            {userEmail && <p className="mt-0.5 truncate text-[11px] text-slate-500">{userEmail}</p>}
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{roleLabel}</p>
          </div>

          <div className="my-1 flex items-start gap-2.5 rounded-md px-2.5 py-2.5">
            <Building2 size={14} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">Empresa</p>
              <p className="truncate text-[11px] font-medium">{companyName}</p>
            </div>
          </div>

          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              onOpenProfile();
              setIsOpen(false);
            }}
            ref={(element) => { menuItemsRef.current[0] = element; }}
            role="menuitem"
            type="button"
          >
            <ShieldCheck size={14} />
            Meu perfil e segurança
          </button>

          <button
            className="user-menu-logout mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] font-medium"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
            ref={(element) => { menuItemsRef.current[1] = element; }}
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

function getRoleLabel(role?: string) {
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
