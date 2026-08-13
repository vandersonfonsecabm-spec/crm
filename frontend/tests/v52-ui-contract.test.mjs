import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V52 shell keeps collapse, attention badge, progressive mobile navigation and skip link contracts", () => {
  const sidebar = read("src/components/dashboard/DashboardSidebar.tsx");
  const css = read("src/components/dashboard/DashboardSidebar.css");
  const dashboard = read("src/pages/Dashboard.tsx");
  assert.match(sidebar, /aria-expanded=\{!collapsed\}/);
  assert.match(sidebar, /aria-controls="sidebar-navigation"/);
  assert.match(sidebar, /attentionCount/);
  assert.match(sidebar, /Mais/);
  assert.match(css, /mobile-navigation-badge/);
  assert.match(css, /min-height: 44px/);
  assert.match(dashboard, /crm-sidebar-collapsed/);
  assert.match(dashboard, /id="crm-main-content"/);
  assert.match(dashboard, /className="skip-link"/);
});

test("V52 busca global expõe estados de combobox e lista focável sem duplicar foco", () => {
  const search = read("src/components/dashboard/DashboardCommandSearch.tsx");
  assert.match(search, /aria-busy=\{isSearching\}/);
  assert.match(search, /role="status"/);
  assert.match(search, /role="alert"/);
  assert.match(search, /id="crm-command-results-listbox" role="listbox"/);
  assert.match(search, /role="option"/);
  assert.match(search, /tabIndex=\{-1\}/);
  assert.match(search, /key: `client-\$\{client\.id\}`/);
  assert.match(search, /aria-activedescendant=\{showCommandResults/);
  assert.match(read("src/pages/Dashboard.tsx"), /handleSearchSelectClient/);
});

test("V52 arquivamento mantém cliente arquivado somente leitura e oferece restauração/exclusão segura", () => {
  const modal = read("src/components/dashboard/ClientModal.tsx");
  const clientPanel = read("src/components/dashboard/DashboardSelectedClientPanel.tsx");
  const api = read("src/services/crmApi.ts");
  assert.match(modal, /Restaure-o para editar/);
  assert.match(modal, /data-client-restore/);
  assert.match(modal, /Exclusão permanente/);
  assert.match(modal, /role="alert"/);
  assert.match(clientPanel, /Abrir cadastro para restaurar/);
  assert.match(api, /archiveClienteOnBackend/);
  assert.match(api, /restoreClienteOnBackend/);
});

test("V52 linha do tempo preserva histórico arquivado sem ações operacionais", () => {
  const timeline = read("src/components/dashboard/DashboardClientTimeline.tsx");
  assert.match(timeline, /readOnly/);
  assert.match(timeline, /Contexto disponível após restaurar/);
  assert.match(timeline, /min-h-11 min-w-11/);
});

test("V52 idioma e contagem de atenção não assumem zero em falha fria", () => {
  const html = read("index.html");
  const dashboard = read("src/pages/Dashboard.tsx");
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(dashboard, /useState<number \| null>\(null\)/);
  assert.match(dashboard, /attentionCount=\{inboxAttentionCount\}/);
  assert.doesNotMatch(dashboard, /Nao foi possivel|indisponiveis/);
});
