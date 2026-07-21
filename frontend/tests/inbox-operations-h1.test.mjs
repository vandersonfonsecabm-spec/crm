import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H1 apresenta fila, estados oficiais, SLA e nao lidas sem criar uma interface paralela", async () => {
  const [inbox, presentation, formatters, styles] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/communicationPresentation.tsx"),
    source("src/components/leads-communication/communicationFormatters.ts"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  for (const label of [
    "Todas", "Não atribuídas", "Minhas conversas", "Em atendimento",
    "Aguardando cliente", "Pendente", "Encerrada", "SLA em atenção", "SLA crítico",
  ]) assert.match(`${inbox}\n${presentation}\n${formatters}`, new RegExp(label));
  assert.match(inbox, /item\.naoLidas/);
  assert.match(inbox, /ConversationSlaBadge/);
  assert.match(presentation, /Dentro do prazo|sla\.label/);
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /@media \(max-width: 1023px\)/);
});

test("H1 conecta somente as acoes operacionais explicitas e trata conflito concorrente", async () => {
  const [inbox, api] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const endpoint of [
    "/assumir", "/atribuir", "/devolver-fila", "/aguardar-cliente",
    "/marcar-pendente", "/encerrar", "/reabrir", "/marcar-lida",
  ]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(inbox, /Esta conversa acabou de ser assumida por outro atendente/);
  assert.match(inbox, /error instanceof ApiHttpError && error\.status === 409/);
  assert.match(inbox, /waitCommunicationConversationForCustomer/);
  assert.match(inbox, /markCommunicationConversationPending/);
  assert.match(inbox, /closeCommunicationConversation/);
  assert.match(inbox, /reopenCommunicationConversation/);
  assert.doesNotMatch(api, /empresaId.*ConversationQuery/);
});

test("H1 preserva lease, timeline e ausencia de chamadas externas", async () => {
  const [inbox, api] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  assert.match(inbox, /renewCommunicationReplyLease/);
  assert.match(inbox, /Outro usuário.*respondendo esta conversa/);
  assert.match(inbox, /Histórico de atendimento/);
  assert.match(inbox, /entry\.acaoAtendimento \?\? entry\.tipo/);
  assert.match(inbox, /Observação \(opcional\)/);
  assert.match(inbox, /Falha ao carregar conversas/);
  assert.match(inbox, /aria-label="Atualizar conversas"[^>]+onClick=\{\(\) => void loadList\(\)\}/);
  assert.match(inbox, /Nenhuma conversa encontrada/);
  assert.doesNotMatch(`${inbox}\n${api}`, /graph\.facebook|api\.whatsapp|oauth|axios/i);
});
