import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H2 apresenta qualificacao comercial progressiva dentro da Inbox existente", async () => {
  const [panel, inbox] = await Promise.all([
    source("src/components/leads-communication/InboxCommercialPanel.tsx"),
    source("src/components/leads-communication/DashboardInboxPanel.tsx"),
  ]);

  assert.match(inbox, /InboxCommercialPanel/);
  assert.match(inbox, /Contexto do atendimento/);
  for (const label of [
    "Qualificar atendimento",
    "Criar Negócio",
    "Vincular Negócio existente",
    "Abrir no Kanban",
    "Produto, serviço ou assunto",
    "Próxima ação",
    "Valor estimado",
    "Data de retorno",
  ]) assert.match(panel, new RegExp(label));
  assert.match(panel, /context\.permissoes\.qualificar/);
  assert.match(panel, /context\.permissoes\.criarOuVincular/);
  assert.match(panel, /Disponível após qualificação e contato humano/);
});

test("H2 usa somente endpoints comerciais explicitos e trata erros recuperaveis", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/leads-communication/InboxCommercialPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const endpoint of [
    "/contexto-comercial",
    "/qualificacao-comercial",
    "/negocios-elegiveis",
    "/criar-negocio",
    "/vincular-negocio",
  ]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));
  for (const status of [401, 403, 404, 409, 422]) assert.match(panel, new RegExp(`status === ${status}`));
  assert.match(panel, /Não foi possível atualizar o contexto comercial agora/);
  assert.match(panel, /COMMERCIAL_BUSINESS_DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(panel, /Possível duplicidade/);
  assert.match(panel, /Criar outro Negócio/);
  assert.doesNotMatch(panel, /graph\.facebook|api\.whatsapp|oauth|localStorage|sessionStorage/i);
});

test("H2 abre o Negocio real no Kanban sem criar fluxo paralelo", async () => {
  const [panel, dashboard, kanban] = await Promise.all([
    source("src/components/leads-communication/InboxCommercialPanel.tsx"),
    source("src/pages/Dashboard.tsx"),
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
  ]);

  assert.match(panel, /onOpenBusiness\(context\.negocio!?\.id\)/);
  assert.match(dashboard, /openKanbanBusiness/);
  assert.match(dashboard, /handleSetActivePage\("kanban"\)/);
  assert.match(kanban, /fetchNegocioKanban\(initialBusinessId\)/);
  assert.doesNotMatch(panel, /mock|fallback.*Negócio|sucesso falso/i);
});
