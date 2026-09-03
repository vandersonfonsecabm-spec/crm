import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("agenda usa rotas e parâmetros canônicos para vínculos comerciais", async () => {
  const agenda = await source("src/components/dashboard/DashboardAgendaPanel.tsx");
  assert.match(agenda, /import \{ getDashboardPath \} from "\.\.\/\.\.\/navigation\/dashboardNavigation"/);
  assert.match(agenda, /getDashboardPath\("kanban"\)\}\?negocioId=/);
  assert.match(agenda, /getDashboardPath\("inbox"\)\}\?conversationId=/);
  assert.doesNotMatch(agenda, /href=\{`\/kanban\?/);
  assert.doesNotMatch(agenda, /href=\{`\/inbox\?/);
});

test("deep-link de proposta abre o Negócio e seleciona a proposta indicada", async () => {
  const [agenda, dashboard, kanban, proposals] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/CommercialProposalsPanel.tsx"),
  ]);

  assert.match(agenda, /propostaId=\$\{item\.propostaComercialId\}/);
  assert.match(dashboard, /const proposalId = Number\(params\.get\("propostaId"\)\)/);
  assert.match(dashboard, /initialProposalId=\{kanbanProposalId\}/);
  assert.match(kanban, /fetchCommercialProposal/);
  assert.match(kanban, /setSelectedProposalId\((?:initialProposalId|targetProposalId) \?\? null\)/);
  assert.match(kanban, /initialProposalId=\{selectedProposalId\}/);
  assert.match(proposals, /initialProposalId\?: number \| null/);
  assert.match(proposals, /handledInitialProposalId/);
  assert.match(proposals, /void selectProposal\(targetProposalId\)/);
  assert.match(proposals, /proposalDetailRequestSequence/);
});

test("drawer de Leads invalida respostas antigas antes de atualizar o estado", async () => {
  const leads = await source("src/components/leads-communication/DashboardLeadsPanel.tsx");
  assert.match(leads, /const drawerRequestSequence = useRef\(0\)/);
  assert.match(leads, /const sequence = \+\+drawerRequestSequence\.current/);
  assert.match(leads, /if \(sequence !== drawerRequestSequence\.current\) return;/);
  assert.match(leads, /function closeLead\(\) \{\s*drawerRequestSequence\.current \+= 1;/);
  assert.match(leads, /onClose=\{closeLead\}/);
});

test("refresh entre abas não transmite token nem deixa seguidora renovar fora da coordenação", async () => {
  const coordinator = await source("src/services/auth-refresh-coordinator.ts");
  assert.match(coordinator, /async function tryWithWebLock/);
  assert.match(coordinator, /currentTerminal && currentTerminal\.type !== "refresh-success"/);
  assert.match(coordinator, /Re-enter the same lock before refreshing locally/);
  assert.match(coordinator, /if \(terminal\.type !== "refresh-success"\) return resolveTerminal/);
  assert.doesNotMatch(coordinator, /async function resolvePeerTerminal/);
  assert.doesNotMatch(coordinator, /access_token.*postMessage|postMessage.*access_token/s);
});

test("nota do Cliente usa a mutação transacional e bloqueia clique duplicado no navegador", async () => {
  const actions = await source("src/hooks/useDashboardActions.ts");
  const addNote = actions.slice(actions.indexOf("async function addNote"), actions.indexOf("async function addTagToSelected"));
  assert.match(addNote, /noteWritesInFlight\.current\.has\(selectedClient\.id\)/);
  assert.match(addNote, /createNotaOnBackend\(selectedClient, note\.text\)/);
  assert.match(addNote, /lastContactDays: 0/);
  assert.doesNotMatch(addNote, /updateClienteOnBackend/);
});
