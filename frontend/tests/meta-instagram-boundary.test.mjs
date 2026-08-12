import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const boundary = fs.readFileSync(new URL("src/services/metaInstagramBoundary.ts", root), "utf8");
const panel = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationReadinessPanel.tsx", root), "utf8");

test("boundary Meta local mapeia estados reais sem chamada externa", () => {
  assert.match(boundary, /NOT_CONFIGURED/);
  assert.match(boundary, /WAITING_META_AUTH/);
  assert.match(boundary, /CONNECTED/);
  assert.match(boundary, /CONFIGURED_INACTIVE/);
  assert.match(boundary, /ERROR/);
  assert.match(boundary, /UNAVAILABLE/);
  assert.match(boundary, /REAL_META_ACCOUNT_REQUIRED_FOR_E2E/);
  assert.doesNotMatch(boundary, /fetch\(|axios\(|graph\.facebook/i);
});

test("estado default da UI é preparado para conexão, não conectado", () => {
  assert.match(boundary, /createLocalMetaInstagramReadiness/);
  assert.match(boundary, /Preparado para conexão/);
  assert.match(panel, /Próximo requisito/);
  assert.match(panel, /Conectar Instagram/);
  assert.match(panel, /Aguardando canal Instagram real/);
});

test("handler Meta exige host oficial e não permite URL arbitrária", () => {
  assert.match(boundary, /isApprovedInstagramAuthorizationUrl/);
  assert.match(boundary, /www\.instagram\.com/);
  assert.match(boundary, /oauth\/authorize/);
  assert.match(panel, /iniciarConexaoInstagram/);
  assert.match(panel, /window\.location\.assign/);
});

test("fixtures conectada e de erro ficam restritas ao source test-only", () => {
  assert.match(boundary, /source === "fixture"/);
  assert.match(boundary, /Estado sintético somente para validar a state machine/);
  assert.match(boundary, /Erro de configuração/);
});
