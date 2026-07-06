import type { Client, Note, Status } from "../types/dashboard";

const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_URL = configuredApiUrl || (import.meta.env.PROD ? "" : "http://localhost:3001");
const TOKEN_KEY = "crm-auth-token";
const USER_KEY = "crm-auth-user";
const COMPANY_KEY = "crm-auth-company";
const ROLE_KEY = "crm-auth-role";
const EXPIRES_KEY = "crm-auth-expires-at";
const DEMO_KEY = "crm-auth-demo";
const DEMO_TOKEN = "demo-sqlite";

type ApiAuthResponse = {
  access_token: string;
  expires_at?: string;
  user?: {
    id?: number;
    nome?: string;
    email?: string;
    papel?: ApiUserRole;
    role?: ApiUserRole;
    ativo?: boolean;
    empresaId?: number;
  };
  usuario?: {
    id?: number;
    nome?: string;
    email?: string;
    papel?: ApiUserRole;
    role?: ApiUserRole;
    ativo?: boolean;
    empresaId?: number;
  };
  empresa?: ApiAuthCompany;
  papel?: ApiUserRole;
  isDemo?: boolean;
};

export type ApiUserRole = "ADMIN" | "GERENTE" | "VENDEDOR";

export type ApiAuthUser = {
  id?: number;
  empresaId?: number;
  nome: string;
  email?: string;
  papel?: ApiUserRole;
  ativo?: boolean;
};

export type ApiAuthCompany = {
  id?: number;
  nome: string;
  slug?: string;
  ativo?: boolean;
};

export type AuthSession = {
  token: string;
  usuario: ApiAuthUser;
  empresa?: ApiAuthCompany;
  papel?: ApiUserRole;
  expiresAt?: string;
  isDemo: boolean;
};

type ApiCliente = {
  id: string | number;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  cidade?: string | null;
  fazenda?: string | null;
  interesse?: string | null;
  observacoes?: string | null;
  status?: string | null;
  valor?: number | null;
  origem?: string | null;
  favorito?: boolean | null;
  quente?: boolean | null;
  ultimoContato?: number | null;
  proximoFollowUp?: string | null;
  tags?: string[] | string | null;
  createdAt?: string;
  updatedAt?: string;
  notas?: ApiNota[];
};

type ApiNota = {
  id: number;
  texto: string;
  tipo?: string | null;
  createdAt: string;
  clienteId?: number;
};

type ClientePayload = {
  nome: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  interesse?: string;
  status?: string;
  valor?: number;
  origem?: string;
  favorito?: boolean;
  quente?: boolean;
  ultimoContato?: number;
  proximoFollowUp?: string;
  tags?: string[];
};

export type ApiDashboardSummary = {
  indicadores: {
    clientes: number;
    produtos: number;
    pedidos: number;
    contasPendentes: number;
    faturamento: number;
  };
  estoqueBaixo: unknown[];
  pedidosRecentes: unknown[];
  contasVencidas: unknown[];
  produtosMaisVendidos: unknown[];
};

