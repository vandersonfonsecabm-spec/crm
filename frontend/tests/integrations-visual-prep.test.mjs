import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const panel = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationReadinessPanel.tsx", root), "utf8");
const boundary = fs.readFileSync(new URL("src/services/metaInstagramBoundary.ts", root), "utf8");
const integrations = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationsPanel.tsx", root), "utf8");

test("preparação visual de integrações usa estados honestos e a superfície existente", () => {
  assert.match(integrations, /DashboardIntegrationReadinessPanel/);
  assert.match(panel, /Instagram Direct \/ Meta/);
  assert.match(panel, /Facebook \/ Meta/);
  assert.match(panel, /Serasa \/ score/);
  assert.match(boundary, /Preparado para conexão/);
  assert.match(panel, /Configuração pendente/);
  assert.match(panel, /Ainda não disponível/);
  assert.match(panel, /Conectar Instagram/);
  assert.match(panel, /Aguardando canal Instagram real/);
  assert.doesNotMatch(panel, /graph\.facebook|fetch\(|axios\(/i);
});

test("a preparação não apresenta conexão, sincronização ou score como fato", () => {
  assert.doesNotMatch(panel, /label: "Conectado"/i);
  assert.match(boundary, /source: "local-preparation"/);
  assert.match(panel, /disabled={!instagramAction \|\| busy}/);
  assert.match(boundary, /REAL_META_ACCOUNT_REQUIRED_FOR_E2E/);
});
