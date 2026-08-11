import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Onda 4 Negócios organiza o pipeline real por etapa, ritmo e próxima ação", async () => {
  const [panel, css] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/DashboardNegocios.css"),
  ]);

  assert.match(panel, /fetchNegociosKanban/);
  assert.match(panel, /data-stage=\{stage\}/);
  assert.match(panel, /business\.tempoEtapa\?\.atualSegundos/);
  assert.match(panel, /business\.proximaAcao/);
  assert.match(panel, /data-negocio-stalled/);
  assert.match(panel, /currency:\s*"BRL"/);
  assert.match(panel, /Sem negócios nesta etapa/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(280px, 296px\)\);/);
  assert.doesNotMatch(css, /\.negocios-stage\[data-stage=/);
  assert.match(css, /\.negocios-card-action\.is-overdue/);
  assert.doesNotMatch(panel, /updateClienteOnBackend|KanbanLeadCard/);
});

test("Onda 4 Negócios preserva filtros e torna o drawer modal recuperável", async () => {
  const panel = await source("src/components/negocios/DashboardNegociosKanbanPanel.tsx");

  for (const filter of ["PARADOS", "SEM_PROXIMA_ACAO", "PROXIMA_ACAO_ATRASADA", "PROXIMA_ACAO_HOJE"]) {
    assert.match(panel, new RegExp(filter));
  }
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /document\.body\.style\.overflow = "hidden"/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /event\.key !== "Tab"/);
  assert.match(panel, /closeButtonRef\.current\?\.focus/);
  assert.match(panel, /data-negocio-card-id=\{business\.id\}/);
  assert.match(panel, /document\.querySelector<HTMLElement>\('\[data-negocio-card-id="' \+ businessId \+ '"]'\)/);
  assert.match(panel, /if \(currentCard\?\.isConnected\) \{[\s\S]*?currentCard\.focus\(\{ preventScroll: true \}\);[\s\S]*?return;/);
  assert.match(panel, /if \(originalTrigger\?\.isConnected\) \{[\s\S]*?originalTrigger\.focus\(\{ preventScroll: true \}\);[\s\S]*?return;/);
});