export type ApiPaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ApiCategoriaProduto = {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  produtosCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoriaProdutoCreatePayload = {
  nome: string;
  descricao?: string;
};

export type CategoriaProdutoUpdatePayload = {
  nome?: string;
  descricao?: string | null;
  ativo?: boolean;
};

export type ApiProduto = {
  id: number;
  nome: string;
  codigo?: string | null;
  descricao?: string | null;
  categoriaId?: number | null;
  categoria?: ApiCategoriaProduto | null;
  unidadeMedida: string;
  quantidadeAtual: string;
  estoqueMinimo: string;
  precoCustoCentavos: number;
  precoVendaCentavos: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  movimentacoesCount?: number;
  ultimasMovimentacoes?: ApiMovimentacaoEstoque[];
};

export type ApiMovimentacaoEstoque = {
  id: number;
  tipo: "ENTRADA" | "SAIDA" | "AJUSTE";
  quantidade: string;
  quantidadeAnterior: string;
  quantidadePosterior: string;
  motivo?: string | null;
  observacao?: string | null;
  createdAt: string;
  produto: {
    id: number;
    nome: string;
    codigo?: string | null;
    unidadeMedida: string;
  } | null;
};

export type ApiResumoEstoque = {
  indicadores: {
    produtosAtivos: number;
    produtosComEstoque: number;
    produtosSemEstoque: number;
    produtosComEstoqueBaixo: number;
    categoriasAtivas: number;
    valorTotalCustoCentavos?: string;
    valorTotalVendaCentavos?: string;
  };
  ultimasMovimentacoes: ApiMovimentacaoEstoque[];
};

export type ApiAcompanhamentoStatus = "PENDENTE" | "CONCLUIDO" | "CANCELADO";
export type ApiAcompanhamentoPrioridade = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
export type ApiAcompanhamentoTipo = "LIGACAO" | "WHATSAPP" | "EMAIL" | "REUNIAO" | "VISITA" | "OUTRO";

export type ApiAcompanhamento = {
  id: number;
  clienteId: number;
  cliente: {
    id: number;
    nome: string;
    empresa?: string | null;
    telefone?: string | null;
    email?: string | null;
    status?: string | null;
    valor?: number | null;
  } | null;
  titulo: string;
  descricao?: string | null;
  dataHora: string;
  prioridade: ApiAcompanhamentoPrioridade;
  status: ApiAcompanhamentoStatus;
  tipo: ApiAcompanhamentoTipo;
  responsavel?: string | null;
  concluidoEm?: string | null;
  atrasado: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiAcompanhamentoResumo = {
  indicadores: {
    pendentes: number;
    paraHoje: number;
    atrasados: number;
    criticos: number;
    concluidosPeriodo: number;
  };
  proximos: ApiAcompanhamento[];
  porTipo: Array<{
    tipo: ApiAcompanhamentoTipo;
    total: number;
  }>;
};

export type AcompanhamentoQueryParams = {
  busca?: string;
  clienteId?: number;
  status?: ApiAcompanhamentoStatus;
  prioridade?: ApiAcompanhamentoPrioridade;
  tipo?: ApiAcompanhamentoTipo;
  dataInicial?: string;
  dataFinal?: string;
  atrasados?: boolean;
  hoje?: boolean;
  page?: number;
  limit?: number;
};

export type AcompanhamentoPayload = {
  clienteId: number;
  titulo: string;
  descricao?: string;
  dataHora: string;
  prioridade: ApiAcompanhamentoPrioridade;
  tipo: ApiAcompanhamentoTipo;
  responsavel?: string;
};

export type ProdutoQueryParams = {
  busca?: string;
  categoriaId?: number;
  ativo?: boolean | null;
  unidadeMedida?: string;
  estoqueBaixo?: boolean;
  page?: number;
  limit?: number;
};

export type ProdutoCreatePayload = {
  nome: string;
  codigo?: string;
  descricao?: string;
  categoriaId?: number;
  unidadeMedida: string;
  estoqueMinimo: string;
  precoCustoCentavos: number;
  precoVendaCentavos: number;
};

export type ProdutoUpdatePayload = Partial<ProdutoCreatePayload> & {
  ativo?: boolean;
};

export type EstoqueEntradaPayload = {
  produtoId: number;
  quantidade: string;
  motivo?: string;
  observacao?: string;
};

export type EstoqueSaidaPayload = EstoqueEntradaPayload;

export type EstoqueAjustePayload = {
  produtoId: number;
  novaQuantidade: string;
  motivo: string;
  observacao?: string;
};

export type EstoqueMovimentacaoResponse = {
  produto: ApiProduto;
  movimentacao: ApiMovimentacaoEstoque;
};

export type MovimentacaoQueryParams = {
  produtoId?: number;
  tipo?: ApiMovimentacaoEstoque["tipo"];
  busca?: string;
  dataInicial?: string;
  dataFinal?: string;
  page?: number;
  limit?: number;
};


export type HubIntegrationStatus = "PENDENTE" | "ATIVA" | "INATIVA" | "ERRO";
export type HubIntegrationType = "BLING" | "OMIE" | "CONTA_AZUL" | "TINY" | "ALTERDATA" | "CSV" | "XLSX" | "XML" | "JSON" | "CUSTOM";
export type HubImportStatus = "ENVIADO" | "MAPEAMENTO_PENDENTE" | "VALIDANDO" | "PRONTO" | "PROCESSANDO" | "CONCLUIDO" | "CONCLUIDO_COM_ERROS" | "FALHOU" | "CANCELADO";
export type HubImportFormat = "CSV" | "XLSX" | "XML" | "JSON";
export type HubUpdateStrategy = "CRIAR_E_ATUALIZAR" | "APENAS_CRIAR" | "APENAS_ATUALIZAR";
export type HubMoneyMode = "CENTAVOS" | "REAIS_VIRGULA" | "REAIS_PONTO";

export type HubIntegracao = {
  id: number;
  empresaId: number;
  nome: string;
  tipo: HubIntegrationType;
  status: HubIntegrationStatus;
  modo?: string | null;
  configuracao?: Record<string, unknown> | null;
  possuiCredenciais?: boolean;
  ultimaSincronizacaoEm?: string | null;
  ultimoSucessoEm?: string | null;
  ultimoErroEm?: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HubSincronizacao = {
  id: number;
  empresaId: number;
  integracaoId: number;
  status: "PENDENTE" | "EXECUTANDO" | "CONCLUIDA" | "CONCLUIDA_COM_ERROS" | "FALHOU" | "CANCELADA";
  origem: string;
  iniciadaEm: string;
  finalizadaEm?: string | null;
  itensRecebidos: number;
  itensProcessados: number;
  itensComErro: number;
  mensagemErro?: string | null;
  metadados?: Record<string, unknown> | null;
};

export type HubBlingStartResponse = { authorizationUrl: string; expiresAt: string };
export type HubBlingTestResponse = { conectado: boolean; validadoEm: string; conta?: string | null };
export type HubBlingSyncResponse = {
  sincronizacao: HubSincronizacao;
  resultado: Record<string, number>;
};

export type HubImportacaoUsuario = { id: number; nome: string; email: string };

export type HubCanonicalField =
  | "externalId"
  | "sku"
  | "codigoBarras"
  | "nome"
  | "descricao"
  | "categoria"
  | "marca"
  | "unidade"
  | "ativo"
  | "quantidade"
  | "reservado"
  | "disponivel"
  | "localExternalId"
  | "localNome"
  | "precoCentavos"
  | "precoPromocionalCentavos"
  | "tabelaPreco"
  | "inicioPromocao"
  | "fimPromocao";

export type HubImportMappingConfig = {
  mapping: Partial<Record<HubCanonicalField, string>>;
  options?: { money?: Partial<Record<"precoCentavos" | "precoPromocionalCentavos", HubMoneyMode>> };
  chavePrincipal?: string;
  permitirParcial?: boolean;
};

export type HubErroImportacao = {
  id: number;
  linha: number;
  campo: string;
  codigo: string;
  mensagem: string;
  valorSanitizado?: string | null;
  createdAt: string;
};

export type HubImportacaoDados = {
  id: number;
  empresaId: number;
  integracaoId?: number | null;
  formato: HubImportFormat;
  status: HubImportStatus;
  nomeArquivo: string;
  tamanhoBytes: number;
  hashArquivo?: string | null;
  tipoEntidade: string;
  mapeamento?: HubImportMappingConfig | null;
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  iniciadaEm?: string | null;
  finalizadaEm?: string | null;
  createdByUsuarioId?: number | null;
  createdAt: string;
  updatedAt: string;
  integracao?: Pick<HubIntegracao, "id" | "nome" | "tipo"> | null;
  usuario?: HubImportacaoUsuario | null;
  erros?: HubErroImportacao[];
};

export type HubImportacaoUploadResponse = {
  importacao: HubImportacaoDados;
  formato: HubImportFormat;
  nomeArquivo: string;
  tamanhoBytes: number;
  hashArquivo: string;
  status: HubImportStatus;
  colunasDetectadas: string[];
  colunasDuplicadas?: string[];
  sugestaoMapeamento?: Partial<Record<HubCanonicalField, string>>;
  primeirasLinhas: Record<string, unknown>[];
  totalLinhasEstimado: number;
  separador?: string | null;
  planilha?: string | null;
};

export type HubImportacaoMapeamentoResponse = {
  importacao: HubImportacaoDados;
  previa: Record<string, unknown>[];
  errosConfiguracao: string[];
  avisos: string[];
  linhasValidasEstimadas: number;
  linhasInvalidasEstimadas: number;
};

export type HubImportacaoValidacaoResponse = {
  importacao: HubImportacaoDados;
  resumo: {
    totalLinhas: number;
    linhasValidas: number;
    linhasComErro: number;
    errosRegistrados: number;
    avisos: string[];
  };
};

export type HubImportacaoProcessamentoResponse = {
  importacao: HubImportacaoDados;
  resultado: {
    criados: number;
    atualizados: number;
    ignorados: number;
    estoques: number;
    estoquesCriados: number;
    estoquesAtualizados: number;
    precos: number;
    precosCriados: number;
    precosAtualizados: number;
  };
};

export type HubProdutoComercial = {
  idCanonico: number;
  externalId?: string | null;
  nome: string;
  descricao?: string | null;
  sku?: string | null;
  codigoBarras?: string | null;
  categoria?: string | null;
  marca?: string | null;
  unidade?: string | null;
  ativo: boolean;
  disponibilidade: "EM_ESTOQUE" | "SEM_ESTOQUE" | "INDISPONIVEL" | "DESCONHECIDO";
  estoques: Array<{
    localExternalId?: string | null;
    localNome?: string | null;
    quantidade: string;
    reservado: string;
    disponivel: string;
    status: string;
    sincronizadoEm?: string | null;
  }>;
  quantidadeTotal: string;
  quantidadeReservadaTotal: string;
  quantidadeDisponivelTotal: string;
  precoPadrao?: { tabela?: string | null; precoCentavos: number; precoPromocionalCentavos?: number | null; emPromocao: boolean; inicioPromocao?: string | null; fimPromocao?: string | null } | null;
  precoAtualCentavos?: number | null;
  precoOriginalCentavos?: number | null;
  precoPromocionalCentavos?: number | null;
  emPromocao: boolean;
  tabelaPreco?: string | null;
  inicioPromocao?: string | null;
  fimPromocao?: string | null;
  locais: string[];
  origem: { integracaoId?: number | null; integracaoNome?: string | null; tipoIntegracao?: string | null };
  ultimaSincronizacao?: string | null;
  dadosDesatualizados: boolean;
  avisos: string[];
};

export type HubQualidadeDados = {
  totalProdutos: number;
  produtosAtivos: number;
  produtosInativos: number;
  produtosSemSku: number;
  produtosSemCodigoBarras: number;
  produtosSemEstoque: number;
  produtosSemPreco: number;
  produtosComDadosDesatualizados: number;
  duplicidadesDetectadas: {
    sku: Array<{ campo: string; valor: string; total: number }>;
    codigoBarras: Array<{ campo: string; valor: string; total: number }>;
  };
  integracoesOrigem: Array<{ id: number; nome: string; tipo: string; status: string; ultimaSincronizacaoEm?: string | null; ultimoSucessoEm?: string | null }>;
  ultimaImportacao?: Pick<HubImportacaoDados, "id" | "formato" | "status" | "nomeArquivo" | "totalLinhas" | "linhasValidas" | "linhasComErro" | "createdAt" | "finalizadaEm"> | null;
  ultimaSincronizacao?: { id: number; nome: string; tipo: string; ultimaSincronizacaoEm?: string | null; ultimoSucessoEm?: string | null } | null;
  staleAfterMinutes: number;
};

export type HubCatalogQueryParams = {
  q?: string;
  sku?: string;
  codigoBarras?: string;
  categoria?: string;
  marca?: string;
  local?: string;
  somenteDisponiveis?: boolean;
  pagina?: number;
  limite?: number;
};

export type HubImportListParams = { page?: number; limit?: number; status?: string; formato?: string; busca?: string };

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function setAuthUser(user?: ApiAuthUser) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }

  localStorage.removeItem(USER_KEY);
}

export function clearAuthSession() {
  clearAuthToken();
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(COMPANY_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(DEMO_KEY);
}

export function getAuthSession(): AuthSession | null {
  const token = getAuthToken();
  if (!token) return null;

  const usuario = readStorageJson<ApiAuthUser>(USER_KEY);
  const empresa = readStorageJson<ApiAuthCompany>(COMPANY_KEY);
  const papel = localStorage.getItem(ROLE_KEY) as ApiUserRole | null;
  const expiresAt = localStorage.getItem(EXPIRES_KEY) || undefined;
  const storedDemo = localStorage.getItem(DEMO_KEY) === "true";
  const isDemo = storedDemo || token === DEMO_TOKEN;

  if (!usuario?.nome) {
    return {
      token,
      usuario: isDemo ? demoUser() : localUser(),
      empresa: isDemo ? demoCompany() : empresa ?? undefined,
      papel: isDemo ? "VENDEDOR" : papel ?? undefined,
      expiresAt,
      isDemo,
    };
  }

  return {
    token,
    usuario,
    empresa: empresa ?? undefined,
    papel: papel ?? usuario.papel,
    expiresAt,
    isDemo,
  };
}

export function isDemoSession() {
  return getAuthSession()?.isDemo ?? false;
}

export function getSessionRole(session: AuthSession | null): ApiUserRole | null {
  if (!session || session.isDemo) return null;
  const role = session.papel ?? session.usuario?.papel;
  return role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR" ? role : null;
}

export function canAccessIntegrations(session: AuthSession | null) {
  return getSessionRole(session) === "ADMIN";
}

function setAuthSessionFromResponse(data: ApiAuthResponse, options: { forceDemo?: boolean } = {}) {
  const token = data.access_token;
  const apiUser = data.usuario ?? data.user;
  const papel = data.papel ?? apiUser?.papel ?? apiUser?.role;
  const isDemo = Boolean(options.forceDemo || data.isDemo);
  const usuario = isDemo
    ? demoUser(apiUser)
    : normalizeAuthUser(apiUser, papel);
  const empresa = isDemo ? demoCompany(data.empresa) : normalizeAuthCompany(data.empresa);

  setAuthToken(token);
  setAuthUser(usuario);

  if (empresa) {
    localStorage.setItem(COMPANY_KEY, JSON.stringify(empresa));
  } else {
    localStorage.removeItem(COMPANY_KEY);
  }

  if (papel) {
    localStorage.setItem(ROLE_KEY, papel);
  } else if (usuario.papel) {
    localStorage.setItem(ROLE_KEY, usuario.papel);
  } else {
    localStorage.removeItem(ROLE_KEY);
  }

  if (data.expires_at) {
    localStorage.setItem(EXPIRES_KEY, data.expires_at);
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }

  localStorage.setItem(DEMO_KEY, isDemo ? "true" : "false");
}

export async function fetchAuthMe() {
  const token = getAuthToken();
  if (!token || !hasRemoteApi()) {
    throw new Error("Sessao indisponivel.");
  }

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    clearAuthSession();
    throw new Error("Sessao expirada.");
  }

  const data = (await response.json()) as Pick<ApiAuthResponse, "usuario" | "user" | "empresa" | "papel" | "isDemo">;
  const sessionData: ApiAuthResponse = {
    access_token: token,
    usuario: data.usuario,
    user: data.user,
    empresa: data.empresa,
    papel: data.papel,
    isDemo: data.isDemo ?? isDemoSession(),
  };
  setAuthSessionFromResponse(sessionData, { forceDemo: sessionData.isDemo });
  return getAuthSession();
}

export async function loginWithBackend(email: string, senha: string) {
  if (!hasRemoteApi()) {
    throw new Error("Sincronização indisponível.");
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, senha }),
  });

  if (!response.ok) {
    throw new Error("Login inválido ou sincronização indisponível.");
  }

  const data = (await response.json()) as ApiAuthResponse;
  setAuthSessionFromResponse(data);
  return data;
}

