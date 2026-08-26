import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 6 deriva Total como contagem do contrato real de Negócios", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  const toolbar = panel.slice(panel.indexOf("export function NegociosKanbanToolbar"), panel.indexOf("type NegociosKanbanBoardProps"));

  assert.match(api, /export type NegociosKanbanResponse = ApiPaginatedResponse<CommunicationBusiness> & \{/);
  assert.match(api, /resumo:\s*\{[\s\S]*?total: number;/);
  assert.match(panel, /const totalBusinesses = summary\?\.total \?\? pagination\.total;/);
  assert.match(toolbar, /const totalLabel = total === 1 \? "negócio" : "negócios"/);
  assert.match(toolbar, /aria-label=\{`Total: \$\{total\} \$\{totalLabel\}`\}/);
  assert.match(toolbar, /<span>Total<\/span>[\s\S]*?<strong>\{total\}<\/strong>[\s\S]*?<span>\{totalLabel\}<\/span>/);
  assert.doesNotMatch(toolbar, /valor|formatBusinessValue|fechados|perdidos/);
  assert.doesNotMatch(panel, /Resumo do pipeline|Em andamento|summary\?\.fechados|summary\?\.perdidos/);
});

test("Lote 6 mantém Kanban horizontal legível, estados neutros e vazio por etapa", async () => {
  const [panel, css] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/DashboardNegocios.css"),
  ]);
  const board = panel.slice(panel.indexOf("export function NegociosKanbanBoard"), panel.indexOf("export function BusinessCard"));

  assert.match(board, /className="negocios-board-scroll overflow-x-auto pb-1" data-negocios-board-scroll tabIndex=\{0\}/);
  assert.match(board, /aria-label="Quadro de Negócios"/);
  assert.match(board, /<h2 id=\{`negocios-stage-\$\{stage\}`\}>\{stageLabels\[stage\]\}<\/h2>/);
  assert.match(board, /aria-label=\{stageBusinesses\.length === 1 \? "1 negócio" : `\$\{stageBusinesses\.length\} negócios`\}/);
  assert.match(board, /Sem negócios nesta etapa/);
  assert.doesNotMatch(panel, /Nenhum Negócio encontrado|Etapa vazia/);
  assert.match(css, /\.negocios-board \{[\s\S]*?width: max-content;[\s\S]*?grid-template-columns: repeat\(5, minmax\(280px, 296px\)\);/);
  assert.match(css, /\.negocios-board-scroll \{[\s\S]*?max-width: 100%;/);
  assert.match(css, /\.negocios-stage \{\s*--negocios-stage-header-height: 48px;\s*display: grid;\s*grid-template-rows: minmax\(var\(--negocios-stage-header-height\), auto\) minmax\(0, 1fr\);/);
  assert.match(css, /\.negocios-stage-header \{\s*box-sizing: border-box;\s*position: sticky;\s*z-index: 3;\s*top: 0;\s*min-height: var\(--negocios-stage-header-height\);/);
  assert.match(css, /\.negocios-stage-list \{\s*min-width: 0;\s*padding: 10px;/);
  assert.doesNotMatch(css, /\.negocios-stage\[data-stage=/);
});

test("Lote 6 preserva cartão e interação reais sem inventar dados comerciais", async () => {
  const [panel, css, dashboard] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/DashboardNegocios.css"),
    source("src/pages/Dashboard.tsx"),
  ]);
  const card = panel.slice(panel.indexOf("export function BusinessCard"), panel.indexOf("function BusinessDrawer"));

  for (const field of ["business.titulo", "business.cliente?.nome", "formatBusinessValue(business.valor)", "business.responsavel?.nome", "business.tempoEtapa?.atualSegundos", "business.proximaAcao", "business.negocioParado"]) {
    assert.ok(card.includes(field), `cartão deve usar ${field}`);
  }
  assert.match(card, /\{nextAction \? \(\s*<p className="mt-0\.5 font-medium"/);
  assert.match(css, /\.negocios-card-action > p:last-child \{[\s\S]*?-webkit-line-clamp: 2;/);
  assert.match(panel, /stageUpdates\.current\.add\(id\)/);
  assert.match(panel, /const snapshot = businesses/);
  assert.match(panel, /setBusinesses\(snapshot\)/);
  assert.match(panel, /event\.dataTransfer\.getData\("negocioId"\)/);
  assert.match(dashboard, /actions=\{usingNegociosKanban \? \[\] : pageActions\}/);
  const dashboardHeader = dashboard.slice(dashboard.indexOf("<DashboardHeader"), dashboard.indexOf("showBackendCaption={false}"));
  assert.match(dashboardHeader, /showCreateClient=\{[\s\S]*?activePage !== "kanban"/);
  assert.doesNotMatch(`${card}\n${panel}`, /probabilidade|Novo neg[oó]cio|modo lista|seletor/i);
});

test("fixture L6 usa a composição real sem sessão, rede ou escrita", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote6-negocios.tsx"),
    source("tests/fixtures/compositional-redesign-lote6-negocios.html"),
  ]);

  assert.match(fixture, /NegociosKanbanToolbar/);
  assert.match(fixture, /NegociosKanbanBoard/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /showCreateClient=\{false\}/);
  assert.match(fixture, /negocioParado: true/);
  assert.match(fixture, /atrasada: true/);
  assert.match(fixture, /etapa: "FECHADO"/);
  assert.match(fixture, /etapa: "PERDIDO"/);
  assert.doesNotMatch(fixture, /etapa: "PROPOSTA"/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote6-negocios\.tsx"/);
});
