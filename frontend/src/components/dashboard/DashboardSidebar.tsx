import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  KanbanSquare,
  Package,
  PlugZap,
  Sprout,
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
  canManageIntegrations?: boolean;
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
  canManageIntegrations = false,
}: DashboardSidebarProps) {
  return (
    <aside className="sidebar-shell hidden h-screen w-[232px] shrink-0 overflow-x-hidden overflow-y-auto border-r p-3 pb-5 lg:sticky lg:top-0 lg:block">
      <div className="identity-panel mb-5 rounded-lg p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Sprout size={17} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">CRM Agro</p>
            <p className="truncate text-[11px] text-slate-500">Gestão comercial</p>
          </div>
        </div>
      </div>

      <nav aria-label="Navegação principal" className="space-y-5">
        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Visão geral
          </p>

          <div className="grid gap-1.5">
            <SidebarButton
              active={activePage === "dashboard"}
              icon={<BarChart3 size={15} className="mr-2 shrink-0" />}
              label="Visão Geral"
              onClick={() => setActivePage("dashboard")}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Comercial
          </p>

          <div className="grid gap-1.5">
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
          </div>
        </div>

        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Operação
          </p>
          <div className="grid gap-1.5">
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
            <SidebarButton
              active={activePage === "automacoes"}
              icon={<Zap size={15} className="mr-2 shrink-0" />}
              label="Automações"
              onClick={() => setActivePage("automacoes")}
            />
          </div>
        </div>

        {canManageIntegrations && (
          <div>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Conexões
            </p>
            <SidebarButton
              active={activePage === "integracoes"}
              icon={<PlugZap size={15} className="mr-2 shrink-0" />}
              label="Integrações"
              onClick={() => setActivePage("integracoes")}
            />
          </div>
        )}
      </nav>

      {activePage !== "estoque" && activePage !== "integracoes" && (
      <div className="sidebar-context mx-auto mt-6 w-full rounded-lg p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Ações da página</p>

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
              <ActionButton
                disabled
                label="Criar regra"
                title="O motor de automações ainda está em desenvolvimento."
              />
              <ActionButton
                label="Ver modelos"
                onClick={() => document.getElementById("automation-templates")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
            </>
          )}

          <ActionButton onClick={clearFilters} label="Resetar visão" />
        </div>
      </div>
      )}

      {activePage !== "automacoes" && activePage !== "dashboard" && activePage !== "estoque" && activePage !== "integracoes" && (
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
      aria-current={active ? "page" : undefined}
      className={`sidebar-nav-item relative box-border flex h-9 w-full shrink-0 items-center rounded-md px-3 pr-8 text-left text-[13px] leading-5 ${active ? "is-active" : ""}`}
    >
      {icon}
      <span className="block min-w-0 flex-1 truncate leading-5">{label}</span>
      <span
        className="sidebar-nav-indicator absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
      />
    </button>
  );
}

function ActionButton({
  disabled = false,
  label,
  onClick,
  title,
}: {
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`sidebar-action inline-flex box-border h-8 w-full items-center rounded-md px-2.5 text-left text-[11px] ${disabled ? "is-disabled" : ""}`}
    >
      <span>{label}</span>
      {disabled && <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-slate-600">em breve</span>}
    </button>
  );
}
