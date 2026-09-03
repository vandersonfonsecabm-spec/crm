import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("cliente não recebe valor estimado e Agenda preserva acompanhamentoId", () => {
  const api = read("src/services/crmApi.ts");
  const dashboard = read("src/pages/Dashboard.tsx");
  assert.doesNotMatch(api, /estimateValue/);
  assert.match(api, /valueKnown/);
  assert.match(api, /valorInformado: client\.valueKnown !== false/);
  assert.match(api, /client\.valueKnown === false \? \{\} : \{ valor: client\.value \}/);
  assert.match(dashboard, /acompanhamentoId=\$\{encodeURIComponent\(id\)\}/);
  assert.doesNotMatch(dashboard, /setTimeout\(\(\) => setIsBooting\(false\), 650\)/);
});

test("integrações exibem somente estados reais e propagam 401", () => {
  const panel = read("src/components/dashboard/DashboardIntegrationsPanel.tsx");
  const readiness = read("src/components/dashboard/DashboardIntegrationReadinessPanel.tsx");
  const whatsapp = read("src/components/integrations/WhatsAppConnectionPanel.tsx");
  assert.match(panel, /item\.status === "ATIVA"/);
  assert.match(readiness, /useMessengerConnectionStatus\(handleMessengerUnauthorized\)/);
  assert.match(readiness, /\["NOT_CONFIGURED", "WAITING_META_AUTH"\]/);
  assert.match(whatsapp, /status\.credentialConfigured === true/);
  assert.match(whatsapp, /Credencial armazenada/);
  assert.match(whatsapp, /identityConfigured = connected \|\| status\.state === "CONFIGURED_INACTIVE" \|\| status\.state === "WAITING_META_AUTH"/);
});

test("timeout é restrito a leituras e writes invalidam o resumo uma vez", () => {
  const api = read("src/services/crmApi.ts");
  const actions = read("src/hooks/useDashboardActions.ts");
  const getBlock = api.slice(api.indexOf("async function requestApiGet<T>"), api.indexOf("async function requestApiGetAuthenticated<T>"));
  const writeBlock = api.slice(api.indexOf("async function requestApiWrite<T>"), api.indexOf("async function fetchAuthenticated"));
  assert.doesNotMatch(getBlock, /notifyDashboardDataChanged/);
  assert.match(writeBlock, /notifyDashboardDataChanged\(\)/);
  assert.match(api, /isTimeoutSafeMethod\(init\.method\) \? fetchWithTimeout/);
  assert.match(api, /normalized === "GET" \|\| normalized === "HEAD" \|\| normalized === "OPTIONS"/);
  assert.doesNotMatch(actions, /onClientListChanged/);
});
