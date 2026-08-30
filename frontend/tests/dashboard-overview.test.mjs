import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

async function overviewModel() {
  return import(new URL("../src/components/dashboard/DashboardOverviewModel.ts", import.meta.url).href);
}

function summary({
  clients = 12,
  wonValue = 240000,
  forecastValue = 420000,
  activePipeline = 8,
  highRiskCount = 2,
  silentCount = 1,
  hotProposalCount = 3,
  status = [
    { status: "Novo", total: 2, valor: 120000 },
    { status: "Contato", total: 3, valor: 180000 },
    { status: "Proposta", total: 3, valor: 360000 },
    { status: "Fechado", total: 2, valor: 240000 },
    { status: "Perdido", total: 2, valor: 80000 },
  ],
} = {}) {
  return {
    indicadores: { clientes: clients },
    analytics: { wonValue, forecastValue, activePipeline, highRiskCount, silentCount, hotProposalCount },
    status,
  };
}

test("Visão Geral mapeia exclusivamente a matriz contratual L0", async () => {
  const { buildDashboardOverviewModel } = await overviewModel();
  const model = buildDashboardOverviewModel({ summary: summary() });

  assert.equal(model.state, "ready");
  assert.deepEqual(model.metrics.map((metric) => [metric.label, metric.kind, metric.value]), [
    ["Clientes na carteira", "count", 12],
    ["Receita realizada — vendas canônicas", "money", 240000],
    ["Pipeline estimado — Negócios abertos", "money", 420000],
    ["Clientes em acompanhamento comercial", "count", 8],
  ]);
  assert.deepEqual(model.statusRows.map((stage) => [stage.stage, stage.total, stage.value]), [
    ["Novo", 2, 120000],
    ["Contato", 3, 180000],
    ["Proposta", 3, 360000],
    ["Fechado", 2, 240000],
    ["Perdido", 2, 80000],
  ]);
  assert.deepEqual(model.attentionSignals, [
    { key: "high-risk", count: 2, label: "Clientes em alto risco" },
    { key: "silent", count: 1, label: "Clientes sem contato recente" },
    { key: "hot-proposal", count: 3, label: "Clientes quentes em Proposta" },
  ]);
  assert.equal(model.attentionKnown, true);
});

test("zero conhecido, parcial, erro, loading e fail-closed ficam distintos", async () => {
  const { buildDashboardOverviewModel } = await overviewModel();
  const empty = buildDashboardOverviewModel({
    summary: summary({
      clients: 0,
      wonValue: 0,
      forecastValue: 0,
      activePipeline: 0,
      highRiskCount: 0,
      silentCount: 0,
      hotProposalCount: 0,
      status: [],
    }),
  });
  assert.equal(empty.state, "empty");
  assert.deepEqual(empty.metrics.map((metric) => metric.value), [0, 0, 0, 0]);
  assert.ok(empty.statusRows.every((stage) => stage.total === 0 && stage.value === 0));
  assert.deepEqual(empty.attentionSignals, []);

  const partialSummary = summary();
  delete partialSummary.analytics.forecastValue;
  const partial = buildDashboardOverviewModel({ summary: partialSummary });
  assert.equal(partial.state, "partial");
  assert.equal(partial.partialMessage, "Dados parciais no resumo atual.");
  assert.deepEqual(partial.metrics.map((metric) => metric.value), [12, 240000, null, 8]);

  assert.equal(buildDashboardOverviewModel({ summary: null }).state, "error");
  assert.equal(buildDashboardOverviewModel({ summary: summary(), hasSummaryError: true }).state, "error");
  assert.equal(buildDashboardOverviewModel({ summary: summary(), isLoading: true }).state, "loading");
  assert.equal(buildDashboardOverviewModel({ summary: summary(), isAuthorized: false }).state, "fail-closed");
});

test("componente mantém a composição curta, 8/4 e CTA real sem narrativa editorial", async () => {
  const [component, model, css, dashboard] = await Promise.all([
    source("src/components/dashboard/DashboardOverview.tsx"),
    source("src/components/dashboard/DashboardOverviewModel.ts"),
    source("src/index.css"),
    source("src/pages/Dashboard.tsx"),
  ]);

  assert.match(component, /<h1 className="crm-overview-title truncate" id="crm-overview-title">Visão Geral<\/h1>/);
  assert.equal((component.match(/Abrir Painel Comercial/g) ?? []).length, 1);
  assert.match(dashboard, /onOpenCommercial=\{\(\) => handleSetActivePage\("comercial"\)\}/);
  assert.match(component, /Carteira por status/);
  assert.match(component, />Atenção<\/h2>/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /data-overview-signal=\{signal\.key\}/);
  assert.match(model, /forecastValue/);
  assert.doesNotMatch(component, /Leitura transversal|Leitura executiva|crm-overview-headline|crm-overview-value|Oportunidades ativas|Clientes em atenção|Previs[aã]o|valor aberto/i);
  assert.doesNotMatch(model, /valueInNegotiation|getDashboardOverviewHeadline|managementSignals/);
  assert.match(css, /\.crm-overview-title \{[^}]*font-size: 23px;[^}]*font-weight: 600;/);
  assert.match(css, /\.crm-overview-metrics \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.crm-overview-main-grid, \.crm-overview-loading-grid \{[^}]*grid-template-columns: minmax\(0, 8fr\) minmax\(280px, 4fr\);/);
  assert.match(css, /\.crm-overview-cta \{[^}]*min-height: 40px;/);
  assert.doesNotMatch(css, /\.crm-overview-headline|\.crm-overview-lead|\.crm-overview-management/);
});

test("fixture L3 reutiliza a tela real em modo somente leitura", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote3-overview.tsx"),
    source("tests/fixtures/compositional-redesign-lote3-overview.html"),
  ]);

  assert.match(fixture, /DashboardOverview/);
  assert.match(fixture, /DashboardSidebar/);
  assert.match(fixture, /DashboardTopbar/);
  assert.match(fixture, /summaryLoadState="ready"/);
  assert.match(fixture, /readOnly/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /compositional-redesign-lote3-overview\.tsx/);
});
