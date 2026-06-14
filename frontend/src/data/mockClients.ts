import type { Client, Status } from "../types/dashboard";

export const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

export const initialClients: Client[] = [
  {
    id: 1,
    name: "Mariana Costa",
    company: "Alpha Digital",
    phone: "5535999990001",
    email: "mariana@alpha.com",
    value: 12800,
    status: "Proposta",
    source: "Instagram",
    favorite: true,
    hot: true,
    lastContactDays: 1,
    nextFollowUp: "Hoje",
    tags: ["Quente", "Alto valor"],
    notes: [{ id: 1, text: "Cliente pediu condição especial para fechar essa semana.", date: "15/05/2026 10:20" }],
  },
  {
    id: 2,
    name: "Rafael Lima",
    company: "Mercado Lima",
    phone: "5535988880002",
    email: "rafael@mercado.com",
    value: 6200,
    status: "Contato",
    source: "Indicação",
    favorite: false,
    hot: false,
    lastContactDays: 4,
    nextFollowUp: "Amanhã",
    tags: ["Acompanhamento"],
    notes: [{ id: 1, text: "Enviar acompanhamento com resumo da proposta inicial.", date: "14/05/2026 15:42" }],
  },
  {
    id: 3,
    name: "Bianca Rocha",
    company: "Rocha Studio",
    phone: "5535977770003",
    email: "bianca@rocha.com",
    value: 18900,
    status: "Novo",
    source: "Site",
    favorite: true,
    hot: true,
    lastContactDays: 0,
    nextFollowUp: "Hoje",
    tags: ["Novo", "Quente"],
    notes: [],
  },
  {
    id: 4,
    name: "Felipe Andrade",
    company: "Andrade Tech",
    phone: "5535966660004",
    email: "felipe@andrade.com",
    value: 4200,
    status: "Fechado",
    source: "Google",
    favorite: false,
    hot: false,
    lastContactDays: 6,
    nextFollowUp: "Concluído",
    tags: ["Ganho"],
    notes: [{ id: 1, text: "Contrato fechado e enviado para assinatura.", date: "10/05/2026 09:10" }],
  },
  {
    id: 5,
    name: "Camila Souza",
    company: "Souza Foods",
    phone: "5535955550005",
    email: "camila@souza.com",
    value: 9700,
    status: "Perdido",
    source: "Facebook",
    favorite: false,
    hot: false,
    lastContactDays: 13,
    nextFollowUp: "30 dias",
    tags: ["Risco"],
    notes: [{ id: 1, text: "Reabrir contato daqui 30 dias.", date: "01/05/2026 13:00" }],
  },
  {
    id: 6,
    name: "Daniel Martins",
    company: "Martins Auto",
    phone: "5535944440006",
    email: "daniel@martins.com",
    value: 15400,
    status: "Proposta",
    source: "WhatsApp",
    favorite: true,
    hot: true,
    lastContactDays: 2,
    nextFollowUp: "Hoje",
    tags: ["Quente", "Urgente"],
    notes: [{ id: 1, text: "Enviar comparativo de planos.", date: "13/05/2026 17:30" }],
  },
];

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

export function loadClients(): Client[] {
  const saved = localStorage.getItem("crm-premium-clients");
  if (!saved) return initialClients;

  try {
    const parsed = JSON.parse(saved);

    return parsed.map((client: Partial<Client>) => ({
      id: client.id ?? Date.now(),
      name: client.name ?? "",
      company: client.company ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      value: client.value ?? 0,
      status: client.status ?? "Novo",
      source: client.source ?? "Manual",
      favorite: client.favorite ?? false,
      hot: client.hot ?? false,
      lastContactDays: client.lastContactDays ?? 0,
      nextFollowUp: client.nextFollowUp ?? "Hoje",
      tags: Array.isArray(client.tags) ? client.tags : [],
      notes: Array.isArray(client.notes) ? client.notes : [],
    }));
  } catch {
    return initialClients;
  }
}
