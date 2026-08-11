import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 7 mantém Agenda sobre o contrato real e suas operações existentes", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  assert.match(api, /export type ApiAcompanhamento = \{[\s\S]*?titulo: string;[\s\S]*?dataHora: string;[\s\S]*?prioridade: ApiAcompanhamentoPrioridade;[\s\S]*?status: ApiAcompanhamentoStatus;[\s\S]*?tipo: ApiAcompanhamentoTipo;/);
  assert.match(api, /permissoes\?: \{ editar: boolean; concluir: boolean; cancelar: boolean; reabrir: boolean; verEquipe: boolean \}/);
  assert.match(panel, /const list = await fetchAcompanhamentos\(/);
  assert.match(panel, /fetchAgendaDashboardContext\(periodQuery\)/);
  assert.match(panel, /await iniciarAcompanhamento\(item\.id, item\.revisao\)/);
  assert.match(panel, /await concluirAcompanhamento\(item\.id, item\.revisao\)/);
  assert.match(panel, /await reabrirAcompanhamento\(item\.id, item\.revisao\)/);
  assert.match(panel, /await cancelarAcompanhamento\(item\.id, item\.revisao\)/);
  assert.match(panel, /fetchAcompanhamentoHistorico\(item\.id\)/);
  assert.match(panel, /createAcompanhamento\(payload\)/);
  assert.match(panel, /updateAcompanhamento\(editing\.id/);
});

test("Lote 7 estabelece toolbar operacional e mantém filtros avançados recolhidos", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  const toolbar = panel.slice(panel.indexOf("export function AgendaToolbarFrame"), panel.indexOf("type AgendaFilterDisclosureProps"));
  const filters = panel.slice(panel.indexOf("export function AgendaFilterDisclosure"), panel.indexOf("export function AgendaNextCommitment"));
  const usage = panel.slice(panel.indexOf("<AgendaToolbarFrame"), panel.indexOf("{nextCommitment &&"));

  assert.ok(toolbar.indexOf("agenda-period-control") < toolbar.indexOf("agenda-view-toggle"));
  assert.ok(toolbar.indexOf("agenda-view-toggle") < toolbar.indexOf("<Button onClick={onToday}"));
  assert.match(toolbar, /aria-label="Período"/);
  assert.match(toolbar, /Lista/);
  assert.match(toolbar, /Semana/);
  assert.match(toolbar, />Hoje<\/Button>/);
  assert.match(filters, /<details className="agenda-filter-disclosure">/);
  assert.match(filters, />\s*Filtros\s*/);
  assert.match(filters, /Limpar filtros/);
  for (const label of ["Filtrar por status", "Filtrar por prioridade", "Filtrar por tipo", "Filtrar por cliente", "Filtrar por responsável"]) {
    assert.match(usage, new RegExp(label));
  }
  assert.match(usage, /aria-label="Buscar cliente ou título"/);
  assert.match(usage, /aria-label="Minha agenda"/);
  assert.doesNotMatch(panel, /Semana comercial|Agenda da semana|Visão semanal|Painel operacional/);
});

test("Lote 7 ordena a leitura temporal e torna contexto e ações raras secundários", async () => {
  const [panel, css] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/components/dashboard/DashboardAgenda.css"),
  ]);
  const groups = panel.slice(panel.indexOf("function buildAgendaTemporalGroups"), panel.indexOf("function startOfWeek"));
  const row = panel.slice(panel.indexOf("function AgendaRow"), panel.indexOf("function AgendaModal"));
  const nextCommitment = panel.slice(panel.indexOf("export function AgendaNextCommitment"), panel.indexOf("export function AgendaTemporalList"));

  assert.ok(groups.indexOf('key: "overdue"') < groups.indexOf('key: "today"'));
  assert.ok(groups.indexOf('key: "today"') < groups.indexOf('key: "upcoming"'));
  assert.ok(groups.indexOf('key: "upcoming"') < groups.indexOf('key: "completed"'));
  assert.ok(groups.indexOf('key: "completed"') < groups.indexOf('key: "cancelled"'));
  assert.match(nextCommitment, /if \(!item\) return null;/);
  assert.doesNotMatch(nextCommitment, /Nenhum compromisso futuro agendado|Agendar/);
  assert.match(row, /className="agenda-row-actions mt-2"/);
  assert.match(row, /Reagendar/);
  assert.match(row, /Concluir/);
  assert.match(row, /<details className="agenda-row-context">/);
  assert.match(row, /agenda-row-observation/);
  assert.match(row, /DashboardActionOverflow actions=\{overflowActions\}/);
  assert.match(row, /label: "Histórico"/);
  assert.match(row, /label: "Editar"/);
  assert.match(row, /label: "Iniciar"/);
  assert.match(row, /label: "Reabrir"/);
  assert.match(row, /label: "Cancelar"/);
  assert.match(css, /\.agenda-filter-disclosure\[open\] \{[\s\S]*?flex: 1 0 100%;/);
  assert.match(css, /\.agenda-filter-disclosure-panel \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.agenda-filter-disclosure:not\(\[open\]\) > \.agenda-filter-disclosure-panel,/);
  assert.match(css, /\.agenda-row-context:not\(\[open\]\) > \.agenda-row-context-panel \{\s*display: none;/);
  assert.match(css, /\.agenda-filter-disclosure\[open\] > \.agenda-filter-disclosure-panel \{\s*display: grid;/);
  assert.match(css, /\.agenda-row-context-panel \{\s*display: none;/);
  assert.match(css, /\.agenda-row-context\[open\] > \.agenda-row-context-panel \{\s*display: flex;/);
  assert.match(css, /@media \(max-width: 1279px\) \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(panel, /DashboardMetricStrip|Sem contato|Notas recentes|Aplicar filtro inteligente/);
});

test("fixture L7 é read-only, usa a composição real e cobre Lista e Semana", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote7-agenda.tsx"),
    source("tests/fixtures/compositional-redesign-lote7-agenda.html"),
  ]);

  for (const component of ["DashboardHeader", "AgendaToolbarFrame", "AgendaFilterDisclosure", "AgendaNextCommitment", "AgendaTemporalList", "AgendaWeekView"]) {
    assert.match(fixture, new RegExp(component));
  }
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /pageTitle="Agenda"/);
  assert.match(fixture, /label: "Novo acompanhamento"/);
  assert.match(fixture, /key: "overdue"/);
  assert.match(fixture, /key: "today"/);
  assert.match(fixture, /key: "upcoming"/);
  assert.match(fixture, /atrasado: true/);
  assert.match(fixture, /status: "CONCLUIDO"/);
  assert.match(fixture, /status: "CANCELADO"/);
  assert.match(fixture, /useState<"list" \| "week">\("list"\)/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote7-agenda\.tsx"/);
});
