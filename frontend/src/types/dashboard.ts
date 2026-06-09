export type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
export type SortBy = "score" | "value" | "name" | "status";
export type ActivePage = "dashboard" | "comercial" | "clientes" | "kanban" | "automacoes";
export type SmartFilterType = "risk" | "proposal" | "silent";
export type KanbanOwner = "Todos" | "Ana" | "Marco" | "Bia" | "Time";

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
  phone: string;
  email: string;
  value: number;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
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
