import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardControlCenter from "../../src/components/dashboard/DashboardControlCenter";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { ApiDashboardSummary } from "../../src/services/crmApi";
import type { ActivePage, Client } from "../../src/types/dashboard";

function localDate(offset: number, hour: number) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString();
}

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
    todayFollowUps: 2,
    highRiskCount: 2,
    silentCount: 2,
    hotProposalCount: 1,
    activePipeline: 9,
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

const clients: Client[] = [
  { ...emptyClient, id: 701, name: "Cooperativa Horizonte", company: "Conta local sintética", status: "Proposta", hot: true, lastContactDays: 2, nextFollowUp: localDate(-1, 15) },
  { ...emptyClient, id: 702, name: "Fazenda Aurora", company: "Conta local sintética", status: "Contato", lastContactDays: 1, nextFollowUp: localDate(0, 11) },
  { ...emptyClient, id: 703, name: "Grupo Campo Alto", company: "Conta local sintética", status: "Contato", lastContactDays: 9, nextFollowUp: localDate(0, 16) },
  { ...emptyClient, id: 704, name: "Sítio Mineral", company: "Conta local sintética", status: "Novo", lastContactDays: 0, nextFollowUp: localDate(2, 14) },
];

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompositionalLote4CommercialFixture() {
  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="4" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="comercial"
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

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local do Painel Comercial">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-8 lg:px-7">
              <DashboardControlCenter
                clients={clients}
                clientsLoadState="ready"
                getRisk={(client) => client.id === 701 ? "Alto" : "Baixo"}
                isAuthorized
                money={money}
                onCreateClient={noOp}
                onOpenProposals={noOp}
                onOpenRiskClients={noOp}
                onRetry={noOp}
                setSelectedId={noOp}
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
createRoot(rootElement).render(<MemoryRouter><CompositionalLote4CommercialFixture /></MemoryRouter>);
