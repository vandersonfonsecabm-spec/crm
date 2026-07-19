import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadStateMapper() {
  const source = read("src/components/integrations/whatsappConnectionState.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const file = path.join(process.env.TEMP, `whatsapp-connection-state-${process.pid}.mjs`);
  fs.writeFileSync(file, output, "utf8");
  try {
    return await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

test("F1UI-1 mapeia estados atuais e futuros sem inventar conexao", async () => {
  const { mapWhatsAppConnectionStatus } = await loadStateMapper();

  assert.equal(mapWhatsAppConnectionStatus({ status: "NOT_CONFIGURED", ready: false }).state, "NOT_CONFIGURED");
  assert.equal(mapWhatsAppConnectionStatus({ status: "CONFIGURED", ready: true }).state, "CONFIGURED_INACTIVE");
  assert.equal(
    mapWhatsAppConnectionStatus({ status: "CONFIGURED", ready: true, verifiedAt: "2026-07-18T12:00:00.000Z" }).state,
    "CONNECTED",
  );

  for (const state of ["WAITING_META_AUTH", "CONFIGURED_INACTIVE", "CONNECTED", "PAUSED", "ERROR", "UNAVAILABLE"]) {
    assert.equal(mapWhatsAppConnectionStatus({ status: state }).state, state);
  }
  assert.equal(mapWhatsAppConnectionStatus({ status: "UNKNOWN" }).state, "UNAVAILABLE");
  assert.equal(mapWhatsAppConnectionStatus(null).state, "UNAVAILABLE");
});

test("F1UI-1 reutiliza Integracoes e protege detalhe por permissao administrativa", () => {
  const navigation = read("src/navigation/dashboardNavigation.ts");
  const dashboard = read("src/pages/Dashboard.tsx");
  const sidebar = read("src/components/dashboard/DashboardSidebar.tsx");
  const api = read("src/services/crmApi.ts");

  assert.match(navigation, /"\/integracoes\/whatsapp".*"integracoes"/s);
  assert.match(dashboard, /resolvedNavigation\.detail === "whatsapp"/);
  assert.match(dashboard, /isWhatsAppIntegrationDetail && canManageIntegrations/);
  assert.match(dashboard, /WhatsAppIntegrationCard/);
  assert.equal((sidebar.match(/label: "Integrações"/g) ?? []).length, 0);
  assert.match(api, /return getSessionRole\(session\) === "ADMIN"/);
});

test("F1UI-1 consulta somente o endpoint administrativo existente", () => {
  const api = read("src/services/crmApi.ts");
  const hook = read("src/components/integrations/useWhatsAppConnectionStatus.ts");
  const panel = read("src/components/integrations/WhatsAppConnectionPanel.tsx");

  assert.match(api, /fetchWhatsappOperationalStatus/);
  assert.match(api, /requestApiGetAuthenticated<WhatsappOperationalStatusResponse>\("\/integracoes\/whatsapp\/status"\)/);
  assert.match(hook, /error\.status === 401[\s\S]*onUnauthorized\(\)/);
  assert.match(hook, /error\.status === 403[\s\S]*setLoadState\("forbidden"\)/);
  assert.match(hook, /error\.status === 404[\s\S]*NOT_CONFIGURED_STATUS/);
  assert.match(hook, /setLoadState\("error"\)/);
  assert.doesNotMatch(panel, /\bfetch\s*\(/);
  assert.doesNotMatch(panel, /\/oauth|graph\.facebook|api\.whatsapp/i);
});

test("F1UI-1 apresenta status honesto, checklist e modal sem iniciar OAuth", () => {
  const panel = read("src/components/integrations/WhatsAppConnectionPanel.tsx");

  for (const text of [
    "Conecte o WhatsApp ao CRM",
    "Não configurado",
    "Nenhum número conectado",
    "Aguardando autorização",
    "Preparado no CRM",
    "Desativado",
    "Ainda não implementado",
    "Infraestrutura do CRM",
    "Autorizar conta na Meta",
    "Vincular número do WhatsApp",
    "Validar o webhook",
    "Ativar o recebimento",
    "Testar uma mensagem",
    "Antes de conectar",
    "Continuar na Meta",
  ]) {
    assert.match(panel, new RegExp(text));
  }

  assert.match(panel, /setConnectModalOpen\(true\)/);
  assert.match(panel, /<Button disabled[\s\S]*?>Continuar na Meta<\/Button>/);
  assert.doesNotMatch(panel, /window\.open|window\.location|location\.href/);
});

test("F1UI-1 copia apenas a URL publica e nao persiste credenciais", () => {
  const panel = read("src/components/integrations/WhatsAppConnectionPanel.tsx");
  const hook = read("src/components/integrations/useWhatsAppConnectionStatus.ts");
  const mapper = read("src/components/integrations/whatsappConnectionState.ts");
  const combined = `${panel}\n${hook}\n${mapper}`;

  assert.match(panel, /https:\/\/api-production-875f9\.up\.railway\.app\/webhooks\/whatsapp/);
  assert.match(panel, /navigator\.clipboard\.writeText\(WHATSAPP_WEBHOOK_URL\)/);
  assert.match(panel, /URL copiada/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage/);
  assert.doesNotMatch(combined, /WHATSAPP_APP_SECRET|WHATSAPP_WEBHOOK_VERIFY_TOKEN|access[_-]?token/i);
  assert.doesNotMatch(combined, /console\./);
});

test("F1UI-1 mantem acoes futuras indisponiveis e recuperacao de erro", () => {
  const panel = read("src/components/integrations/WhatsAppConnectionPanel.tsx");

  for (const action of ["Testar conexão", "Pausar recebimento", "Reativar", "Desconectar"]) {
    assert.match(panel, new RegExp(`label="${action}"`));
  }
  assert.match(panel, /Disponível depois que um número for conectado/);
  assert.match(panel, /role="tooltip"/);
  assert.match(panel, /Não foi possível atualizar o status agora/);
  assert.match(panel, /onClick=\{\(\) => void refresh\(\)\}/);
  assert.match(panel, /data-testid="whatsapp-status-loading"/);
});
