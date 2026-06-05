import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  MessageCircle,
  Phone,
  Plus,
  Sparkles,
  Star,
  StickyNote,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import MetricCard from "./MetricCard";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
type ActivePage = "dashboard" | "clientes" | "kanban" | "automacoes";

type Note = {
  id: number;
  text: string;
  date: string;
};

type Client = {
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
  if (activePage === "clientes") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Clientes totais" value={String(clients.length)} icon={<Users size={15} className="text-sky-400" />} />
        <MetricCard title="Favoritos" value={String(clients.filter((client) => client.favorite).length)} icon={<Star size={15} className="text-amber-400" />} />
        <MetricCard title="Em risco" value={String(clients.filter((client) => getRisk(client) === "Alto").length)} icon={<AlertTriangle size={15} className="text-rose-400" />} />
        <MetricCard title="Notas internas" value={String(clients.reduce((sum, client) => sum + client.notes.length, 0))} icon={<StickyNote size={15} className="text-violet-400" />} />
      </section>
    );
  }

  if (activePage === "kanban") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Novos leads" value={String(kanbanClients.filter((client) => client.status === "Novo").length)} icon={<Plus size={15} className="text-sky-400" />} />
        <MetricCard title="Contatos" value={String(kanbanClients.filter((client) => client.status === "Contato").length)} icon={<Phone size={15} className="text-violet-400" />} />
        <MetricCard title="Propostas" value={String(kanbanClients.filter((client) => client.status === "Proposta").length)} icon={<Target size={15} className="text-amber-400" />} />
        <MetricCard title="Fechados" value={String(kanbanClients.filter((client) => client.status === "Fechado").length)} icon={<CheckCircle2 size={15} className="text-emerald-400" />} />
        <MetricCard title="Perdidos" value={String(kanbanClients.filter((client) => client.status === "Perdido").length)} icon={<X size={15} className="text-rose-400" />} />
      </section>
    );
  }

  if (activePage === "automacoes") {
    return (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Regras ativas" value="04" icon={<Zap size={15} className="text-amber-400" />} />
        <MetricCard title="Sequências" value="09" icon={<Bell size={15} className="text-sky-400" />} />
        <MetricCard title="Mensagens prontas" value="18" icon={<MessageCircle size={15} className="text-emerald-400" />} />
        <MetricCard title="Motor IA" value="Beta" icon={<Sparkles size={15} className="text-violet-400" />} />
      </section>
    );
  }

  return null;
}
