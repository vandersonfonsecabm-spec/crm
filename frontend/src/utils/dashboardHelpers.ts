import type { Client, Status } from "../types/dashboard";

export function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}



export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}



export function leadOwner(client: Client) {
  if (client.source.toLowerCase().includes("instagram")) return "Ana";
  if (client.source.toLowerCase().includes("whatsapp")) return "Marco";
  if (client.source.toLowerCase().includes("site")) return "Bia";
  return "Time";
}



export function idleLabel(client: Client) {
  if (client.lastContactDays === 0) return "Hoje";
  if (client.lastContactDays === 1) return "1 dia";
  return `${client.lastContactDays} dias`;
}



export function forecastLabel(client: Client) {
  const score = getLeadScore(client);

  if (score >= 80) return "Alta chance";
  if (score >= 60) return "Em negociação";
  return "Precisa ação";
}



export function slaLabel(client: Client) {
  if (client.lastContactDays >= 7) return "Crítico";
  if (client.lastContactDays >= 3) return "Atenção";
  return "Saudável";
}



export function priorityLabel(client: Client) {
  if (client.hot && getLeadScore(client) >= 80) return "Prioridade máxima";
  if (getLeadScore(client) >= 60) return "Operacional";
  return "Baixa urgência";
}



export function stageGuidance(status: Status) {
  if (status === "Novo") return "Qualificar oportunidade";
  if (status === "Contato") return "Avançar conversa";
  if (status === "Proposta") return "Fechar oportunidade";
  if (status === "Fechado") return "Pós-venda / expansão";
  return "Recuperar ou arquivar";
}



export function customerFitLabel(client: Client) {
  const score = getLeadScore(client);

  if (client.status === "Fechado") return "Cliente validado";
  if (score >= 85 && client.value >= 12000) return "Perfil premium";
  if (score >= 65) return "Bom encaixe";
  if (getRisk(client) === "Alto") return "Recuperação";
  return "Em qualificação";
}



export function nextActionLabel(client: Client) {
  if (client.status === "Fechado") return "Manter relacionamento e buscar expansão.";
  if (client.status === "Perdido") return "Agendar reativação futura com proposta objetiva.";
  if (getRisk(client) === "Alto") return "Retomar contato com urgência e registrar objeção.";
  if (getLeadScore(client) >= 80) return "Priorizar contato hoje e conduzir para fechamento.";
  if (client.status === "Novo") return "Fazer primeiro contato rápido e qualificar necessidade.";
  return "Manter cadência de acompanhamento e avançar para próxima etapa.";
}



export function activitySignalLabel(client: Client) {
  if (client.lastContactDays === 0) return "Contato hoje";
  if (client.lastContactDays <= 2) return "Ativo recente";
  if (client.lastContactDays <= 6) return "Monitorar";
  return "Reativar";
}



export function actionIntensity(client: Client) {
  const score = getLeadScore(client);

  if (client.status === "Perdido") return 35;
  if (client.hot && score >= 80) return 100;
  if (score >= 80) return 88;
  if (score >= 60) return 68;
  return 46;
}



export function smartCardBorderClass(client: Client) {
  if (client.hot && getLeadScore(client) >= 80) {
    return "border-rose-300/30 bg-gradient-to-b from-rose-500/[0.10] via-black/20 to-black/20 shadow-[0_0_28px_rgba(251,113,133,0.10)]";
  }

  if (getRisk(client) === "Alto") {
    return "border-amber-300/25 bg-gradient-to-b from-amber-500/[0.08] via-black/20 to-black/20";
  }

  return "border-white/10 bg-black/20";
}




export function enterpriseHealthLabel(client: Client) {
  if (client.status === "Fechado") return "Carteira saudável";
  if (client.hot && getLeadScore(client) >= 80) return "Alta intenção";
  if (getRisk(client) === "Alto") return "Requer atenção";
  if (client.lastContactDays <= 2) return "Cadência ativa";
  return "Nutrição comercial";
}



export function enterpriseHealthClass(client: Client) {
  if (client.status === "Fechado") return "border-emerald-400/15 bg-emerald-500/[0.055] text-emerald-100";
  if (client.hot && getLeadScore(client) >= 80) return "border-rose-400/15 bg-rose-500/[0.055] text-rose-100";
  if (getRisk(client) === "Alto") return "border-amber-400/15 bg-amber-500/[0.055] text-amber-100";
  return "border-sky-400/15 bg-sky-500/[0.045] text-sky-100";
}



export function getPriority(client: Client) {
  if (client.hot || client.value >= 12000 || client.lastContactDays >= 7) return "Alta";
  if (client.value >= 7000 || client.lastContactDays >= 4) return "Média";
  return "Baixa";
}



export function getRisk(client: Client) {
  if (client.status === "Perdido" || client.lastContactDays >= 10) return "Alto";
  if (client.lastContactDays >= 5 || client.status === "Proposta") return "Médio";
  return "Baixo";
}



export function getLeadScore(client: Client) {
  let score = 45;
  if (client.hot) score += 20;
  if (client.favorite) score += 10;
  if (client.value >= 12000) score += 15;
  if (client.status === "Proposta") score += 10;
  if (client.status === "Fechado") score += 20;
  if (client.status === "Perdido") score -= 25;
  if (client.lastContactDays >= 7) score -= 10;
  return Math.max(0, Math.min(100, score));
}



export function statusClass(status: Status) {
  if (status === "Novo") return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--info)]";
  if (status === "Contato") return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]";
  if (status === "Proposta") return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--warning)]";
  if (status === "Fechado") return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--success)]";
  return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--danger)]";
}



export function kanbanHeaderClass(status: Status) {
  void status;
  return "border-[var(--border-default)] bg-[var(--bg-surface)]";
}



export function tagClass(tag: string) {
  const normalized = tag.toLowerCase();
  if (normalized.includes("quente") || normalized.includes("urgente")) return "border-rose-400/20 bg-rose-500/10 text-rose-200";
  if (normalized.includes("alto")) return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  if (normalized.includes("ganho")) return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (normalized.includes("risco")) return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-sky-400/20 bg-sky-500/10 text-sky-200";
}



