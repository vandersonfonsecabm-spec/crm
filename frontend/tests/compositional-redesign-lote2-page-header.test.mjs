import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 2 mantém um page header curto, com CTA real e overflow acessível", async () => {
  const [header, overflow, dashboard, css] = await Promise.all([
    source("src/components/dashboard/DashboardHeader.tsx"),
    source("src/components/dashboard/DashboardActionOverflow.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/index.css"),
  ]);

  assert.match(header, /showBackendCaption = false/);
  assert.match(header, /<header className=\{`page-header \$\{compact \? "mb-3" : "mb-5"\}`\} data-page=\{activePage\}>/);
  assert.match(header, /<h1 className="truncate text-\[23px\] font-semibold leading-\[1\.25\]" title=\{pageTitle\}>\{pageTitle\}<\/h1>/);
  assert.doesNotMatch(header, /pageMeta|pageDescription|page-breadcrumb|CRM Agro/);
  assert.match(header, /<DashboardActionOverflow[\s\S]*?iconSize="md"[\s\S]*?pageTitle=\{pageTitle\}/);
  assert.match(overflow, /const ariaLabel = `Mais ações de \$\{pageTitle\}`/);
  assert.match(overflow, /<IconButton[\s\S]*?aria-haspopup="menu"[\s\S]*?aria-label=\{ariaLabel\}[\s\S]*?ref=\{actionsButtonRef\}/);
  assert.match(overflow, /createPortal\([\s\S]*?document\.body/);
  assert.match(overflow, /event\.key === "Escape"[\s\S]*?closeActionsMenu\(true\)/);
  assert.match(header, /primaryAction\?\.onClick \?\? onCreateClient/);
  assert.match(header, /<Button[\s\S]*?className="page-primary-action"[\s\S]*?disabled=\{readOnly\}[\s\S]*?size="md"[\s\S]*?variant="primary"/);
  assert.match(css, /\.page-header-main \{ min-height: 56px; \}/);
  assert.match(css, /\.page-header \.page-secondary-action, \.page-header \.page-primary-action \{ min-height: 44px; \}/);

  assert.match(dashboard, /actions=\{usingNegociosKanban \? \[\] : pageActions\}/);
  assert.match(dashboard, /clientes:\s*\[\s*\{ label: "Exportar página atual", onClick: exportCsv \}/);
  assert.match(dashboard, /label: "Novo acompanhamento", onClick: \(\) => setAgendaCreateRequestKey/);
  assert.match(dashboard, /label: "Novo Lead", onClick: \(\) => setLeadsCreateRequestKey/);
  assert.doesNotMatch(header, /Novo negócio/);
});

test("Lote 2 mantém busca local antes dos filtros e secundárias, com medidas compartilhadas", async () => {
  const [toolbar, layout, button, fields, css] = await Promise.all([
    source("src/components/dashboard/DashboardOperationalSearch.tsx"),
    source("src/components/ui/Layout.tsx"),
    source("src/components/ui/Button.tsx"),
    source("src/components/ui/Fields.tsx"),
    source("src/index.css"),
  ]);

  assert.match(toolbar, /<FilterBar[\s\S]*?aria-label=\{`\$\{isClientsPage \? "Buscar e filtrar clientes" : "Buscar e filtrar registros"\}: \$\{toolbarStatus\}/);
  assert.match(toolbar, /className="compositional-local-toolbar border-0 bg-transparent px-3 py-1\.5 shadow-none"/);
  assert.doesNotMatch(toolbar, /SlidersHorizontal|<Toolbar/);
  assert.match(layout, /flex min-w-0 flex-wrap items-end gap-2/);
  assert.match(button, /md: "h-9 gap-2 px-3 text-xs"/);
  assert.match(fields, /const fieldClass = "h-9/);
  assert.match(css, /\.crm-workspace \.compositional-local-toolbar \{ min-height: 48px; align-items: center; \}/);
  assert.match(css, /@media \(min-width: 1360px\) \{[\s\S]*?\.crm-workspace \.compositional-local-toolbar \{ flex-wrap: nowrap; \}/);

  const normalizedToolbar = toolbar.replace(/\r\n/g, "\n");
  const searchIndex = normalizedToolbar.indexOf('placeholder="Buscar cliente, empresa, telefone, e-mail ou tag..."');
  const statusIndex = normalizedToolbar.indexOf('aria-label="Filtrar por status"');
  const sortIndex = normalizedToolbar.indexOf('aria-label={isClientsPage ? "Ordenar clientes" : "Ordenar registros"}');
  const favoritesIndex = normalizedToolbar.indexOf(">\n          Favoritos");
  const hotIndex = normalizedToolbar.indexOf(">\n          Quentes");
  const clearIndex = normalizedToolbar.indexOf(">\n            Limpar filtros");
  const csvIndex = normalizedToolbar.lastIndexOf("CSV");

  assert.ok(searchIndex >= 0 && searchIndex < statusIndex);
  assert.ok(statusIndex < sortIndex && sortIndex < favoritesIndex && favoritesIndex < hotIndex);
  assert.ok(hotIndex < clearIndex && clearIndex < csvIndex);
  assert.match(toolbar, /\{!isClientsPage && \(\s*<Button[\s\S]*?onClick=\{exportCsv\}[\s\S]*?>\s*CSV/);
  assert.equal((toolbar.match(/size="md"/g) ?? []).length, 4);
});

test("fixture do Lote 2 reutiliza componentes reais e não cria sessão, rede ou escrita", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote2-page-header.tsx"),
    source("tests/fixtures/compositional-redesign-lote2-page-header.html"),
  ]);

  assert.match(fixture, /DashboardSidebar/);
  assert.match(fixture, /DashboardTopbar/);
  assert.match(fixture, /DashboardHeader/);
  assert.match(fixture, /FilterBar/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /authSession=\{null\}/);
  assert.match(fixture, /\breadOnly\b/);
  assert.match(fixture, /actions=\{\[\{ label: "Exportar página atual" \}\]\}/);
  assert.doesNotMatch(fixture, />CSV</);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote2-page-header\.tsx"/);
});
