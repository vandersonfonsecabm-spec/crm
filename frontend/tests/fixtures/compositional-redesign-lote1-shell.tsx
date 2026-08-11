import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { ActivePage } from "../../src/types/dashboard";

export function CompositionalLote1ShellFixture() {
  const [activePage, setActivePage] = useState<ActivePage>("comercial");

  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="1" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage={activePage}
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled={false}
          setActivePage={setActivePage}
        />

        <div className="crm-main min-w-0">
          <DashboardTopbar
            authSession={null}
            canManageIntegrations={false}
            emptyClient={emptyClient}
            exportCsv={() => undefined}
            leadsCommunicationEnabled={false}
            onLogout={() => undefined}
            onOpenProfile={() => undefined}
            readOnly
            setActivePage={setActivePage}
            setCreating={() => undefined}
            setSelectedId={() => undefined}
            setShowQuickActions={() => undefined}
            showQuickActions={false}
          />

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência estática do shell">
            <section className="mx-auto w-full max-w-[1680px] px-5 py-8 lg:px-7" aria-labelledby="fixture-title">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Referência local</p>
              <h1 className="mt-2 text-xl font-semibold text-[var(--text-strong)]" id="fixture-title">Operação comercial</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                Shell de QA em visualização somente leitura para conferir a navegação, a busca e as proporções desktop.
              </p>
              <p className="mt-4 text-xs text-[var(--text-muted)]" role="status">Sem sessão, rede ou escrita.</p>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote1ShellFixture /></MemoryRouter>);
