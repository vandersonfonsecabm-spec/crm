import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Phone,
  Plus,
  Star,
  StickyNote,
  Target,
  Users,
  Zap,
} from "lucide-react";
import DashboardMetricStrip from "./DashboardMetricStrip";
import type { ApiDashboardSummary } from "../../services/crmApi";
import type { ActivePage, Client } from "../../types/dashboard";
import { classifyNextFollowUp } from "../../utils/followUpProjection";

type DashboardMetricsSectionProps = {
  activePage: ActivePage;
  clients: Client[];
  summary: ApiDashboardSummary | null;
};

export default function DashboardMetricsSection({
  activePage,
  clients,
  summary,
}: DashboardMetricsSectionProps) {
  const statusTotal = (status: string) => summary?.status.find((item) => item.status === status)?.total ?? 0;

  if (activePage === "comercial") {
    return (
      <DashboardMetricStrip metrics={[
        { label: "Propostas abertas", value: String(statusTotal("Proposta")), context: "Carteira completa", icon: <Target size={15} />, tone: "warning" },
        { label: "Oportunidades quentes", value: String(summary?.analytics.hotCount ?? 0), context: "Carteira completa", icon: <Zap size={15} />, tone: "success" },
        { label: "Clientes em risco", value: String(summary?.analytics.highRiskCount ?? 0), context: "Carteira completa", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Sem contato", value: String(summary?.analytics.silentCount ?? 0), context: "Carteira completa", icon: <Bell size={15} />, tone: "info" },
      ]} />
    );
  }

  if (activePage === "clientes") {
    return (
      <DashboardMetricStrip metrics={[
        { label: "Carteira ativa", value: String(summary?.indicadores.clientes ?? 0), context: "Base completa", icon: <Users size={15} />, tone: "info" },
        { label: "Favoritos na página", value: String(clients.filter((client) => client.favorite).length), context: "Página atual", icon: <Star size={15} />, tone: "warning" },
        { label: "Em risco", value: String(summary?.analytics.highRiskCount ?? 0), context: "Carteira completa", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Atividades recentes", value: String(summary?.atividadesRecentes.length ?? 0), context: "Últimos registros", icon: <StickyNote size={15} /> },
      ]} />
    );
  }

  if (activePage === "kanban") {
    const won = statusTotal("Fechado");
    const lost = statusTotal("Perdido");
    return (
      <DashboardMetricStrip metrics={[
        { label: "Novas oportunidades", value: String(statusTotal("Novo")), context: "Carteira completa", icon: <Plus size={15} />, tone: "info" },
        { label: "Contatos", value: String(statusTotal("Contato")), context: "Carteira completa", icon: <Phone size={15} /> },
        { label: "Propostas", value: String(statusTotal("Proposta")), context: "Carteira completa", icon: <Target size={15} />, tone: "warning" },
        { label: "Resultado", value: `${won} ganhos`, context: `${lost} perdidos`, icon: <CheckCircle2 size={15} />, tone: won > 0 ? "success" : lost > 0 ? "danger" : "default" },
      ]} />
    );
  }

  if (activePage === "agenda") {
    return (
      <DashboardMetricStrip metrics={[
        { label: "Acompanhamentos hoje", value: String(clients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TODAY").length), context: "Agenda imediata", icon: <Bell size={15} />, tone: "info" },
        { label: "Sem contato", value: String(clients.filter((client) => client.lastContactDays >= 7).length), context: "Retomar relação", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Propostas", value: String(clients.filter((client) => client.status === "Proposta").length), context: "Janelas abertas", icon: <Target size={15} />, tone: "warning" },
        { label: "Notas recentes", value: String(clients.reduce((sum, client) => sum + client.notes.length, 0)), context: "Histórico comercial", icon: <StickyNote size={15} /> },
      ]} />
    );
  }

  return null;
}
