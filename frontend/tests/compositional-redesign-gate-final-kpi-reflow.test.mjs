import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function blockAfter(css, marker) {
  const markerIndex = css.indexOf(marker);
  assert.ok(markerIndex >= 0, `marcador ausente: ${marker}`);
  const openIndex = css.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(openIndex + 1, index);
  }
  throw new Error(`bloco não fechado: ${marker}`);
}

test("Gate Visual Final refluí KPIs em uma coluna apenas até 360px sem elipse monetária", async () => {
  const [css, overview, commercial] = await Promise.all([
    source("src/index.css"),
    source("src/components/dashboard/DashboardOverview.tsx"),
    source("src/components/dashboard/DashboardControlCenter.tsx"),
  ]);
  const mobile = blockAfter(css, "@media (max-width: 767px)");
  const narrow = blockAfter(css, "@media (max-width: 360px)");

  assert.match(overview, /className="crm-overview-metrics"/);
  assert.match(commercial, /className="commercial-metric-strip"/);
  assert.match(mobile, /\.crm-overview-metrics \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(mobile, /\.commercial-metric-strip, \.commercial-loading-metrics \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);

  assert.match(narrow, /\.crm-overview-metrics, \.crm-overview-loading-metrics, \.commercial-metric-strip, \.commercial-loading-metrics \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(narrow, /\.crm-overview-metrics dd, \.commercial-metric-strip dd \{ overflow: visible; text-overflow: clip; white-space: normal; \}/);
  assert.match(narrow, /nth-child\(n \+ 2\).*?border-top: 1px solid var\(--border\)/);
  assert.doesNotMatch(narrow, /ellipsis|nowrap/);
});
