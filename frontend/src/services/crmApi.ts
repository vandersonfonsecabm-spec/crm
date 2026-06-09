import type { Client, Note, Status } from "../types/dashboard";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "crm-auth-token";
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

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function loginWithBackend(email: string, senha: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, senha }),
  });

  if (!response.ok) {
    throw new Error("Login inválido ou backend indisponível.");
  }

  const data = (await response.json()) as ApiAuthResponse;
  setAuthToken(data.access_token);
  return data;
}

export async function loginDemoWithBackend() {
  try {
    return await loginWithBackend("demo@crm.com", "123456");
  } catch {
    setAuthToken(DEMO_TOKEN);
    return {
      access_token: DEMO_TOKEN,
      user: {
        nome: "Demo local",
        email: "demo@crm.com",
      },
    };
  }
}

export async function fetchClientesFromBackend() {
  const token = getAuthToken();
  if (!token) return null;

  const response = await fetch(`${API_URL}/clientes`, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar clientes do backend.");
  }

  const clientes = (await response.json()) as ApiCliente[];
  return clientes.map((cliente) => mapApiClienteToClient(cliente));
}

export async function createClienteOnBackend(client: Client) {
  const response = await requestCliente("POST", "/clientes", clientToPayload(client));
  return mapApiClienteToClient(response);
}

export async function updateClienteOnBackend(client: Client) {
  if (!client.backendId) return null;

  const method = isDemoMode() ? "PUT" : "PATCH";
  const response = await requestCliente(method, `/clientes/${client.backendId}`, clientToPayload(client));
  return mapApiClienteToClient(response, client);
}

export async function deleteClienteOnBackend(client: Client) {
  if (!client.backendId) return;
  await requestCliente("DELETE", `/clientes/${client.backendId}`);
}

export async function createNotaOnBackend(client: Client, text: string) {
  if (!client.backendId) return null;

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
    throw new Error("Não foi possível criar nota no backend.");
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
    throw new Error("Operação no backend falhou.");
  }

  if (method === "DELETE") return null;
  return (await response.json()) as ApiCliente;
}

function buildHeaders(token: string): Record<string, string> {
  if (token === DEMO_TOKEN) return {};
  return {
    Authorization: `Bearer ${token}`,
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
    source: fallback?.source ?? cliente.origem ?? "Backend",
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
  if (!tags) return ["Backend"];

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : ["Backend"];
  } catch {
    return ["Backend"];
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
      date: "Registro do backend",
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
