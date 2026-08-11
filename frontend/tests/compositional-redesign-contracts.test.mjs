import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COMPOSITIONAL_CONTRACT_MATRIX = {
  dashboard: {
    scope: "Resumo global da carteira",
    forbiddenLabels: ["Oportunidades ativas", "Pipeline de Negócios", "Clientes em atenção"],
    fields: [
      field("ApiDashboardSummary", "indicadores.clientes", "Clientes na carteira", /indicadores:\s*\{[\s\S]*?\bclientes\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.wonValue", "Receita fechada", /analytics:\s*\{[\s\S]*?\bwonValue\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.forecastValue", "Valor informado em clientes — Novo e Proposta", /analytics:\s*\{[\s\S]*?\bforecastValue\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.activePipeline", "Clientes em acompanhamento comercial", /analytics:\s*\{[\s\S]*?\bactivePipeline\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.todayFollowUps", "Clientes com acompanhamento hoje", /analytics:\s*\{[\s\S]*?\btodayFollowUps\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.highRiskCount", "Clientes em alto risco", /analytics:\s*\{[\s\S]*?\bhighRiskCount\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.silentCount", "Clientes sem contato recente", /analytics:\s*\{[\s\S]*?\bsilentCount\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.hotProposalCount", "Clientes quentes em Proposta", /analytics:\s*\{[\s\S]*?\bhotProposalCount\s*:\s*number;/),
      field("ApiDashboardSummary", "status[].status,total,valor", "Carteira por status", /status:\s*Array<\{\s*status:\s*string;\s*total:\s*number;\s*valor:\s*number\s*\}>;/),
    ],
  },
  comercial: {
    scope: "Resumo global da carteira; fila da página atual de Clientes",
    forbiddenLabels: ["Score de lead", "Ranking por score", "Previsão individual"],
    fields: [
      field("ApiDashboardSummary", "analytics.forecastValue", "Valor informado em clientes — Novo e Proposta", /analytics:\s*\{[\s\S]*?\bforecastValue\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.todayFollowUps", "Clientes com acompanhamento hoje", /analytics:\s*\{[\s\S]*?\btodayFollowUps\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.hotProposalCount", "Clientes quentes em Proposta", /analytics:\s*\{[\s\S]*?\bhotProposalCount\s*:\s*number;/),
      field("ApiDashboardSummary", "analytics.silentCount", "Clientes sem contato recente", /analytics:\s*\{[\s\S]*?\bsilentCount\s*:\s*number;/),
      field("Client", "nextFollowUp", "Próximo acompanhamento", /\bnextFollowUp\s*:\s*string;/),
      field("Client", "lastContactDays", "Dias desde o último contato", /\blastContactDays\s*:\s*number;/),
    ],
  },
  clientes: {
    scope: "Página atual de Clientes carregados",
    forbiddenLabels: ["Score", "Responsável", "Valor individual", "Previsão individual"],
    fields: [
      field("Client", "name", "Cliente", /\bname\s*:\s*string;/),
      field("Client", "company", "Empresa", /\bcompany\s*:\s*string;/),
      field("Client", "city,state", "Localização", /\bcity\s*:\s*string;[\s\S]*?\bstate\s*:\s*string;/),
      field("Client", "phone,email", "Contato", /\bphone\s*:\s*string;[\s\S]*?\bemail\s*:\s*string;/),
      field("Client", "status", "Status", /\bstatus\s*:\s*Status;/),
      field("Client", "hot", "Cliente quente", /\bhot\s*:\s*boolean;/),
      field("Client", "nextFollowUp", "Próxima ação", /\bnextFollowUp\s*:\s*string;/),
    ],
  },
  negocios: {
    scope: "Funil de Negócios canônico",
    forbiddenLabels: ["Valor total por etapa", "Receita por etapa", "Pipeline de Clientes"],
    fields: [
      field("NegociosKanbanResponse", "resumo.total", "Negócios no funil", /resumo:\s*\{[\s\S]*?\btotal\s*:\s*number;/),
      field("NegociosKanbanResponse", "resumo.porEtapa", "Quantidade por etapa", /resumo:\s*\{[\s\S]*?\bporEtapa\s*:\s*Record<BusinessStage,\s*number>;/),
      field("NegociosKanbanResponse", "resumo.fechados", "Negócios fechados", /resumo:\s*\{[\s\S]*?\bfechados\s*:\s*number;/),
      field("NegociosKanbanResponse", "resumo.perdidos", "Negócios perdidos", /resumo:\s*\{[\s\S]*?\bperdidos\s*:\s*number;/),
      field("CommunicationBusiness", "cliente,titulo,etapa", "Contexto do negócio", /\bcliente\??\s*:[\s\S]*?\btitulo\s*:\s*string \| null;[\s\S]*?\betapa\s*:\s*BusinessStage;/),
      field("CommunicationBusiness", "valor", "Valor informado", /\bvalor\s*:\s*number \| null;/),
      field("CommunicationBusiness", "proximaAcao", "Próxima ação", /\bproximaAcao\??\s*:\s*BusinessNextAction \| null;/),
      field("CommunicationBusiness", "tempoEtapa", "Tempo na etapa", /\btempoEtapa\??\s*:\s*BusinessStageTiming;/),
      field("CommunicationBusiness", "negocioParado", "Negócio parado", /\bnegocioParado\??\s*:\s*boolean;/),
    ],
  },
  agenda: {
    scope: "Operação de acompanhamentos",
    forbiddenLabels: ["Clientes sem contato", "Notas recentes", "Propostas abertas"],
    fields: [
      field("ApiAcompanhamento", "dataHora", "Data e hora", /\bdataHora\s*:\s*string;/),
      field("ApiAcompanhamento", "tipo", "Tipo", /\btipo\s*:\s*ApiAcompanhamentoTipo;/),
      field("ApiAcompanhamento", "status", "Status", /\bstatus\s*:\s*ApiAcompanhamentoStatus;/),
      field("ApiAcompanhamento", "prioridade", "Prioridade", /\bprioridade\s*:\s*ApiAcompanhamentoPrioridade;/),
      field("ApiAcompanhamento", "responsavelUsuario", "Responsável", /\bresponsavelUsuario\??\s*:/),
      field("ApiAcompanhamento", "clienteId,negocioId,conversaCanalId,propostaComercialId", "Vínculos", /\bclienteId\s*:[\s\S]*?\bnegocioId\??\s*:[\s\S]*?\bconversaCanalId\??\s*:[\s\S]*?\bpropostaComercialId\??\s*:/),
    ],
  },
  inbox: {
    scope: "Conversas e SLA operacional",
    forbiddenLabels: ["Macros", "Automação", "Modo tabela"],
    fields: [
      field("CommunicationConversation", "canalIntegracao", "Canal", /\bcanalIntegracao\s*:/),
      field("CommunicationConversation", "status", "Status", /\bstatus\s*:\s*ConversationStatus;/),
      field("CommunicationConversation", "sla", "SLA", /\bsla\s*:/),
      field("CommunicationConversation", "naoLidas", "Não lidas", /\bnaoLidas\s*:\s*number;/),
      field("CommunicationConversation", "ultimaMensagem", "Última mensagem", /\bultimaMensagem\s*:/),
      field("CommunicationConversation", "podeResponderDiretamente", "Resposta direta", /\bpodeResponderDiretamente\s*:\s*boolean;/),
      field("CommunicationConversation", "contatoCanal.cliente", "Contexto do cliente", /\bcontatoCanal\s*:[\s\S]*?\bcliente\s*:/),
    ],
  },
};

function field(source, key, label, evidence) {
  return { source, key, label, evidence };
}

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

function typeBlock(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Tipo não encontrado: ${startMarker}`);
  assert.notEqual(end, -1, `Fim do tipo não encontrado: ${endMarker}`);

  return contents.slice(start, end);
}

test("Lote 0 define uma matriz composicional consistente, sem impor a UI futura", () => {
  const allowedSources = new Set([
    "ApiDashboardSummary",
    "Client",
    "NegociosKanbanResponse",
    "CommunicationBusiness",
    "ApiAcompanhamento",
    "CommunicationConversation",
  ]);

  for (const [view, contract] of Object.entries(COMPOSITIONAL_CONTRACT_MATRIX)) {
    assert.ok(contract.scope.length > 0, `${view} precisa declarar seu escopo.`);
    assert.ok(contract.fields.length > 0, `${view} precisa declarar campos de fonte.`);

    const labels = new Set();
    for (const item of contract.fields) {
      assert.ok(allowedSources.has(item.source), `${view}.${item.key} precisa apontar para uma fonte canônica.`);
      assert.ok(item.key.length > 0 && item.label.length > 0, `${view} precisa ter campo e rótulo.`);
      assert.ok(!labels.has(item.label), `${view} não pode duplicar o rótulo ${item.label}.`);
      labels.add(item.label);
    }

    for (const forbiddenLabel of contract.forbiddenLabels) {
      assert.ok(!labels.has(forbiddenLabel), `${view} não pode incluir o rótulo proibido ${forbiddenLabel}.`);
    }
  }

  assert.deepEqual(
    new Set(COMPOSITIONAL_CONTRACT_MATRIX.dashboard.fields.map((item) => item.source)),
    new Set(["ApiDashboardSummary"]),
    "Dashboard é um resumo de carteira, não um funil de Negócios.",
  );
  assert.deepEqual(
    new Set(COMPOSITIONAL_CONTRACT_MATRIX.comercial.fields.map((item) => item.source)),
    new Set(["ApiDashboardSummary", "Client"]),
    "Painel Comercial separa resumo global de fila local de Clientes.",
  );
  assert.ok(
    COMPOSITIONAL_CONTRACT_MATRIX.negocios.fields.some((item) => item.source === "NegociosKanbanResponse"),
    "Negócios deve partir da resposta canônica do Kanban.",
  );
});

test("Lote 0 prova cada campo da matriz nos contratos de leitura reais", async () => {
  const [crmApi, dashboardTypes] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/types/dashboard.ts"),
  ]);

  const typeBodies = {
    ApiDashboardSummary: typeBlock(crmApi, "export type ApiDashboardSummary = {", "export type ClientListQuery = {"),
    Client: typeBlock(dashboardTypes, "export type Client = {", "export type Analytics = {"),
    CommunicationBusiness: typeBlock(crmApi, "export type CommunicationBusiness = {", "export type NegociosKanbanResponse ="),
    NegociosKanbanResponse: typeBlock(crmApi, "export type NegociosKanbanResponse =", "export type CommunicationLead = {"),
    ApiAcompanhamento: typeBlock(crmApi, "export type ApiAcompanhamento = {", "export type ApiAcompanhamentoResumo = {"),
    CommunicationConversation: typeBlock(crmApi, "export type CommunicationConversation = {", "export type Customer360TimelineType ="),
  };

  for (const [view, contract] of Object.entries(COMPOSITIONAL_CONTRACT_MATRIX)) {
    for (const item of contract.fields) {
      assert.match(
        typeBodies[item.source],
        item.evidence,
        `${view}.${item.key} precisa existir em ${item.source}; o Lote 0 não depende da UI atual.`,
      );
    }
  }
});

test("Lote 0 preserva as fronteiras Cliente, Negócios, Agenda e Inbox", async () => {
  const [crmApi, dashboardTypes] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/types/dashboard.ts"),
  ]);

  const client = typeBlock(dashboardTypes, "export type Client = {", "export type Analytics = {");
  const negociosResumo = typeBlock(crmApi, "export type NegociosKanbanResponse =", "export type CommunicationLead = {");

  assert.doesNotMatch(client, /\bscore\??\s*:/i, "Client não declara score confiável para a lista.");
  assert.doesNotMatch(client, /\bowner\??\s*:/i, "Client não declara owner confiável para a lista.");
  assert.match(client, /\bvalue\s*:\s*number;/, "A proibição de valor individual é de apresentação, não uma negação do contrato bruto.");

  assert.match(negociosResumo, /\bporEtapa\s*:\s*Record<BusinessStage,\s*number>;/);
  assert.doesNotMatch(negociosResumo, /\bvalor\??\s*:/, "O resumo canônico de Negócios não autoriza soma monetária por etapa.");

  const dashboardFields = COMPOSITIONAL_CONTRACT_MATRIX.dashboard.fields.map((item) => item.key).join("|");
  assert.doesNotMatch(dashboardFields, /score|neg[oó]cio|resumo\.porEtapa/i);
  assert.ok(
    COMPOSITIONAL_CONTRACT_MATRIX.agenda.fields.every((item) => item.source === "ApiAcompanhamento"),
    "Agenda permanece ancorada no contrato operacional de acompanhamentos.",
  );
  assert.ok(
    COMPOSITIONAL_CONTRACT_MATRIX.inbox.fields.every((item) => item.source === "CommunicationConversation"),
    "Inbox permanece ancorada no contrato de conversas e SLA.",
  );
});
