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

  const pageDescription = {
    dashboard: "Indicadores, prioridades e atividades da operação comercial.",
    comercial: "Decisões, oportunidades e ações comerciais em um só contexto.",
    clientes: "Clientes, responsáveis, interações e próximos passos.",
    kanban: "Acompanhe oportunidades por etapa e mantenha o pipeline em movimento.",
    agenda: "Compromissos, retornos e atividades organizados por prioridade.",
    estoque: "Catálogo, saldos e dados sincronizados das integrações.",
    integracoes: "Conexões, sincronizações e saúde dos dados externos.",
    automacoes: "Fluxos disponíveis, estados e modelos operacionais.",
  }[activePage];

  return (
    <header className="page-header mb-5">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span>CRM Agro</span>
        <span aria-hidden="true" className="text-slate-700">/</span>
        <span className="text-slate-300">{breadcrumbLabel}</span>
      </div>

      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold leading-7 tracking-normal text-slate-50">
            {pageTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{pageDescription}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="data-caption hidden rounded-md px-3 py-2 text-[10px] font-semibold sm:inline-flex">
            {backendCaption}
          </span>

          <button
            aria-label="Notificações"
            className="icon-button rounded-md p-2 text-slate-300"
            title="Notificações"
            type="button"
          >
            <Bell size={15} />
          </button>

          {showCreateClient && (
            <button
              onClick={onCreateClient}
              className="premium-button inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold"
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
