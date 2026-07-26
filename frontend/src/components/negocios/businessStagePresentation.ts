import type { BusinessNextAction } from "../../services/crmApi";

export function formatBusinessDuration(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined || seconds < 0) return "Não disponível";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return "menos de 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes ? `${totalHours} h e ${minutes} min` : `${totalHours} h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days} ${days === 1 ? "dia" : "dias"} e ${hours} h` : `${days} ${days === 1 ? "dia" : "dias"}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function followUpTypeLabel(type: BusinessNextAction["tipo"]) {
  const labels: Record<BusinessNextAction["tipo"], string> = {
    TAREFA: "Tarefa",
    RETORNO: "Retorno",
    REUNIAO: "Reunião",
    LIGACAO: "Ligação",
    VISITA: "Visita",
    OUTRO: "Outro",
    WHATSAPP: "WhatsApp",
    EMAIL: "E-mail",
  };
  return labels[type];
}
