import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Lote 5 compõe Clientes com seis colunas contratuais, sem Score e com Abrir sempre acessível", async () => {
  const [table, css] = await Promise.all([
    source("src/components/dashboard/DashboardClientsTable.tsx"),
    source("src/components/dashboard/DashboardClientes.css"),
  ]);

  for (const label of ["Cliente", "Localização", "Contato", "Status + risco", "Próxima ação", "Ações"]) {
    assert.match(table, new RegExp(`<th[^>]*>${escapeRegExp(label)}</th>`));
  }
  assert.equal((table.match(/<th /g) ?? []).length, 6);
  assert.match(table, /data-clientes-sticky="client"/);
  assert.match(table, /data-clientes-sticky="actions"/);
  assert.match(table, /aria-label=\{`Abrir Cliente 360 de \$\{client\.name\}`\}/);
  assert.match(table, />\s*Abrir\s*<\/Button>/);
  assert.match(table, /function rowActions/);
  assert.match(table, /Remover dos favoritos/);
  assert.match(table, /Abrir confirmação de WhatsApp/);
  assert.doesNotMatch(table, /\bScore\b|data-clientes-score|scoreClass|getLeadScore|money\(client\.value\)|Registros carregados/);

  assert.match(css, /\.clientes-table-scroll \{\s*max-width: 100%;[\s\S]*?overscroll-behavior-x: contain;/);
  assert.match(css, /\.clientes-table \[data-clientes-sticky="client"\] \{\s*left: 0;/);
  assert.match(css, /\.clientes-table \[data-clientes-sticky="actions"\] \{\s*right: 0;/);
  assert.match(css, /@media \(max-width: 1360px\)[\s\S]*?\.clientes-table \{\s*min-width: 1000px;/);
});

test("Lote 5 mantém ações reais no overflow existente e a sequência local de toolbar", async () => {
  const [header, overflow, toolbar, dashboard] = await Promise.all([
    source("src/components/dashboard/DashboardHeader.tsx"),
    source("src/components/dashboard/DashboardActionOverflow.tsx"),
    source("src/components/dashboard/DashboardOperationalSearch.tsx"),
    source("src/pages/Dashboard.tsx"),
  ]);

  assert.match(header, /actionsPlacement\?: "header" \| "toolbar"/);
  assert.match(header, /<DashboardActionOverflow[\s\S]*?iconSize="md"/);
  assert.match(overflow, /aria-haspopup="menu"/);
  assert.match(overflow, /createPortal\([\s\S]*?document\.body/);
  assert.match(overflow, /event\.key === "Escape"[\s\S]*?closeActionsMenu\(true\)/);
  assert.match(overflow, /triggerLabel \? \(/);
  assert.match(toolbar, /pageActions\?: PageAction\[\];/);
  assert.match(toolbar, /triggerLabel="Mais"/);
  assert.match(toolbar, /activeFiltersCount > 0 && !isClientsPage/);
  assert.match(toolbar, /\{!isClientsPage && \(/);

  const normalizedToolbar = toolbar.replace(/\r\n/g, "\n");
  const searchIndex = normalizedToolbar.indexOf('placeholder="Buscar cliente, empresa, telefone, e-mail ou tag..."');
  const statusIndex = normalizedToolbar.indexOf('aria-label="Filtrar por status"');
  const sortIndex = normalizedToolbar.indexOf('aria-label={isClientsPage ? "Ordenar clientes" : "Ordenar registros"}');
  const favoritesIndex = normalizedToolbar.indexOf(">\n          Favoritos");
  const hotIndex = normalizedToolbar.indexOf(">\n          Quentes");
  const moreIndex = normalizedToolbar.indexOf('triggerLabel="Mais"');
  assert.ok(searchIndex >= 0 && searchIndex < statusIndex && statusIndex < sortIndex && sortIndex < favoritesIndex && favoritesIndex < hotIndex && hotIndex < moreIndex);

  assert.match(dashboard, /actionsPlacement=\{activePage === "clientes" \? "toolbar" : "header"\}/);
  assert.match(dashboard, /pageActions=\{activePage === "clientes" \? pageActions : \[\]\}/);
  assert.match(dashboard, /activePage !== "comercial" && activePage !== "clientes" && activePage !== "agenda"/);
  assert.doesNotMatch(dashboard, /DashboardClientsInsights/);
});

test("Lote 5 preserva o drawer real e sua largura composicional", async () => {
  const drawer = await source("src/components/dashboard/DashboardCustomerDrawer.tsx");

  assert.match(drawer, /w-\[clamp\(400px,32vw,440px\)\] max-w-\[calc\(100vw-24px\)\]/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /onRequestFocusSessionClose/);
});

test("fixture L5 reutiliza a tela real, tem seleção/risco/drawer e não cria sessão, rede ou escrita", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote5-clientes.tsx"),
    source("tests/fixtures/compositional-redesign-lote5-clientes.html"),
  ]);

  for (const component of ["DashboardHeader", "DashboardOperationalSearch", "DashboardClientsTable", "DashboardCustomerDrawer", "DashboardSidebar", "DashboardTopbar"]) {
    assert.match(fixture, new RegExp(component));
  }
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /selectedId=\{selectedClient\.id\}/);
  assert.match(fixture, /getRisk=\{\(client\) => client\.id === selectedClient\.id \? "Alto" : "Baixo"\}/);
  assert.match(fixture, /new URLSearchParams\(window\.location\.search\)\.get\("drawer"\) !== "0"/);
  assert.match(fixture, /open=\{isDrawerOpen\}/);
  assert.match(fixture, /overlay=\{isDrawerOpen\}/);
  assert.match(fixture, /pageActions=\{pageActions\}/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization|backendId/);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote5-clientes\.tsx"/);
});
