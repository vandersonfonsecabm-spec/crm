import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let commercialModelPromise;

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

async function commercialModel() {
  if (!commercialModelPromise) {
    commercialModelPromise = source("src/components/dashboard/DashboardControlCenterModel.ts")
      .then((modelSource) => ts.transpileModule(modelSource, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2023,
        },
      }).outputText)
      .then((compiled) => import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`));
  }
  return commercialModelPromise;
}

function client(overrides = {}) {
  return {
    id: 1,
    name: "Cliente de teste",
    company: "Fazenda de teste",
    value: 1000,
    status: "Contato",
    hot: false,
    lastContactDays: 0,
    nextFollowUp: "Sem acompanhamento",
    risk: "Baixo",
    score: 0,
    ...overrides,
  };
}

function summary(overrides = {}) {
  return {
    analytics: {
      forecastValue: 125000,
      todayFollowUps: 3,
      hotProposalCount: 2,
      silentCount: 4,
      highRiskCount: 1,
      ...overrides,
    },
  };
}

function modelInput(overrides = {}) {
  return {
    summary: summary(),
    summaryLoadState: "ready",
    clientsLoadState: "ready",
    isAuthorized: true,
    clients: [client({ id: 10, nextFollowUp: "2026-08-04T15:00:00.000Z", risk: "Alto" })],
    getRisk: (item) => item.risk,
    now: new Date("2026-08-03T12:00:00.000Z"),
    ...overrides,
  };
}

test("Painel Comercial mapeia somente os quatro KPIs globais autorizados", async () => {
  const { buildCommercialControlCenterModel } = await commercialModel();
  const filled = buildCommercialControlCenterModel(modelInput());

  assert.equal(filled.state, "ready");
  assert.deepEqual(
    filled.metrics.map((metric) => [metric.key, metric.label, metric.kind, metric.value]),
    [
      ["forecastValue", "Valor informado em clientes — Novo e Proposta", "money", 125000],
      ["todayFollowUps", "Clientes com acompanhamento hoje", "count", 3],
      ["hotProposalCount", "Clientes quentes em Proposta", "count", 2],
      ["silentCount", "Clientes sem contato recente", "count", 4],
    ],
  );
  assert.deepEqual(filled.attention, { highRiskCount: 1 });

  const noGlobalSummary = buildCommercialControlCenterModel(modelInput({
    summary: { analytics: {} },
    clients: [client({ id: 99, hot: true, status: "Proposta", nextFollowUp: "2026-08-03T13:00:00.000Z" })],
  }));
  assert.equal(noGlobalSummary.state, "partial");
  assert.deepEqual(noGlobalSummary.metrics.map((metric) => metric.value), [null, null, null, null]);
  assert.notEqual(noGlobalSummary.priorities.length, 0);
});

test("Prioridades permanecem na página atual e ordenam atraso, próxima data e id sem score", async () => {
  const [modelSource, { buildCommercialControlCenterModel, COMMERCIAL_PRIORITY_TIE_BREAKERS }] = await Promise.all([
    source("src/components/dashboard/DashboardControlCenterModel.ts"),
    commercialModel(),
  ]);
  const model = buildCommercialControlCenterModel(modelInput({
    clients: [
      client({ id: 30, name: "Sem data", risk: "Alto", score: 999, nextFollowUp: "Sem acompanhamento" }),
      client({ id: 22, name: "Hoje", risk: "Alto", score: 999, nextFollowUp: "2026-08-03T16:00:00.000Z" }),
      client({ id: 21, name: "Atrasado recente", risk: "Alto", score: 999, nextFollowUp: "2026-08-02T20:00:00.000Z" }),
      client({ id: 20, name: "Atrasado primeiro", risk: "Alto", score: 0, nextFollowUp: "2026-08-01T20:00:00.000Z" }),
      client({ id: 19, name: "Encerrado", status: "Fechado", risk: "Alto", nextFollowUp: "2026-08-01T10:00:00.000Z" }),
    ],
  }));

  assert.deepEqual(model.priorities.map((item) => item.client.id), [20, 21, 22, 30]);
  assert.deepEqual(
    COMMERCIAL_PRIORITY_TIE_BREAKERS,
    ["follow-up-overdue-first", "next-follow-up-ascending", "client-id-ascending"],
  );
  assert.doesNotMatch(modelSource, /leadScore|lead-score-descending|high-priority/);
  assert.doesNotMatch(modelSource, /getPriority\s*:/);
});

test("Hoje usa somente compromissos visíveis da página atual", async () => {
  const { buildCommercialControlCenterModel } = await commercialModel();
  const filled = buildCommercialControlCenterModel(modelInput({
    clients: [
      client({ id: 3, nextFollowUp: "2026-08-04T12:00:00.000Z" }),
      client({ id: 2, nextFollowUp: "2026-08-03T15:00:00.000Z" }),
      client({ id: 1, nextFollowUp: "2026-08-03T14:00:00.000Z" }),
      client({ id: 4, nextFollowUp: "2026-08-02T15:00:00.000Z" }),
    ],
  }));
  assert.equal(filled.agendaState, "ready");
  assert.deepEqual(filled.agenda.map((item) => item.client.id), [1, 2]);

  const empty = buildCommercialControlCenterModel(modelInput({ clients: [] }));
  assert.equal(empty.state, "empty");
  assert.deepEqual(empty.metrics.map((metric) => metric.value), [125000, 3, 2, 4]);
  assert.equal(empty.priorityState, "empty");
  assert.equal(empty.agendaState, "empty");

  assert.equal(buildCommercialControlCenterModel(modelInput({ summaryLoadState: "loading", clientsLoadState: "loading" })).state, "loading");
  assert.equal(buildCommercialControlCenterModel(modelInput({ summaryLoadState: "error" })).state, "error");
  assert.equal(buildCommercialControlCenterModel(modelInput({ isAuthorized: false })).state, "fail-closed");
});

test("componente preserva CTA, Cliente 360 e composição 8/4 sem painel de risco duplicado", async () => {
  const [panel, dashboard, css, modelSource] = await Promise.all([
    source("src/components/dashboard/DashboardControlCenter.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/index.css"),
    source("src/components/dashboard/DashboardControlCenterModel.ts"),
  ]);
  const commercialCall = dashboard.match(/<DashboardControlCenter[\s\S]*?\/>/)?.[0] ?? "";

  for (const text of [
    "Painel Comercial",
    "Novo cliente",
    "Resumo da carteira",
    "Ver clientes em risco",
    "Ver propostas",
  ]) assert.match(panel, new RegExp(text));

  for (const text of [
    "Valor informado em clientes — Novo e Proposta",
    "Clientes com acompanhamento hoje",
    "Clientes quentes em Proposta",
    "Clientes sem contato recente",
  ]) assert.match(modelSource, new RegExp(text));

  assert.match(panel, /Prioridades\s*<span aria-hidden="true">—<\/span>\s*<span className="commercial-section-scope">Página atual<\/span>/);
  assert.match(panel, /Hoje\s*<span aria-hidden="true">—<\/span>\s*<span className="commercial-section-scope">Página atual<\/span>/);
  assert.match(panel, /<span>Cliente<\/span><span>Motivo<\/span><span>Prazo<\/span><span>Abrir<\/span>/);
  assert.match(panel, /setSelectedId\(clientId, origin, priorityHeadingRef\.current\)/);
  assert.match(panel, /setSelectedId\(clientId, origin, agendaHeadingRef\.current\)/);
  assert.match(panel, /onOpenRiskClients/);
  assert.match(panel, /onOpenProposals/);
  assert.doesNotMatch(panel, /TRABALHO DO DIA|FILA PRIORITÁRIA|Resolver antes de abrir novos assuntos|Agenda compacta|Sinais para aprofundar|commercial-risks|Ver negócios|Previs[aã]o|valor aberto/i);
  assert.doesNotMatch(modelSource, /leadScore|lead-score-descending|high-priority/);
  assert.match(modelSource, /forecastValue/);
  assert.doesNotMatch(commercialCall, /getLeadScore|getPriority/);
  assert.match(css, /\.commercial-title \{[^}]*font-size: 23px;[^}]*font-weight: 600;/);
  assert.match(css, /\.commercial-operational-grid \{[^}]*grid-template-columns: minmax\(0, 8fr\) minmax\(280px, 4fr\);/);
  assert.match(css, /\.commercial-metric-strip, \.commercial-loading-metrics \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.commercial-attention \{[^}]*min-height: 40px;/);
  assert.doesNotMatch(css, /\.commercial-risks|\.commercial-side-rail|\.commercial-risk-list/);
});

test("fixture L4 reutiliza a tela real sem sessão, rede ou escrita", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote4-commercial.tsx"),
    source("tests/fixtures/compositional-redesign-lote4-commercial.html"),
  ]);

  assert.match(fixture, /DashboardControlCenter/);
  assert.match(fixture, /DashboardSidebar/);
  assert.match(fixture, /DashboardTopbar/);
  assert.match(fixture, /readOnly/);
  assert.match(fixture, /summaryLoadState="ready"/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /compositional-redesign-lote4-commercial\.tsx/);
});
