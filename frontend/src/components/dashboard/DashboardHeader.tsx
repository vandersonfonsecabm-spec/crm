import { Bell, Plus } from "lucide-react";
import type { ActivePage } from "../../types/dashboard";

type DashboardHeaderProps = {
  activePage: ActivePage;
  pageTitle: string;
  backendCaption: string;
  onCreateClient: () => void;
  showCreateClient?: boolean;
};

export default function DashboardHeader({
  activePage,
  pageTitle,
  backendCaption,
  onCreateClient,
  showCreateClient = true,
}: DashboardHeaderProps) {
  const breadcrumbLabel = {
    dashboard: "Visão Geral",
    comercial: "Central Comercial",
    clientes: "Carteira",
    kanban: "Funil Comercial",
    agenda: "Agenda",
    estoque: "Estoque",
    integracoes: "Integrações",
    automacoes: "Automações",
  }[activePage];

  return (
    <header className="mb-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span>CRM</span>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">{breadcrumbLabel}</span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Opera&ccedil;&atilde;o comercial
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal text-slate-50">
            {pageTitle}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-xl border border-slate-500/14 bg-slate-950/28 px-3 py-2 text-[10px] font-semibold text-slate-400 sm:inline-flex">
            {backendCaption}
          </span>

          <button
            className="premium-ghost rounded-xl p-2 text-slate-300 transition hover:border-teal-200/18 hover:bg-teal-300/[0.055] hover:text-white"
            type="button"
          >
            <Bell size={15} />
          </button>

          {showCreateClient && (
            <button
              onClick={onCreateClient}
              className="premium-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-px hover:brightness-105"
              type="button"
            >
              <Plus size={14} />
              Novo cliente
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
