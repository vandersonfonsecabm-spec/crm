import { Search, Star } from "lucide-react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { Button, FilterBar, Select, Surface } from "../../src/components/ui";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";

const noOp = () => undefined;

export function CompositionalLote2PageHeaderFixture() {
  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="2" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="clientes"
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled={false}
          setActivePage={noOp}
        />

        <div className="crm-main min-w-0">
          <DashboardTopbar
            authSession={null}
            canManageIntegrations={false}
            emptyClient={emptyClient}
            exportCsv={noOp}
            leadsCommunicationEnabled={false}
            onLogout={noOp}
            onOpenProfile={noOp}
            readOnly
            setActivePage={noOp}
            setCreating={noOp}
            setSelectedId={noOp}
            setShowQuickActions={noOp}
            showQuickActions={false}
          />

          <main className="crm-content mx-auto w-full max-w-[1680px] px-4 pb-24 pt-5 sm:px-5 lg:px-7 lg:pb-8" aria-label="Referência estática de page header e toolbar">
            <section aria-describedby="fixture-readonly-note">
              <DashboardHeader
                activePage="clientes"
                actions={[{ label: "Exportar página atual" }]}
                backendCaption="12 clientes encontrados"
                compact
                onCreateClient={noOp}
                pageTitle="Clientes"
                primaryAction={{ label: "Novo cliente", onClick: noOp }}
                readOnly
                showBackendCaption={false}
              />

              <Surface className="overflow-hidden">
                <FilterBar aria-label="Buscar e filtrar clientes: 12 clientes encontrados" className="compositional-local-toolbar border-0 bg-transparent px-3 py-1.5 shadow-none">
                  <div className="flex h-9 min-w-[280px] flex-[1_1_380px] items-center gap-2 rounded-md border border-[var(--control-border)] bg-[var(--control-bg)] px-3">
                    <Search aria-hidden="true" className="text-[var(--icon-muted)]" size={14} />
                    <input aria-label="Buscar clientes" className="w-full bg-transparent text-xs text-[var(--control-text)] outline-none placeholder:text-[var(--control-placeholder)]" placeholder="Buscar cliente, empresa, telefone, e-mail ou tag..." readOnly value="" />
                  </div>

                  <Select aria-label="Filtrar por status" disabled value="Todos">
                    <option value="Todos">Todos os status</option>
                  </Select>

                  <Select aria-label="Ordenar clientes" disabled value="score">
                    <option value="score">Ordem padrão</option>
                  </Select>

                  <Button disabled leftIcon={<Star size={13} />} size="md" variant="secondary">Favoritos</Button>
                  <Button disabled size="md" variant="secondary">Quentes</Button>
                </FilterBar>
              </Surface>
              <p className="sr-only" id="fixture-readonly-note">Referência de QA somente leitura, sem sessão, rede ou escrita.</p>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote2PageHeaderFixture /></MemoryRouter>);
