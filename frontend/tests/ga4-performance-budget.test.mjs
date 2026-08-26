import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(frontendDir, relativePath), "utf8");

test("Inbox detail and list polling carry abort signals and ignore cancellation", async () => {
  const [inbox, api] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  assert.match(inbox, /listAbortController/);
  assert.match(inbox, /detailAbortController/);
  assert.match(inbox, /new AbortController\(\)/);
  assert.match(inbox, /fetchConversationBundle\(id, controller\.signal\)/);
  assert.match(inbox, /controller\.signal\.aborted \|\| isAbortError\(error\)/);
  assert.match(inbox, /fetchCommunicationMessages\(id, \{ page: 1, limit: 100 \}, options\)/);
  assert.match(api, /fetchCommunicationConversations\(params: ConversationQuery = \{\}, options: \{ signal\?: AbortSignal \} = \{\}\)/);
  assert.match(api, /fetchCommunicationMessages\(id: number, params: \{ page\?: number; limit\?: number \} = \{\}, options: \{ signal\?: AbortSignal \} = \{\}\)/);
});

test("Dashboard skips the client-list request on routes that do not render client data", async () => {
  const dashboard = await source("src/pages/Dashboard.tsx");

  assert.match(dashboard, /const CLIENT_DATA_PAGES = new Set<ActivePage>\(\[/);
  assert.match(dashboard, /"dashboard",\s*"comercial",\s*"leads",\s*"clientes",\s*"kanban",\s*"agenda"/s);
  assert.match(dashboard, /if \(!CLIENT_DATA_PAGES\.has\(activePage\)\) return;/);
  assert.match(dashboard, /fetchClientesFromBackend\(\{/);
});
