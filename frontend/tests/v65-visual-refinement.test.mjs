import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd(), "src");
const overview = fs.readFileSync(path.join(root, "components/dashboard/DashboardOverview.tsx"), "utf8");
const commercial = fs.readFileSync(path.join(root, "components/dashboard/DashboardControlCenter.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "index.css"), "utf8");

test("V65 keeps operational summary derived from already loaded state", () => {
  assert.match(overview, /buildOverviewOperationalSummary\(attentionCount, attentionCountFresh, agendaSummary, agendaLoadState, model\.attentionSignals\.length > 0\)/);
  assert.match(overview, /attentionCountFresh && attentionCount !== null && attentionCount > 0/);
  assert.match(overview, /indicadores\.paraHoje/);
  assert.match(overview, /isDataState\(model\.state\) \? buildOverviewOperationalSummary/);
  assert.match(overview, /agendaLoadState === "ready" \? readMetric\(agendaSummary\?\.indicadores\.atrasados\)/);
  assert.match(overview, /if \(parts\.length > 0\) return/);
  assert.match(overview, /return null;/);
});

test("V65 removes the English snapshot kicker and keeps commercial summary state-safe", () => {
  assert.doesNotMatch(commercial, />Snapshot atual</i);
  assert.match(commercial, /buildCommercialOperationalSummary\(snapshot, snapshotState\)/);
  assert.match(commercial, /summaryAllowed: boolean/);
  assert.match(commercial, /summaryAllowed \? buildCommercialOperationalSummary/);
  assert.match(commercial, /state !== "ready" \|\| !snapshot/);
  assert.match(commercial, /commercial-header-summary/);
});

test("V65 uses the existing data blocks more intentionally and keeps commercial mobile metrics 2x2", () => {
  assert.match(css, /\.crm-overview-action-grid \{ grid-template-columns: minmax\(0, 1\.45fr\) minmax\(320px, \.85fr\);/);
  assert.match(css, /\.crm-overview-support-grid \{ grid-template-columns: minmax\(0, 1\.2fr\) minmax\(320px, \.8fr\);/);
  assert.match(css, /\.commercial-process-grid \{ grid-template-columns: minmax\(0, 1\.2fr\) minmax\(320px, \.8fr\);/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.commercial-process-metrics \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.commercial-process-kicker \{ display: none; \}/);
});

test("V65 does not add backend or data-contract files", () => {
  const changed = process.env.V65_CHANGED_FILES?.split("\n").filter(Boolean) ?? [];
  assert.equal(changed.some((file) => /^(backend|prisma|migrations)\\/i.test(file)), false);
});
