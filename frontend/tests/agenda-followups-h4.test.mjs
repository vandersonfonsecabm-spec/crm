import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H4 oferece agenda pessoal e da equipe com filtros operacionais", async () => {
  const panel = await source("src/components/dashboard/DashboardAgendaPanel.tsx");

  for (const label of ["Minha agenda", "Hoje", "Próximos", "Atrasados", "Concluídos", "Equipe", "Todos"]) {
    assert.match(panel, new RegExp(label));
  }
  for (const label of ["Tarefa", "Retorno", "Reuniao", "Ligacao", "Visita", "Outro"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /responsibleFilter/);
  assert.match(panel, /agendaView/);
  assert.match(panel, /item\.atrasado/);
});

test("H4 cria e edita acompanhamentos com responsavel e vinculos reais", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const field of ["clienteId", "leadId", "negocioId", "conversaCanalId", "propostaComercialId", "responsavelId", "revisao"]) {
    assert.match(`${panel}\n${api}`, new RegExp(field));
  }
  assert.match(panel, /Vínculos comerciais opcionais/);
  assert.match(panel, /Registro da alteração/);
  assert.match(api, /\/acompanhamentos\/opcoes/);
  assert.doesNotMatch(panel, /empresaId/);
});

test("H4 cobre iniciar, concluir, cancelar, reabrir e historico", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);

  for (const action of ["iniciarAcompanhamento", "concluirAcompanhamento", "cancelarAcompanhamento", "reabrirAcompanhamento", "fetchAcompanhamentoHistorico"]) {
    assert.match(`${panel}\n${api}`, new RegExp(action));
  }
  for (const action of ["CRIAR", "EDITAR", "ALTERAR_RESPONSAVEL", "REAGENDAR", "INICIAR", "CONCLUIR", "CANCELAR", "REABRIR"]) {
    assert.match(panel, new RegExp(action));
  }
  assert.match(panel, /ApiHttpError/);
  assert.match(panel, /status === 409/);
  assert.match(panel, /Os dados foram atualizados|alterado por outra pessoa/);
});

test("H4 mantem a agenda interna e sem integracoes externas", async () => {
  const [panel, api] = await Promise.all([
    source("src/components/dashboard/DashboardAgendaPanel.tsx"),
    source("src/services/crmApi.ts"),
  ]);
  const agendaApi = api.slice(api.indexOf("export type ApiAcompanhamentoStatus"), api.indexOf("export type ProdutoQueryParams"));

  assert.doesNotMatch(`${panel}\n${agendaApi}`, /graph\.facebook|api\.whatsapp|oauth|embedded.signup|sendgrid|twilio/i);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|console\.log|Authorization/);
  assert.match(panel, /Sem vínculo comercial/);
  assert.match(panel, /Nenhum acompanhamento/);
  assert.match(panel, /Carregando acompanhamentos/);
});
