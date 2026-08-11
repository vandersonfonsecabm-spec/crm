import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardOverview from "../../src/components/dashboard/DashboardOverview";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { ApiDashboardSummary } from "../../src/services/crmApi";
import type { ActivePage } from "../../src/types/dashboard";

const summary: ApiDashboardSummary = {
  indicadores: {
    clientes: 12,
    produtos: 0,
    pedidos: 0,
    contasPendentes: 0,
    faturamento: 0,
    pipeline: 0,
    quentes: 0,
  },
  analytics: {
    totalValue: 0,
    wonValue: 248000,
    forecastValue: 412000,
    hotCount: 0,
    averageScore: 0,
    todayFollowUps: 0,
    activePipeline: 9,
    highRiskCount: 2,
    silentCount: 2,
    hotProposalCount: 1,
    conversionRate: 0,
  },
  status: [
    { status: "Novo", total: 2, valor: 84000 },
    { status: "Contato", total: 3, valor: 126000 },
    { status: "Proposta", total: 4, valor: 202000 },
    { status: "Fechado", total: 2, valor: 248000 },
    { status: "Perdido", total: 1, valor: 36000 },
  ],
  estoqueBaixo: [],
  pedidosRecentes: [],
  contasVencidas: [],
  produtosMaisVendidos: [],
  atividadesRecentes: [],
};

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompositionalLote3OverviewFixture() {
  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="3" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="dashboard"
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled={false}
          setActivePage={navigate}
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
            setActivePage={navigate}
            setCreating={noOp}
            setSelectedId={noOp}
            setShowQuickActions={setQuickActions}
            showQuickActions={false}
          />

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local da Visão Geral">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-8 lg:px-7">
              <DashboardOverview
                isAuthorized
                money={money}
                onOpenCommercial={noOp}
                onRetry={noOp}
                summary={summary}
                summaryLoadState="ready"
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote3OverviewFixture /></MemoryRouter>);
