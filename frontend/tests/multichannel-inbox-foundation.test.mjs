import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Inbox identifica os cinco canais sem heurística semântica", async () => {
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
    ["EMAIL", "E-mail"],
  ]) {
    assert.match(badge, new RegExp(`${type}: \\{[^\\n]+label: "${label}"`));
    assert.match(formatters, /getChannelPresentation\(type\)\.label/);
  }

  assert.match(inbox, /CommunicationChannelBadge/);
  assert.match(inbox, /getChannelPresentation\(/);
  assert.doesNotMatch(inbox, /Site, WhatsApp, Instagram, Messenger e E-mail/);
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
  assert.match(inbox, /Respostas por e-mail ainda não estão habilitadas/);
  assert.match(inbox, /Nota interna — visível somente para a equipe/);
  assert.match(inbox, /Registrar simulação/);
  assert.match(inbox, /Simulação registrada por/);
  assert.match(inbox, /não enviada/i);
  assert.doesNotMatch(inbox, />Enviar</);
  assert.doesNotMatch(inbox, /Graph API|accessTokenRef|api\.whatsapp|graph\.facebook/i);
});

test("Inbox apresenta assunto e anexos de E-mail sem renderizar HTML", async () => {
  const [inbox, api] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  assert.match(api, /emailSubject: string \| null/);
  assert.match(api, /emailMetadata\?:/);
  assert.match(api, /attachmentCount: number/);
  assert.match(inbox, /email\.subject/);
  assert.match(inbox, /email\.fromName \? `\$\{email\.fromName\} <\$\{email\.fromAddress\}>` : email\.fromAddress/);
  assert.match(inbox, /Paperclip/);
  assert.doesNotMatch(inbox, /dangerouslySetInnerHTML/);
});

test("Cliente 360 prioriza o nome canônico do canal", async () => {
  const timeline = await source("src/components/dashboard/DashboardClientTimeline.tsx");

  assert.match(timeline, /getChannelPresentation/);
  assert.match(timeline, /timelineChannelLabel/);
  assert.match(timeline, /`\$\{canonical\} · \$\{channel\.nome\}`/);
  assert.doesNotMatch(timeline, /event\.canal \? <span>\{event\.canal\.nome\}/);
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
  assert.match(inbox, /function selectConversation\(id: number\)[\s\S]*id !== selectedId[\s\S]*setComposerText\(""\)[\s\S]*idempotencyKey\.current = null[\s\S]*setSelectedId\(id\)/);
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
