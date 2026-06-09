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
    <div className="identity-panel mb-4 flex items-center justify-between rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/[0.10] px-2.5 py-1 shadow-[0_0_22px_rgba(185,242,39,0.10)]">
          <div className="h-1.5 w-1.5 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(185,242,39,0.75)]" />

          <span className="text-[10px] font-semibold text-lime-50">
            Operação estável
          </span>
        </div>

        <div className="hidden h-4 w-px bg-white/10 md:block" />

        <p className="hidden text-[11px] text-slate-500 md:block">
          CRM Agro SaaS • Consistência Visual
        </p>

        <span className="hidden rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[10px] text-amber-100/90 lg:inline-flex">
          command skin
        </span>
      </div>

      <div className="flex items-center gap-2">
        <DashboardCommandSearch
          clients={clients}
          onSelectClient={setSelectedId}
          onSetActivePage={setActivePage}
          onCloseQuickActions={() => setShowQuickActions(false)}
        />

        <div className="premium-ghost hidden rounded-xl px-3 py-1.5 lg:block">
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

        <div className="premium-ghost flex items-center gap-2 rounded-xl px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-[11px] font-bold text-slate-950 shadow-[0_0_18px_rgba(255,255,255,0.12)]">
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
