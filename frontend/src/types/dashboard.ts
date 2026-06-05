export type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
export type SortBy = "score" | "value" | "name" | "status";
export type ActivePage = "dashboard" | "clientes" | "kanban" | "automacoes";

export type Note = {
  id: number;
  text: string;
  date: string;
};

export type Client = {
  id: number;
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
