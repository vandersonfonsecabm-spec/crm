import type { Client, Status } from "../types/dashboard";

export const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

export const emptyClient: Client = {
  id: 0,
  name: "",
  company: "",
  phone: "",
  email: "",
  value: 0,
  status: "Novo",
  source: "Manual",
  favorite: false,
  hot: false,
  lastContactDays: 0,
  nextFollowUp: "Hoje",
  tags: [],
  notes: [],
};
