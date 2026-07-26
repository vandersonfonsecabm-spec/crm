import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H6B consome os campos reais da H6A no card sem recalcular regra comercial", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  assert.match(api, /tempoEtapa\?: BusinessStageTiming/);
  assert.match(api, /negocioParado\?: boolean/);
  assert.match(api, /proximaAcao\?: BusinessNextAction/);
  assert.match(panel, /business\.tempoEtapa\?\.atualSegundos/);
  assert.match(panel, /business\.negocioParado/);
  assert.match(panel, /business\.proximaAcao/);
  assert.match(panel, /Tempo estimado na etapa/);
  assert.match(panel, /Nenhuma ação agendada/);
  assert.doesNotMatch(panel, /business\.etapa\s*===\s*["']FECHADO["'].*Parado/);
  assert.doesNotMatch(panel, /setInterval|setTimeout\(.*tempoEtapa/);
});

test("H6B apresenta duração, próxima ação e histórico parcial no drawer", async () => {
  const [timing, presentation] = await Promise.all([
    source("src/components/negocios/BusinessStageTimingPanel.tsx"),
    source("src/components/negocios/businessStagePresentation.ts"),
  ]);
  assert.match(timing, /Ritmo do Negócio/);
  assert.match(timing, /Tempo acumulado/);
  assert.match(timing, /Histórico parcial/);
  assert.match(presentation, /menos de 1 min/);
  assert.match(presentation, /\$\{totalHours\} h/);
  assert.match(presentation, /\$\{days\} \$\{days === 1 \? "dia" : "dias"\}/);
  assert.match(timing, /action\.atrasada \? "Atrasada" : "Agendada"/);
  assert.match(timing, /Nenhuma próxima ação/);
  assert.match(timing, /onOpenAgenda/);
  assert.doesNotMatch(timing, /createAcompanhamento|updateAcompanhamento/);
});

test("H6B carrega o histórico paginado sem duplicidade e preserva estados de falha", async () => {
  const [timing, api] = await Promise.all([
    source("src/components/negocios/BusinessStageTimingPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  assert.match(api, /fetchBusinessStageHistory/);
  assert.match(api, /historico-etapas\$\{toQueryString\(params\)\}/);
  assert.match(timing, /fetchBusinessStageHistory\(business\.id, \{ page, limit: 8 \}\)/);
  assert.match(timing, /new Set\(current\.map\(\(entry\) => entry\.id\)\)/);
  assert.match(timing, /filter\(\(entry\) => !existing\.has\(entry\.id\)\)/);
  assert.match(timing, /Carregar etapas anteriores/);
  assert.match(timing, /Nenhuma etapa finalizada foi registrada/);
  assert.match(timing, /Não foi possível carregar o histórico de etapas/);
  assert.match(timing, /onRetry=\{\(\) => void loadHistory\(1, false\)\}/);
  assert.match(timing, /requestError\.status === 403/);
  assert.doesNotMatch(timing, /Promise\.all|setInterval/);
});

test("H6B envia filtros operacionais ao backend e mantém a navegação da Agenda", async () => {
  const [panel, dashboard, api] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  for (const filter of ["PARADOS", "SEM_PROXIMA_ACAO", "PROXIMA_ACAO_ATRASADA", "PROXIMA_ACAO_HOJE"]) {
    assert.match(panel, new RegExp(filter));
    assert.match(api, new RegExp(filter));
  }
  assert.match(panel, /filtroOperacional: operationalFilter/);
  assert.match(panel, /onOpenAgenda=\{onOpenAgenda\}/);
  assert.match(dashboard, /onOpenAgenda=\{\(\) => handleSetActivePage\("agenda"\)\}/);
  assert.doesNotMatch(panel, /filter\(\(business\) => business\.negocioParado/);
});