export async function loginDemoWithBackend() {
  if (hasRemoteApi()) {
    try {
      const response = await fetch(`${API_URL}/auth/demo`, {
        method: "POST",
      });

      if (response.ok) {
        const data = (await response.json()) as ApiAuthResponse;
        setAuthSessionFromResponse(data, { forceDemo: true });
        return data;
      }
    } catch {
      return startGuidedAccess();
    }
  }

  return startGuidedAccess();
}

export async function fetchClientesFromBackend() {
  const token = getAuthToken();
  if (!token || !hasRemoteApi()) return null;

  const response = await fetch(`${API_URL}/clientes`, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar clientes sincronizados.");
  }

  const clientes = (await response.json()) as ApiCliente[];
  return clientes.map((cliente) => mapApiClienteToClient(cliente));
}

export async function fetchDashboardSummaryFromBackend() {
  const token = getAuthToken();
  if (!token || token === DEMO_TOKEN || !hasRemoteApi()) return null;

  const response = await fetch(`${API_URL}/dashboard`, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar o resumo sincronizado.");
  }

  return (await response.json()) as ApiDashboardSummary;
}

export async function fetchCategoriasProdutos(params: { busca?: string; ativo?: boolean | null; page?: number; limit?: number } = {}) {
  const response = await requestApiGet<ApiPaginatedResponse<ApiCategoriaProduto> | ApiCategoriaProduto[]>(
    `/categorias-produtos${toQueryString(params)}`,
  );
  return normalizePaginatedResponse(response, params);
}

