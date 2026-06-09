import { Bell, Plus } from "lucide-react";
import type { ActivePage } from "../../types/dashboard";

type DashboardHeaderProps = {
  activePage: ActivePage;
  pageTitle: string;
  onCreateClient: () => void;
};

export default function DashboardHeader({
  activePage,
  pageTitle,
  onCreateClient,
}: DashboardHeaderProps) {
  const breadcrumbLabel = {
    dashboard: "Dashboard",
    comercial: "Comercial",
    clientes: "Clientes",
    kanban: "Kanban",
    agenda: "Agenda",
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
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Operação comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-50">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="premium-ghost rounded-xl p-2 text-slate-300 transition hover:border-cyan-200/20 hover:bg-cyan-300/[0.06] hover:text-white">
            <Bell size={15} />
          </button>

          <button
            onClick={onCreateClient}
            className="premium-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-px hover:brightness-105"
          >
            <Plus size={14} />
            Novo cliente
          </button>
        </div>
      </div>
    </header>
  );
}
