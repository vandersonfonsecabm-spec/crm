import { LogOut, ShieldCheck } from "lucide-react";
import DashboardCommandSearch from "./DashboardCommandSearch";
import DashboardQuickActions from "./DashboardQuickActions";
import type { AuthSession } from "../../services/crmApi";
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardTopbarProps = {
  clients: Client[];
  currentTime: string;
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
  currentTime,
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
  const displayName = authSession?.usuario.nome || "Usuario Local";
  const roleLabel = getRoleLabel(authSession?.papel ?? authSession?.usuario.papel, authSession?.isDemo);
  const userInitials = getInitials(displayName);
  const companyName = authSession?.empresa?.nome;
  const caption = companyName && !authSession?.isDemo ? `${roleLabel} - ${companyName}` : roleLabel;

  return (
    <div className="topbar-shell relative z-30 mb-5 flex min-h-14 items-center justify-between overflow-visible border-b px-1 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="workspace-status hidden h-8 w-8 shrink-0 items-center justify-center rounded-md md:flex">
          <ShieldCheck size={15} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="hidden truncate text-xs font-semibold text-slate-100 md:block">
              Área de trabalho
            </p>

            <span className="workspace-online flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Ativo
            </span>
          </div>

          <p className="hidden truncate text-[10px] text-slate-500 lg:block">
            Operação comercial e dados da empresa
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <DashboardCommandSearch
          clients={clients}
          onSelectClient={setSelectedId}
          onSetActivePage={setActivePage}
          onCloseQuickActions={() => setShowQuickActions(false)}
          canManageIntegrations={canManageIntegrations}
        />

        <div className="topbar-time hidden rounded-md px-3 py-1.5 lg:block">
          <p className="text-[10px] text-slate-500">Agora</p>
          <p className="text-[11px] font-semibold text-slate-100">{currentTime}</p>
        </div>

        <DashboardQuickActions
          isOpen={showQuickActions}
          onToggle={() => setShowQuickActions((value) => !value)}
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

        <div className="topbar-user flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="user-avatar flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold">
            {userInitials}
          </div>

          <div className="hidden min-w-0 md:block">
            <p className="max-w-[130px] truncate text-[11px] font-medium text-slate-100 xl:max-w-[150px]">
              {displayName}
            </p>
            <p className="max-w-[130px] truncate text-[10px] text-slate-500 xl:max-w-[170px]">
              {caption}
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="topbar-logout inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold"
          title="Sair da conta"
          type="button"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Sair</span>
        </button>
      </div>
    </div>
  );
}

function getRoleLabel(role?: string, isDemo?: boolean) {
  if (isDemo) return "Demonstracao";

  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    GERENTE: "Gerente",
    VENDEDOR: "Vendedor",
  };

  return role ? labels[role] ?? role : "Operador";
}

function getInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "U";

  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : words[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}
