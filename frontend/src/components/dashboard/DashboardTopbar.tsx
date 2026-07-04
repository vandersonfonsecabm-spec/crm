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
}: DashboardTopbarProps) {
  const displayName = authSession?.usuario.nome || "Usuario Local";
  const roleLabel = getRoleLabel(authSession?.papel ?? authSession?.usuario.papel, authSession?.isDemo);
  const userInitials = getInitials(displayName);
  const companyName = authSession?.empresa?.nome;
  const caption = companyName && !authSession?.isDemo ? `${roleLabel} - ${companyName}` : roleLabel;

  return (
    <div className="premium-panel topbar-shell relative z-30 mb-4 flex items-center justify-between overflow-visible rounded-2xl px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-teal-200/16 bg-teal-300/[0.055] text-teal-100 md:flex">
          <ShieldCheck size={15} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="hidden truncate text-xs font-semibold text-slate-100 md:block">
              Central Comercial
            </p>

            <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/16 bg-emerald-300/[0.055] px-2 py-0.5 text-[10px] font-semibold text-emerald-50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Ativo
            </span>
          </div>

          <p className="hidden truncate text-[10px] text-slate-500 lg:block">
            Funil, carteira e agenda em uma visão unificada
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <DashboardCommandSearch
          clients={clients}
          onSelectClient={setSelectedId}
          onSetActivePage={setActivePage}
          onCloseQuickActions={() => setShowQuickActions(false)}
        />

        <div className="premium-ghost hidden rounded-xl px-3 py-1.5 lg:block">
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

        <div className="premium-ghost flex items-center gap-2 rounded-xl px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-950 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
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
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-600/26 bg-slate-950/24 px-2.5 text-[10px] font-semibold text-slate-400 transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-100"
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
