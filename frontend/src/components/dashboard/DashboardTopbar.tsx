import DashboardCommandSearch from "./DashboardCommandSearch";
import DashboardQuickActions from "./DashboardQuickActions";
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
}: DashboardTopbarProps) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/[0.07] px-2.5 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />

          <span className="text-[10px] font-semibold text-emerald-100">
            Operação estável
          </span>
        </div>

        <div className="hidden h-4 w-px bg-white/10 md:block" />

        <p className="hidden text-[11px] text-slate-500 md:block">
          CRM Agro SaaS • Consistência Visual
        </p>

        <span className="hidden rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] text-slate-400 lg:inline-flex">
          v1 refinamento
        </span>
      </div>

      <div className="flex items-center gap-2">
        <DashboardCommandSearch
          clients={clients}
          onSelectClient={setSelectedId}
          onSetActivePage={setActivePage}
          onCloseQuickActions={() => setShowQuickActions(false)}
        />

        <div className="hidden rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 lg:block">
          <p className="text-[10px] text-slate-500">Agora</p>
          <p className="text-[11px] font-semibold">{currentTime}</p>
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

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">
            MA
          </div>

          <div className="hidden md:block">
            <p className="text-[11px] font-medium">Marco Admin</p>
            <p className="text-[10px] text-slate-500">Administrador</p>
          </div>
        </div>
      </div>
    </div>
  );
}
