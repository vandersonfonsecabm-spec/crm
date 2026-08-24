import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(path.join(frontend, file), "utf8");

test("E4 conecta somente as leituras E2 e mantém o gate de prévia explícito", async () => {
  const [api, panel, dashboard, navigation] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/components/stock/StockControlPanel.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/navigation/dashboardNavigation.ts"),
  ]);
  for (const route of ["/estoque/fontes", "/estoque/freshness", "/estoque/problemas-qualidade", "/estoque/importacoes/preview"]) assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(panel, /UNKNOWN/);
  assert.match(panel, /STALE/);
  assert.match(panel, /Gerar prévia segura/);
  assert.match(panel, /Nenhuma linha é aplicada antes/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-label="Controle operacional de estoque"/);
  assert.match(dashboard, /<StockControlPanel\b/);
  assert.match(navigation, /stockDetail/);
  assert.match(navigation, /\/estoque\/(produtos|lotes|fontes)/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|window\.open/);
});