export async function createCategoriaProduto(payload: CategoriaProdutoCreatePayload) {
  return requestApiPost<ApiCategoriaProduto>("/categorias-produtos", payload);
}

export async function updateCategoriaProduto(id: number, payload: CategoriaProdutoUpdatePayload) {
  return requestApiWrite<ApiCategoriaProduto>("PATCH", `/categorias-produtos/${id}`, payload);
}

export async function fetchProdutos(params: ProdutoQueryParams = {}) {
  const response = await requestApiGet<ApiPaginatedResponse<ApiProduto> | ApiProduto[]>(`/produtos${toQueryString(params)}`);
  return normalizePaginatedResponse(response, params);
}

export async function fetchProduto(id: number) {
  return requestApiGet<ApiProduto>(`/produtos/${id}`);
}

export async function createProduto(payload: ProdutoCreatePayload) {
  return requestApiPost<ApiProduto>("/produtos", payload);
}

export async function updateProduto(id: number, payload: ProdutoUpdatePayload) {
  return requestApiWrite<ApiProduto>("PATCH", `/produtos/${id}`, payload);
}

export async function createEntradaEstoque(payload: EstoqueEntradaPayload) {
  return requestApiPost<EstoqueMovimentacaoResponse>("/estoque/entradas", payload);
}

