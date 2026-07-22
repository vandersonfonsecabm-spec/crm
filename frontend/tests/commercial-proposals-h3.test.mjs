import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H3 integra propostas ao drawer real do Negocio com editor compacto", async () => {
  const [panel, kanban] = await Promise.all([
    source("src/components/negocios/CommercialProposalsPanel.tsx"),
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
  ]);
  assert.match(kanban, /CommercialProposalsPanel businessId=\{business\.id\}/);
  for (const label of ["Propostas comerciais", "Nova proposta", "Título", "Validade", "Itens", "Adicionar item", "Desconto geral", "Condições comerciais", "Observações", "Salvar rascunho"]) assert.match(panel, new RegExp(label));
  assert.match(panel, /grid-cols-\[minmax\(0,1fr\)_72px_105px_105px_32px\]/);
  assert.match(panel, /calculatePreview/);
  assert.match(panel, /Valores calculados pelo servidor/);
});

test("H3 cobre status, versao, PDF, historico e erros recuperaveis", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/negocios/CommercialProposalsPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  for (const status of ["RASCUNHO", "PRONTA", "ENVIADA", "ACEITA", "RECUSADA", "VENCIDA", "CANCELADA"]) assert.match(panel, new RegExp(status));
  for (const endpoint of ["/propostas", "/rascunho", "/status", "/duplicar-versao", "/historico", "/pdf"]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));
  for (const status of [401, 403, 404, 409, 422]) assert.match(panel, new RegExp(`error.status === ${status}`));
  assert.match(panel, /Nova versão/);
  assert.match(panel, /Abrir PDF/);
  assert.match(panel, /Histórico/);
  assert.match(panel, /URL\.revokeObjectURL/);
});

test("H3 nao cria envio externo nem usa o frontend como autoridade dos totais", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/negocios/CommercialProposalsPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  assert.doesNotMatch(`${panel}\n${api}`, /graph\.facebook|api\.whatsapp|oauth|embedded.signup/i);
  assert.doesNotMatch(panel, /fetch\(|axios|empresaId/);
  assert.doesNotMatch(api, /enviar-proposta|send-proposal/i);
  assert.match(api, /fetchCommercialProposalPdf[\s\S]*?fetch\(`\$\{API_URL\}\/propostas\/\$\{id\}\/pdf`, \{ headers/);
  assert.match(panel, /estado ENVIADA|ENVIADA/);
});
