import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Lote 2 preserva a hierarquia plana com exceções semânticas reais", async () => {
  const [css, overview, commercial, sidebar, fixture] = await Promise.all([
    source("src/index.css"),
    source("src/components/dashboard/DashboardOverview.tsx"),
    source("src/components/dashboard/DashboardControlCenter.tsx"),
    source("src/components/dashboard/DashboardSidebar.css"),
    source("tests/fixtures/wave6/lot2-shell-references.tsx"),
  ]);

  assert.match(sidebar, /\.sidebar-nav-item\.is-active::before[\s\S]*background: var\(--selected-marker\);/);
  assert.match(sidebar, /\.sidebar-nav-item:focus-visible[\s\S]*border-color: var\(--focus\);[\s\S]*outline-offset: 2px;/);
  assert.match(css, /\.crm-workspace \.topbar-shell \{ border-color: var\(--border-subtle\);/);
  assert.match(css, /\.crm-workspace \.topbar-icon-button:focus-visible[\s\S]*outline-color: var\(--emphasis-focus-outline\);/);

  assert.match(overview, /data-overview-signal=\{signal\.key\}/);
  assert.match(css, /\[data-overview-signal="high-risk"\] \{ border-left: 2px solid var\(--danger\);/);
  assert.match(css, /\[data-overview-signal="silent"\] \{ border-left: 2px solid var\(--warning\);/);
  assert.match(css, /\.crm-overview-metrics dd \{[^}]*color: var\(--text-strong\);/);

  assert.match(commercial, /data-commercial-metric=\{metric\.key\}/);
  assert.match(commercial, /data-timing=\{item\.timing\.toLowerCase\(\)\}/);
  assert.match(commercial, /className="commercial-attention"/);
  assert.match(css, /\.commercial-summary-label, \.commercial-section-scope \{[^}]*border-radius: 99px;/);
  assert.match(css, /\.commercial-queue-row\[data-timing="overdue"\][\s\S]*var\(--danger\)/);
  assert.match(css, /\.commercial-queue-row\[data-timing="today"\][\s\S]*var\(--warning\)/);
  assert.match(css, /\.commercial-attention-copy strong \{[^}]*font-variant-numeric: tabular-nums;/);

  assert.doesNotMatch(`${css}\n${overview}\n${commercial}\n${sidebar}`, /Novo neg[oó]cio/i);
  assert.doesNotMatch(`${css}\n${overview}\n${commercial}\n${sidebar}`, /transition:\s*all\b/);
  assert.match(fixture, /DashboardSidebar/);
  assert.match(fixture, /DashboardOverview/);
  assert.match(fixture, /DashboardControlCenter/);
  assert.doesNotMatch(fixture, /\bfetch\b|localStorage|sessionStorage|document\.cookie|Authorization/);
});
