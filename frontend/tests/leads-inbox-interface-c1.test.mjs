import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("C1 mantém Leads e Inbox desligados salvo valor literal true", async () => {
  const [flags, dashboard, navigation, search] = await Promise.all([
    source("src/config/featureFlags.ts"),
    source("src/pages/Dashboard.tsx"),
    source("src/navigation/dashboardNavigation.ts"),
    source("src/components/dashboard/DashboardCommandSearch.tsx"),
  ]);

  assert.match(flags, /VITE_LEADS_COMMUNICATION_ENABLED\s*===\s*["']true["']/);
  assert.match(navigation, /\/caixa-de-entrada/);
  assert.match(navigation, /\/leads/);
  assert.match(navigation, /requiresLeadsCommunication:\s*true/g);
  assert.match(dashboard, /activePage === ["']leads["'] && leadsCommunicationEnabled/);
  assert.match(dashboard, /activePage === ["']inbox["'] && leadsCommunicationEnabled/);
  assert.match(search, /leadsCommunicationEnabled/);
  assert.match(search, /inbox atendimento whatsapp instagram facebook omnichannel/);
});

test("C1 preserva autoria, responsabilidade e idempotência no compositor", async () => {
  const [inbox, api] = await Promise.all([
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  assert.match(inbox, /Respondido por \$\{message\.autor\?\.nome/);
  assert.match(inbox, /responsavelPrincipal/);
  assert.match(inbox, /crypto\.randomUUID/);
  assert.match(inbox, /idempotencyKey\.current/);
  assert.match(inbox, /activeLeaseFromOther/);
  assert.match(inbox, /Ctrl\+Enter ou Cmd\+Enter envia/);
  assert.match(api, /\/mensagens\/simuladas/);
  assert.match(api, /\/reserva-resposta\/renovar/);
  assert.doesNotMatch(inbox, /api\.whatsapp|graph\.facebook|graph\.instagram/i);
});

test("C1 não adiciona contrato visual fictício de SLA ou score e preserva a conversão real da G1", async () => {
  const [leads, inbox] = await Promise.all([
    source("src/components/leads-communication/DashboardLeadsPanel.tsx"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
  ]);

  assert.doesNotMatch(leads, /score de ia|atrasados/i);
  assert.match(leads, /convertCommunicationLeadToBusiness/);
  assert.doesNotMatch(inbox, /sla oficial|saldo baixo|sincronizar bling/i);
  assert.match(leads, /Não informado/);
  assert.match(inbox, /simulad[ao]/i);
});
