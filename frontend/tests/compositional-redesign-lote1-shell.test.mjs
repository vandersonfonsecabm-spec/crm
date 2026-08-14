import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 1 mantém o shell denso, acessível e ancorado em ações reais", async () => {
  const [sidebar, sidebarCss, topbar, search, css] = await Promise.all([
    source("src/components/dashboard/DashboardSidebar.tsx"),
    source("src/components/dashboard/DashboardSidebar.css"),
    source("src/components/dashboard/DashboardTopbar.tsx"),
    source("src/components/dashboard/DashboardCommandSearch.tsx"),
    source("src/index.css"),
  ]);

  assert.match(sidebar, /dashboardNavigationGroups/);
  assert.match(sidebar, /!route\.requiresIntegrationAccess \|\| canManageIntegrations/);
  assert.match(sidebar, /!route\.requiresUserManagement \|\| canManageUsers/);
  assert.match(sidebar, /!route\.requiresLeadsCommunication \|\| leadsCommunicationEnabled/);
  assert.match(sidebar, /!route\.requiresPlatformOperator \|\| isPlatformOperator/);
  assert.match(sidebar, /event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(sidebar, /aria-label=\{`\$\{label\}/);
  assert.match(sidebar, /exigindo atenção/);
  assert.match(sidebar, /title=\{label\}/);
  assert.doesNotMatch(sidebar, /sidebar-account|sidebar-avatar/);
  assert.match(sidebarCss, /\.sidebar-nav-item\.is-active \{[\s\S]*?background: var\(--sidebar-active\);/);
  assert.match(sidebarCss, /\.sidebar-nav-item\.is-active::before[\s\S]*?background: var\(--selected-marker\);/);
  assert.match(sidebarCss, /\.sidebar-nav-item:focus-visible[\s\S]*?outline: 2px solid var\(--emphasis-focus-outline\);/);

  assert.match(css, /--sidebar-expanded-width:\s*224px;/);
  assert.match(css, /@media \(min-width: 1024px\) and \(max-width: 1199px\) \{[\s\S]*?--sidebar-width:\s*var\(--sidebar-collapsed-width\);/);
  assert.match(css, /sidebar-nav-label \{ display: none; \}/);
  assert.match(css, /topbar-shell \{ height:\s*52px; flex:\s*0 0 52px;/);

  assert.match(topbar, /h-\[52px\]/);
  assert.match(topbar, /!readOnly && \(\s*<DashboardQuickActions/);
  assert.match(topbar, /<UserMenu [\s\S]*?readOnly=\{readOnly\}/);
  assert.doesNotMatch(topbar, /NotificationsMenu|Notificações|Área de trabalho|Sessão protegida/);

  assert.match(search, /placeholder="Buscar páginas e clientes…"/);
  assert.match(search, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === "k"/);
  assert.match(search, /useEffect\(\(\) => \{\s*if \(readOnly\) return;\s*const term = normalizeCommandTerm\(commandSearch\);[\s\S]*?fetchClientesFromBackend/);
});

test("fixture do Lote 1 usa o shell real e permanece somente leitura", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote1-shell.tsx"),
    source("tests/fixtures/compositional-redesign-lote1-shell.html"),
  ]);

  assert.match(fixture, /DashboardSidebar/);
  assert.match(fixture, /DashboardTopbar/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /authSession=\{null\}/);
  assert.match(fixture, /\breadOnly\b/);
  assert.doesNotMatch(fixture, /\bfetch\b|fetchClientesFromBackend|localStorage|sessionStorage|document\.cookie|Authorization/);
  assert.match(html, /src="\/tests\/fixtures\/compositional-redesign-lote1-shell\.tsx"/);
});
