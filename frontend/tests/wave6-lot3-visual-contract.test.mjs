import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 3 mantém Clientes e Negócios operacionais com ênfase somente nos estados reais", async () => {
  const [clients, clientsCss, filters, negocios, negociosCss, fixture] = await Promise.all([
    source("src/components/dashboard/DashboardClientsTable.tsx"),
    source("src/components/dashboard/DashboardClientes.css"),
    source("src/components/dashboard/DashboardOperationalSearch.tsx"),
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/DashboardNegocios.css"),
    source("tests/fixtures/wave6/lot3-clientes-negocios.tsx"),
  ]);

  assert.doesNotMatch(clients, /Registros carregados|data-clientes-score|Score indisponível/);
  assert.match(filters, /isClientsPage \? "Buscar e filtrar clientes" : "Buscar e filtrar registros"/);
  assert.match(clients, /data-client-risk=\{isHighRisk \? "high" : "normal"\}/);
  assert.match(clients, /data-client-timing=\{isNextActionOverdue \? "overdue" : "planned"\}/);
  assert.match(clients, /Risco alto/);
  assert.match(clients, /Status \+ risco/);
  assert.match(clients, /data-clientes-sticky="client"/);
  assert.match(clients, /data-clientes-sticky="actions"/);
  assert.match(clientsCss, /\.clientes-table-row\.is-selected > td \{\s*background: var\(--selected-subtle\);/);
  assert.match(clientsCss, /\.clientes-table-row\.is-selected > td:first-child::before \{\s*background: var\(--selected-marker\);/);
  assert.match(clientsCss, /\[data-client-timing="overdue"\]:not\(\.is-selected\) > td:first-child::before \{\s*background: var\(--danger\);/);
  assert.match(clientsCss, /\.clientes-table \[data-clientes-sticky="client"\] \{\s*left: 0;/);
  assert.match(clientsCss, /\.clientes-table \[data-clientes-sticky="actions"\] \{\s*right: 0;/);
  assert.match(clientsCss, /@media \(max-width: 1360px\)[\s\S]*min-width: 1000px;/);

  assert.match(negocios, /const totalBusinesses = summary\?\.total \?\? pagination\.total;/);
  assert.match(negocios, /<NegociosKanbanBoard/);
  assert.match(negocios, /Sem negócios nesta etapa/);
  assert.match(negocios, /export function BusinessCard/);
  assert.match(negocios, /isNextActionOverdue \? "is-overdue"/);
  assert.match(negociosCss, /\.negocios-board \{[\s\S]*grid-template-columns: repeat\(5, minmax\(280px, 296px\)\);/);
  assert.match(negociosCss, /\.negocios-stage-header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.doesNotMatch(negociosCss, /\.negocios-stage\[data-stage=/);
  assert.match(negociosCss, /\.negocios-card\.is-overdue \{\s*border-left: 2px solid var\(--danger\);/);
  assert.match(negociosCss, /\.negocios-card-rhythm \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(negociosCss, /\.negocios-board-scroll \{[\s\S]*max-width: 100%;/);

  assert.match(fixture, /DashboardClientsTable/);
  assert.match(fixture, /BusinessCard/);
  assert.match(fixture, /clientes-filled-selected-risk/);
  assert.match(fixture, /negocios-filled-lost-stalled-reflow/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.doesNotMatch(`${clients}\n${negocios}`, /Novo neg[oó]cio/i);
});
