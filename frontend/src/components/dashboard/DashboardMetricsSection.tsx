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
import type { ActivePage, Client } from "../../types/dashboard";

type DashboardMetricsSectionProps = {
  activePage: ActivePage;
  clients: Client[];
  kanbanClients: Client[];
  getRisk: (client: Client) => string;
};

export default function DashboardMetricsSection({
  activePage,
  clients,
  kanbanClients,
  getRisk,
}: DashboardMetricsSectionProps) {
  if (activePage === "comercial") {
    const proposals = clients.filter((client) => client.status === "Proposta").length;
    const hot = clients.filter((client) => client.hot).length;
    const risk = clients.filter((client) => getRisk(client) === "Alto").length;
    const silent = clients.filter((client) => client.lastContactDays >= 7).length;
    return (
      <DashboardMetricStrip metrics={[
        { label: "Propostas abertas", value: String(proposals), context: "Negociações em andamento", icon: <Target size={15} />, tone: "warning" },
        { label: "Oportunidades quentes", value: String(hot), context: "Prioridade comercial", icon: <Zap size={15} />, tone: "success" },
        { label: "Clientes em risco", value: String(risk), context: "Exigem recuperação", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Sem contato", value: String(silent), context: "Retomar relacionamento", icon: <Bell size={15} />, tone: "info" },
      ]} />
    );
  }

  if (activePage === "clientes") {
    return (
      <DashboardMetricStrip metrics={[
        { label: "Carteira ativa", value: String(clients.length), context: "Base ativa", icon: <Users size={15} />, tone: "info" },
        { label: "Favoritos", value: String(clients.filter((client) => client.favorite).length), context: "Contas estratégicas", icon: <Star size={15} />, tone: "warning" },
        { label: "Em risco", value: String(clients.filter((client) => getRisk(client) === "Alto").length), context: "Atenção imediata", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Notas internas", value: String(clients.reduce((sum, client) => sum + client.notes.length, 0)), context: "Registros salvos", icon: <StickyNote size={15} /> },
      ]} />
    );
  }

  if (activePage === "kanban") {
    const won = kanbanClients.filter((client) => client.status === "Fechado").length;
    const lost = kanbanClients.filter((client) => client.status === "Perdido").length;
    return (
      <DashboardMetricStrip metrics={[
        { label: "Novas oportunidades", value: String(kanbanClients.filter((client) => client.status === "Novo").length), context: "Entrada do funil", icon: <Plus size={15} />, tone: "info" },
        { label: "Contatos", value: String(kanbanClients.filter((client) => client.status === "Contato").length), context: "Em abordagem", icon: <Phone size={15} /> },
        { label: "Propostas", value: String(kanbanClients.filter((client) => client.status === "Proposta").length), context: "Negociação ativa", icon: <Target size={15} />, tone: "warning" },
        { label: "Resultado", value: `${won} ganhos`, context: `${lost} perdidos`, icon: <CheckCircle2 size={15} />, tone: won > 0 ? "success" : lost > 0 ? "danger" : "default" },
      ]} />
    );
  }

  if (activePage === "agenda") {
    return (
      <DashboardMetricStrip metrics={[
        { label: "Acompanhamentos hoje", value: String(clients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje").length), context: "Agenda imediata", icon: <Bell size={15} />, tone: "info" },
        { label: "Sem contato", value: String(clients.filter((client) => client.lastContactDays >= 7).length), context: "Retomar relação", icon: <AlertTriangle size={15} />, tone: "danger" },
        { label: "Propostas", value: String(clients.filter((client) => client.status === "Proposta").length), context: "Janelas abertas", icon: <Target size={15} />, tone: "warning" },
        { label: "Notas recentes", value: String(clients.reduce((sum, client) => sum + client.notes.length, 0)), context: "Histórico comercial", icon: <StickyNote size={15} /> },
      ]} />
    );
  }

  return null;
}
