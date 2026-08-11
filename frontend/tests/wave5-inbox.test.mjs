import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Onda 5 mantém contexto inline no desktop e recolhível no compacto", async () => {
  const [inbox, css] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  assert.match(inbox, /const compactInboxContext = useCompactInboxContext\(\)/);
  assert.match(inbox, /const hasInlineContext = Boolean\(conversation && !compactInboxContext\)/);
  assert.match(inbox, /const hasContextDrawer = Boolean\(conversation && compactInboxContext && contextOpen\)/);
  assert.match(inbox, /inbox-workspace \$\{hasInlineContext \? "has-context" : "without-context"\}/);
  assert.match(inbox, /inbox-context-pane/);
  assert.match(inbox, /compactInboxContext && <IconButton/);
  assert.match(inbox, /open=\{hasContextDrawer\}/);
  assert.match(inbox, /inbox-list-scroll/);
  assert.match(inbox, /inbox-message-viewport/);
  assert.match(css, /\.inbox-workspace\.has-context\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.inbox-context-pane\s*\{[\s\S]*overflow-y: auto/);
  assert.match(css, /@media \(max-width: 1359px\)[\s\S]*\.inbox-workspace\.has-context/);
});

test("Onda 5 preserva scrolls independentes e retorno progressivo no mobile", async () => {
  const [inbox, css] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  for (const selector of [".inbox-list-scroll", ".inbox-message-viewport", ".inbox-context-pane"]) {
    assert.match(css, new RegExp(`${selector.replace(".", "\\.")}\\s*,?[\\s\\S]*overscroll-behavior: contain`));
  }
  assert.match(inbox, /data-mobile-view=\{mobileView\}/);
  assert.match(inbox, /Voltar para a lista de conversas/);
  assert.match(css, /data-mobile-view="list"\] \.inbox-conversation/);
  assert.match(css, /data-mobile-view="conversation"\] \.inbox-conversation-list/);
});

test("Inbox permanece protegida por flag, capability, navegação e rota direta", async () => {
  const [flags, navigation, sidebar, dashboard] = await Promise.all([
    source("src/config/featureFlags.ts"),
    source("src/navigation/dashboardNavigation.ts"),
    source("src/components/dashboard/DashboardSidebar.tsx"),
    source("src/pages/Dashboard.tsx"),
  ]);

  assert.match(flags, /VITE_LEADS_COMMUNICATION_ENABLED === "true"/);
  assert.match(flags, /capabilities\?\.leadsCommunication === true/);
  assert.match(navigation, /pathname: "\/caixa-de-entrada"/);
  assert.match(navigation, /requiresLeadsCommunication: true/);
  assert.match(sidebar, /!route\.requiresLeadsCommunication \|\| leadsCommunicationEnabled/);
  assert.match(dashboard, /activePage === "inbox" && leadsCommunicationEnabled && authSession/);
  assert.match(dashboard, /activePage === "inbox"\) && !leadsCommunicationEnabled/);
  assert.match(dashboard, /Recurso não habilitado/);
});

test("Inbox continua fail-closed para outbound e só registra simulação WhatsApp de teste", async () => {
  const [channels, inbox] = await Promise.all([
    source("src/components/leads-communication/communicationChannels.ts"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
  ]);

  assert.match(channels, /conversation\?\.podeResponderDiretamente === true/);
  assert.match(channels, /canalIntegracao\.tipo === "WHATSAPP_META"/);
  assert.match(channels, /canalIntegracao\.modoTeste === true/);
  assert.match(inbox, /if \(!selectedId \|\| !text \|\| sending \|\| isClosed \|\| !canReplyDirectly\) return/);
  assert.match(inbox, /sendSimulatedCommunicationMessage\(selectedId/);
  assert.match(inbox, /Simulação interna: nenhuma mensagem será enviada ao cliente/);
  assert.match(inbox, /Respostas por este canal ainda não estão habilitadas/);
  assert.doesNotMatch(inbox, /Graph API|accessTokenRef|api\.whatsapp|graph\.facebook|graph\.instagram/i);
  assert.doesNotMatch(inbox, />Enviar</);
});
