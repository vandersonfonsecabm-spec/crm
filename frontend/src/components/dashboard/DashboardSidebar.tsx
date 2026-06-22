import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  KanbanSquare,
  Package,
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
    <aside className="sidebar-shell hidden h-screen w-64 shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-700/45 p-4 pb-6 shadow-[18px_0_54px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:sticky lg:top-0 lg:block">
      <div className="identity-panel mb-5 rounded-2xl p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-300/[0.08] text-teal-100">
            <Sparkles size={16} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">CRM Agro SaaS</p>
            <p className="truncate text-[11px] text-slate-500">Operação comercial</p>
          </div>
        </div>
      </div>

      <nav className="space-y-4">
        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Área de trabalho
          </p>

          <div className="grid gap-1.5">
            <SidebarButton
              active={activePage === "dashboard"}
              icon={<BarChart3 size={15} className="mr-2 shrink-0" />}
              label="Visão Geral"
              onClick={() => setActivePage("dashboard")}
            />

            <SidebarButton
              active={activePage === "comercial"}
              icon={<BriefcaseBusiness size={15} className="mr-2 shrink-0" />}
              label="Central Comercial"
              onClick={() => setActivePage("comercial")}
            />

            <SidebarButton
              active={activePage === "clientes"}
              icon={<Users size={15} className="mr-2 shrink-0" />}
              label="Carteira"
              onClick={() => setActivePage("clientes")}
            />

            <SidebarButton
              active={activePage === "kanban"}
              icon={<KanbanSquare size={15} className="mr-2 shrink-0" />}
              label="Funil Comercial"
              onClick={() => setActivePage("kanban")}
            />

            <SidebarButton
              active={activePage === "agenda"}
              icon={<CalendarCheck size={15} className="mr-2 shrink-0" />}
              label="Agenda"
              onClick={() => setActivePage("agenda")}
            />

            <SidebarButton
              active={activePage === "estoque"}
              icon={<Package size={15} className="mr-2 shrink-0" />}
              label="Estoque"
              onClick={() => setActivePage("estoque")}
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

      {activePage !== "estoque" && (
      <div className="premium-panel mx-auto mt-6 w-full max-w-[224px] rounded-2xl p-3 transition-all duration-200 hover:border-white/20">
        <p className="text-xs font-semibold">Atalhos operacionais</p>

        <div className="mt-3 space-y-2">
          {activePage === "dashboard" && (
            <>
              <ActionButton onClick={() => setOnlyHot(true)} label="Oportunidades quentes" />
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
              <ActionButton onClick={() => setOnlyHot(true)} label="Oportunidades quentes" />
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
              <ActionButton label="Ver modelos" />
            </>
          )}

          <ActionButton onClick={clearFilters} label="Resetar visão" />
        </div>
      </div>
      )}

      {activePage !== "automacoes" && activePage !== "dashboard" && activePage !== "estoque" && (
        <>
          <DashboardSmartAlerts
            smartAlerts={smartAlerts}
            onApplySmartFilter={applySmartFilter}
          />

          {activePage === "clientes" && (
            <div className="premium-panel mt-3 rounded-2xl p-3 transition-all duration-200 hover:border-white/20">
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
        <div className="premium-panel mt-3 rounded-2xl p-3 transition-all duration-200 hover:border-white/20">
          <p className="text-xs font-semibold">Status operacional</p>

          <div className="mt-3 space-y-2">
            <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
              <p className="text-[11px] text-slate-200">Automações</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Regras comerciais prontas para acompanhamento.
              </p>
            </div>

            <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
              <p className="text-[11px] text-slate-200">Operação assistida</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Ações automáticas acompanhadas pelo time comercial.
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
      className={`relative mx-auto box-border flex h-10 w-[224px] shrink-0 items-center rounded-xl border px-3 pr-9 text-left text-sm leading-5 transition-all duration-200 ${
        active
          ? "border-teal-200/25 bg-teal-300/[0.075] text-white shadow-[inset_2px_0_0_rgba(48,201,176,0.42)] ring-1 ring-inset ring-white/10"
          : "border-white/[0.07] bg-white/[0.028] text-slate-300 hover:border-white/14 hover:bg-white/[0.052] hover:text-white"
      }`}
    >
      {icon}
      <span className="block min-w-0 flex-1 truncate leading-5">{label}</span>
      <span
        className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
          active ? "bg-teal-200" : "bg-white/15"
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
      className="box-border h-9 w-full rounded-xl border border-white/[0.07] bg-white/[0.045] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-cyan-200/20 hover:bg-cyan-300/[0.06] hover:text-slate-100"
    >
      {label}
    </button>
  );
}
