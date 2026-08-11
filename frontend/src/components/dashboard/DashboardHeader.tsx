import { Plus } from "lucide-react";
import type { ActivePage } from "../../types/dashboard";
import { Button } from "../ui";
import DashboardActionOverflow from "./DashboardActionOverflow";
import type { PageAction } from "./DashboardActionOverflow";

export type { PageAction } from "./DashboardActionOverflow";

type DashboardHeaderProps = {
  activePage: ActivePage;
  pageTitle: string;
  backendCaption: string;
  onCreateClient: () => void;
  showCreateClient?: boolean;
  showBackendCaption?: boolean;
  compact?: boolean;
  readOnly?: boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  actions?: PageAction[];
  actionsPlacement?: "header" | "toolbar";
};

export default function DashboardHeader({
  activePage,
  pageTitle,
  backendCaption,
  onCreateClient,
  showCreateClient = true,
  showBackendCaption = false,
  compact = false,
  readOnly = false,
  primaryAction,
  actions = [],
  actionsPlacement = "header",
}: DashboardHeaderProps) {
  return (
    <header className={`page-header ${compact ? "mb-3" : "mb-5"}`} data-page={activePage}>
      <div className="page-header-main flex min-h-14 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[23px] font-semibold leading-[1.25]" title={pageTitle}>{pageTitle}</h1>
          {showBackendCaption && (
            <span className="page-header-caption mt-1 inline-flex text-[11px] font-medium">
              {backendCaption}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-1">
          {actions.length > 0 && actionsPlacement === "header" && (
            <DashboardActionOverflow
              actions={actions}
              iconSize="md"
              pageTitle={pageTitle}
              readOnly={readOnly}
              triggerClassName="page-secondary-action"
            />
          )}

          {(primaryAction || showCreateClient) && (
            <Button
              className="page-primary-action"
              disabled={readOnly}
              leftIcon={<Plus size={14} />}
              onClick={primaryAction?.onClick ?? onCreateClient}
              size="md"
              variant="primary"
            >
              {primaryAction?.label ?? "Novo cliente"}
            </Button>
          )}
        </div>
      </div>

    </header>
  );
}
