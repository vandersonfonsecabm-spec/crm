export type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
export type SortBy = "score" | "value" | "name" | "status";
export type ActivePage = "dashboard" | "comercial" | "inbox" | "leads" | "clientes" | "kanban" | "agenda" | "estoque" | "integracoes" | "automacoes" | "platformTenants" | "usuarios" | "perfil";
export type SmartFilterType = "risk" | "proposal" | "silent";
export type KanbanOwner = "Todos" | "Sem responsável";

export type Note = {
  id: number;
  text: string;
  date: string;
  createdAt?: number;
};

export type Client = {
  id: number;
  backendId?: string;
  synced?: boolean;
  name: string;
  company: string;
  city: string;
  state: string;
  cpfCnpj: string;
  phone: string;
  email: string;
  value: number;
  valueKnown?: boolean;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
  revision?: number;
  archived?: boolean;
  archivedAt?: string | null;
};

export type Analytics = {
  totalValue: number;
  wonValue: number;
  forecastValue: number;
  hotCount: number;
  averageScore: number;
  todayFollowUps: number;
};

export type RecentActivity = {
  id: string;
  client: string;
  text: string;
  date: string;
};
