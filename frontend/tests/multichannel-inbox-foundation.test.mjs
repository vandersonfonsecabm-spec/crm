import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Inbox identifica os quatro canais sem heurística semântica", async () => {
  const [badge, formatters, inbox] = await Promise.all([
    source("src/components/leads-communication/communicationChannels.ts"),
    source("src/components/leads-communication/communicationFormatters.ts"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
  ]);

  for (const [type, label] of [
    ["SITE_FORM", "Site"],
    ["WHATSAPP_META", "WhatsApp"],
    ["INSTAGRAM_META", "Instagram"],
    ["MESSENGER_META", "Messenger"],
  ]) {
    assert.match(badge, new RegExp(`${type}: \\{[^\\n]+label: "${label}"`));
    assert.match(formatters, /getChannelPresentation\(type\)\.label/);
  }

  assert.match(inbox, /CommunicationChannelBadge/);
  assert.match(badge, /Canal não reconhecido/);
  assert.doesNotMatch(`${badge}\n${formatters}`, /includes\("insta"\)|includes\("facebook"\)/i);
});

test("Inbox combina filtros e usa navegação progressiva no mobile", async () => {
  const [inbox, styles] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  assert.match(inbox, /queueScope === "minhas"/);
  assert.match(inbox, /statusFilter \? \{ estado: statusFilter \}/);
  assert.match(inbox, /slaFilter \? \{ sla: slaFilter \}/);
  assert.match(inbox, /responsavelId \? \{ responsavelId:/);
  assert.match(inbox, /channelId \? \{ canalIntegracaoId:/);
  assert.match(inbox, /data-mobile-view=\{mobileView\}/);
  assert.match(inbox, /Voltar para a lista de conversas/);
  assert.match(styles, /data-mobile-view="list".*inbox-conversation/s);
  assert.match(styles, /data-mobile-view="conversation".*inbox-conversation-list/s);
});

test("Inbox bloqueia outbound real e mantém apenas notas internas", async () => {
  const [badge, inbox] = await Promise.all([
    source("src/components/leads-communication/communicationChannels.ts"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
  ]);

  assert.match(badge, /podeResponderDiretamente === true/);
  assert.match(badge, /tipo === "WHATSAPP_META"/);
  assert.match(badge, /modoTeste === true/);
  assert.match(inbox, /Respostas por este canal ainda não estão habilitadas/);
  assert.match(inbox, /Nota interna — visível somente para a equipe/);
  assert.match(inbox, /Registrar simulação/);
  assert.doesNotMatch(inbox, />Enviar</);
  assert.doesNotMatch(inbox, /Graph API|accessTokenRef|api\.whatsapp|graph\.facebook/i);
});

test("Inbox preserva leitura durante polling e abre detalhes sob demanda", async () => {
  const inbox = await source("src/components/leads-communication/DashboardInboxPanel.tsx");

  assert.match(inbox, /isNearMessageEnd\(messageViewport\.current\)/);
  assert.match(inbox, /setHasNewMessages\(true\)/);
  assert.match(inbox, /fetchLatestCommunicationMessages/);
  assert.match(inbox, /slice\(-100\)/);
  assert.doesNotMatch(inbox, /setSelectedId\(response\.data\[0\]\.id\)/);
  assert.match(inbox, /selectedId === item\.id/);
  assert.match(inbox, /detail\.naoLidas > 0 && \(!background \|\| keepAtLatest\)/);
  assert.match(inbox, /markCommunicationConversationRead\(conversation\.id\)/);
  assert.doesNotMatch(inbox, /role="listbox"|role="option"/);
  assert.match(inbox, /aria-current=\{active \? "true" : undefined\}/);
});

test("Inbox cobre estados operacionais sem esconder falhas", async () => {
  const inbox = await source("src/components/leads-communication/DashboardInboxPanel.tsx");

  assert.match(inbox, /listLoading \? <LoadingState/);
  assert.match(inbox, /listError \? <ErrorState/);
  assert.match(inbox, /Nenhuma conversa na fila/);
  assert.match(inbox, /Nenhuma conversa neste filtro/);
  assert.match(inbox, /Selecione uma conversa/);
  assert.match(inbox, /detailLoading \? <LoadingState/);
  assert.match(inbox, /detailError \? <ErrorState/);
  assert.match(inbox, /Canal não reconhecido|selectedChannel\.label/);
});
