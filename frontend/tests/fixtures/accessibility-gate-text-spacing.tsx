import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardOverview from "../../src/components/dashboard/DashboardOverview";
import { AgendaToolbarFrame } from "../../src/components/dashboard/DashboardAgendaPanel";
import "../../src/index.css";
import type { ApiDashboardSummary } from "../../src/services/crmApi";

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
const onMovePeriod = (offset: number) => { void offset; };
const onViewModeChange = (mode: "list" | "week") => { void mode; };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const textSpacingOverride = [
  ".accessibility-gate-text-spacing,",
  ".accessibility-gate-text-spacing * {",
  "  line-height: 1.5 !important;",
  "  letter-spacing: .12em !important;",
  "  word-spacing: .16em !important;",
  "}",
  ".accessibility-gate-text-spacing p {",
  "  margin-block-end: 2em !important;",
  "}",
].join("\n");

export function AccessibilityGateTextSpacingFixture() {
  return (
    <div className="accessibility-gate-text-spacing crm-workspace min-h-screen" data-fixture-readonly="true" data-reflow-targets="640,320" data-text-spacing-contract="wcag-1.4.12">
      <style>{textSpacingOverride}</style>
      <main aria-label="Fixture controlada de espaçamento de texto" className="mx-auto w-full max-w-[1680px] px-5 py-8 lg:px-7">
        <DashboardOverview
          isAuthorized
          money={money}
          onOpenCommercial={noOp}
          onRetry={noOp}
          summary={summary}
          summaryLoadState="ready"
        />

        <section aria-labelledby="agenda-text-spacing-title" className="mt-8">
          <h2 id="agenda-text-spacing-title">Agenda</h2>
          <AgendaToolbarFrame
            filters={<details className="agenda-filter-disclosure"><summary>Filtros</summary><div>Filtros existentes permanecem recolhidos.</div></details>}
            onMovePeriod={onMovePeriod}
            onToday={noOp}
            onViewModeChange={onViewModeChange}
            periodLabel="11 a 17 de agosto"
            viewMode="list"
          >
            <label className="sr-only" htmlFor="agenda-text-spacing-search">Busca de referência</label>
            <input aria-label="Busca de referência" id="agenda-text-spacing-search" placeholder="Buscar cliente ou título" type="search" />
          </AgendaToolbarFrame>
          <p>Este cenário aplica o espaçamento exigido sem criar dados, rede, sessão ou escrita.</p>
        </section>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><AccessibilityGateTextSpacingFixture /></MemoryRouter>);
