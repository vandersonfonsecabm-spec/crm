import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("Venda Canônica V1 expõe proveniência e bloqueia fechamento silencioso", async () => {
  const [kanban, proposals, api] = await Promise.all([
    source("src/components/negocios/DashboardNegociosKanbanPanel.tsx"),
    source("src/components/negocios/CommercialProposalsPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const label of ["Contrato da venda", "Estimativa", "Principal", "Vencedora", "Venda", "Fechar com proposta vencedora", "Fechar venda manual", "Reabrir com auditoria"]) {
    assert.match(kanban, new RegExp(label));
  }
  assert.match(kanban, /nextStage === "FECHADO" \|\| nextStage === "PERDIDO"/);
  assert.match(kanban, /closeDealAsWon/);
  assert.match(kanban, /markDealAsLost/);
  assert.match(kanban, /reopenCanonicalDeal/);
  assert.match(kanban, /idempotencyKey/);
  assert.match(kanban, /Motivo obrigatório/);
  assert.match(kanban, /Exportar vendas CSV/);
  assert.match(kanban, /sale\.totalCentavos/);
  assert.doesNotMatch(kanban, /empresaId|Authorization|localStorage|sessionStorage/);

  for (const label of ["Principal", "Vencedora", "Aceitar como vencedora", "Substituir vencedora", "Reconciliar vencedora", "Remover vencedora"]) {
    assert.match(proposals, new RegExp(label));
  }
  assert.match(proposals, /setPrimaryCommercialProposal/);
  assert.match(proposals, /acceptCommercialProposal/);
  assert.match(proposals, /replaceWinningCommercialProposal/);
  assert.match(proposals, /SUBSTITUIDA/);
  assert.doesNotMatch(proposals, /PRONTA: \[[^\]]*"ACEITA"/);

  for (const endpoint of ["contrato-venda", "proposta-principal", "\/aceitar", "proposta-vencedora\/substituir", "fechar-ganho", "marcar-perdido", "\/reabrir", "\/vendas"]) {
    assert.match(api, new RegExp(endpoint));
  }
  assert.match(api, /CanonicalSaleSource/);
  assert.match(api, /CanonicalSaleContract/);
  assert.match(api, /totalCentavos/);
});

test("Customer 360 distingue pipeline estimado de receita canônica", async () => {
  const [customer, timeline, api] = await Promise.all([
    source("src/components/dashboard/DashboardSelectedClientPanel.tsx"),
    source("src/components/dashboard/DashboardClientTimeline.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  assert.match(customer, /Pipeline estimado/);
  assert.match(customer, /Total vendido/);
  assert.match(customer, /Vendas realizadas/);
  assert.match(customer, /totalVendidoCentavos/);
  assert.match(customer, /purchase\.totalCentavos/);
  assert.match(timeline, /value: "VENDA"/);
  assert.match(timeline, /label: "Venda"/);
  assert.match(api, /valorCentavos/);
});
