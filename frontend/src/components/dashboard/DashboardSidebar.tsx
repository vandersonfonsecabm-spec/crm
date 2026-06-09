import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  KanbanSquare,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import DashboardSmartAlerts from "./DashboardSmartAlerts";
import type { ActivePage, Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";

type DashboardSidebarProps = {
  activePage: ActivePage;
  smartAlerts: string[];
  recentActivities: RecentActivity[];
  emptyClient: Client;
  setActivePage: (page: ActivePage) => void;
  setOnlyHot: (value: boolean) => void;
  setStatusFilter: (status: Status | "Todos") => void;
  setCreating: (client: Client) => void;
  exportCsv: () => void;
  clearFilters: () => void;
  applySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardSidebar({
  activePage,
  smartAlerts,
  recentActivities,
  emptyClient,
  setActivePage,
  setOnlyHot,
  setStatusFilter,
  setCreating,
  exportCsv,
  clearFilters,
  applySmartFilter,
}: DashboardSidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 overflow-hidden border-r border-white/[0.06] bg-white/[0.03] p-4 lg:block">
      <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-black">
            <Sparkles size={16} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">CRM Enterprise</p>
            <p className="truncate text-[11px] text-slate-500">Operação comercial</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5">
          <span className="text-[10px] text-emerald-200/80">Ambiente</span>
          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-100">
            estável
          </span>
        </div>
      </div>

      <nav className="space-y-4">
        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>

          <div className="grid gap-1.5">
            <SidebarButton
              active={activePage === "dashboard"}
              icon={<BarChart3 size={15} className="mr-2 shrink-0" />}
              label="Dashboard"
              onClick={() => setActivePage("dashboard")}
            />

            <SidebarButton
              active={activePage === "comercial"}
              icon={<BriefcaseBusiness size={15} className="mr-2 shrink-0" />}
              label="Comercial"
              onClick={() => setActivePage("comercial")}
            />

            <SidebarButton
              active={activePage === "clientes"}
              icon={<Users size={15} className="mr-2 shrink-0" />}
              label="Clientes"
              onClick={() => setActivePage("clientes")}
            />

            <SidebarButton
              active={activePage === "kanban"}
              icon={<KanbanSquare size={15} className="mr-2 shrink-0" />}
              label="Kanban"
              onClick={() => setActivePage("kanban")}
            />

            <SidebarButton
              active={activePage === "agenda"}
              icon={<CalendarCheck size={15} className="mr-2 shrink-0" />}
              label="Agenda"
              onClick={() => setActivePage("agenda")}
            />
          </div>
        </div>

        <div className="border-t border-white/5 pt-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Inteligência
          </p>

          <div className="grid gap-1.5">
            <SidebarButton
              active={activePage === "automacoes"}
              icon={<Zap size={15} className="mr-2 shrink-0" />}
              label="Automações"
              onClick={() => setActivePage("automacoes")}
            />
          </div>
        </div>
      </nav>

      <div className="mx-auto mt-6 w-full max-w-[208px] rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
        <p className="text-xs font-semibold">Atalhos operacionais</p>

        <div className="mt-3 space-y-2">
          {activePage === "dashboard" && (
            <>
              <ActionButton onClick={() => setOnlyHot(true)} label="Clientes quentes" />
              <ActionButton onClick={() => setStatusFilter("Proposta")} label="Propostas abertas" />
            </>
          )}

          {activePage === "comercial" && (
            <>
              <ActionButton onClick={() => setOnlyHot(true)} label="Fila quente" />
              <ActionButton onClick={() => setStatusFilter("Proposta")} label="Focar propostas" />
            </>
          )}

          {activePage === "clientes" && (
            <>
              <ActionButton onClick={() => setCreating({ ...emptyClient })} label="Novo cliente" />
              <ActionButton onClick={exportCsv} label="Exportar clientes" />
            </>
          )}

          {activePage === "kanban" && (
            <>
              <ActionButton onClick={() => setOnlyHot(true)} label="Leads quentes" />
              <ActionButton onClick={() => setStatusFilter("Proposta")} label="Focar propostas" />
            </>
          )}

          {activePage === "agenda" && (
            <>
              <ActionButton onClick={() => applySmartFilter("silent")} label="Sem contato" />
              <ActionButton onClick={() => applySmartFilter("proposal")} label="Propostas hoje" />
            </>
          )}

          {activePage === "automacoes" && (
            <>
              <ActionButton label="Criar regra" />
              <ActionButton label="Ver templates" />
            </>
          )}

          <ActionButton onClick={clearFilters} label="Resetar visão" />
        </div>
      </div>

      {activePage !== "automacoes" && activePage !== "dashboard" && (
        <>
          <DashboardSmartAlerts
            smartAlerts={smartAlerts}
            onApplySmartFilter={applySmartFilter}
          />

          {activePage === "clientes" && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
              <p className="text-xs font-semibold">Atividades recentes</p>

              <div className="mt-3 space-y-2">
                {recentActivities.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-semibold text-slate-300">
                      Sem atividades registradas
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      As notas criadas no painel do cliente aparecem aqui como histórico rápido.
                    </p>
                  </div>
                )}

                {recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10"
                  >
                    <p className="text-[11px] text-slate-200">{activity.client}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">
                      {activity.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activePage === "automacoes" && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
          <p className="text-xs font-semibold">Status operacional</p>

          <div className="mt-3 space-y-2">
            <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
              <p className="text-[11px] text-slate-200">Automações frontend</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Base pronta para regras comerciais.
              </p>
            </div>

            <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
              <p className="text-[11px] text-slate-200">Próxima fase</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Conectar ações com backend e banco real.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative mx-auto box-border flex h-10 w-[208px] shrink-0 items-center rounded-xl border border-white/[0.08] px-3 pr-9 text-left text-sm leading-none transition-colors duration-200 ${
        active
          ? "bg-white/[0.115] text-white ring-1 ring-inset ring-white/70"
          : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.055]"
      }`}
    >
      {icon}
      <span className="block min-w-0 flex-1 truncate">{label}</span>
      <span
        className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
          active ? "bg-white" : "bg-white/15"
        }`}
      />
    </button>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]"
    >
      {label}
    </button>
  );
}
