import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function between(value, start, end) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `início ausente: ${start}`);
  assert.ok(endIndex >= 0, `fim ausente: ${end}`);
  return value.slice(startIndex, endIndex);
}

test("Lote 8 aplica a composição Inbox aos contratos reais sem criar operações", async () => {
  const [api, inbox, css] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/components/leads-communication/LeadsCommunication.css"),
  ]);

  for (const field of ["canalIntegracao", "status", "responsavelPrincipal", "naoLidas", "sla", "ultimaMensagem"]) {
    assert.match(api, new RegExp(`\\b${field}:`), `contrato real deve expor ${field}`);
  }
  assert.match(api, /fetchCommunicationConversations\(params: ConversationQuery/);
  assert.match(api, /fetchCommunicationMessages\(id: number/);
  assert.match(api, /fetchCommunicationConversationHistory\(id: number/);
  assert.match(api, /acquireCommunicationReplyLease\(id: number/);
  assert.match(api, /releaseCommunicationReplyLease\(id: number/);

  assert.match(inbox, /fetchCommunicationConversations\(listQuery\)/);
  assert.match(inbox, /fetchConversationBundle\(id\)/);
  assert.match(inbox, /canUseSimulatedReply\(conversation\)/);
  assert.match(inbox, /canChangeConversation && <details className="inbox-actions-menu/);
  assert.match(inbox, /renewCommunicationReplyLease/);
  assert.match(inbox, /releaseCommunicationReplyLease/);
  assert.match(inbox, /if \(!selectedId \|\| !text \|\| sending \|\| isClosed \|\| !canReplyDirectly\) return/);

  const toolbar = between(inbox, "export function InboxQueueToolbar", "export function InboxContextContent");
  const toolbarOrder = ["Conversas", "Buscar conversas", "Filtros", "Atualizar conversas"].map((token) => toolbar.indexOf(token));
  assert.ok(toolbarOrder.every((index) => index >= 0), "toolbar deve expor fila, busca, filtros e atualização reais");
  assert.ok(toolbarOrder.every((index, position) => position === 0 || index > toolbarOrder[position - 1]), "toolbar deve manter Conversas → Busca → Filtros → Atualizar");
  assert.doesNotMatch(toolbar, /Fila multicanal|Atendimentos inbound|Centralize conversas/);

  const header = between(inbox, 'className="inbox-conversation-header', 'className="inbox-conversation-actions');
  for (const token of ["CommunicationChannelBadge", "ConversationStatusBadge", "ConversationSlaBadge", "Responsável:"]) {
    assert.match(header, new RegExp(token));
  }

  const actions = between(inbox, 'className="inbox-conversation-actions', '<div className="relative min-h-0 flex-1">');
  for (const action of ["Transferir", "Aguardar cliente", "Marcar pendente", "Devolver à fila", "Encerrar conversa", "Reabrir conversa"]) {
    assert.match(actions, new RegExp(action));
  }

  const context = between(inbox, "export function InboxContextContent", "function InboxFilters");
  const orderedContext = ["Telefone", "E-mail", "Interesse", "Campanha e origem", "Página de origem", "Detalhes do atendimento", "Histórico de atendimento"];
  const contextIndexes = orderedContext.map((token) => context.indexOf(token));
  assert.ok(contextIndexes.every((index) => index >= 0), "contexto deve expor contato, origem, detalhes e histórico");
  assert.ok(contextIndexes.every((index, position) => position === 0 || index > contextIndexes[position - 1]), "telefone, e-mail e interesse precisam anteceder os detalhes secundários");
  assert.match(context, /showCommercialPanel = true/);

  assert.match(css, /\.inbox-workspace\.has-context\s*\{\s*grid-template-columns: 320px minmax\(0, 1fr\) 352px/);
  assert.match(css, /@media \(max-width: 1359px\)[\s\S]*grid-template-columns: 320px minmax\(0, 1fr\)/);
  assert.match(css, /\.inbox-context-pane\s*\{[\s\S]*overflow-y: auto/);
  assert.match(css, /\.inbox-composer\s*\{\s*position: relative/);
  assert.doesNotMatch(css, /communication-channel-(site|whatsapp|instagram|messenger|email)\s*\{\s*border-left:\s*3px solid #/i);
});

test("fixture Lote 8 é local, preenchida e oferece os cenários inline e drawer", async () => {
  const [fixture, html] = await Promise.all([
    source("tests/fixtures/compositional-redesign-lote8-inbox.tsx"),
    source("tests/fixtures/compositional-redesign-lote8-inbox.html"),
  ]);

  assert.match(html, /compositional-redesign-lote8-inbox\.tsx/);
  assert.match(fixture, /data-compositional-lote="8"/);
  assert.match(fixture, /data-fixture-readonly="true"/);
  assert.match(fixture, /drawerScenario/);
  assert.match(fixture, /data-context-mode=\{drawerScenario \? "drawer" : "inline"\}/);
  assert.match(fixture, /const \[contextDrawerOpen, setContextDrawerOpen\] = useState\(drawerScenario\)/);
  assert.match(fixture, /<CommunicationDrawer[\s\S]*onClose=\{\(\) => setContextDrawerOpen\(false\)\}[\s\S]*open=\{contextDrawerOpen\}/);
  for (const component of ["InboxQueueToolbar", "ConversationListItem", "MessageTimeline", "InboxContextContent", "ConversationSlaBadge"]) {
    assert.match(fixture, new RegExp(component));
  }
  assert.match(fixture, /\[10, "SAIDA"/);
  assert.match(fixture, /Notas internas/);
  assert.match(fixture, /showCommercialPanel=\{false\}/);
  assert.doesNotMatch(fixture, /fetch\(|localStorage|sessionStorage|document\.cookie|Authorization/i);
});
