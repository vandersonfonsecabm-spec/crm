import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("G2A exige flag global literal e capability do tenant", async () => {
  const [flags, dashboard] = await Promise.all([
    source("src/config/featureFlags.ts"),
    source("src/pages/Dashboard.tsx"),
  ]);
  assert.match(flags, /VITE_NEGOCIOS_KANBAN_ENABLED\s*===\s*["']true["']/);
  assert.match(flags, /negociosKanban:\s*isNegociosKanbanEnabled\(\)\s*&&\s*capabilities\?\.negociosKanban === true/);
  assert.match(dashboard, /usingNegociosKanban/);
  assert.match(dashboard, /usingNegociosKanban && authSession/);
  assert.match(dashboard, /!negociosKanbanEnabled && <DashboardKanbanBoard/);
});

test("G2A usa Negocio como fonte, lock de etapa e rollback otimista", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  assert.match(panel, /fetchNegociosKanban/);
  assert.match(panel, /updateNegocioKanbanStage/);
  assert.match(panel, /stageUpdates\.current/);
  assert.match(panel, /const snapshot = businesses/);
  assert.match(panel, /setBusinesses\(snapshot\)/);
  assert.match(panel, /setData\("negocioId"/);
  assert.match(api, /\/negocios\/\$\{id\}\/etapa/);
  assert.match(api, /etapaAnterior/);
  assert.doesNotMatch(panel, /updateClienteOnBackend|Cliente\.status|lead\.status\s*=/);
});

test("G2A separa metricas e detalhes do fluxo legado", async () => {
  const panel = await source("src/components/negocios/DashboardNegociosKanbanPanel.tsx");
  assert.match(panel, /summary\?\.total/);
  assert.match(panel, /summary\?\.fechados/);
  assert.match(panel, /summary\?\.perdidos/);
  assert.match(panel, /Conversas relacionadas/);
  assert.match(panel, /Nenhum Negócio encontrado/);
  assert.doesNotMatch(panel, /changeStatus|statusUpdatesInFlight|KanbanLeadCard/);
});