export async function createSaidaEstoque(payload: EstoqueSaidaPayload) {
  return requestApiPost<EstoqueMovimentacaoResponse>("/estoque/saidas", payload);
}

export async function createAjusteEstoque(payload: EstoqueAjustePayload) {
  return requestApiPost<EstoqueMovimentacaoResponse>("/estoque/ajustes", payload);
}

export async function fetchEstoqueMovimentacoes(params: MovimentacaoQueryParams = {}) {
  const response = await requestApiGet<ApiPaginatedResponse<ApiMovimentacaoEstoque> | ApiMovimentacaoEstoque[]>(
    `/estoque/movimentacoes${toQueryString(params)}`,
  );
  return normalizePaginatedResponse(response, params);
}

export async function fetchEstoqueResumo() {
  return requestApiGet<ApiResumoEstoque>("/estoque/resumo");
}


export async function fetchIntegracoes(params: { page?: number; limit?: number; status?: string; tipo?: string; busca?: string } = {}) {
  const response = await requestApiGetAuthenticated<ApiPaginatedResponse<HubIntegracao> | HubIntegracao[]>("/integracoes" + toQueryString(params));
  return normalizePaginatedResponse(response, { page: params.page, limit: params.limit });
}

export async function createIntegracao(payload: { nome: string; tipo: HubIntegrationType; status?: HubIntegrationStatus; ativo?: boolean; configuracao?: Record<string, unknown> }) {
  return requestApiPost<HubIntegracao>("/integracoes", payload);
}

export async function iniciarConexaoBling() {
  return requestApiPost<HubBlingStartResponse>("/integracoes/bling/iniciar", {});
}

export async function testarConexaoBling(id: number) {
  return requestApiPost<HubBlingTestResponse>("/integracoes/" + id + "/bling/testar", {});
}

export async function desconectarBling(id: number) {
  return requestApiPost<HubIntegracao>("/integracoes/" + id + "/bling/desconectar", {});
}

