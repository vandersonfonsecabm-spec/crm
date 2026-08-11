import type {
  ApiPaginatedResponse,
  AssignmentHistoryEntry,
  AuthSession,
  CommercialPriority,
  CommunicationBusiness,
  CommunicationConversation,
  CommunicationMessage,
  ConversationQuery,
  ConversationStatus,
  InboxCommercialBusiness,
  InboxCommercialContext,
  InternalConversationNote,
  LeadStatus,
  LeadsCommunicationUser,
  ReplyLease,
} from "../../../src/services/crmApi";

export type {
  ApiPaginatedResponse,
  AssignmentHistoryEntry,
  AuthSession,
  CommercialPriority,
  CommunicationBusiness,
  CommunicationConversation,
  CommunicationMessage,
  ConversationQuery,
  ConversationStatus,
  InboxCommercialBusiness,
  InboxCommercialContext,
  InternalConversationNote,
  LeadStatus,
  LeadsCommunicationUser,
  ReplyLease,
};

/**
 * Test-only Inbox adapter.
 *
 * Its reads stay on the current localhost origin under /__wave5-inbox and all
 * mutations reject before fetch is called. A Vite resolve alias must map the
 * production crmApi module to this file for the real panel to consume it.
 */
const FIXTURE_PREFIX = "/__wave5-inbox";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

type FixtureReadResult = {
  body: unknown;
  status?: number;
};

export class ApiHttpError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fixtureUsers: LeadsCommunicationUser[] = [
  { id: 701, nome: "Atendente QA", papel: "GERENTE", ativo: true },
  { id: 702, nome: "Equipe de demonstração", papel: "VENDEDOR", ativo: true },
];

