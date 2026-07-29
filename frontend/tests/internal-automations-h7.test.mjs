import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H7 entrega workspace de automacoes com dados reais e sem promessa externa", async () => {
  const panel = await source("src/components/dashboard/DashboardAutomationsPanel.tsx");

  for (const label of [
    "Automações",
    "Regras",
    "Nova regra",
    "Simulação",
    "Execuções recentes",
    "Criar acompanhamento",
    "Evento tecnico interno",
    "Round-robin",
    "Simular sem efeitos",
    "Retry",
  ]) assert.match(panel, new RegExp(label));

  assert.match(panel, /LEAD_CREATED/);
  assert.match(panel, /LEAD_WITHOUT_FOLLOW_UP/);
  assert.match(panel, /DEAL_STALLED/);
  assert.match(panel, /setSimulation\(await simulateAutomationRule/);
  assert.match(panel, /availableActions = options\?\.actions \?\? \[\]/);
  assert.match(panel, /availableActions\.map\(\(value\)/);
  assert.doesNotMatch(panel, /Object\.entries\(actionLabels\)\.map/);
  assert.doesNotMatch(panel, /graph\.facebook|api\.whatsapp|facebook\.com|oauth|webhook externo|enviar mensagem externa/i);
  assert.doesNotMatch(panel, /JSON\.stringify\(.*condicoes|<pre|textarea.*JSON/i);
});

test("H7 usa apenas endpoints internos explicitos de automacao", async () => {
  const api = await source("src/services/crmApi.ts");

  for (const endpoint of [
    "/automacoes/resumo",
    "/automacoes/opcoes",
    "/automacoes",
    "/automacoes/simular",
    "/automacoes/execucoes",
    "/automacoes/falhas",
    "/automacoes/jobs/",
    "/ativar",
    "/desativar",
    "/reprocessar",
  ]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));

  assert.doesNotMatch(api, /graph\.facebook|api\.whatsapp|oauth|localStorage\.setItem\([^)]*autom/i);
});

test("H7 reconhece capability e feature flag sem habilitar por padrao", async () => {
  const [api, flags] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/config/featureFlags.ts"),
  ]);

  assert.match(api, /automations: boolean/);
  assert.match(api, /automations: capabilities\?\.automations === true/);
  assert.match(flags, /VITE_AUTOMATIONS_ENABLED/);
  assert.match(flags, /capabilities\?\.automations === true/);
});