export async function sincronizarIntegracao(id: number, entidades: Array<"PRODUTOS" | "ESTOQUE" | "PRECOS" | "CONDICOES_PAGAMENTO">) {
  return requestApiPost<HubBlingSyncResponse>("/integracoes/" + id + "/sincronizar", { entidades });
}

export async function fetchImportacoes(params: HubImportListParams = {}) {
  const response = await requestApiGetAuthenticated<ApiPaginatedResponse<HubImportacaoDados> | HubImportacaoDados[]>("/importacoes" + toQueryString(params));
  return normalizePaginatedResponse(response, { page: params.page, limit: params.limit });
}

export async function fetchImportacao(id: number) {
  return requestApiGetAuthenticated<HubImportacaoDados>("/importacoes/" + id);
}

export async function uploadImportacao(file: File, options: { tipoEntidade?: "PRODUTOS"; confirmarReprocessamento?: boolean } = {}) {
  const formData = new FormData();
  formData.append("arquivo", file);
  formData.append("tipoEntidade", options.tipoEntidade ?? "PRODUTOS");
  if (options.confirmarReprocessamento) formData.append("confirmarReprocessamento", "true");
  return requestApiMultipart<HubImportacaoUploadResponse>("/importacoes/upload", formData);
}

export async function mapearImportacao(id: number, payload: HubImportMappingConfig) {
  return requestApiPost<HubImportacaoMapeamentoResponse>("/importacoes/" + id + "/mapear", {
    mapeamento: payload.mapping,
    opcoes: payload.options,
    chavePrincipal: payload.chavePrincipal,
    permitirParcial: payload.permitirParcial,
  });
}

export async function validarImportacao(id: number) {
  return requestApiPost<HubImportacaoValidacaoResponse>("/importacoes/" + id + "/validar", {});
}

export async function processarImportacao(id: number, payload: { importarLinhasValidas: boolean; estrategiaAtualizacao: HubUpdateStrategy }) {
  return requestApiPost<HubImportacaoProcessamentoResponse>("/importacoes/" + id + "/processar", payload);
}

export async function cancelarImportacao(id: number) {
  return requestApiPost<HubImportacaoDados>("/importacoes/" + id + "/cancelar", {});
}

export async function fetchErrosImportacao(id: number, params: { page?: number; limit?: number; campo?: string; codigo?: string; linha?: number } = {}) {
  const response = await requestApiGetAuthenticated<ApiPaginatedResponse<HubErroImportacao> | HubErroImportacao[]>("/importacoes/" + id + "/erros" + toQueryString(params));
  return normalizePaginatedResponse(response, { page: params.page, limit: params.limit });
}

export async function consultarCatalogoComercial(params: HubCatalogQueryParams = {}) {
  const response = await requestApiGetAuthenticated<ApiPaginatedResponse<HubProdutoComercial> | HubProdutoComercial[]>("/hub/consulta-comercial" + toQueryString(params));
  return normalizePaginatedResponse(response, { page: params.pagina, limit: params.limite });
}

export async function fetchQualidadeDados() {
  return requestApiGetAuthenticated<HubQualidadeDados>("/hub/qualidade-dados");
}

export async function fetchAcompanhamentos(params: AcompanhamentoQueryParams = {}) {
  const response = await requestApiGet<ApiPaginatedResponse<ApiAcompanhamento> | ApiAcompanhamento[]>(
    `/acompanhamentos${toQueryString(params)}`,
  );
  return normalizePaginatedResponse(response, params);
}

export async function fetchAcompanhamentoResumo(params: { dataInicial?: string; dataFinal?: string } = {}) {
  return requestApiGet<ApiAcompanhamentoResumo>(`/acompanhamentos/resumo${toQueryString(params)}`);
}

export async function createAcompanhamento(payload: AcompanhamentoPayload) {
  return requestApiPost<ApiAcompanhamento>("/acompanhamentos", payload);
}

export async function updateAcompanhamento(id: number, payload: Partial<AcompanhamentoPayload>) {
  return requestApiWrite<ApiAcompanhamento>("PATCH", `/acompanhamentos/${id}`, payload);
}

export async function concluirAcompanhamento(id: number) {
  return requestApiPost<ApiAcompanhamento>(`/acompanhamentos/${id}/concluir`, {});
}

export async function reabrirAcompanhamento(id: number) {
  return requestApiPost<ApiAcompanhamento>(`/acompanhamentos/${id}/reabrir`, {});
}

export async function cancelarAcompanhamento(id: number) {
  return requestApiPost<ApiAcompanhamento>(`/acompanhamentos/${id}/cancelar`, {});
}

export async function createClienteOnBackend(client: Client) {
  if (!hasRemoteApi()) return null;

  const response = await requestCliente("POST", "/clientes", clientToPayload(client));
  return mapApiClienteToClient(response);
}

export async function updateClienteOnBackend(client: Client) {
  if (!client.backendId || !hasRemoteApi()) return null;

  const method = isDemoMode() ? "PUT" : "PATCH";
  const response = await requestCliente(method, `/clientes/${client.backendId}`, clientToPayload(client));
  return mapApiClienteToClient(response, client);
}

