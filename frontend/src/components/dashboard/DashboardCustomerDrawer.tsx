import { X } from "lucide-react";
import type { ActivePage, Analytics, Client, SmartFilterType, Status } from "../../types/dashboard";
import DashboardCommercialDecisionCenter from "./DashboardCommercialDecisionCenter";
import { EmptyDecisionState } from "./DashboardDrawerPrimitives";
import DashboardExecutiveRadar from "./DashboardExecutiveRadar";
import DashboardSelectedClientPanel from "./DashboardSelectedClientPanel";

type DashboardCustomerDrawerProps = {
  activePage: ActivePage;
  selectedClient: Client | null;
  noteText: string;
  tagText: string;
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  tagClass: (tag: string) => string;
  customerFitLabel: (client: Client) => string;
  leadOwner: (client: Client) => string;
  nextActionLabel: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  whatsappMessage: (client: Client) => string;
  onClearSelectedClient: () => void;
  onSetNoteText: (value: string) => void;
  onSetTagText: (value: string) => void;
  onAddNote: () => void;
  onAddTagToSelected: () => void;
  onRemoveTagFromSelected: (tag: string) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
};

function drawerShellClass(activePage: ActivePage) {
  const base =
    "min-h-0 w-full min-w-0 shrink-0 self-start space-y-3 overflow-y-auto overscroll-contain pb-10 pr-1 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)]";

  if (activePage === "kanban") {
    return `${base} [scrollbar-width:thin]`;
  }

  if (activePage === "clientes") {
    return `${base} [scrollbar-width:thin]`;
  }

  return `${base} [scrollbar-width:thin]`;
}

export default function DashboardCustomerDrawer({
  activePage,
  selectedClient,
  noteText,
  tagText,
  clients,
  analytics,
  money,
  initials,
  statusClass,
  tagClass,
  customerFitLabel,
  leadOwner,
  nextActionLabel,
  getLeadScore,
  getRisk,
  slaLabel,
  priorityLabel,
  whatsappMessage,
  onClearSelectedClient,
  onSetNoteText,
  onSetTagText,
  onAddNote,
  onAddTagToSelected,
  onRemoveTagFromSelected,
  onEditClient,
  onCopyText,
  onApplySmartFilter,
}: DashboardCustomerDrawerProps) {
  if (activePage === "automacoes") {
    return null;
  }

  if (activePage === "kanban") {
    return (
      <aside key={`${activePage}-${selectedClient?.id ?? "empty"}`} className={drawerShellClass(activePage)}>
        <DashboardCommercialDecisionCenter
          selectedClient={selectedClient}
          clients={clients}
          analytics={analytics}
          money={money}
          statusClass={statusClass}
          getLeadScore={getLeadScore}
          getRisk={getRisk}
          slaLabel={slaLabel}
          priorityLabel={priorityLabel}
          nextActionLabel={nextActionLabel}
          whatsappMessage={whatsappMessage}
          onEditClient={onEditClient}
          onCopyText={onCopyText}
          onApplySmartFilter={onApplySmartFilter}
          mode="kanban"
        />
      </aside>
    );
  }

  return (
    <aside key={`${activePage}-${selectedClient?.id ?? "empty"}`} className={drawerShellClass(activePage)}>
      <div className="saas-panel rounded-2xl">
        <div className="border-b border-slate-700/40 bg-slate-950/18 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Central de decisão</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Dados, ação e histórico do cliente em um só lugar.</p>
            </div>

            {selectedClient && (
              <button
                onClick={onClearSelectedClient}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {selectedClient ? (
          <DashboardSelectedClientPanel
            selectedClient={selectedClient}
            noteText={noteText}
            tagText={tagText}
            money={money}
            initials={initials}
            statusClass={statusClass}
            tagClass={tagClass}
            customerFitLabel={customerFitLabel}
            leadOwner={leadOwner}
            nextActionLabel={nextActionLabel}
            getLeadScore={getLeadScore}
            getRisk={getRisk}
            slaLabel={slaLabel}
            whatsappMessage={whatsappMessage}
            onSetNoteText={onSetNoteText}
            onSetTagText={onSetTagText}
            onAddNote={onAddNote}
            onAddTagToSelected={onAddTagToSelected}
            onRemoveTagFromSelected={onRemoveTagFromSelected}
            onEditClient={onEditClient}
            onCopyText={onCopyText}
          />
        ) : (
          <EmptyDecisionState />
        )}
      </div>

      {!selectedClient && (
        <DashboardExecutiveRadar
          clients={clients}
          analytics={analytics}
          money={money}
          getRisk={getRisk}
          onApplySmartFilter={onApplySmartFilter}
        />
      )}
    </aside>
  );
}
