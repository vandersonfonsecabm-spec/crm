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

test("drawer de Leads invalida respostas antigas antes de atualizar o estado", async () => {
  const leads = await source("src/components/leads-communication/DashboardLeadsPanel.tsx");
  assert.match(leads, /const drawerRequestSequence = useRef\(0\)/);
  assert.match(leads, /const sequence = \+\+drawerRequestSequence\.current/);
  assert.match(leads, /if \(sequence !== drawerRequestSequence\.current\) return;/);
  assert.match(leads, /function closeLead\(\) \{\s*drawerRequestSequence\.current \+= 1;/);
  assert.match(leads, /onClose=\{closeLead\}/);
});

test("refresh entre abas não transmite token e a aba seguidora recupera sua própria memória", async () => {
  const coordinator = await source("src/services/auth-refresh-coordinator.ts");
  assert.match(coordinator, /async function resolvePeerTerminal/);
  assert.match(coordinator, /return refresh\(\);/);
  assert.match(coordinator, /Access tokens stay in each tab's memory/);
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