export async function deleteClienteOnBackend(client: Client) {
  if (!client.backendId || !hasRemoteApi()) return;
  await requestCliente("DELETE", `/clientes/${client.backendId}`);
}

export async function createNotaOnBackend(client: Client, text: string) {
  if (!client.backendId || !hasRemoteApi()) return null;

  const token = getAuthToken();
  if (!token) {
    throw new Error("Sem token de autenticação.");
  }

  const response = await fetch(`${API_URL}/clientes/${client.backendId}/notas`, {
    method: "POST",
    headers: {
      ...buildHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      texto: text,
      tipo: "nota",
    }),
  });

  if (!response.ok) {
    throw new Error("Não foi possível sincronizar a nota.");
  }

  const nota = (await response.json()) as ApiNota;
  return mapApiNotaToNote(nota);
}

async function requestCliente(method: "POST" | "PATCH" | "PUT", path: string, payload: ClientePayload): Promise<ApiCliente>;
async function requestCliente(method: "DELETE", path: string): Promise<null>;
async function requestCliente(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, payload?: ClientePayload) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sem token de autenticação.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...buildHeaders(token),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error("A sincronização não foi concluída.");
  }

  if (method === "DELETE") return null;
  return (await response.json()) as ApiCliente;
}

async function requestApiGet<T>(path: string): Promise<T> {
  if (!hasRemoteApi()) {
    throw new Error("Nao foi possivel carregar os dados agora.");
  }

  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar os dados agora.");
  }

  return (await response.json()) as T;
}


