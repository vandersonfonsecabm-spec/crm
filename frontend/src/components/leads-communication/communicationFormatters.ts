import type { ConversationStatus, LeadStatus } from "../../services/crmApi";
import { getChannelPresentation } from "./communicationChannels";

export const leadStatusLabels: Record<LeadStatus, string> = {
  NOVO: "Novo",
  EM_ATENDIMENTO: "Em atendimento",
  QUALIFICADO: "Qualificado",
  DESQUALIFICADO: "Desqualificado",
  CONVERTIDO: "Convertido",
};

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  ABERTA: "Aberta",
  NOVA: "Nova",
  AGUARDANDO_ATENDIMENTO: "Aguardando atendimento",
  EM_ATENDIMENTO: "Em atendimento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  PENDENTE: "Pendente",
  ENCERRADA: "Encerrada",
};

export function formatCommunicationDate(value?: string | null, withTime = true) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

export function formatCommunicationTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatCommunicationDateTime(value?: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

export function formatCommunicationDayLabel(value?: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  if (dateKey === todayKey) return "Hoje";
  if (dateKey === yesterdayKey) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function channelLabel(type?: string | null, name?: string | null) {
  void name;
  return getChannelPresentation(type).label;
}

export function initials(name?: string | null) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : words[0]?.[1] ?? ""}`.toUpperCase();
}
