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

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Operação comercial</p>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-white/10 bg-white/5 p-2">
            <Bell size={15} />
          </button>

          <button
            onClick={onCreateClient}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black transition-all duration-200 hover:scale-[1.01] hover:bg-slate-100"
          >
            <Plus size={14} />
            Novo cliente
          </button>
        </div>
      </div>
    </header>
  );
}
