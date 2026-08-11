import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 4 mantém a cadência temporal da Agenda por marcadores sem cardificar linhas", async () => {
  const [panel, css] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/components/dashboard/DashboardAgenda.css"),
  ]);

  assert.match(panel, /agenda-temporal-group--\$\{group\.key\}/);
  assert.match(panel, /const temporalEmphasis = temporalGroup/);
  assert.match(panel, /const temporalRowClass = temporalGroup \? `agenda-row--\$\{temporalGroup\}`/);
  assert.match(panel, /data-temporal-emphasis=\{temporalEmphasis\}/);
  assert.match(panel, /temporalEmphasis === "today"[\s\S]*text-\[var\(--primary\)\]/);
  assert.match(panel, /temporalEmphasis === "upcoming"[\s\S]*text-\[var\(--info\)\]/);
  assert.match(panel, /key: "today", label: "Hoje"/);

  assert.match(css, /\.agenda-temporal-group--overdue[\s\S]*var\(--danger\)/);
  assert.match(css, /\.agenda-temporal-group--today[\s\S]*var\(--brand\)/);
  assert.match(css, /\.agenda-temporal-group--upcoming[\s\S]*var\(--info\)/);
  assert.match(css, /\.agenda-row--completed\s*\{\s*border-left-color: transparent/);
  assert.match(css, /\.agenda-row--cancelled\s*\{\s*border-left-color: transparent/);
  assert.match(css, /@media \(max-width: 1359px\)[\s\S]*\.agenda-workspace/);
  assert.doesNotMatch(css, /box-shadow:/);
});

test("Lote 4 torna a Inbox semântica, selecionável e neutra por canal", async () => {
  const [inbox, css] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  assert.match(inbox, /function isSlaException/);
  assert.match(inbox, /const primaryQueueBadge = slaException/);
  assert.match(inbox, /\(slaException \|\| otherLease\).*inbox-conversation-status-text/);
  assert.match(inbox, /const selectedSlaException = isSlaException\(conversation\?\.sla \?\? null\)/);
  assert.match(inbox, /border-\[var\(--brand-border\)\] bg-\[var\(--brand-subtle\)\]/);
  assert.match(inbox, /border-\[var\(--info-border\)\] bg-\[var\(--info-subtle\)\]/);
  assert.doesNotMatch(inbox, /(?:border|bg)-(?:emerald|sky)-/);

  assert.match(css, /\.inbox-conversation-item\.is-selected[\s\S]*var\(--selected-marker\)/);
  assert.match(css, /\.inbox-conversation-item\[aria-current="true"\] \.inbox-conversation-name[\s\S]*font-weight: 700/);
  assert.match(css, /\.communication-channel-site,[\s\S]*\.communication-channel-unknown[\s\S]*border-left: 3px solid var\(--border-strong\)/);
  assert.match(css, /\.inbox-actions-menu > div button:focus-visible[\s\S]*outline: 2px solid var\(--focus-ring\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test("Lote 4 transpila os componentes focais sem erro de sintaxe", async () => {
  for (const relativePath of [
    "src/components/dashboard/DashboardAgendaPanel.tsx",
    "src/components/leads-communication/DashboardInboxPanel.tsx",
  ]) {
    const output = ts.transpileModule(await source(relativePath), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: relativePath,
      reportDiagnostics: true,
    });
    const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${relativePath}: ${errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")).join("; ")}`);
  }
});