async function requestApiGetAuthenticated<T>(path: string): Promise<T> {
  if (!hasRemoteApi()) {
    throw new Error("Nao foi possivel carregar os dados agora.");
  }

  const token = getAuthToken();
  if (!token) {
    throw new Error("Sessao expirada. Entre novamente para continuar.");
  }

  const response = await fetch(API_URL + path, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    const message = await readApiError(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function requestApiMultipart<T>(path: string, body: FormData): Promise<T> {
  if (!hasRemoteApi()) {
    throw new Error("Nao foi possivel enviar o arquivo agora.");
  }

  const token = getAuthToken();
  if (!token) {
    throw new Error("Sessao expirada. Entre novamente para continuar.");
  }

  const response = await fetch(API_URL + path, {
    method: "POST",
    headers: buildHeaders(token),
    body,
  });

  if (!response.ok) {
    const message = await readApiError(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function requestApiPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  return requestApiWrite<T>("POST", path, payload);
}

async function requestApiWrite<T>(method: "POST" | "PATCH", path: string, payload: Record<string, unknown>): Promise<T> {
  if (!hasRemoteApi()) {
    throw new Error("Nao foi possivel concluir a acao agora.");
  }

  const token = getAuthToken();
  if (!token) {
    throw new Error("Acesse a demonstracao novamente para continuar.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...buildHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readApiError(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { erro?: string; error?: string; message?: string };
    return data.erro || data.error || data.message || "Nao foi possivel concluir a acao agora.";
  } catch {
    return "Nao foi possivel concluir a acao agora.";
  }
}

function toQueryString(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const text = query.toString();
  return text ? `?${text}` : "";
}

function normalizePaginatedResponse<T>(
  response: ApiPaginatedResponse<T> | T[],
  params: { page?: number; limit?: number } = {},
): ApiPaginatedResponse<T> {
  if (Array.isArray(response)) {
    const page = params.page ?? 1;
    const limit = params.limit ?? response.length;

    return {
      data: response,
      pagination: {
        page,
        limit,
        total: response.length,
        totalPages: response.length > 0 ? Math.max(1, Math.ceil(response.length / Math.max(1, limit))) : 0,
      },
    };
  }

  return {
    data: Array.isArray(response.data) ? response.data : [],
    pagination: {
      page: response.pagination?.page ?? params.page ?? 1,
      limit: response.pagination?.limit ?? params.limit ?? response.data?.length ?? 0,
      total: response.pagination?.total ?? response.data?.length ?? 0,
      totalPages: response.pagination?.totalPages ?? 0,
    },
  };
}

function buildHeaders(token: string): Record<string, string> {
  if (token === DEMO_TOKEN) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}

function hasRemoteApi() {
  return API_URL.length > 0;
}

function startGuidedAccess() {
  setAuthToken(DEMO_TOKEN);
  setAuthUser(demoUser());
  localStorage.setItem(COMPANY_KEY, JSON.stringify(demoCompany()));
  localStorage.setItem(ROLE_KEY, "VENDEDOR");
  localStorage.setItem(DEMO_KEY, "true");
  localStorage.removeItem(EXPIRES_KEY);

  return {
    access_token: DEMO_TOKEN,
    user: demoUser(),
    usuario: demoUser(),
    empresa: demoCompany(),
    papel: "VENDEDOR" as ApiUserRole,
    isDemo: true,
  };
}

function isDemoMode() {
  return isDemoSession();
}

function normalizeAuthUser(user?: ApiAuthResponse["usuario"], papel?: ApiUserRole): ApiAuthUser {
  return {
    id: user?.id,
    empresaId: user?.empresaId,
    nome: user?.nome?.trim() || "Usuario",
    email: user?.email,
    papel: papel ?? user?.papel ?? user?.role,
    ativo: user?.ativo,
  };
}

function normalizeAuthCompany(company?: ApiAuthCompany): ApiAuthCompany | undefined {
  if (!company?.nome) return undefined;
  return {
    id: company.id,
    nome: company.nome,
    slug: company.slug,
    ativo: company.ativo,
  };
}

function demoUser(user?: ApiAuthResponse["usuario"]): ApiAuthUser {
  return {
    id: user?.id,
    empresaId: user?.empresaId,
    nome: "Usuario Demo",
    email: user?.email ?? "demo@crm.com",
    papel: "VENDEDOR",
    ativo: true,
  };
}

function demoCompany(company?: ApiAuthCompany): ApiAuthCompany {
  return {
    id: company?.id,
    nome: "CRM Agro Demo",
    slug: company?.slug ?? "crm-agro-demo",
    ativo: true,
  };
}

function localUser(): ApiAuthUser {
  return {
    nome: "Usuario Local",
    papel: "VENDEDOR",
    ativo: true,
  };
}

function readStorageJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function mapApiClienteToClient(cliente: ApiCliente, fallback?: Client): Client {
  const backendId = String(cliente.id);
  const id = fallback?.id ?? backendIdToNumericId(backendId);
  const status = fallback?.status ?? mapClienteStatus(cliente.status);
  const value = fallback?.value ?? cliente.valor ?? estimateValue(cliente);
  const company =
    fallback?.company || cliente.empresa || cliente.fazenda || cliente.cidade || extractCompany(cliente) || "Cliente agro";

  return {
    id,
    backendId,
    synced: true,
    name: cliente.nome,
    company,
    phone: cliente.telefone ?? "",
    email: cliente.email ?? "",
    value,
    status,
    source: fallback?.source ?? cliente.origem ?? "Sincronizado",
    favorite: fallback?.favorite ?? Boolean(cliente.favorito),
    hot: fallback?.hot ?? (Boolean(cliente.quente) || value >= 12000 || status === "Proposta"),
    lastContactDays: fallback?.lastContactDays ?? cliente.ultimoContato ?? 0,
    nextFollowUp: fallback?.nextFollowUp ?? cliente.proximoFollowUp ?? "Hoje",
    tags: fallback?.tags?.length ? fallback.tags : parseTags(cliente.tags),
    notes: fallback?.notes ?? buildNotes(cliente),
  };
}

function clientToPayload(client: Client): ClientePayload {
  return {
    nome: client.name.trim(),
    email: client.email.trim() || undefined,
    telefone: client.phone.trim() || undefined,
    empresa: client.company.trim() || undefined,
    interesse: client.company.trim() || undefined,
    status: client.status,
    valor: client.value,
    origem: client.source,
    favorito: client.favorite,
    quente: client.hot,
    ultimoContato: client.lastContactDays,
    proximoFollowUp: client.nextFollowUp,
    tags: client.tags,
  };
}

function backendIdToNumericId(id: string) {
  const asNumber = Number(id);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash || Date.now();
}

function mapClienteStatus(status?: string | null): Status {
  if (status === "INATIVO" || status === "Perdido") return "Perdido";
  if (status === "Fechado") return "Fechado";
  if (status === "Proposta") return "Proposta";
  if (status === "Contato") return "Contato";
  return "Novo";
}

function estimateValue(cliente: ApiCliente) {
  const basis = `${cliente.nome}${cliente.email ?? ""}${cliente.telefone ?? ""}${cliente.interesse ?? ""}`.length;
  return Math.max(3200, basis * 430);
}

function extractCompany(cliente: ApiCliente) {
  if (!cliente.interesse) return "";
  return cliente.interesse.split(" - ")[0]?.trim() || "";
}

function parseTags(tags?: string[] | string | null) {
  if (Array.isArray(tags)) return tags.map(String);
  if (!tags) return ["Sincronizado"];

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : ["Sincronizado"];
  } catch {
    return ["Sincronizado"];
  }
}

function buildNotes(cliente: ApiCliente): Note[] {
  if (cliente.notas?.length) {
    return cliente.notas.map(mapApiNotaToNote);
  }

  const text = cliente.observacoes ?? cliente.interesse ?? "";
  if (!text) return [];

  return [
    {
      id: 1,
      text,
      date: "Registro sincronizado",
      createdAt: cliente.createdAt ? new Date(cliente.createdAt).getTime() : undefined,
    },
  ];
}

function mapApiNotaToNote(nota: ApiNota): Note {
  const createdAt = new Date(nota.createdAt);

  return {
    id: nota.id,
    text: nota.texto,
    date: createdAt.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    createdAt: createdAt.getTime(),
  };
}
