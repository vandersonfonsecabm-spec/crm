export type ApiAcompanhamentoStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
export type ApiAcompanhamentoPrioridade = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE" | "CRITICA";
export type ApiAcompanhamentoTipo = "TAREFA" | "RETORNO" | "REUNIAO" | "LIGACAO" | "VISITA" | "OUTRO" | "WHATSAPP" | "EMAIL";
export type ApiAcompanhamentoVisao = "MINHA" | "HOJE" | "PROXIMOS" | "ATRASADOS" | "CONCLUIDOS" | "EQUIPE" | "TODOS";

export type ApiAcompanhamento = {
  id: number;
  titulo: string;
  descricao?: string | null;
  dataHora: string;
  status: ApiAcompanhamentoStatus;
  prioridade: ApiAcompanhamentoPrioridade;
  tipo: ApiAcompanhamentoTipo;
  atrasado: boolean;
  revisao: number;
  clienteId?: number | null;
  cliente?: { id: number; nome: string } | null;
  leadId?: number | null;
  lead?: { id: number; interesse?: string | null } | null;
  negocioId?: number | null;
  negocio?: { id: number; titulo?: string | null } | null;
  conversaCanalId?: number | null;
  conversaCanal?: { id: number; status: string } | null;
  propostaComercialId?: number | null;
  propostaComercial?: { id: number; codigo: string; titulo: string } | null;
  responsavelId?: number | null;
  responsavel?: string | null;
  responsavelUsuario?: { id: number; nome: string } | null;
  permissoes?: { editar?: boolean; concluir?: boolean; reabrir?: boolean; cancelar?: boolean } | null;
};

export type ApiAcompanhamentoHistorico = {
  id: number;
  acao: "CRIAR" | "EDITAR" | "ALTERAR_RESPONSAVEL" | "REAGENDAR" | "INICIAR" | "CONCLUIR" | "CANCELAR" | "REABRIR";
  autor: { nome: string };
  createdAt: string;
  statusAnterior?: ApiAcompanhamentoStatus | null;
  statusNovo?: ApiAcompanhamentoStatus | null;
  responsavelAnterior?: { id: number; nome: string } | null;
  responsavelNovo?: { id: number; nome: string } | null;
  dataHoraAnterior?: string | null;
  dataHoraNova?: string | null;
  observacao?: string | null;
};

export type ApiAcompanhamentoResumo = {
  indicadores: { total: number; pendentes: number; paraHoje: number; atrasados: number; criticos: number; concluidosPeriodo: number };
  proximos: ApiAcompanhamento[];
};

export type ApiAgendaOptions = {
  usuarios: Array<{ id: number; nome: string }>;
  podeVerEquipe: boolean;
};

export type AcompanhamentoQueryParams = {
  page?: number;
  limit?: number;
  [key: string]: string | number | boolean | undefined;
};

export type AcompanhamentoPayload = {
  clienteId?: number;
  leadId?: number;
  negocioId?: number;
  conversaCanalId?: number;
  propostaComercialId?: number;
  titulo?: string;
  descricao?: string;
  dataHora?: string;
  prioridade?: ApiAcompanhamentoPrioridade;
  tipo?: ApiAcompanhamentoTipo;
  responsavelId?: number;
  observacao?: string;
  revisao?: number;
};

export class ApiHttpError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiHttpError";
  }
}

function query(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "omit" });
  if (!response.ok) throw new ApiHttpError("Fixture local indisponível.", response.status, "LOCAL_QA_READ_ONLY");
  return response.json() as Promise<T>;
}

async function write<T>(method: "POST" | "PATCH", path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new ApiHttpError("Fixture local é somente leitura.", response.status, "LOCAL_QA_READ_ONLY");
  return response.json() as Promise<T>;
}

export async function fetchAcompanhamentos(params: AcompanhamentoQueryParams = {}) {
  return read<{ data: ApiAcompanhamento[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/acompanhamentos${query(params)}`);
}

export function fetchAcompanhamentoResumo(params: { dataInicial?: string; dataFinal?: string } = {}) {
  return read<ApiAcompanhamentoResumo>(`/acompanhamentos/resumo${query(params)}`);
}

export async function fetchAgendaDashboardContext(params: { dataInicial?: string; dataFinal?: string } = {}) {
  const [summary, next] = await Promise.all([
    fetchAcompanhamentoResumo(params),
    fetchAcompanhamentos({ visao: "PROXIMOS", page: 1, limit: 1 }),
  ]);
  return { summary, next: next.data[0] ?? null };
}

export function fetchAgendaOptions() {
  return read<ApiAgendaOptions>("/acompanhamentos/opcoes");
}

export function fetchAcompanhamentoHistorico(id: number) {
  return read<{ data: ApiAcompanhamentoHistorico[] }>(`/acompanhamentos/${id}/historico`);
}

export function createAcompanhamento(payload: AcompanhamentoPayload) {
  return write<ApiAcompanhamento>("POST", "/acompanhamentos", payload);
}

export function updateAcompanhamento(id: number, payload: Partial<AcompanhamentoPayload>) {
  return write<ApiAcompanhamento>("PATCH", `/acompanhamentos/${id}`, payload);
}

export function iniciarAcompanhamento(id: number, revisao?: number) {
  return write<ApiAcompanhamento>("POST", `/acompanhamentos/${id}/iniciar`, revisao ? { revisao } : {});
}

export function concluirAcompanhamento(id: number, revisao?: number) {
  return write<ApiAcompanhamento>("POST", `/acompanhamentos/${id}/concluir`, revisao ? { revisao } : {});
}

export function reabrirAcompanhamento(id: number, revisao?: number) {
  return write<ApiAcompanhamento>("POST", `/acompanhamentos/${id}/reabrir`, revisao ? { revisao } : {});
}

export function cancelarAcompanhamento(id: number, revisao?: number) {
  return write<ApiAcompanhamento>("POST", `/acompanhamentos/${id}/cancelar`, revisao ? { revisao } : {});
}
