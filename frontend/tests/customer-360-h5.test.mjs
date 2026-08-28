import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H5 apresenta cadastro, resumo e negocios fechados do Cliente 360", async () => {
  const [panel, api, modal] = await Promise.all([
    source("src/components/dashboard/DashboardSelectedClientPanel.tsx"),
    source("src/services/crmApi.ts"),
    source("src/components/dashboard/ClientModal.tsx"),
  ]);

  for (const label of ["Cidade / UF", "CPF / CNPJ", "Pipeline ativo", "Negócios ativos", "Propostas abertas", "Negócios fechados"]) {
    assert.match(panel, new RegExp(label));
  }
  for (const field of ["cidade", "estado", "cpfCnpj", "revisao"]) assert.match(api, new RegExp(field));
  assert.match(modal, /client-city/);
  assert.match(modal, /client-state/);
  assert.match(modal, /client-document/);
  assert.match(modal, /CUSTOMER_REGISTRATION_CONFLICT|status === 409/);
});

test("H5 usa timeline real, paginada, filtravel e com proveniencia", async () => {
  const [timeline, api] = await Promise.all([
    source("src/components/dashboard/DashboardClientTimeline.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const filter of ["MENSAGEM", "LIGACAO", "VISITA", "PROPOSTA", "NEGOCIO", "ACOMPANHAMENTO", "NOTA", "QUALIFICACAO"]) {
    assert.match(timeline, new RegExp(filter));
  }
  assert.match(timeline, /event\.origem\.entidade/);
  assert.match(timeline, /Página \{page\} de \{totalPages\}/);
  assert.match(api, /\/clientes\/\$\{clienteId\}\/timeline/);
  assert.match(api, /\/clientes\/\$\{clienteId\}\/360/);
});

test("H5 navega para contextos reais e nao inventa receita ou integracoes", async () => {
  const [panel, timeline] = await Promise.all([
    source("src/components/dashboard/DashboardSelectedClientPanel.tsx"),
    source("src/components/dashboard/DashboardClientTimeline.tsx"),
  ]);
  const combined = `${panel}\n${timeline}`;

  assert.match(combined, /onNavigateContext/);
  assert.match(combined, /"INBOX"/);
  assert.match(combined, /"KANBAN"/);
  assert.match(combined, /"AGENDA"/);
  assert.match(panel, /Nenhum negócio fechado/);
  assert.match(panel, /purchase\.valor === null \? "Não informado"/);
  assert.match(timeline, /minimumFractionDigits: 2/);
  assert.doesNotMatch(combined, /graph\.facebook|api\.whatsapp|oauth|embedded.signup/i);
  assert.doesNotMatch(combined, /empresaId|localStorage|sessionStorage|Authorization|console\.log/);
});
