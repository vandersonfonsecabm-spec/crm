import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("overflow compartilhado usa portal fixo, colisão de viewport e menu ARIA navegável", async () => {
  const [overflow, css] = await Promise.all([
    source("src/components/dashboard/DashboardActionOverflow.tsx"),
    source("src/index.css"),
  ]);

  assert.match(overflow, /import \{ createPortal \} from "react-dom"/);
  assert.match(overflow, /getBoundingClientRect\(\)/);
  assert.match(overflow, /window\.innerWidth/);
  assert.match(overflow, /window\.innerHeight/);
  assert.match(overflow, /const fitsBelow/);
  assert.match(overflow, /const fitsAbove/);
  assert.match(overflow, /clamp\(triggerRect\.right - width/);
  assert.match(overflow, /createPortal\([\s\S]*?className=\{`page-actions-menu fixed[\s\S]*?document\.body/);
  assert.doesNotMatch(overflow, /page-actions-menu absolute right-0/);
  assert.match(overflow, /aria-controls=\{isActionsOpen \? menuId : undefined\}/);
  assert.match(overflow, /aria-expanded=\{isActionsOpen\}/);
  assert.match(overflow, /aria-labelledby=\{triggerId\}/);
  assert.match(overflow, /role="menu"/);
  assert.match(overflow, /role="menuitem"/);
  assert.match(overflow, /tabIndex=\{-1\}/);
  assert.match(overflow, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(overflow, /event\.key === "ArrowDown"/);
  assert.match(overflow, /event\.key === "ArrowUp"/);
  assert.match(overflow, /event\.key === "Home"/);
  assert.match(overflow, /event\.key === "End"/);
  assert.match(overflow, /event\.key === "Escape"[\s\S]*?closeActionsMenu\(true\)/);
  assert.match(overflow, /event\.key === "Tab"[\s\S]*?closeActionsMenu\(\)/);
  assert.match(overflow, /focusFirstMenuItem\(\)/);
  assert.match(overflow, /actionsButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /\.page-actions-menu \{ border-color: var\(--border\); background: var\(--surface-elevated\);/);
});

test("overflow cobre toolbar de Clientes, todas as linhas e Agenda sem criar ação", async () => {
  const [toolbar, clients, agenda, agendaCss] = await Promise.all([
    source("src/components/dashboard/DashboardOperationalSearch.tsx"),
    source("src/components/dashboard/DashboardClientsTable.tsx"),
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/components/dashboard/DashboardAgenda.css"),
  ]);

  assert.match(toolbar, /<DashboardActionOverflow[\s\S]*?pageTitle="Clientes"[\s\S]*?triggerLabel="Mais"/);
  assert.match(clients, /paginatedClients\.map\(\(client\) => \([\s\S]*?<ClientTableRow/);
  assert.match(clients, /function ClientTableRow[\s\S]*?<DashboardActionOverflow[\s\S]*?actions=\{rowActions\(client, onToggleFavorite, onToggleHot, onRequestWhatsapp\)\}/);
  assert.match(agenda, /groups\.map\(\(group\) => \([\s\S]*?group\.items\.map\(\(item\) => \([\s\S]*?<AgendaRow/);
  assert.match(agenda, /function AgendaRow[\s\S]*?<DashboardActionOverflow actions=\{overflowActions\} pageTitle=\{`acompanhamento \$\{item\.titulo\}`\} triggerLabel="Mais"/);
  assert.match(agendaCss, /\.agenda-row-context:not\(\[open\]\) > \.agenda-row-context-panel \{\s*display: none;/);
  assert.match(agendaCss, /\.agenda-row-context\[open\] > \.agenda-row-context-panel \{\s*display: flex;/);
  assert.doesNotMatch(`${toolbar}\n${clients}\n${agenda}`, /Nova ação de overflow|Novo menu de ações/);
});
