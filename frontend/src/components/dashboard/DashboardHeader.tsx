import { MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActivePage } from "../../types/dashboard";

export type PageAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

type DashboardHeaderProps = {
  activePage: ActivePage;
  pageTitle: string;
  backendCaption: string;
  onCreateClient: () => void;
  showCreateClient?: boolean;
  showBackendCaption?: boolean;
  compact?: boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  actions?: PageAction[];
};

export default function DashboardHeader({
  activePage,
  pageTitle,
  backendCaption,
  onCreateClient,
  showCreateClient = true,
  showBackendCaption = true,
  compact = false,
  primaryAction,
  actions = [],
}: DashboardHeaderProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const breadcrumbLabel = pageMeta[activePage].breadcrumb;
  const pageDescription = pageMeta[activePage].description;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) setIsActionsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsActionsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className={`page-header ${compact ? "mb-3" : "mb-5"}`}>
      <div className="page-header-main flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="page-breadcrumb mb-2 flex items-center gap-1.5 text-[10px]">
            <span>CRM Agro</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{breadcrumbLabel}</span>
          </div>
          <h1 className="truncate text-[21px] font-semibold leading-7">{pageTitle}</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-5">{pageDescription}</p>
          {showBackendCaption && (
            <span className="data-caption mt-2 inline-flex rounded-md px-2.5 py-1 text-[10px] font-medium">
              {backendCaption}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-1">
          {actions.length > 0 && (
            <div ref={actionsRef} className="relative">
              <button
                aria-expanded={isActionsOpen}
                aria-haspopup="menu"
                className="page-secondary-action inline-flex h-9 items-center gap-2 rounded-md px-3 text-[11px] font-medium"
                onClick={() => setIsActionsOpen((current) => !current)}
                type="button"
              >
                <MoreHorizontal size={15} />
                Ações
              </button>

              {isActionsOpen && (
                <div className="page-actions-menu absolute right-0 top-11 z-[180] w-60 rounded-lg border p-1.5 shadow-lg" role="menu">
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      className="page-action-item flex w-full items-center rounded-md px-2.5 py-2 text-left text-[11px]"
                      disabled={action.disabled}
                      onClick={() => {
                        action.onClick?.();
                        setIsActionsOpen(false);
                      }}
                      role="menuitem"
                      title={action.title}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(primaryAction || showCreateClient) && (
            <button
              onClick={primaryAction?.onClick ?? onCreateClient}
              className="premium-button inline-flex h-9 items-center gap-2 rounded-md px-3 text-[11px] font-semibold"
              type="button"
            >
              <Plus size={14} />
              {primaryAction?.label ?? "Novo cliente"}
            </button>
          )}
        </div>
      </div>

    </header>
  );
}

const pageMeta: Record<ActivePage, { breadcrumb: string; description: string }> = {
  dashboard: {
    breadcrumb: "Visão Geral",
    description: "Indicadores, prioridades e atividades da operação comercial.",
  },
  comercial: {
    breadcrumb: "Central Comercial",
    description: "Decisões, oportunidades e ações comerciais em um só contexto.",
  },
  clientes: {
    breadcrumb: "Clientes",
    description: "Gerencie relacionamentos, prioridades e histórico comercial.",
  },
  kanban: {
    breadcrumb: "Negócios",
    description: "Acompanhe negociações e o avanço no funil comercial.",
  },
  agenda: {
    breadcrumb: "Agenda",
    description: "Compromissos, retornos e atividades organizados por prioridade.",
  },
  estoque: {
    breadcrumb: "Estoque",
    description: "Catálogo, saldos e dados sincronizados das integrações.",
  },
  integracoes: {
    breadcrumb: "Integrações",
    description: "Conexões, sincronizações e saúde dos dados externos.",
  },
  automacoes: {
    breadcrumb: "Automações",
    description: "Padrões comerciais documentados e preparação do motor de regras.",
  },
};
