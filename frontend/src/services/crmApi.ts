import type { Client, Note, Status } from "../types/dashboard";

const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_URL = configuredApiUrl || (import.meta.env.PROD ? "" : "http://localhost:3001");
const TOKEN_KEY = "crm-auth-token";
const USER_KEY = "crm-auth-user";
const DEMO_TOKEN = "demo-sqlite";

type ApiAuthResponse = {
  access_token: string;
  user?: {
    nome?: string;
    email?: string;
  };
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
  createdAt: string;
  updatedAt: string;
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

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function setAuthUser(user?: ApiAuthResponse["user"]) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }

  localStorage.removeItem(USER_KEY);
}

export function clearAuthSession() {
  clearAuthToken();
  localStorage.removeItem(USER_KEY);
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
  setAuthToken(data.access_token);
  setAuthUser(data.user);
  return data;
}

export async function loginDemoWithBackend() {
  if (hasRemoteApi()) {
    try {
      return await loginWithBackend("demo@crm.com", "123456");
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
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error || data.message || "Nao foi possivel concluir a acao agora.";
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
  setAuthUser({
    nome: "Acesso guiado",
    email: "marco@crmagro.com.br",
  });

  return {
    access_token: DEMO_TOKEN,
    user: {
      nome: "Acesso guiado",
      email: "marco@crmagro.com.br",
    },
  };
}

function isDemoMode() {
  return getAuthToken() === DEMO_TOKEN;
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
