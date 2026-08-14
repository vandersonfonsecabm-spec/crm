import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const panel = fs.readFileSync(path.join(root, "src/components/leads-communication/DashboardInboxPanel.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/leads-communication/LeadsCommunication.css"), "utf8");
const pagination = fs.readFileSync(path.join(root, "src/components/ui/Pagination.tsx"), "utf8");

test("V63 command bar separates the active queue from secondary filters", () => {
  assert.match(panel, /data-testid="inbox-queue-selector"/);
  assert.match(panel, /aria-label="Fila da caixa de entrada"/);
  assert.match(panel, /<optgroup label="Filas principais">/);
  assert.match(panel, /<option value="lembrar-depois">Lembrar depois<\/option>/);
  assert.match(panel, /Filtros ativos · \{activeFilterCount\}/);
  assert.match(panel, /function resetSecondaryFilters\(\)/);
  assert.doesNotMatch(panel, /<h3[^>]*>Escopo<\/h3>/);
  assert.match(panel, /description="Refine por estado, SLA, canal, responsável ou Lead\."/);
});

test("V63 list and actions preserve operational semantics without badge duplication", () => {
  assert.match(panel, /inbox-conversation-channel-meta/);
  assert.match(panel, /inbox-conversation-reminder is-overdue/);
  assert.match(panel, /const leaseIndicator = otherLease/);
  assert.match(panel, /exceptionalIndicator \|\| leaseIndicator/);
  assert.match(panel, /aria-label="Abrir próxima pendência"/);
  assert.match(panel, />Próxima<\/Button>/);
  assert.match(panel, /Pendente sem prazo/);
  assert.match(panel, /Agendar lembrete/);
  assert.match(panel, /setInterval\(\(\) => setRenderNow\(Date\.now\(\)\), 30000\)/);
  assert.match(pagination, />\{nextLabel\}<\/Button>/);
});

test("V63 pagination is explicit and the empty Inbox does not announce a fake page", () => {
  assert.match(panel, /Boolean\(list\?\.pagination\.total\)/);
  assert.match(panel, /previousLabel="Página anterior"/);
  assert.match(panel, /nextLabel="Próxima página"/);
  assert.match(pagination, /previousLabel\?: string/);
  assert.match(pagination, /nextLabel\?: string/);
  assert.match(pagination, /const currentPage = Math\.min\(Math\.max\(1, page\), safeTotalPages\)/);
  assert.match(panel, /const lastAvailablePage = Math\.max\(1, response\.pagination\.totalPages\)/);
  assert.match(panel, /if \(listQuery\.page > lastAvailablePage\) \{\s*setPage\(lastAvailablePage\);\s*return;/);
});

test("V63 command bar has a tablet-safe two-row layout and compact queue control", () => {
  assert.match(css, /\.inbox-command-leading\s*\{[\s\S]*?min-width: 0/);
  assert.match(css, /\.inbox-queue-select\s*\{[\s\S]*?min-width: 190px/);
  assert.match(css, /@media \(max-width: 1023px\)\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"leading actions"[\s\S]*?"search search"/);
});
