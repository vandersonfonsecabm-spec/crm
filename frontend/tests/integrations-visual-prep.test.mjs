import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mapMessengerConnectionStatus } from "../src/components/integrations/messengerConnectionState.ts";
import { blingStatePresentation, isApprovedBlingAuthorizationUrl } from "../src/components/integrations/blingConnectionState.ts";
import { deriveMetaInstagramReadiness } from "../src/services/metaInstagramBoundary.ts";

const root = new URL("../", import.meta.url);
const panel = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationReadinessPanel.tsx", root), "utf8");
const boundary = fs.readFileSync(new URL("src/services/metaInstagramBoundary.ts", root), "utf8");
const integrations = fs.readFileSync(new URL("src/components/dashboard/DashboardIntegrationsPanel.tsx", root), "utf8");
const dashboard = fs.readFileSync(new URL("src/pages/Dashboard.tsx", root), "utf8");
const messengerHook = fs.readFileSync(new URL("src/components/integrations/useMessengerConnectionStatus.ts", root), "utf8");

test("preparação visual de integrações usa estados honestos e a superfície existente", () => {
  assert.match(integrations, /DashboardIntegrationReadinessPanel/);
  assert.match(panel, /Instagram Direct \/ Meta/);
  assert.match(panel, /Facebook Messenger \/ Meta/);
  assert.match(panel, /Serasa \/ score/);
  assert.match(boundary, /Não conectado/);
  assert.match(panel, /Configuração pendente/);
  assert.match(panel, /Ainda não disponível/);
  assert.match(panel, /Conectar Instagram/);
  assert.match(panel, /Aguardando canal Instagram real/);
  assert.match(panel, /Conectar Messenger/);
  assert.match(panel, /Configure primeiro um App\/Página TEST_ONLY/);
  assert.match(dashboard, /LazyDashboardIntegrationsPanel[\s\S]*onUnauthorized=\{onLogout\}/);
  assert.match(panel, /useMessengerConnectionStatus\(handleMessengerUnauthorized\)/);
  assert.match(messengerHook, /error\.status === 401[\s\S]*onUnauthorized\(\)/);
  assert.doesNotMatch(panel, /graph\.facebook|fetch\(|axios\(/i);
});

test("a preparação não apresenta conexão, sincronização ou score como fato", () => {
  assert.equal(mapMessengerConnectionStatus({ state: "NOT_CONFIGURED" }).state, "NOT_CONFIGURED");
  assert.equal(mapMessengerConnectionStatus({ state: "CONNECTED", credentialConfigured: false, verifiedAt: "2026-08-27T12:00:00.000Z" }).state, "WAITING_META_AUTH");
  assert.equal(mapMessengerConnectionStatus({ state: "CONNECTED", credentialConfigured: true, verifiedAt: null }).state, "WAITING_META_AUTH");
  assert.equal(mapMessengerConnectionStatus({ state: "CONNECTED", credentialConfigured: true, verifiedAt: "2026-08-27T12:00:00.000Z" }).state, "CONNECTED");
  assert.equal(deriveMetaInstagramReadiness({ state: "CONNECTED", credentialConfigured: false, verifiedAt: "2026-08-27T12:00:00.000Z", source: "fixture" }).state, "WAITING_META_AUTH");
  assert.equal(deriveMetaInstagramReadiness({ state: "CONNECTED", credentialConfigured: true, verifiedAt: "2026-08-27T12:00:00.000Z", source: "fixture" }).state, "CONNECTED");
  assert.match(boundary, /source: "local-preparation"/);
  assert.match(panel, /disabled={!instagramAction \|\| busy}/);
  assert.match(boundary, /REAL_META_ACCOUNT_REQUIRED_FOR_E2E/);
});

test("Bling e IA distinguem estados incompletos, erro e conexão real", () => {
  const aiSettings = fs.readFileSync(new URL("src/components/ai-commerce/CommerceSettingsPanel.tsx", root), "utf8");
  const aiApi = fs.readFileSync(new URL("src/services/aiCommerceApi.ts", root), "utf8");
  const integration = { id: 1, empresaId: 1, nome: "Bling", tipo: "BLING", modo: "SOMENTE_LEITURA", configuracao: {}, ultimaSincronizacaoEm: null, ultimoSucessoEm: null, ultimoErroEm: null, ativo: true, createdAt: "", updatedAt: "" };
  assert.deepEqual(blingStatePresentation({ ...integration, status: "PENDENTE", possuiCredenciais: true }), { label: "Configuração incompleta", status: "alerta" });
  assert.deepEqual(blingStatePresentation({ ...integration, status: "ERRO", possuiCredenciais: true }), { label: "Erro de conexão", status: "erro" });
  assert.deepEqual(blingStatePresentation({ ...integration, status: "ATIVA", possuiCredenciais: true }), { label: "Conectado", status: "conectado" });
  assert.deepEqual(blingStatePresentation({ ...integration, status: "ATIVA", possuiCredenciais: false }), { label: "Desconectado", status: "desconectado" });
  assert.equal(isApprovedBlingAuthorizationUrl("https://www.bling.com.br/Api/v3/oauth/authorize?state=fixture"), true);
  assert.equal(isApprovedBlingAuthorizationUrl("https://example.test/Api/v3/oauth/authorize"), false);
  assert.match(integrations, /item\.status === "ATIVA"/);
  assert.match(integrations, /isApprovedBlingAuthorizationUrl/);
  assert.match(aiApi, /realConnected \? "REAL_CONNECTED"/);
  assert.match(aiSettings, /connection\?\.status === "REAL_CONNECTED" && connection\.realProviderConnected && connection\.realConnectorImplemented/);
  assert.match(aiSettings, /providerValue: "Configuração incompleta"/);
  assert.doesNotMatch(aiSettings, /label="Provedor real" value="Não conectado"/);
});
