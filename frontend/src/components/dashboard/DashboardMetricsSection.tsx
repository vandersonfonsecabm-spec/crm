import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Phone,
  Plus,
  RotateCcw,
  Star,
  StickyNote,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import MetricCard from "./MetricCard";
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
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Carteira ativa" value={String(clients.length)} caption="Base ativa" icon={<Users size={15} />} tone="revenue" />
        <MetricCard title="Favoritos" value={String(clients.filter((client) => client.favorite).length)} caption="Contas estratégicas" icon={<Star size={15} />} tone="forecast" />
        <MetricCard title="Em risco" value={String(clients.filter((client) => getRisk(client) === "Alto").length)} caption="Atenção imediata" icon={<AlertTriangle size={15} />} tone="risk" />
        <MetricCard title="Notas internas" value={String(clients.reduce((sum, client) => sum + client.notes.length, 0))} caption="Registros salvos" icon={<StickyNote size={15} />} />
      </section>
    );
  }

  if (activePage === "kanban") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Novas oportunidades" value={String(kanbanClients.filter((client) => client.status === "Novo").length)} caption="Entrada do funil" icon={<Plus size={15} />} tone="revenue" />
        <MetricCard title="Contatos" value={String(kanbanClients.filter((client) => client.status === "Contato").length)} caption="Em abordagem" icon={<Phone size={15} />} />
        <MetricCard title="Propostas" value={String(kanbanClients.filter((client) => client.status === "Proposta").length)} caption="Negociação ativa" icon={<Target size={15} />} tone="forecast" />
        <MetricCard title="Fechados" value={String(kanbanClients.filter((client) => client.status === "Fechado").length)} caption="Receita ganha" icon={<CheckCircle2 size={15} />} tone="pipeline" />
        <MetricCard title="Perdidos" value={String(kanbanClients.filter((client) => client.status === "Perdido").length)} caption="Saída do funil" icon={<X size={15} />} tone="risk" />
      </section>
    );
  }

  if (activePage === "agenda") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Acompanhamentos hoje" value={String(clients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje").length)} caption="Agenda imediata" icon={<Bell size={15} />} tone="revenue" />
        <MetricCard title="Sem contato" value={String(clients.filter((client) => client.lastContactDays >= 7).length)} caption="Retomar relação" icon={<AlertTriangle size={15} />} tone="risk" />
        <MetricCard title="Propostas" value={String(clients.filter((client) => client.status === "Proposta").length)} caption="Janelas abertas" icon={<Target size={15} />} tone="forecast" />
        <MetricCard title="Notas recentes" value={String(clients.reduce((sum, client) => sum + client.notes.length, 0))} caption="Histórico comercial" icon={<StickyNote size={15} />} />
      </section>
    );
  }

  if (activePage === "automacoes") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Regras ativas" value="03" caption="Fluxos em operação" icon={<Zap size={15} />} tone="pipeline" />
        <MetricCard title="Acompanhamentos criados" value="18" caption="Últimos 7 dias" icon={<Bell size={15} />} tone="revenue" />
        <MetricCard title="Clientes reativados" value="06" caption="Retomadas comerciais" icon={<RotateCcw size={15} />} tone="pipeline" />
        <MetricCard title="Alertas pendentes" value="04" caption="Aguardam revisão" icon={<AlertTriangle size={15} />} tone="forecast" />
      </section>
    );
  }

  return null;
}
