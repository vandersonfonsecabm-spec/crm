import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const board = fs.readFileSync(new URL("src/components/integrations/IntegrationStatusBoard.tsx", root), "utf8");
const policy = fs.readFileSync(new URL("src/components/integrations/integrationActivationPolicy.ts", root), "utf8");
const readiness = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationReadinessPanel.tsx", root), "utf8");
const whatsapp = fs.readFileSync(new URL("src/components/integrations/WhatsAppConnectionPanel.tsx", root), "utf8");
const integrations = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationsPanel.tsx", root), "utf8");

test("status board cobre os seis providers com estado honesto", () => {
  for (const key of ["whatsapp", "instagram", "messenger", "bling", "email", "ai"]) {
    assert.match(board, new RegExp(`"${key}"`));
  }
  assert.match(board, /return \[\s*whatsappCard\(input\),\s*instagramCard\(input\),\s*messengerCard\(input\),\s*blingCard\(input\),\s*emailCard\(input\),\s*aiCard\(input\),/s);
  assert.match(board, /stateCopy\(state, title\)/);
  assert.match(board, /Próximo requisito:/);
});

test("ativação externa permanece bloqueada nos três painéis", () => {
  assert.match(policy, /EXTERNAL_PROVIDER_ACTIVATION_ENABLED = false/);
  assert.match(board, /Nenhuma conexão externa é iniciada nesta fase/);
  assert.match(board, /Ativação externa bloqueada nesta fase/);
  assert.match(readiness, /EXTERNAL_PROVIDER_ACTIVATION_ENABLED/);
  assert.match(whatsapp, /disabled={!EXTERNAL_PROVIDER_ACTIVATION_ENABLED/);
  assert.match(integrations, /disabled={!EXTERNAL_PROVIDER_ACTIVATION_ENABLED/);
});

test("falhas de leitura não são convertidas em não configurado", () => {
  assert.match(board, /if \(input\.instagramUnavailable\) return unavailable\("instagram"/);
  assert.match(board, /if \(input\.messengerUnavailable\) return unavailable\("messenger"/);
  assert.match(board, /if \(input\.channelsUnavailable\) return unavailable\("email"/);
});

test("hub usa leituras parciais e tabs com relação ARIA explícita", () => {
  assert.match(integrations, /Promise\.allSettled/);
  assert.match(integrations, /Algumas áreas continuam indisponíveis/);
  assert.match(integrations, /role="tablist"/);
  assert.match(integrations, /role="tab"/);
  assert.match(integrations, /aria-controls=\{panelId\}/);
  assert.match(integrations, /role="tabpanel"/);
  assert.match(integrations, /min-h-10/);
  assert.match(board, /AI_COMMERCE_DISABLED/);
});