const messagesByConversation = new Map<number, CommunicationMessage[]>([
  [101, [
    {
      id: 10001,
      conversaCanalId: 101,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Olá! Esta é uma conversa fictícia para validar a Caixa de Entrada.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: null,
      createdAt: "2030-01-15T13:05:00.000Z",
      updatedAt: "2030-01-15T13:05:00.000Z",
    },
    {
      id: 10002,
      conversaCanalId: 101,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Quero entender as opções para a próxima safra.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: null,
      createdAt: "2030-01-15T13:09:00.000Z",
      updatedAt: "2030-01-15T13:09:00.000Z",
    },
    ...[
      "levantamento inicial da demonstração",
      "detalhamento do cenário de teste",
      "confirmação de requisitos fictícios",
      "revisão de prioridade sintética",
      "validação da próxima ação local",
      "resumo do histórico demonstrativo",
      "checagem de alternativas de exemplo",
      "registro de decisão para QA visual",
      "simulação de uma pergunta complementar",
      "esclarecimento de fluxo sem integração",
      "organização do retorno de demonstração",
      "anotação de contexto para a equipe local",
      "comparação de opções puramente fictícias",
      "confirmação de leitura no cenário local",
      "detalhe adicional para testar quebra de linha",
      "preparação da conclusão simulada",
      "recapitulação do atendimento de exemplo",
      "encerramento da conversa de QA",
    ].map((topic, index): CommunicationMessage => {
      const outgoing = index % 2 === 0;
      const timestamp = "2030-01-15T13:" + String(10 + index).padStart(2, "0") + ":00.000Z";
      return {
        id: 10003 + index,
        conversaCanalId: 101,
        autorUsuarioId: outgoing ? 701 : null,
        autor: outgoing ? { id: 701, nome: "Atendente QA" } : null,
        direcao: outgoing ? "SAIDA" : "ENTRADA",
        tipo: "TEXTO",
        texto: (outgoing ? "Resposta simulada de QA sobre " : "Mensagem sintética recebida sobre ") + topic
          + ". Este texto existe apenas para validar a rolagem independente da linha do tempo em uma tela de 1440 por 900 pixels, sem cliente, contato, integração ou operação externa.",
        status: outgoing ? "REGISTRADA" : "RECEBIDA",
        statusEntrega: outgoing ? "LIDA" : null,
        simulada: outgoing,
        lidaEm: outgoing ? timestamp : null,
        emailMetadata: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
  ]],
  [102, [
    {
      id: 10003,
      conversaCanalId: 102,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "FORMULARIO",
      texto: "Pedido sintético enviado pelo formulário local.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: null,
      createdAt: "2030-01-15T12:42:00.000Z",
      updatedAt: "2030-01-15T12:42:00.000Z",
    },
  ]],
  [103, [
    {
      id: 10004,
      conversaCanalId: 103,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Mensagem fictícia do canal Instagram.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: null,
      createdAt: "2030-01-15T12:08:00.000Z",
      updatedAt: "2030-01-15T12:08:00.000Z",
    },
  ]],
  [104, [
    {
      id: 10005,
      conversaCanalId: 104,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Mensagem fictícia do canal Messenger.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: null,
      createdAt: "2030-01-15T11:36:00.000Z",
      updatedAt: "2030-01-15T11:36:00.000Z",
    },
  ]],
  [105, [
    {
      id: 10006,
      conversaCanalId: 105,
      autorUsuarioId: null,
      autor: null,
      direcao: "ENTRADA",
      tipo: "EMAIL",
      texto: "E-mail fictício para revisão visual da listagem multicanal.",
      status: "RECEBIDA",
      statusEntrega: null,
      simulada: false,
      lidaEm: null,
      emailMetadata: {
        subject: "Dúvida de demonstração",
        fromAddress: "contato.fixture@example.invalid",
        fromName: "Contato de demonstração",
        attachmentCount: 1,
      },
      createdAt: "2030-01-15T10:54:00.000Z",
      updatedAt: "2030-01-15T10:54:00.000Z",
    },
  ]],
]);

const conversations: CommunicationConversation[] = [
  {
    id: 101,
    canalIntegracaoId: 11,
    contatoCanalId: 1001,
    leadId: 501,
    responsavelId: 701,
    status: "EM_ATENDIMENTO",
    emailSubject: null,
    primeiraMensagemEm: "2030-01-15T13:05:00.000Z",
    ultimaMensagemEm: "2030-01-15T13:09:00.000Z",
    primeiraRespostaHumanaEm: null,
    aguardandoDesde: null,
    encerradaEm: null,
    reabertaEm: null,
    createdAt: "2030-01-15T13:05:00.000Z",
    updatedAt: "2030-01-15T13:09:00.000Z",
    canalIntegracao: { id: 11, nome: "WhatsApp QA", tipo: "WHATSAPP_META", status: "ATIVO", modoTeste: true },
    contatoCanal: {
      id: 1001,
      nome: "Contato Campo Claro",
      clienteId: 901,
      cliente: {
        id: 901,
        nome: "Cliente Campo Claro (fictício)",
        telefone: "+55 00 00000-0000",
        email: "campo-claro.fixture@example.invalid",
        empresa: "Operação de demonstração",
      },
    },
    lead: {
      id: 501,
      clienteId: 901,
      status: "QUALIFICADO",
      interesse: "Planejamento de safra demonstrativo",
      origem: "QA local",
      campanha: "Wave 5 fixture",
      paginaOrigem: "/fixture/inbox",
      responsavel: { id: 701, nome: "Atendente QA" },
    },
    responsavel: fixtureUsers[0],
    responsavelPrincipal: { id: 701, nome: "Atendente QA" },
    reservaResposta: null,
    ultimaMensagem: messagesByConversation.get(101)?.at(-1) ?? null,
    podeResponderDiretamente: true,
    tipoCanal: "WHATSAPP_META",
    naoLidas: 2,
    sla: {
      status: "ATENCAO",
      label: "Em atenção",
      level: 2,
      elapsedMinutes: 34,
      startedAt: "2030-01-15T13:05:00.000Z",
    },
  },
  {
    id: 102,
    canalIntegracaoId: 12,
    contatoCanalId: 1002,
    leadId: 502,
    responsavelId: null,
    status: "NOVA",
    emailSubject: null,
    primeiraMensagemEm: "2030-01-15T12:42:00.000Z",
    ultimaMensagemEm: "2030-01-15T12:42:00.000Z",
    primeiraRespostaHumanaEm: null,
    aguardandoDesde: null,
    encerradaEm: null,
    reabertaEm: null,
    createdAt: "2030-01-15T12:42:00.000Z",
    updatedAt: "2030-01-15T12:42:00.000Z",
    canalIntegracao: { id: 12, nome: "Formulário do site QA", tipo: "SITE_FORM", status: "ATIVO", modoTeste: false },
    contatoCanal: {
      id: 1002,
      nome: "Lead do site (fictício)",
      clienteId: 902,
      cliente: {
        id: 902,
        nome: "Lead do site (fictício)",
        telefone: "+55 00 00000-0001",
        email: "site.fixture@example.invalid",
        empresa: "Conta sintética",
      },
    },
    lead: {
      id: 502,
      clienteId: 902,
      status: "NOVO",
      interesse: "Visita de demonstração",
      origem: "Site QA",
      campanha: "Fixture",
      paginaOrigem: "/fixture/site",
      responsavel: null,
    },
    responsavel: null,
    responsavelPrincipal: null,
    reservaResposta: null,
    ultimaMensagem: messagesByConversation.get(102)?.at(-1) ?? null,
    podeResponderDiretamente: false,
    tipoCanal: "SITE_FORM",
    naoLidas: 1,
    sla: {
      status: "CRITICO",
      label: "Crítico",
      level: 3,
      elapsedMinutes: 94,
      startedAt: "2030-01-15T12:42:00.000Z",
    },
  },
  {
    id: 103,
    canalIntegracaoId: 13,
    contatoCanalId: 1003,
    leadId: null,
    responsavelId: 702,
    status: "AGUARDANDO_CLIENTE",
    emailSubject: null,
    primeiraMensagemEm: "2030-01-15T12:08:00.000Z",
    ultimaMensagemEm: "2030-01-15T12:08:00.000Z",
    primeiraRespostaHumanaEm: null,
    aguardandoDesde: "2030-01-15T12:09:00.000Z",
    encerradaEm: null,
    reabertaEm: null,
    createdAt: "2030-01-15T12:08:00.000Z",
    updatedAt: "2030-01-15T12:09:00.000Z",
    canalIntegracao: { id: 13, nome: "Instagram QA", tipo: "INSTAGRAM_META", status: "ATIVO", modoTeste: false },
    contatoCanal: {
      id: 1003,
      nome: "Perfil de demonstração",
      clienteId: null,
      cliente: null,
    },
    lead: null,
    responsavel: fixtureUsers[1],
    responsavelPrincipal: { id: 702, nome: "Equipe de demonstração" },
    reservaResposta: null,
    ultimaMensagem: messagesByConversation.get(103)?.at(-1) ?? null,
    podeResponderDiretamente: false,
    tipoCanal: "INSTAGRAM_META",
    naoLidas: 0,
    sla: {
      status: "DENTRO_PRAZO",
      label: "Dentro do prazo",
      level: 1,
      elapsedMinutes: 12,
      startedAt: "2030-01-15T12:08:00.000Z",
    },
  },
  {
    id: 104,
    canalIntegracaoId: 14,
    contatoCanalId: 1004,
    leadId: null,
    responsavelId: null,
    status: "PENDENTE",
    emailSubject: null,
    primeiraMensagemEm: "2030-01-15T11:36:00.000Z",
    ultimaMensagemEm: "2030-01-15T11:36:00.000Z",
    primeiraRespostaHumanaEm: null,
    aguardandoDesde: null,
    encerradaEm: null,
    reabertaEm: null,
    createdAt: "2030-01-15T11:36:00.000Z",
    updatedAt: "2030-01-15T11:36:00.000Z",
    canalIntegracao: { id: 14, nome: "Messenger QA", tipo: "MESSENGER_META", status: "ATIVO", modoTeste: false },
    contatoCanal: {
      id: 1004,
      nome: "Contato Messenger (fictício)",
      clienteId: null,
      cliente: null,
    },
    lead: null,
    responsavel: null,
    responsavelPrincipal: null,
    reservaResposta: null,
    ultimaMensagem: messagesByConversation.get(104)?.at(-1) ?? null,
    podeResponderDiretamente: false,
    tipoCanal: "MESSENGER_META",
    naoLidas: 0,
    sla: null,
  },
  {
    id: 105,
    canalIntegracaoId: 15,
    contatoCanalId: 1005,
    leadId: 503,
    responsavelId: 701,
    status: "ENCERRADA",
    emailSubject: "Dúvida de demonstração",
    primeiraMensagemEm: "2030-01-15T10:54:00.000Z",
    ultimaMensagemEm: "2030-01-15T10:54:00.000Z",
    primeiraRespostaHumanaEm: null,
    aguardandoDesde: null,
    encerradaEm: "2030-01-15T11:01:00.000Z",
    reabertaEm: null,
    createdAt: "2030-01-15T10:54:00.000Z",
    updatedAt: "2030-01-15T11:01:00.000Z",
    canalIntegracao: { id: 15, nome: "E-mail QA", tipo: "EMAIL", status: "ATIVO", modoTeste: false },
    contatoCanal: {
      id: 1005,
      nome: "Contato por e-mail (fictício)",
      clienteId: 903,
      cliente: {
        id: 903,
        nome: "Contato por e-mail (fictício)",
        telefone: "+55 00 00000-0002",
        email: "email.fixture@example.invalid",
        empresa: "Empresa de demonstração",
      },
    },
    lead: {
      id: 503,
      clienteId: 903,
      status: "CONVERTIDO",
      interesse: "Revisão de e-mail",
      origem: "E-mail QA",
      campanha: null,
      paginaOrigem: null,
      responsavel: { id: 701, nome: "Atendente QA" },
    },
    responsavel: fixtureUsers[0],
    responsavelPrincipal: { id: 701, nome: "Atendente QA" },
    reservaResposta: null,
    ultimaMensagem: messagesByConversation.get(105)?.at(-1) ?? null,
    podeResponderDiretamente: false,
    tipoCanal: "EMAIL",
    naoLidas: 0,
    sla: null,
  },
];

const notesByConversation = new Map<number, InternalConversationNote[]>([
  [101, [{
    id: 11001,
    conversaCanalId: 101,
    autorId: 701,
    autor: { id: 701, nome: "Atendente QA" },
    autorSistema: false,
    sistema: false,
    conteudo: "Nota sintética: validar leitura do contexto antes de qualquer contato.",
    createdAt: "2030-01-15T13:12:00.000Z",
    updatedAt: "2030-01-15T13:12:00.000Z",
  }]],
]);

const historyByConversation = new Map<number, AssignmentHistoryEntry[]>([
  [101, [{
    id: 12001,
    tipo: "ASSUMIR",
    origem: "FIXTURE_LOCAL",
    acaoAtendimento: "ASSUMIR",
    estadoAnterior: "AGUARDANDO_ATENDIMENTO",
    estadoNovo: "EM_ATENDIMENTO",
    motivo: "Cenário local de QA",
    responsavelAnterior: null,
    responsavelNovo: { id: 701, nome: "Atendente QA" },
    alteradoPor: { id: 701, nome: "Atendente QA" },
    createdAt: "2030-01-15T13:10:00.000Z",
  }]],
]);

const commercialContextByConversation = new Map<number, InboxCommercialContext>([
  [101, {
    estado: "QUALIFICADO",
    cliente: {
      id: 901,
      nome: "Cliente Campo Claro (fictício)",
      interesse: "Planejamento de safra demonstrativo",
      valor: 18000,
      origem: "QA local",
    },
    lead: {
      id: 501,
      status: "QUALIFICADO",
      origem: "QA local",
      interesse: "Planejamento de safra demonstrativo",
      responsavel: { id: 701, nome: "Atendente QA", papel: "GERENTE" },
    },
    qualificacao: {
      interesse: "Planejamento de safra demonstrativo",
      prioridade: "ALTA",
      valorEstimado: 18000,
      proximaAcao: "Revisar a proposta de demonstração",
      dataRetorno: "2030-01-18T12:00:00.000Z",
      observacao: "Dados fictícios; a fixture não permite gravação.",
    },
    negocio: null,
    historico: [{
      id: 13001,
      acao: "QUALIFICAR",
      autor: { id: 701, nome: "Atendente QA" },
      negocio: null,
      observacao: "Qualificação sintética para QA visual.",
      createdAt: "2030-01-15T13:13:00.000Z",
    }],
    permissoes: { qualificar: false, criarOuVincular: false },
  }],
]);

const eligibleBusinesses: InboxCommercialBusiness[] = [{
  id: 14001,
  titulo: "Negócio de demonstração",
  etapa: "CONTATO",
  valor: 18000,
  cliente: { id: 901, nome: "Cliente Campo Claro (fictício)" },
  responsavel: { id: 701, nome: "Atendente QA" },
  leadId: 501,
  elegivel: true,
  createdAt: "2030-01-15T13:14:00.000Z",
}];

function currentLocalOrigin() {
  if (typeof window === "undefined") {
    throw new ApiHttpError("A fixture Inbox exige um navegador local.", 0, "LOCAL_QA_BROWSER_REQUIRED");
  }

  const origin = new URL(window.location.href);
  if (!LOCAL_HOSTS.has(origin.hostname)) {
    throw new ApiHttpError("A fixture Inbox só pode rodar em localhost.", 0, "LOCAL_QA_OUTBOUND_BLOCKED");
  }

  return origin.origin;
}

function localUrl(path: string, params: Record<string, unknown> = {}) {
  const url = new URL(path, currentLocalOrigin());
  if (url.origin !== currentLocalOrigin() || !url.pathname.startsWith(FIXTURE_PREFIX + "/")) {
    throw new ApiHttpError("A fixture bloqueou uma rota fora do escopo local.", 0, "LOCAL_QA_OUTBOUND_BLOCKED");
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const scenario = new URLSearchParams(window.location.search).get("scenario");
  if (scenario) url.searchParams.set("scenario", scenario);
  return url;
}

async function localRead<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = localUrl(path, params);
  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null) as { message?: string; code?: string; details?: Record<string, unknown> } | null;

  if (!response.ok) {
    throw new ApiHttpError(
      body?.message ?? "A fixture Inbox não encontrou a rota local.",
      response.status,
      body?.code,
      body?.details,
    );
  }

  return body as T;
}

function blockedWrite(): Promise<never> {
  return Promise.reject(new ApiHttpError(
    "A fixture local da Inbox não permite mutações.",
    405,
    "LOCAL_QA_WRITE_BLOCKED",
  ));
}

function page<T>(items: T[], search: URLSearchParams): ApiPaginatedResponse<T> {
  const pageNumber = Math.max(1, Number(search.get("page") ?? "1") || 1);
  const limit = Math.max(1, Number(search.get("limit") ?? String(items.length || 20)) || 20);
  const start = (pageNumber - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: {
      page: pageNumber,
      limit,
      total: items.length,
      totalPages: items.length ? Math.max(1, Math.ceil(items.length / limit)) : 0,
    },
  };
}

function filteredConversations(search: URLSearchParams) {
  if (search.get("scenario") === "empty") return [];

  const text = (search.get("q") ?? "").trim().toLocaleLowerCase("pt-BR");
  const status = search.get("estado");
  const channelId = Number(search.get("canalIntegracaoId") ?? "");
  const leadId = Number(search.get("leadId") ?? "");
  const responsibleId = Number(search.get("responsavelId") ?? "");
  const wantsMine = search.get("meus") === "true";
  const wantsUnassigned = search.get("semResponsavel") === "true";
  const sla = search.get("sla");

  return conversations.filter((conversation) => {
    const searchable = [
      conversation.contatoCanal.nome,
      conversation.contatoCanal.cliente?.nome,
      conversation.ultimaMensagem?.texto,
      conversation.emailSubject,
      conversation.canalIntegracao.nome,
    ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

    if (text && !searchable.includes(text)) return false;
    if (status && conversation.status !== status) return false;
    if (Number.isFinite(channelId) && channelId > 0 && conversation.canalIntegracaoId !== channelId) return false;
    if (Number.isFinite(leadId) && leadId > 0 && conversation.leadId !== leadId) return false;
    if (Number.isFinite(responsibleId) && responsibleId > 0 && conversation.responsavelId !== responsibleId) return false;
    if (wantsMine && conversation.responsavelId !== 701) return false;
    if (wantsUnassigned && conversation.responsavelId !== null) return false;
    if (sla === "ATENCAO" && conversation.sla?.status !== "ATENCAO") return false;
    if (sla === "CRITICO" && conversation.sla?.status !== "CRITICO") return false;
    return true;
  });
}

function fixtureNotFound(message: string): FixtureReadResult {
  return {
    status: 404,
    body: { message, code: "LOCAL_QA_FIXTURE_NOT_FOUND" },
  };
}

/**
 * Called by inbox.html's fetch boundary. It never performs network I/O.
 */
export function resolveInboxFixtureRead(url: URL): FixtureReadResult {
  if (!LOCAL_HOSTS.has(url.hostname) || !url.pathname.startsWith(FIXTURE_PREFIX + "/")) {
    return {
      status: 403,
      body: { message: "A fixture bloqueou a rota fora de localhost.", code: "LOCAL_QA_OUTBOUND_BLOCKED" },
    };
  }

  const route = url.pathname;
  if (route === FIXTURE_PREFIX + "/conversas") {
    return { body: page(filteredConversations(url.searchParams), url.searchParams) };
  }
  if (route === FIXTURE_PREFIX + "/conversas/equipe") {
    return { body: { data: fixtureUsers } };
  }

  const match = route.match(/^\/__wave5-inbox\/conversas\/(\d+)(?:\/([^/]+))?$/);
  if (!match) return fixtureNotFound("Rota local da Inbox não encontrada.");

  const conversationId = Number(match[1]);
  const resource = match[2];
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) return fixtureNotFound("Conversa sintética não encontrada.");

  if (!resource) return { body: conversation };
  if (resource === "mensagens") {
    return { body: page(messagesByConversation.get(conversationId) ?? [], url.searchParams) };
  }
  if (resource === "notas-internas") {
    return { body: notesByConversation.get(conversationId) ?? [] };
  }
  if (resource === "historico-atribuicao") {
    return { body: historyByConversation.get(conversationId) ?? [] };
  }
  if (resource === "contexto-comercial") {
    return { body: commercialContextByConversation.get(conversationId) ?? { estado: "SEM_CONTEXTO", cliente: null, lead: null, qualificacao: null, negocio: null, historico: [], permissoes: { qualificar: false, criarOuVincular: false } } };
  }
  if (resource === "negocios-elegiveis") {
    const text = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("pt-BR");
    return {
      body: {
        data: eligibleBusinesses.filter((business) => !text || [business.titulo, business.responsavel?.nome].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(text)),
      },
    };
  }

  return fixtureNotFound("Recurso local da Inbox não encontrado.");
}

declare global {
  interface Window {
    __WAVE5_INBOX_FIXTURE_READ__?: (url: URL) => FixtureReadResult;
  }
}

if (typeof window !== "undefined") {
  window.__WAVE5_INBOX_FIXTURE_READ__ = resolveInboxFixtureRead;
}

export function fetchCommunicationConversations(params: ConversationQuery = {}) {
  return localRead<ApiPaginatedResponse<CommunicationConversation>>(FIXTURE_PREFIX + "/conversas", params);
}

export function fetchCommunicationConversation(id: number) {
  return localRead<CommunicationConversation>(FIXTURE_PREFIX + "/conversas/" + id);
}

export function fetchCommunicationMessages(id: number, params: { page?: number; limit?: number } = {}) {
  return localRead<ApiPaginatedResponse<CommunicationMessage>>(FIXTURE_PREFIX + "/conversas/" + id + "/mensagens", params);
}

export function fetchCommunicationNotes(id: number) {
  return localRead<InternalConversationNote[]>(FIXTURE_PREFIX + "/conversas/" + id + "/notas-internas");
}

export function fetchCommunicationConversationHistory(id: number) {
  return localRead<AssignmentHistoryEntry[]>(FIXTURE_PREFIX + "/conversas/" + id + "/historico-atribuicao");
}

export function fetchCommunicationTeamUsers() {
  return localRead<{ data: LeadsCommunicationUser[] }>(FIXTURE_PREFIX + "/conversas/equipe");
}

export function fetchInboxCommercialContext(id: number) {
  return localRead<InboxCommercialContext>(FIXTURE_PREFIX + "/conversas/" + id + "/contexto-comercial");
}

export function fetchInboxEligibleBusinesses(id: number, query = "") {
  return localRead<{ data: InboxCommercialBusiness[] }>(
    FIXTURE_PREFIX + "/conversas/" + id + "/negocios-elegiveis",
    query.trim() ? { q: query.trim() } : {},
  );
}

export function acquireCommunicationReplyLease(_id: number): Promise<{ reservaResposta: ReplyLease }> {
  void _id;
  return blockedWrite();
}

export function assignCommunicationConversation(_id: number, _responsavelId: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _responsavelId;
  void _motivo;
  return blockedWrite();
}

export function assumeCommunicationConversation(_id: number): Promise<CommunicationConversation> {
  void _id;
  return blockedWrite();
}

export function closeCommunicationConversation(_id: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _motivo;
  return blockedWrite();
}

export function createCommunicationNote(_id: number, _conteudo: string): Promise<InternalConversationNote> {
  void _id;
  void _conteudo;
  return blockedWrite();
}

export function createInboxBusiness(
  _id: number,
  _payload: { titulo?: string; observacao?: string | null; confirmarDuplicidade?: boolean },
): Promise<{ created: boolean; negocio: CommunicationBusiness; contexto: InboxCommercialContext }> {
  void _id;
  void _payload;
  return blockedWrite();
}

export function linkInboxBusiness(_id: number, _negocioId: number): Promise<{ linked: boolean; contexto: InboxCommercialContext }> {
  void _id;
  void _negocioId;
  return blockedWrite();
}

export function markCommunicationConversationPending(_id: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _motivo;
  return blockedWrite();
}

export function markCommunicationConversationRead(_id: number): Promise<{ marcadasComoLidas: number }> {
  void _id;
  return blockedWrite();
}

export function releaseCommunicationReplyLease(_id: number): Promise<{ reservaResposta: null }> {
  void _id;
  return blockedWrite();
}

export function reopenCommunicationConversation(_id: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _motivo;
  return blockedWrite();
}

export function renewCommunicationReplyLease(_id: number): Promise<{ reservaResposta: ReplyLease }> {
  void _id;
  return blockedWrite();
}

export function returnCommunicationConversationToQueue(_id: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _motivo;
  return blockedWrite();
}

export function saveInboxCommercialQualification(
  _id: number,
  _payload: {
    interesse: string;
    prioridade: CommercialPriority;
    valorEstimado?: number | null;
    proximaAcao: string;
    dataRetorno?: string | null;
    observacao?: string | null;
  },
): Promise<InboxCommercialContext> {
  void _id;
  void _payload;
  return blockedWrite();
}

export function sendSimulatedCommunicationMessage(
  _id: number,
  _payload: { externalId: string; texto: string },
): Promise<CommunicationMessage> {
  void _id;
  void _payload;
  return blockedWrite();
}

export function waitCommunicationConversationForCustomer(_id: number, _motivo?: string): Promise<CommunicationConversation> {
  void _id;
  void _motivo;
  return blockedWrite();
}
