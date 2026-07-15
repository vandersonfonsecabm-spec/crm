import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ActivePage, Analytics, Client, SmartFilterType, Status } from "../../types/dashboard";
import { IconButton } from "../ui";
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
  onRequestWhatsapp: (client: Client) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
  overlay?: boolean;
  open?: boolean;
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
  onRequestWhatsapp,
  onApplySmartFilter,
  overlay = false,
  open = false,
}: DashboardCustomerDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!overlay || !open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timeout = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClearSelectedClient();
      if (event.key !== "Tab") return;
      const focusable = overlayDrawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClearSelectedClient, open, overlay]);

  const overlayTitle = activePage === "clientes"
    ? "Detalhes do cliente"
    : activePage === "kanban"
      ? "Detalhes da oportunidade"
      : "Central de decisão";
  const overlayDescription = activePage === "kanban"
    ? "Oportunidade, próxima ação e histórico comercial."
    : "Dados, ação e histórico do cliente.";

  if (activePage === "automacoes") {
    return null;
  }

  if (overlay) {
    if (!open || !selectedClient) return null;
    return (
      <div className="fixed inset-0 z-[220] flex justify-end" role="presentation">
        <button aria-label={`Fechar ${overlayTitle.toLowerCase()}`} className="absolute inset-0 cursor-default bg-[var(--overlay-backdrop)]" onClick={onClearSelectedClient} tabIndex={-1} type="button" />
        <aside
          aria-labelledby="customer-decision-title"
          aria-modal="true"
          className="relative h-full w-[min(440px,calc(100vw-24px))] overflow-y-auto border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl"
          ref={overlayDrawerRef}
          role="dialog"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]" id="customer-decision-title">{overlayTitle}</h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{overlayDescription}</p>
            </div>
            <IconButton aria-label={`Fechar ${overlayTitle.toLowerCase()}`} onClick={onClearSelectedClient} ref={closeButtonRef}><X size={15} /></IconButton>
          </div>
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
            onRequestWhatsapp={onRequestWhatsapp}
          />
        </aside>
      </div>
    );
  }

  if (activePage === "kanban") {
    return (
      <aside key={`${activePage}-${selectedClient?.id ?? "empty"}`} className={`${drawerShellClass(activePage)} decision-drawer-shell`}>
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
          onEditClient={onEditClient}
          onCopyText={onCopyText}
          onRequestWhatsapp={onRequestWhatsapp}
          onApplySmartFilter={onApplySmartFilter}
          mode="kanban"
        />
      </aside>
    );
  }

  return (
    <aside key={`${activePage}-${selectedClient?.id ?? "empty"}`} className={`${drawerShellClass(activePage)} decision-drawer-shell`}>
      <div className="saas-panel decision-drawer rounded-lg">
        <div className="border-b border-slate-700/40 bg-slate-950/18 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Central de decisão</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Dados, ação e histórico do cliente em um só lugar.</p>
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
            onRequestWhatsapp={onRequestWhatsapp}
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
