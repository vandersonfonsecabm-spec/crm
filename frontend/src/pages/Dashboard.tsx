import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bell,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Flame,
  KanbanSquare,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  StickyNote,
  Target,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import MetricCard from "../components/dashboard/MetricCard";
import DashboardMetrics from "../components/dashboard/DashboardMetrics";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import DashboardPortfolioInsights from "../components/dashboard/DashboardPortfolioInsights";
import DashboardClientsTable from "../components/dashboard/DashboardClientsTable";
import DashboardQuickActions from "../components/dashboard/DashboardQuickActions";

type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";
type SortBy = "score" | "value" | "name" | "status";
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

const statusList: Status[] = ["Novo", "Contato", "Proposta", "Fechado", "Perdido"];

const initialClients: Client[] = [
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
    tags: ["Follow-up"],
    notes: [{ id: 1, text: "Enviar follow-up com resumo da proposta inicial.", date: "14/05/2026 15:42" }],
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

const emptyClient: Client = {
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

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function leadOwner(client: Client) {
  if (client.source.toLowerCase().includes("instagram")) return "Ana";
  if (client.source.toLowerCase().includes("whatsapp")) return "Marco";
  if (client.source.toLowerCase().includes("site")) return "Bia";
  return "Time";
}

function idleLabel(client: Client) {
  if (client.lastContactDays === 0) return "Hoje";
  if (client.lastContactDays === 1) return "1 dia";
  return `${client.lastContactDays} dias`;
}

function forecastLabel(client: Client) {
  const score = getLeadScore(client);

  if (score >= 80) return "Alta chance";
  if (score >= 60) return "Em negociação";
  return "Precisa ação";
}

function slaLabel(client: Client) {
  if (client.lastContactDays >= 7) return "Crítico";
  if (client.lastContactDays >= 3) return "Atenção";
  return "Saudável";
}

function priorityLabel(client: Client) {
  if (client.hot && getLeadScore(client) >= 80) return "Prioridade máxima";
  if (getLeadScore(client) >= 60) return "Operacional";
  return "Baixa urgência";
}

function stageGuidance(status: Status) {
  if (status === "Novo") return "Qualificar lead";
  if (status === "Contato") return "Avançar conversa";
  if (status === "Proposta") return "Fechar oportunidade";
  if (status === "Fechado") return "Pós-venda / expansão";
  return "Recuperar ou arquivar";
}

function customerFitLabel(client: Client) {
  const score = getLeadScore(client);

  if (client.status === "Fechado") return "Cliente validado";
  if (score >= 85 && client.value >= 12000) return "Fit premium";
  if (score >= 65) return "Bom encaixe";
  if (getRisk(client) === "Alto") return "Recuperação";
  return "Em qualificação";
}

function nextActionLabel(client: Client) {
  if (client.status === "Fechado") return "Manter relacionamento e buscar expansão.";
  if (client.status === "Perdido") return "Agendar reativação futura com proposta objetiva.";
  if (getRisk(client) === "Alto") return "Retomar contato com urgência e registrar objeção.";
  if (getLeadScore(client) >= 80) return "Priorizar contato hoje e conduzir para fechamento.";
  if (client.status === "Novo") return "Fazer primeiro contato rápido e qualificar necessidade.";
  return "Manter cadência de follow-up e avançar para próxima etapa.";
}

function activitySignalLabel(client: Client) {
  if (client.lastContactDays === 0) return "Contato hoje";
  if (client.lastContactDays <= 2) return "Ativo recente";
  if (client.lastContactDays <= 6) return "Monitorar";
  return "Reativar";
}

function actionIntensity(client: Client) {
  const score = getLeadScore(client);

  if (client.status === "Perdido") return 35;
  if (client.hot && score >= 80) return 100;
  if (score >= 80) return 88;
  if (score >= 60) return 68;
  return 46;
}

function smartCardBorderClass(client: Client) {
  if (client.hot && getLeadScore(client) >= 80) {
    return "border-rose-300/30 bg-gradient-to-b from-rose-500/[0.10] via-black/20 to-black/20 shadow-[0_0_28px_rgba(251,113,133,0.10)]";
  }

  if (getRisk(client) === "Alto") {
    return "border-amber-300/25 bg-gradient-to-b from-amber-500/[0.08] via-black/20 to-black/20";
  }

  return "border-white/10 bg-black/20";
}


function enterpriseHealthLabel(client: Client) {
  if (client.status === "Fechado") return "Carteira saudável";
  if (client.hot && getLeadScore(client) >= 80) return "Alta intenção";
  if (getRisk(client) === "Alto") return "Requer atenção";
  if (client.lastContactDays <= 2) return "Cadência ativa";
  return "Nutrição comercial";
}

function enterpriseHealthClass(client: Client) {
  if (client.status === "Fechado") return "border-emerald-400/15 bg-emerald-500/[0.055] text-emerald-100";
  if (client.hot && getLeadScore(client) >= 80) return "border-rose-400/15 bg-rose-500/[0.055] text-rose-100";
  if (getRisk(client) === "Alto") return "border-amber-400/15 bg-amber-500/[0.055] text-amber-100";
  return "border-sky-400/15 bg-sky-500/[0.045] text-sky-100";
}

function getPriority(client: Client) {
  if (client.hot || client.value >= 12000 || client.lastContactDays >= 7) return "Alta";
  if (client.value >= 7000 || client.lastContactDays >= 4) return "Média";
  return "Baixa";
}

function getRisk(client: Client) {
  if (client.status === "Perdido" || client.lastContactDays >= 10) return "Alto";
  if (client.lastContactDays >= 5 || client.status === "Proposta") return "Médio";
  return "Baixo";
}

function getLeadScore(client: Client) {
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

function statusClass(status: Status) {
  if (status === "Novo") return "border-sky-400/20 bg-sky-500/10 text-sky-200";
  if (status === "Contato") return "border-violet-400/20 bg-violet-500/10 text-violet-200";
  if (status === "Proposta") return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  if (status === "Fechado") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  return "border-rose-400/20 bg-rose-500/10 text-rose-200";
}

function kanbanHeaderClass(status: Status) {
  if (status === "Novo") return "border-sky-400/20 bg-sky-500/10";
  if (status === "Contato") return "border-violet-400/20 bg-violet-500/10";
  if (status === "Proposta") return "border-amber-400/20 bg-amber-500/10";
  if (status === "Fechado") return "border-emerald-400/20 bg-emerald-500/10";
  return "border-rose-400/20 bg-rose-500/10";
}

function tagClass(tag: string) {
  const normalized = tag.toLowerCase();
  if (normalized.includes("quente") || normalized.includes("urgente")) return "border-rose-400/20 bg-rose-500/10 text-rose-200";
  if (normalized.includes("alto")) return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  if (normalized.includes("ganho")) return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (normalized.includes("risco")) return "border-red-400/20 bg-red-500/10 text-red-200";
  return "border-sky-400/20 bg-sky-500/10 text-sky-200";
}

function loadClients(): Client[] {
  const saved = localStorage.getItem("crm-premium-clients");
  if (!saved) return initialClients;

  try {
    const parsed = JSON.parse(saved);
    return parsed.map((client: any) => ({
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

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>(loadClients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "Todos">("Todos");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [onlySilent, setOnlySilent] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [kanbanOwnerFilter, setKanbanOwnerFilter] = useState<"Todos" | "Ana" | "Marco" | "Bia" | "Time">("Todos");
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [isDraggingKanban, setIsDraggingKanban] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState<Client | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagText, setTagText] = useState("");
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [showCommandResults, setShowCommandResults] = useState(false);
  const [recentViewedClients, setRecentViewedClients] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const [isBooting, setIsBooting] = useState(true);

  const pageSize = 4;

  const pageTitle =
    activePage === "dashboard"
      ? "Visão geral"
      : activePage === "clientes"
        ? "Clientes"
        : activePage === "kanban"
          ? "Kanban"
          : "Automações";

  useEffect(() => {
    localStorage.setItem("crm-premium-clients", JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000 * 30);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsBooting(false), 650);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandResults(true);
        window.setTimeout(() => document.getElementById("crm-command-search")?.focus(), 0);
        return;
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setShowCommandResults(true);
        window.setTimeout(() => document.getElementById("crm-command-search")?.focus(), 0);
        return;
      }

      if (event.key === "Escape") {
        setShowCommandResults(false);
        setShowQuickActions(false);
        setCommandSearch("");
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, []);

  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedId) || null, [clients, selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    setRecentViewedClients((current) => {
      const filtered = current.filter((id) => id !== selectedId);
      return [selectedId, ...filtered].slice(0, 5);
    });
  }, [selectedId]);

  const filteredClients = useMemo(() => {
    const result = clients.filter((client) => {
      const term = search.toLowerCase();

      const matchSearch =
        client.name.toLowerCase().includes(term) ||
        client.company.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        client.phone.includes(term) ||
        client.tags.some((tag) => tag.toLowerCase().includes(term));

      const matchStatus = statusFilter === "Todos" || client.status === statusFilter;
      const matchFavorite = !onlyFavorites || client.favorite;
      const matchHot = !onlyHot || client.hot;
      const matchRisk = !onlyRisk || getRisk(client) === "Alto";
      const matchSilent = !onlySilent || client.lastContactDays >= 7;

      return matchSearch && matchStatus && matchFavorite && matchHot && matchRisk && matchSilent;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "score") return getLeadScore(b) - getLeadScore(a);
      if (sortBy === "value") return b.value - a.value;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return a.status.localeCompare(b.status);
    });
  }, [clients, onlyFavorites, onlyHot, onlyRisk, onlySilent, search, sortBy, statusFilter]);

  const kanbanClients = useMemo(() => {
    if (kanbanOwnerFilter === "Todos") {
      return filteredClients;
    }

    return filteredClients.filter((client) => leadOwner(client) === kanbanOwnerFilter);
  }, [filteredClients, kanbanOwnerFilter]);

  const kanbanEnterpriseStats = useMemo(() => {
    const totalValue = kanbanClients.reduce((sum, client) => sum + client.value, 0);
    const forecastValue = kanbanClients
      .filter((client) => client.status === "Novo" || client.status === "Contato" || client.status === "Proposta")
      .reduce((sum, client) => sum + client.value, 0);
    const wonValue = kanbanClients
      .filter((client) => client.status === "Fechado")
      .reduce((sum, client) => sum + client.value, 0);
    const averageScore = Math.round(
      kanbanClients.reduce((sum, client) => sum + getLeadScore(client), 0) / Math.max(1, kanbanClients.length)
    );
    const highRiskCount = kanbanClients.filter((client) => getRisk(client) === "Alto").length;
    const todayFollowUps = kanbanClients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje").length;
    const activePipeline = kanbanClients.filter((client) => client.status !== "Fechado" && client.status !== "Perdido").length;
    const conversionRate = Math.round((wonValue / Math.max(1, totalValue)) * 100);

    return {
      totalValue,
      forecastValue,
      wonValue,
      averageScore,
      highRiskCount,
      todayFollowUps,
      activePipeline,
      conversionRate,
    };
  }, [kanbanClients]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const paginatedClients = filteredClients.slice((page - 1) * pageSize, page * pageSize);

  const analytics = useMemo(() => {
    const totalValue = clients.reduce((sum, client) => sum + client.value, 0);
    const wonValue = clients.filter((client) => client.status === "Fechado").reduce((sum, client) => sum + client.value, 0);
    const forecastValue = clients
      .filter((client) => client.status === "Proposta" || client.status === "Novo")
      .reduce((sum, client) => sum + client.value, 0);
    const hotCount = clients.filter((client) => client.hot || getPriority(client) === "Alta").length;
    const averageScore = Math.round(clients.reduce((sum, client) => sum + getLeadScore(client), 0) / Math.max(1, clients.length));
    const todayFollowUps = clients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje").length;

    return { totalValue, wonValue, forecastValue, hotCount, averageScore, todayFollowUps };
  }, [clients]);

  const recentActivities = useMemo(() => {
    return clients
      .flatMap((client) =>
        client.notes.map((note) => ({
          id: `${client.id}-${note.id}`,
          client: client.name,
          text: note.text,
          date: note.date,
        }))
      )
      .slice(0, 5);
  }, [clients]);

  const followUpAgenda = useMemo(() => {
    const today = clients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje");
    const tomorrow = clients.filter((client) => client.nextFollowUp.toLowerCase() === "amanhã");
    const later = clients.filter(
      (client) =>
        client.nextFollowUp.toLowerCase() !== "hoje" &&
        client.nextFollowUp.toLowerCase() !== "amanhã" &&
        client.nextFollowUp.toLowerCase() !== "concluído"
    );

    return [
      { label: "Hoje", hint: "Ação imediata", clients: today },
      { label: "Amanhã", hint: "Próxima janela", clients: tomorrow },
      { label: "Depois", hint: "Nutrição", clients: later },
    ];
  }, [clients]);

  const commandResults = useMemo(() => {
    const term = commandSearch.toLowerCase().trim();

    if (!term) {
      return [];
    }

    const pages = [
      { label: "Dashboard", type: "Página", action: () => setActivePage("dashboard") },
      { label: "Clientes", type: "Página", action: () => setActivePage("clientes") },
      { label: "Kanban", type: "Página", action: () => setActivePage("kanban") },
      { label: "Automações", type: "Página", action: () => setActivePage("automacoes") },
    ].filter((item) => item.label.toLowerCase().includes(term));

    const clientResults = clients
      .filter((client) =>
        client.name.toLowerCase().includes(term) ||
        client.company.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term)
      )
      .slice(0, 4)
      .map((client) => ({
        label: client.name,
        type: client.company,
        action: () => {
          setSelectedId(client.id);
          setActivePage("clientes");
        },
      }));

    return [...pages, ...clientResults].slice(0, 6);
  }, [clients, commandSearch]);

  const smartAlerts = useMemo(() => {
    const highRisk = clients.filter((client) => getRisk(client) === "Alto").length;
    const hotProposals = clients.filter((client) => client.hot && client.status === "Proposta").length;
    const silentClients = clients.filter((client) => client.lastContactDays >= 7).length;

    return [
      `${highRisk} clientes em risco alto`,
      `${hotProposals} propostas quentes abertas`,
      `${silentClients} clientes sem contato recente`,
    ];
  }, [clients]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (statusFilter !== "Todos") count += 1;
    if (onlyFavorites) count += 1;
    if (onlyHot) count += 1;
    if (onlyRisk) count += 1;
    if (onlySilent) count += 1;
    if (sortBy !== "score") count += 1;
    return count;
  }, [onlyFavorites, onlyHot, onlyRisk, onlySilent, search, sortBy, statusFilter]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    showToast(message);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("Todos");
    setOnlyFavorites(false);
    setOnlyHot(false);
    setOnlyRisk(false);
    setOnlySilent(false);
    setSortBy("score");
    setKanbanOwnerFilter("Todos");
    setPage(1);
    showToast("Filtros limpos.");
  }

  function toggleFavorite(id: number) {
    setClients((current) => current.map((client) => (client.id === id ? { ...client, favorite: !client.favorite } : client)));
  }

  function toggleHot(id: number) {
    setClients((current) => current.map((client) => (client.id === id ? { ...client, hot: !client.hot } : client)));
  }

  function changeStatus(id: number, status: Status) {
    setClients((current) =>
      current.map((client) => (client.id === id ? { ...client, status, lastContactDays: 0 } : client))
    );
    showToast("Status atualizado.");
  }

  function saveEdit() {
    if (!editing) return;
    setClients((current) => current.map((client) => (client.id === editing.id ? editing : client)));
    setSelectedId(editing.id);
    setEditing(null);
    showToast("Cliente atualizado.");
  }

  function createClient() {
    if (!creating || !creating.name.trim()) {
      showToast("Informe o nome do cliente.");
      return;
    }

    const newClient: Client = {
      ...creating,
      id: Date.now(),
      tags: creating.tags.length ? creating.tags : ["Novo"],
      notes: [],
    };

    setClients((current) => [newClient, ...current]);
    setSelectedId(newClient.id);
    setCreating(null);
    showToast("Cliente criado.");
  }

  function deleteClient(id: number) {
    setClients((current) => current.filter((client) => client.id !== id));
    if (selectedId === id) setSelectedId(null);
    setEditing(null);
    showToast("Cliente removido.");
  }

  function addNote() {
    if (!selectedClient || !noteText.trim()) return;

    const note: Note = {
      id: Date.now(),
      text: noteText.trim(),
      date: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    };

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id ? { ...client, notes: [note, ...client.notes], lastContactDays: 0 } : client
      )
    );

    setNoteText("");
    showToast("Nota adicionada.");
  }

  function addTagToSelected() {
    if (!selectedClient || !tagText.trim()) return;
    const tag = tagText.trim();

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id && !client.tags.includes(tag)
          ? { ...client, tags: [...client.tags, tag] }
          : client
      )
    );

    setTagText("");
    showToast("Tag adicionada.");
  }

  function removeTagFromSelected(tag: string) {
    if (!selectedClient) return;

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id ? { ...client, tags: client.tags.filter((item) => item !== tag) } : client
      )
    );

    showToast("Tag removida.");
  }

  function exportCsv() {
    const header = ["Nome", "Empresa", "Telefone", "Email", "Valor", "Status", "Origem", "Prioridade", "Risco", "Score"];
    const rows = clients.map((client) => [
      client.name,
      client.company,
      client.phone,
      client.email,
      String(client.value),
      client.status,
      client.source,
      getPriority(client),
      getRisk(client),
      String(getLeadScore(client)),
    ]);

    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "clientes-crm.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV exportado.");
  }

  function applySmartFilter(type: "risk" | "proposal" | "silent") {
    clearFilters();

    window.setTimeout(() => {
      if (type === "risk") setOnlyRisk(true);
      if (type === "proposal") {
        setStatusFilter("Proposta");
        setOnlyHot(true);
      }
      if (type === "silent") setOnlySilent(true);
      setPage(1);
    }, 0);
  }

  function whatsappMessage(client: Client) {
    return `Olá, ${client.name}! Tudo bem? Passando para dar continuidade ao atendimento da ${client.company}.`;
  }

  if (isBooting) {
    return (
      <div className="min-h-screen bg-[#080b12] p-4 text-white">
        <div className="flex min-h-[calc(100vh-32px)] min-w-0 gap-4 overflow-x-hidden">
          <div className="hidden w-60 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:block">
            <div className="mb-6 flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
                <div className="h-2 w-16 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-xl bg-white/[0.045]" />
              ))}
            </div>

            <div className="mt-6 h-28 animate-pulse rounded-2xl bg-white/[0.045]" />
            <div className="mt-3 h-36 animate-pulse rounded-2xl bg-white/[0.035]" />
          </div>

          <main className="flex-1 space-y-4">
            <div className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />

            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
                <div className="h-6 w-44 animate-pulse rounded-full bg-white/10" />
              </div>

              <div className="h-9 w-32 animate-pulse rounded-xl bg-white/10" />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>

            <div className="h-16 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-3">
                <div className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                <div className="h-52 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              </div>

              <div className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen select-none overflow-x-hidden bg-[#080b12] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 overflow-hidden border-r border-white/[0.06] bg-white/[0.03] p-4 lg:block">
          <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-black">
                <Sparkles size={16} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">CRM Enterprise</p>
                <p className="truncate text-[11px] text-slate-500">Operação comercial</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5">
              <span className="text-[10px] text-emerald-200/80">Ambiente</span>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-100">estável</span>
            </div>
          </div>

          <nav className="space-y-4">
            <div>
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Workspace
              </p>

              <div className="grid gap-1.5">
                <button
                  onClick={() => setActivePage("dashboard")}
                  className={`relative mx-auto box-border flex h-10 w-[208px] shrink-0 items-center rounded-xl border border-white/[0.08] px-3 pr-9 text-left text-sm leading-none transition-colors duration-200 ${
                    activePage === "dashboard"
                      ? "bg-white/[0.115] text-white ring-1 ring-inset ring-white/70"
                      : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.055]"
                  }`}
                >
                  <BarChart3 size={15} className="mr-2 shrink-0" />
                  <span className="block min-w-0 flex-1 truncate">Dashboard</span>
                  <span className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${activePage === "dashboard" ? "bg-white" : "bg-white/15"}`} />
                </button>

                <button
                  onClick={() => setActivePage("clientes")}
                  className={`relative mx-auto box-border flex h-10 w-[208px] shrink-0 items-center rounded-xl border border-white/[0.08] px-3 pr-9 text-left text-sm leading-none transition-colors duration-200 ${
                    activePage === "clientes"
                      ? "bg-white/[0.115] text-white ring-1 ring-inset ring-white/70"
                      : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.055]"
                  }`}
                >
                  <Users size={15} className="mr-2 shrink-0" />
                  <span className="block min-w-0 flex-1 truncate">Clientes</span>
                  <span className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${activePage === "clientes" ? "bg-white" : "bg-white/15"}`} />
                </button>

                <button
                  onClick={() => setActivePage("kanban")}
                  className={`relative mx-auto box-border flex h-10 w-[208px] shrink-0 items-center rounded-xl border border-white/[0.08] px-3 pr-9 text-left text-sm leading-none transition-colors duration-200 ${
                    activePage === "kanban"
                      ? "bg-white/[0.115] text-white ring-1 ring-inset ring-white/70"
                      : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.055]"
                  }`}
                >
                  <KanbanSquare size={15} className="mr-2 shrink-0" />
                  <span className="block min-w-0 flex-1 truncate">Kanban</span>
                  <span className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${activePage === "kanban" ? "bg-white" : "bg-white/15"}`} />
                </button>
              </div>
            </div>

            <div className="border-t border-white/5 pt-3">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Inteligência
              </p>

              <div className="grid gap-1.5">
                <button
                  onClick={() => setActivePage("automacoes")}
                  className={`relative mx-auto box-border flex h-10 w-[208px] shrink-0 items-center rounded-xl border border-white/[0.08] px-3 pr-9 text-left text-sm leading-none transition-colors duration-200 ${
                    activePage === "automacoes"
                      ? "bg-white/[0.115] text-white ring-1 ring-inset ring-white/70"
                      : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.055]"
                  }`}
                >
                  <Zap size={15} className="mr-2 shrink-0" />
                  <span className="block min-w-0 flex-1 truncate">Automações</span>
                  <span className={`absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${activePage === "automacoes" ? "bg-white" : "bg-white/15"}`} />
                </button>
              </div>
            </div>
          </nav>

          <div className="mx-auto mt-6 w-full max-w-[208px] rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
            <p className="text-xs font-semibold">Atalhos operacionais</p>

            <div className="mt-3 space-y-2">
              {activePage === "dashboard" && (
                <>
                  <button onClick={() => setOnlyHot(true)} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Clientes quentes
                  </button>

                  <button onClick={() => setStatusFilter("Proposta")} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Propostas abertas
                  </button>
                </>
              )}

              {activePage === "clientes" && (
                <>
                  <button onClick={() => setCreating({ ...emptyClient })} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Novo cliente
                  </button>

                  <button onClick={exportCsv} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Exportar clientes
                  </button>
                </>
              )}

              {activePage === "kanban" && (
                <>
                  <button onClick={() => setOnlyHot(true)} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Leads quentes
                  </button>

                  <button onClick={() => setStatusFilter("Proposta")} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Focar propostas
                  </button>
                </>
              )}

              {activePage === "automacoes" && (
                <>
                  <button className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Criar regra
                  </button>

                  <button className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                    Ver templates
                  </button>
                </>
              )}

              <button onClick={clearFilters} className="box-border h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.07]">
                Resetar visão
              </button>
            </div>
          </div>

          {activePage !== "automacoes" && (
            <>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                <p className="text-xs font-semibold">Sinais comerciais</p>

                <div className="mt-3 space-y-2">
                  {smartAlerts.map((alert, index) => (
                    <button
                      key={alert}
                      onClick={() => applySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                      className="w-full rounded-xl bg-white/5 p-2 text-left transition-all duration-200 text-[11px] text-slate-300 hover:bg-white/[0.07]"
                    >
                      {alert}
                    </button>
                  ))}
                </div>
              </div>

              {activePage === "clientes" && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                  <p className="text-xs font-semibold">Atividades recentes</p>

                  <div className="mt-3 space-y-2">
                    {recentActivities.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] font-semibold text-slate-300">
                          Sem atividades registradas
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                          As notas criadas no painel do cliente aparecem aqui como histórico rápido.
                        </p>
                      </div>
                    )}

                    {recentActivities.map((activity) => (
                      <div key={activity.id} className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
                        <p className="text-[11px] text-slate-200">{activity.client}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{activity.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activePage === "automacoes" && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
              <p className="text-xs font-semibold">Status operacional</p>

              <div className="mt-3 space-y-2">
                <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
                  <p className="text-[11px] text-slate-200">Automações frontend</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Base pronta para regras comerciais.</p>
                </div>

                <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
                  <p className="text-[11px] text-slate-200">Próxima fase</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Conectar ações com backend e banco real.</p>
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4">
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/[0.07] px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />

                <span className="text-[10px] font-semibold text-emerald-100">
                  Operação estável
                </span>
              </div>

              <div className="hidden h-4 w-px bg-white/10 md:block" />

              <p className="hidden text-[11px] text-slate-500 md:block">
                CRM Agro SaaS • Consistência Visual
              </p>

              <span className="hidden rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] text-slate-400 lg:inline-flex">
                v1 refinamento
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <div className="flex w-64 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <Search size={13} className="text-slate-500" />

                  <input
                    id="crm-command-search"
                    value={commandSearch}
                    onChange={(event) => {
                      setCommandSearch(event.target.value);
                      setShowCommandResults(true);
                    }}
                    onFocus={() => setShowCommandResults(true)}
                    placeholder="Buscar cliente, empresa ou página..."
                    className="w-full select-text bg-transparent text-[11px] outline-none placeholder:text-slate-500"
                  />

                  <kbd className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-600">
                    Ctrl K
                  </kbd>
                </div>

                {showCommandResults && commandSearch && (
                  <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-white/10 bg-[#0d111a] p-2 shadow-2xl">
                    {commandResults.length === 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                        <p className="text-[11px] font-semibold text-slate-300">
                          Nenhum resultado encontrado
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                          Tente buscar pelo nome do cliente, empresa, email ou página do CRM.
                        </p>
                      </div>
                    )}

                    {commandResults.map((item) => (
                      <button
                        key={`${item.type}-${item.label}`}
                        onClick={() => {
                          item.action();
                          setCommandSearch("");
                          setShowCommandResults(false);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
                      >
                        <p className="text-[11px] font-medium text-slate-200">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {item.type}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 lg:block">
                <p className="text-[10px] text-slate-500">Agora</p>
                <p className="text-[11px] font-semibold">{currentTime}</p>
              </div>

              <DashboardQuickActions
                isOpen={showQuickActions}
                onToggle={() => setShowQuickActions((value) => !value)}
                onCreateClient={() => {
                  setCreating({ ...emptyClient });
                  setShowQuickActions(false);
                }}
                onGoToClients={() => {
                  setActivePage("clientes");
                  setShowQuickActions(false);
                }}
                onGoToKanban={() => {
                  setActivePage("kanban");
                  setShowQuickActions(false);
                }}
                onExportCsv={() => {
                  exportCsv();
                  setShowQuickActions(false);
                }}
              />

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">
                  MA
                </div>

                <div className="hidden md:block">
                  <p className="text-[11px] font-medium">Marco Admin</p>
                  <p className="text-[10px] text-slate-500">Administrador</p>
                </div>
              </div>
            </div>
          </div>

          <DashboardHeader
            activePage={activePage}
            pageTitle={pageTitle}
            onCreateClient={() => setCreating({ ...emptyClient })}
          />

          {activePage === "dashboard" && (
            <DashboardMetrics analytics={analytics} money={money} />
          )}

          {activePage === "dashboard" && (
            <DashboardPortfolioInsights
              clients={clients}
              money={money}
              getPriority={getPriority}
              getRisk={getRisk}
              getLeadScore={getLeadScore}
              enterpriseHealthClass={enterpriseHealthClass}
              enterpriseHealthLabel={enterpriseHealthLabel}
              onSelectClient={setSelectedId}
              onOpenClient={(clientId) => {
                setSelectedId(clientId);
                setActivePage("clientes");
              }}
            />
          )}

          {activePage === "clientes" && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Clientes totais" value={String(clients.length)} icon={<Users size={15} className="text-sky-400" />} />
              <MetricCard title="Favoritos" value={String(clients.filter((client) => client.favorite).length)} icon={<Star size={15} className="text-amber-400" />} />
              <MetricCard title="Em risco" value={String(clients.filter((client) => getRisk(client) === "Alto").length)} icon={<AlertTriangle size={15} className="text-rose-400" />} />
              <MetricCard title="Notas internas" value={String(clients.reduce((sum, client) => sum + client.notes.length, 0))} icon={<StickyNote size={15} className="text-violet-400" />} />
            </section>
          )}

          {activePage === "kanban" && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Novos leads" value={String(kanbanClients.filter((client) => client.status === "Novo").length)} icon={<Plus size={15} className="text-sky-400" />} />
              <MetricCard title="Contatos" value={String(kanbanClients.filter((client) => client.status === "Contato").length)} icon={<Phone size={15} className="text-violet-400" />} />
              <MetricCard title="Propostas" value={String(kanbanClients.filter((client) => client.status === "Proposta").length)} icon={<Target size={15} className="text-amber-400" />} />
              <MetricCard title="Fechados" value={String(kanbanClients.filter((client) => client.status === "Fechado").length)} icon={<CheckCircle2 size={15} className="text-emerald-400" />} />
              <MetricCard title="Perdidos" value={String(kanbanClients.filter((client) => client.status === "Perdido").length)} icon={<X size={15} className="text-rose-400" />} />
            </section>
          )}

          {activePage === "automacoes" && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Regras ativas" value="04" icon={<Zap size={15} className="text-amber-400" />} />
              <MetricCard title="Sequências" value="09" icon={<Bell size={15} className="text-sky-400" />} />
              <MetricCard title="Mensagens prontas" value="18" icon={<MessageCircle size={15} className="text-emerald-400" />} />
              <MetricCard title="Motor IA" value="Beta" icon={<Sparkles size={15} className="text-violet-400" />} />
            </section>
          )}

          {activePage !== "automacoes" && (
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Busca operacional</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {filteredClients.length} clientes encontrados • {activeFiltersCount} filtro(s) ativo(s)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {activeFiltersCount > 0 && (
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-200">
                      Filtros ativos
                    </span>
                  )}

                  <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
                    <Download size={14} />
                    CSV
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition-all duration-200 focus-within:border-white/25 focus-within:bg-white/[0.06]">
                  <Search size={14} className="text-slate-500" />

                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar por cliente, empresa, telefone, email ou tag..."
                    className="w-full select-text bg-transparent text-sm outline-none placeholder:text-slate-500"
                  />

                  {search.trim() && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                      }}
                      className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as Status | "Todos"); setPage(1); }} className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none">
                  <option value="Todos">Todos os status</option>
                  {statusList.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>

                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none">
                  <option value="score">Ordenar por score</option>
                  <option value="value">Ordenar por valor</option>
                  <option value="name">Ordenar por nome</option>
                  <option value="status">Ordenar por status</option>
                </select>

                {activePage === "kanban" && (
                  <select
                    value={kanbanOwnerFilter}
                    onChange={(event) => setKanbanOwnerFilter(event.target.value as "Todos" | "Ana" | "Marco" | "Bia" | "Time")}
                    className="rounded-xl border border-white/10 bg-[#0d111a] px-3 py-2 text-xs text-slate-200 outline-none"
                  >
                    <option value="Todos">Todos os vendedores</option>
                    <option value="Ana">Ana</option>
                    <option value="Marco">Marco</option>
                    <option value="Bia">Bia</option>
                    <option value="Time">Time</option>
                  </select>
                )}

                <button onClick={() => setOnlyFavorites((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${onlyFavorites ? "border-amber-300/30 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.08)]" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"}`}>
                  Favoritos
                </button>

                <button onClick={() => setOnlyHot((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs transition-all duration-200 ${onlyHot ? "border-rose-300/30 bg-rose-400/10 text-rose-100 shadow-[0_0_18px_rgba(251,113,133,0.08)]" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"}`}>
                  Quentes
                </button>

                <button onClick={clearFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
                  <ArrowUpDown size={14} />
                  Limpar
                </button>
              </div>
            </section>
          )}

          <section className={`mt-4 grid gap-4 ${activePage === "kanban" ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-[minmax(0,1fr)_340px]"}`}>
            <div className="space-y-4">
              {activePage === "clientes" && (
                <DashboardClientsTable
                  paginatedClients={paginatedClients}
                  filteredClientsCount={filteredClients.length}
                  selectedId={selectedId}
                  page={page}
                  totalPages={totalPages}
                  money={money}
                  initials={initials}
                  tagClass={tagClass}
                  statusClass={statusClass}
                  idleLabel={idleLabel}
                  getPriority={getPriority}
                  getRisk={getRisk}
                  getLeadScore={getLeadScore}
                  forecastLabel={forecastLabel}
                  onSelectClient={setSelectedId}
                  onToggleFavorite={toggleFavorite}
                  onToggleHot={toggleHot}
                  onEditClient={setEditing}
                  onCopyText={copyText}
                  whatsappMessage={whatsappMessage}
                  onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
                  onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
                />
              )}
              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Mini calendário de follow-up</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Próximas ações comerciais organizadas por urgência.
                      </p>
                    </div>

                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-400">
                      {analytics.todayFollowUps} hoje
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {followUpAgenda.map((group) => (
                      <div key={group.label} className="rounded-2xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-slate-200">{group.label}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{group.hint}</p>
                          </div>

                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                            {group.clients.length}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {group.clients.slice(0, 3).map((client) => (
                            <button
                              key={client.id}
                              onClick={() => {
                                setSelectedId(client.id);
                                setActivePage("clientes");
                              }}
                              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[11px] font-semibold text-slate-200">{client.name}</p>
                                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                                  {client.status}
                                </span>
                              </div>

                              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                {client.company} • {money(client.value)}
                              </p>
                            </button>
                          ))}

                          {group.clients.length === 0 && (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3">
                              <p className="text-[10px] text-slate-500">Nenhum follow-up nesta janela.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {clients.slice(0, 4).map((client) => (
                    <div
                      key={client.id}
                      onClick={() => setSelectedId(client.id)}
                      className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] transition hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{client.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{client.company}</p>
                        </div>

                        <span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(client.status)}`}>
                          {client.status}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-500">Valor</p>
                          <p className="text-sm font-semibold">{money(client.value)}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Score</p>
                          <p className="text-sm font-semibold">{getLeadScore(client)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Pipeline por etapa</p>
                    <span className="text-[11px] text-slate-500">Distribuição comercial</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-5">
                    {statusList.map((status) => (
                      <div
                        key={status}
                        className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-slate-400">{status}</p>

                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(status)}`}>
                            {clients.filter((client) => client.status === status).length}
                          </span>
                        </div>

                        <div className="mt-3">
                          <p className="text-lg font-semibold">
                            {money(
                              kanbanClients
                                .filter((client) => client.status === status)
                                .reduce((sum, client) => sum + client.value, 0)
                            )}
                          </p>

                          <p className="mt-1 text-[10px] text-slate-500">
                            Valor acumulado
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePage === "dashboard" && recentViewedClients.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Acessos recentes</p>

                    <span className="text-[11px] text-slate-500">
                      Retomar atendimento
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {recentViewedClients
                      .map((id) => clients.find((client) => client.id === id))
                      .filter(Boolean)
                      .map((client) => (
                        <button
                          key={client!.id}
                          onClick={() => {
                            setSelectedId(client!.id);
                            setActivePage("clientes");
                          }}
                          className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035] text-left transition hover:bg-white/[0.05]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold">
                              {client!.name}
                            </p>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client!.status)}`}
                            >
                              {client!.status}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-[10px] text-slate-500">
                            {client!.company}
                          </p>

                          <p className="mt-3 text-[11px] font-semibold">
                            {money(client!.value)}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Atividades comerciais</p>
                    <span className="text-[11px] text-slate-500">Sinais, registros e próximos passos</span>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      {smartAlerts.map((alert, index) => (
                        <button
                          key={alert}
                          onClick={() => applySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                          className="w-full rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035] text-left hover:bg-white/[0.04]"
                        >
                          <p className="text-xs font-semibold text-slate-200">{alert}</p>
                          <p className="mt-1 text-[10px] text-slate-500">Clique para aplicar filtro inteligente</p>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {recentActivities.length === 0 && (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                          <p className="text-xs font-semibold text-slate-300">
                            Nenhuma atividade recente
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Adicione notas no cliente selecionado para construir uma timeline comercial mais rica.
                          </p>
                        </div>
                      )}

                      {recentActivities.slice(0, 3).map((activity) => (
                        <div key={activity.id} className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                          <p className="text-xs font-semibold text-slate-200">{activity.client}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{activity.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Analytics Executive</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Tendência comercial, conversão e performance do time.
                      </p>
                    </div>

                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
                      Leitura executiva
                    </span>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-200">Performance semanal</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Tendência, volume e qualidade do pipeline em visão executiva.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="rounded-lg border border-emerald-400/10 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                            +18%
                          </span>

                          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">
                            semana
                          </span>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]">
                        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.025] p-3">
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
                              Pipeline previsto
                            </p>

                            <p className="mt-1 text-2xl font-bold text-white">
                              {money(analytics.forecastValue)}
                            </p>

                            <p className="mt-1 text-[10px] text-slate-500">
                              Comparativo visual dos últimos 7 dias.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-cyan-400/10 bg-cyan-500/[0.06] px-2.5 py-2 text-right">
                              <p className="text-[9px] text-cyan-200/70">Pico</p>
                              <p className="mt-1 text-xs font-semibold text-cyan-100">86%</p>
                            </div>

                            <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.06] px-2.5 py-2 text-right">
                              <p className="text-[9px] text-violet-200/70">Média</p>
                              <p className="mt-1 text-xs font-semibold text-violet-100">{analytics.averageScore}</p>
                            </div>
                          </div>
                        </div>

                        <div className="relative h-56 p-3">
                          <div className="absolute inset-x-3 top-8 h-px bg-white/5" />
                          <div className="absolute inset-x-3 top-20 h-px bg-white/5" />
                          <div className="absolute inset-x-3 top-32 h-px bg-white/5" />
                          <div className="absolute inset-x-3 top-44 h-px bg-white/5" />

                          <div className="absolute inset-x-3 bottom-8 top-5 rounded-2xl bg-gradient-to-t from-cyan-500/10 via-cyan-400/[0.035] to-transparent" />

                          <svg viewBox="0 0 700 180" className="relative z-10 h-[180px] w-full overflow-visible">
                            <defs>
                              <linearGradient id="pipelineGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(103 232 249)" stopOpacity="0.38" />
                                <stop offset="100%" stopColor="rgb(103 232 249)" stopOpacity="0" />
                              </linearGradient>

                              <filter id="softGlow">
                                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                <feMerge>
                                  <feMergeNode in="coloredBlur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>

                            <path
                              d="M 0 138 C 65 118, 90 92, 135 104 C 190 118, 205 58, 270 70 C 335 82, 340 48, 405 56 C 470 64, 500 30, 565 38 C 625 45, 650 28, 700 24 L 700 180 L 0 180 Z"
                              fill="url(#pipelineGradient)"
                            />

                            <path
                              d="M 0 138 C 65 118, 90 92, 135 104 C 190 118, 205 58, 270 70 C 335 82, 340 48, 405 56 C 470 64, 500 30, 565 38 C 625 45, 650 28, 700 24"
                              fill="none"
                              stroke="rgb(103 232 249)"
                              strokeWidth="4"
                              strokeLinecap="round"
                              filter="url(#softGlow)"
                            />

                            {[
                              { x: 0, y: 138, label: "S" },
                              { x: 135, y: 104, label: "T" },
                              { x: 270, y: 70, label: "Q" },
                              { x: 405, y: 56, label: "Q" },
                              { x: 565, y: 38, label: "S" },
                              { x: 700, y: 24, label: "D" },
                            ].map((point) => (
                              <g key={`${point.x}-${point.y}`}>
                                <circle cx={point.x} cy={point.y} r="6" fill="rgb(8 11 18)" stroke="rgb(103 232 249)" strokeWidth="3" />
                                <circle cx={point.x} cy={point.y} r="2.5" fill="rgb(103 232 249)" />
                              </g>
                            ))}
                          </svg>

                          <div className="relative z-20 mt-1 grid grid-cols-7 text-center text-[9px] text-slate-600">
                            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
                              <span key={day}>{day}</span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 border-t border-white/10 bg-white/[0.02] p-3">
                          <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                            <p className="text-[9px] text-slate-500">Conversão</p>
                            <p className="mt-1 text-xs font-semibold text-white">
                              {Math.round((clients.filter((client) => client.status === "Fechado").length / Math.max(clients.length, 1)) * 100)}%
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                            <p className="text-[9px] text-slate-500">Oportunidades</p>
                            <p className="mt-1 text-xs font-semibold text-white">{clients.length} leads</p>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                            <p className="text-[9px] text-slate-500">Qualidade</p>
                            <p className="mt-1 text-xs font-semibold text-white">{analytics.averageScore}/100</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] p-3">
                        <p className="text-[10px] text-emerald-200/70">Taxa de conversão</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold text-emerald-100">
                            {Math.round((clients.filter((client) => client.status === "Fechado").length / Math.max(clients.length, 1)) * 100)}%
                          </p>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.round((clients.filter((client) => client.status === "Fechado").length / Math.max(clients.length, 1)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-sky-400/10 bg-sky-500/[0.05] p-3">
                        <p className="text-[10px] text-sky-200/70">Velocidade comercial</p>
                        <p className="mt-2 text-lg font-semibold text-sky-100">
                          {clients.filter((client) => client.lastContactDays <= 2).length}/{clients.length}
                        </p>
                        <p className="mt-1 text-[10px] text-sky-200/60">leads movimentados recentemente</p>
                      </div>

                      <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] p-3">
                        <p className="text-[10px] text-violet-200/70">Qualidade média</p>
                        <p className="mt-2 text-lg font-semibold text-violet-100">{analytics.averageScore}/100</p>
                        <p className="mt-1 text-[10px] text-violet-200/60">score consolidado da carteira</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {["Ana", "Marco", "Bia"].map((seller) => {
                      const sellerClients = clients.filter((client) => leadOwner(client) === seller);
                      const sellerScore = sellerClients.length > 0
                        ? Math.round(sellerClients.reduce((sum, client) => sum + getLeadScore(client), 0) / sellerClients.length)
                        : 0;

                      return (
                        <div key={seller} className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                                {initials(seller)}
                              </div>

                              <div>
                                <p className="text-xs font-semibold">{seller}</p>
                                <p className="text-[10px] text-slate-500">Performance comercial</p>
                              </div>
                            </div>

                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                              {sellerClients.length} leads
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Score</span>
                              <span>{sellerScore}</span>
                            </div>

                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-white" style={{ width: `${sellerScore}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Centro de Comando Comercial</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Prioridades, alertas executivos e ações rápidas guiadas por dados.
                      </p>
                    </div>

                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
                      Operação assistida
                    </span>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-200">Fila de prioridade</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">Leads com maior urgência comercial agora</p>
                        </div>

                        <div className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                          {clients.filter((client) => getPriority(client) === "Alta").length} críticos
                        </div>
                      </div>

                      <div className="space-y-2">
                        {[...clients]
                          .sort((a, b) => getLeadScore(b) - getLeadScore(a))
                          .slice(0, 3)
                          .map((client, index) => (
                            <button
                              key={client.id}
                              onClick={() => {
                                setSelectedId(client.id);
                                setActivePage("clientes");
                              }}
                              className="w-full rounded-xl border border-white/10 bg-white/[0.025] p-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                                    {index + 1}
                                  </div>

                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                                    <p className="truncate text-[10px] text-slate-500">{client.company}</p>
                                  </div>
                                </div>

                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                                  {client.status}
                                </span>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                                <span>{money(client.value)}</span>
                                <span>Score {getLeadScore(client)}/100</span>
                              </div>

                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-white" style={{ width: `${getLeadScore(client)}%` }} />
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <button
                        onClick={() => applySmartFilter("proposal")}
                        className="rounded-xl border border-amber-400/10 bg-amber-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/20 hover:bg-amber-500/[0.08]"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <Target size={15} className="text-amber-300" />
                          <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-100">Foco</span>
                        </div>
                        <p className="text-xs font-semibold text-amber-100">Atacar propostas quentes</p>
                        <p className="mt-1 text-[10px] text-amber-100/60">Filtra oportunidades com maior chance de fechamento.</p>
                      </button>

                      <button
                        onClick={() => applySmartFilter("risk")}
                        className="rounded-xl border border-rose-400/10 bg-rose-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300/20 hover:bg-rose-500/[0.08]"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <AlertTriangle size={15} className="text-rose-300" />
                          <span className="rounded-full bg-rose-300/10 px-2 py-0.5 text-[9px] text-rose-100">Risco</span>
                        </div>
                        <p className="text-xs font-semibold text-rose-100">Recuperar carteira parada</p>
                        <p className="mt-1 text-[10px] text-rose-100/60">Mostra clientes críticos antes que esfriem.</p>
                      </button>

                      <button
                        onClick={() => setCreating({ ...emptyClient })}
                        className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/20 hover:bg-emerald-500/[0.08]"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <Plus size={15} className="text-emerald-300" />
                          <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-100">Novo</span>
                        </div>
                        <p className="text-xs font-semibold text-emerald-100">Adicionar oportunidade</p>
                        <p className="mt-1 text-[10px] text-emerald-100/60">Cria um novo lead sem sair do fluxo comercial.</p>
                      </button>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-200">Leitura executiva do dia</p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              Priorize propostas quentes, reative clientes silenciosos e mantenha follow-ups de hoje no topo.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                              {analytics.todayFollowUps} follow-ups
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                              {clients.filter((client) => client.lastContactDays >= 7).length} silenciosos
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                              {analytics.hotCount} quentes
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePage === "dashboard" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Resumo executivo</p>
                    <span className="text-[11px] text-slate-500">Leitura consolidada</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                      <p className="text-[11px] text-slate-400">Próximas ações</p>
                      <p className="mt-2 text-sm font-semibold">{analytics.todayFollowUps} follow-ups hoje</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                      <p className="text-[11px] text-slate-400">Clientes quentes</p>
                      <p className="mt-2 text-sm font-semibold">{analytics.hotCount} oportunidades</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                      <p className="text-[11px] text-slate-400">Score médio</p>
                      <p className="mt-2 text-sm font-semibold">{analytics.averageScore}/100</p>
                    </div>
                  </div>
                </div>
              )}

              {activePage === "kanban" && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Resumo operacional do Kanban</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Gargalos, oportunidades, saúde das colunas e próxima ação do pipeline.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Maior gargalo</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          {clients.filter((client) => client.status === "Contato").length >= clients.filter((client) => client.status === "Proposta").length
                            ? "Contato"
                            : "Proposta"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Alta prioridade</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          {clients.filter((client) => getLeadScore(client) >= 80).length} leads
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Ação sugerida</p>
                        <p className="mt-0.5 text-xs font-semibold">
                          Follow-up hoje
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-emerald-200/70">
                          Previsão receita
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-emerald-100">
                          {money(
                            clients
                              .filter(
                                (client) =>
                                  client.status === "Proposta" ||
                                  client.status === "Fechado"
                              )
                              .reduce((sum, client) => sum + client.value, 0)
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl border border-sky-400/10 bg-sky-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-sky-200/70">
                          Conversão
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-sky-100">
                          {Math.max(
                            1,
                            Math.round(
                              (clients.filter((client) => client.status === "Fechado").length /
                                Math.max(clients.length, 1)) *
                                100
                            )
                          )}%
                        </p>
                      </div>

                      <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] px-3 py-2">
                        <p className="text-[10px] text-violet-200/70">
                          Meta pipeline
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-violet-100">
                          78%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePage === "kanban" && (
                <div className="grid gap-3 lg:grid-cols-3">
                  {["Ana", "Marco", "Bia"].map((seller) => {
                    const sellerClients = clients.filter(
                      (client) => leadOwner(client) === seller
                    );

                    const sellerValue = sellerClients.reduce(
                      (sum, client) => sum + client.value,
                      0
                    );

                    return (
                      <div
                        key={seller}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                              {initials(seller)}
                            </div>

                            <div>
                              <p className="text-xs font-semibold">{seller}</p>
                              <p className="text-[10px] text-slate-500">
                                Operador comercial
                              </p>
                            </div>
                          </div>

                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                            {sellerClients.length} leads
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Pipeline
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {money(sellerValue)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">
                              Score médio
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {sellerClients.length > 0
                                ? Math.round(
                                    sellerClients.reduce(
                                      (sum, client) =>
                                        sum + getLeadScore(client),
                                      0
                                    ) / sellerClients.length
                                  )
                                : 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activePage === "kanban" && (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">Pipeline Kanban Enterprise</p>

                          <span className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-cyan-100">
                            visão executiva
                          </span>
                        </div>

                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {kanbanClients.length} leads na visão atual • {kanbanOwnerFilter === "Todos" ? "todos os vendedores" : `vendedor ${kanbanOwnerFilter}`}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
                          <p className="text-[8px] uppercase tracking-[0.16em] text-slate-600">Pipeline</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-100">{money(kanbanEnterpriseStats.totalValue)}</p>
                        </div>

                        <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.05] px-2.5 py-2">
                          <p className="text-[8px] uppercase tracking-[0.16em] text-violet-200/50">Forecast</p>
                          <p className="mt-1 text-[11px] font-semibold text-violet-100">{money(kanbanEnterpriseStats.forecastValue)}</p>
                        </div>

                        <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2.5 py-2">
                          <p className="text-[8px] uppercase tracking-[0.16em] text-emerald-200/50">Conversão</p>
                          <p className="mt-1 text-[11px] font-semibold text-emerald-100">{kanbanEnterpriseStats.conversionRate}%</p>
                        </div>

                        <div className="rounded-xl border border-rose-400/10 bg-rose-500/[0.05] px-2.5 py-2">
                          <p className="text-[8px] uppercase tracking-[0.16em] text-rose-200/50">Risco alto</p>
                          <p className="mt-1 text-[11px] font-semibold text-rose-100">{kanbanEnterpriseStats.highRiskCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center justify-between text-[9px] text-slate-500">
                          <span>Score médio</span>
                          <span className="text-slate-300">{kanbanEnterpriseStats.averageScore}/100</span>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${kanbanEnterpriseStats.averageScore}%` }} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center justify-between text-[9px] text-slate-500">
                          <span>Pipeline ativo</span>
                          <span className="text-slate-300">{kanbanEnterpriseStats.activePipeline} leads</span>
                        </div>

                        <p className="mt-1 truncate text-[10px] text-slate-400">
                          Leads ainda em negociação antes de fechamento ou perda.
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center justify-between text-[9px] text-slate-500">
                          <span>Follow-ups hoje</span>
                          <span className="text-slate-300">{kanbanEnterpriseStats.todayFollowUps}</span>
                        </div>

                        <p className="mt-1 truncate text-[10px] text-slate-400">
                          Ações que precisam de atenção imediata.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {statusList.map((status) => (
                  <div
                    key={status}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverStatus(status);
                    }}
                    onDragLeave={() => setDragOverStatus(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id = Number(event.dataTransfer.getData("clientId"));
                      if (id) changeStatus(id, status);
                      setDragOverStatus(null);
                      setIsDraggingKanban(false);
                    }}
                    className={`min-w-0 rounded-2xl border p-3 transition-all duration-300 hover:shadow-[0_16px_45px_rgba(0,0,0,0.25)] ${
                      dragOverStatus === status
                        ? "scale-[1.01] border-cyan-400/50 bg-cyan-500/[0.08] shadow-[0_0_35px_rgba(34,211,238,0.18)]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className={`mb-3 overflow-hidden rounded-xl border ${kanbanHeaderClass(status)}`}>
                      <div className="flex min-w-0 items-start justify-between gap-2 px-2 py-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className={`h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.25)] ${status === "Novo" ? "bg-sky-300" : status === "Contato" ? "bg-violet-300" : status === "Proposta" ? "bg-amber-300" : status === "Fechado" ? "bg-emerald-300" : "bg-rose-300"}`} />

                            <p className="truncate text-xs font-semibold">{status}</p>
                          </div>

                          <p className="mt-1 truncate text-[9px] text-slate-400">
                            {dragOverStatus === status && isDraggingKanban ? "Solte aqui" : stageGuidance(status)}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="inline-flex min-w-5 justify-center rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-300">
                            {kanbanClients.filter((client) => client.status === status).length}
                          </span>

                          <p className="mt-1 max-w-[92px] truncate text-[8px] font-medium text-slate-300">
                            {money(
                              kanbanClients
                                .filter((client) => client.status === status)
                                .reduce((sum, client) => sum + client.value, 0)
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-white/10 bg-black/10 px-2 py-1.5">
                        <div className="flex items-center justify-between text-[8px]">
                          <span className="text-slate-500">Saúde</span>
                          <span className="text-slate-300">
                            {kanbanClients.filter((client) => client.status === status && getRisk(client) === "Alto").length === 0 ? "Saudável" : "Revisar"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10 text-center">
                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Score</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {Math.round(
                              kanbanClients
                                .filter((client) => client.status === status)
                                .reduce((sum, client) => sum + getLeadScore(client), 0) /
                                Math.max(1, kanbanClients.filter((client) => client.status === status).length)
                            )}
                          </p>
                        </div>

                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Risco</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {kanbanClients.filter((client) => client.status === status && getRisk(client) === "Alto").length}
                          </p>
                        </div>

                        <div className="bg-black/20 px-1.5 py-1.5">
                          <p className="text-[7px] text-slate-500">Hoje</p>
                          <p className="mt-0.5 text-[9px] font-semibold text-slate-200">
                            {kanbanClients.filter((client) => client.status === status && client.nextFollowUp.toLowerCase() === "hoje").length}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between text-[8px] text-slate-500">
                        <span>Intensidade</span>

                        <span>
                          {Math.min(
                            100,
                            kanbanClients.filter((client) => client.status === status).length * 18
                          )}%
                        </span>
                      </div>

                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
                            status === "Novo"
                              ? "bg-sky-300"
                              : status === "Contato"
                                ? "bg-violet-300"
                                : status === "Proposta"
                                  ? "bg-amber-300"
                                  : status === "Fechado"
                                    ? "bg-emerald-300"
                                    : "bg-rose-300"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              kanbanClients.filter((client) => client.status === status).length * 18
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {kanbanClients.filter((client) => client.status === status).length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-3 text-center">
                          <p className="text-[11px] font-semibold text-slate-400">
                            Etapa vazia
                          </p>

                          <p className="mt-1 text-[9px] text-slate-600">
                            Arraste um card para esta etapa
                          </p>
                        </div>
                      )}

                      {kanbanClients.filter((client) => client.status === status).map((client) => (
                        <div
                          key={client.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("clientId", String(client.id));
                            setIsDraggingKanban(true);
                          }}
                          onDragEnd={() => {
                            setDragOverStatus(null);
                            setIsDraggingKanban(false);
                          }}
                          onClick={() => setSelectedId(client.id)}
                          className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_38px_rgba(0,0,0,0.38)] ${
                            selectedId === client.id
                              ? "scale-[1.015] border-cyan-300/50 bg-cyan-500/[0.10] shadow-[0_0_24px_rgba(34,211,238,0.10)]"
                              : `${smartCardBorderClass(client)} hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.06] hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]`
                          }`}
                        >
                          <div
                            className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${
                              client.hot && getLeadScore(client) >= 80
                                ? "bg-gradient-to-r from-transparent via-rose-300/70 to-transparent"
                                : getRisk(client) === "Alto"
                                  ? "bg-gradient-to-r from-transparent via-amber-300/60 to-transparent"
                                  : "bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            }`}
                          />

                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[9px] font-bold text-white">
                                {initials(client.name)}
                              </div>

                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1">
                                  <p className="truncate text-xs font-medium">{client.name}</p>

                                  {client.notes.length > 0 && (
                                    <span className="shrink-0 rounded-full bg-white/10 px-1 py-0.5 text-[8px] text-slate-300">
                                      {client.notes.length}
                                    </span>
                                  )}
                                </div>

                                <p className="mt-1 truncate text-[10px] text-slate-500">
                                  {client.company}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              {client.hot && (
                                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.85)]" />
                                </span>
                              )}

                              <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] text-slate-400">
                                {getLeadScore(client)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="min-w-0 truncate text-[10px] font-semibold text-slate-300">
                                {money(client.value)}
                              </p>

                              {selectedId === client.id && (
                                <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] text-cyan-200">
                                  Ativo
                                </span>
                              )}
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${
                                getLeadScore(client) >= 80
                                  ? "bg-emerald-500/10 text-emerald-200"
                                  : getLeadScore(client) >= 60
                                    ? "bg-amber-500/10 text-amber-200"
                                    : "bg-rose-500/10 text-rose-200"
                              }`}
                            >
                              {forecastLabel(client)}
                            </span>
                          </div>

                          <div className="mt-2.5 rounded-xl border border-white/5 bg-black/20 p-2">
                            <div className="mb-1 flex items-center justify-between text-[8px] text-slate-500">
                              <span>Intensidade</span>
                              <span>{actionIntensity(client)}%</span>
                            </div>

                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full ${
                                  actionIntensity(client) >= 85
                                    ? "bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.70)]"
                                    : actionIntensity(client) >= 65
                                      ? "bg-amber-300"
                                      : "bg-slate-400"
                                }`}
                                style={{ width: `${actionIntensity(client)}%` }}
                              />
                            </div>

                            <div className="mt-1 flex items-center justify-between text-[8px]">
                              <span className="text-slate-500">Próxima ação</span>
                              <span className="font-medium text-slate-300">{client.nextFollowUp}</span>
                            </div>
                          </div>

                          <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-300" />

                                <span className="text-[8px] text-slate-400">
                                  Última atividade
                                </span>
                              </div>

                              <span className="text-[8px] text-slate-500">
                                {idleLabel(client)}
                              </span>
                            </div>

                            <p className="mt-1 truncate text-[9px] text-slate-300">
                              {activitySignalLabel(client)} • {forecastLabel(client)}
                            </p>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[8px] ${
                                client.lastContactDays >= 7
                                  ? "bg-rose-500/10 text-rose-200"
                                  : client.lastContactDays >= 3
                                    ? "bg-amber-500/10 text-amber-200"
                                    : "bg-emerald-500/10 text-emerald-200"
                              }`}
                            >
                              SLA {slaLabel(client)}
                            </span>

                            <span
                              className={`truncate rounded-full px-1.5 py-0.5 text-[8px] ${
                                client.hot && getLeadScore(client) >= 80
                                  ? "bg-rose-500/10 text-rose-100"
                                  : getLeadScore(client) >= 60
                                    ? "bg-violet-500/10 text-violet-100"
                                    : "bg-white/5 text-slate-400"
                              }`}
                            >
                              {priorityLabel(client)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                  </div>
                </div>
              )}

              {activePage === "automacoes" && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10">
                            <Zap size={15} className="text-violet-200" />
                          </div>

                          <div>
                            <p className="text-sm font-semibold">Central de Automações</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              Regras comerciais preparadas para backend real.
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400">
                          Configure jornadas, lembretes e mensagens inteligentes para acelerar o atendimento sem perder o controle manual do vendedor.
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.06] px-3 py-2">
                        <p className="text-[10px] text-emerald-200/70">Status operacional</p>
                        <p className="mt-0.5 text-xs font-semibold text-emerald-100">Pronto para integração</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[
                        { title: "Follow-up automático", desc: "Lembretes por etapa, prioridade e tempo parado.", badge: "Ativo", icon: <Bell size={14} className="text-sky-300" /> },
                        { title: "Lead quente", desc: "Sinaliza oportunidades com score alto e valor relevante.", badge: "IA", icon: <Flame size={14} className="text-rose-300" /> },
                        { title: "Mensagens rápidas", desc: "Modelos comerciais para WhatsApp e retomada.", badge: "Template", icon: <MessageCircle size={14} className="text-emerald-300" /> },
                      ].map((item) => (
                        <div
                          key={item.title}
                          className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                                {item.icon}
                              </div>

                              <p className="text-xs font-semibold">{item.title}</p>
                            </div>

                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">
                              {item.badge}
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] leading-4 text-slate-500">{item.desc}</p>

                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-white/60" style={{ width: item.badge === "IA" ? "84%" : item.badge === "Ativo" ? "72%" : "64%" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">Jornadas comerciais</p>
                        <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-slate-300">4 regras</span>
                      </div>

                      <div className="space-y-2">
                        {[
                          { title: "Novo lead recebido", desc: "Criar tarefa de primeiro contato em até 15 minutos.", status: "Ligado" },
                          { title: "Proposta sem resposta", desc: "Sugerir retomada após 2 dias sem atividade.", status: "Ligado" },
                          { title: "Cliente em risco", desc: "Alertar vendedor quando passar de 7 dias sem contato.", status: "Ligado" },
                          { title: "Lead perdido", desc: "Agendar reativação comercial em 30 dias.", status: "Rascunho" },
                        ].map((rule) => (
                          <div key={rule.title} className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-slate-100">{rule.title}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{rule.desc}</p>
                              </div>

                              <span className={`rounded-full px-2 py-0.5 text-[9px] ${rule.status === "Ligado" ? "bg-emerald-500/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>
                                {rule.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">Leitura IA</p>
                        <Sparkles size={15} className="text-violet-300" />
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.06] p-3">
                          <p className="text-xs font-semibold text-violet-100">Sugestão principal</p>
                          <p className="mt-1 text-[11px] leading-4 text-violet-100/70">
                            Priorizar propostas quentes e leads com follow-up hoje antes de criar novas campanhas.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[10px] text-slate-500">Economia estimada</p>
                            <p className="mt-1 text-sm font-semibold">3h/semana</p>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[10px] text-slate-500">Impacto comercial</p>
                            <p className="mt-1 text-sm font-semibold">Alto</p>
                          </div>
                        </div>

                        <button className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
                          Preparar próxima automação
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(activePage === "dashboard" || activePage === "clientes") && (
               <aside className="w-[340px] shrink-0 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Central do cliente</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">Atendimento, sinais comerciais e próxima ação.</p>
                  </div>
                  {selectedClient && (
                    <button onClick={() => setSelectedId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {selectedClient ? (
                  <div>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
                      <div className="border-b border-white/10 bg-white/[0.025] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[11px] font-bold text-black">
                                {initials(selectedClient.name)}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{selectedClient.name}</p>
                                <p className="truncate text-[11px] text-slate-400">{selectedClient.company}</p>
                              </div>
                            </div>
                          </div>

                          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(selectedClient.status)}`}>{selectedClient.status}</span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">Valor</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-200">{money(selectedClient.value)}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">Fit</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-200">{customerFitLabel(selectedClient)}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">Dono</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-200">{leadOwner(selectedClient)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.045] p-3">
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-violet-100">Diagnóstico comercial</span>
                            <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">prioridade</span>
                          </div>

                          <p className="text-[10px] leading-relaxed text-violet-100/65">
                            {nextActionLabel(selectedClient)}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <button
                            onClick={() => copyText(selectedClient.phone, "Telefone copiado.")}
                            className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
                          >
                            <Phone size={13} className="mb-1 text-emerald-300" />
                            <p className="text-[9px] font-semibold text-slate-300">Telefone</p>
                          </button>

                          <button
                            onClick={() => copyText(whatsappMessage(selectedClient), "Mensagem copiada.")}
                            className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
                          >
                            <Copy size={13} className="mb-1 text-sky-300" />
                            <p className="text-[9px] font-semibold text-slate-300">Mensagem</p>
                          </button>

                          <a
                            href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5 text-left transition hover:border-emerald-400/20 hover:bg-emerald-500/[0.08]"
                          >
                            <MessageCircle size={13} className="mb-1 text-emerald-300" />
                            <p className="text-[9px] font-semibold text-emerald-100">WhatsApp</p>
                          </a>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Score inteligente</span>
                            <span>{getLeadScore(selectedClient)}/100</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.35)]" style={{ width: `${getLeadScore(selectedClient)}%` }} />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                            <p className="text-[10px] text-slate-500">Origem</p>
                            <p className="mt-0.5 font-semibold text-slate-200">{selectedClient.source}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                            <p className="text-[10px] text-slate-500">Follow-up</p>
                            <p className="mt-0.5 font-semibold text-slate-200">{selectedClient.nextFollowUp}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                            <p className="text-[10px] text-slate-500">Risco</p>
                            <p className="mt-0.5 font-semibold text-slate-200">{getRisk(selectedClient)}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                            <p className="text-[10px] text-slate-500">SLA</p>
                            <p className="mt-0.5 font-semibold text-slate-200">{slaLabel(selectedClient)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {selectedClient.tags.map((tag) => (
                            <button key={tag} onClick={() => removeTagFromSelected(tag)} className={`rounded-full border px-2 py-1 text-[10px] ${tagClass(tag)}`}>{tag} ×</button>
                          ))}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="Nova tag..." className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500" />
                          <button onClick={addTagToSelected} className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black">Tag</button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => setEditing(selectedClient)} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"><Edit3 size={12} />Editar</button>
                          <button onClick={() => copyText(selectedClient.phone, "Telefone copiado.")} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"><Phone size={12} />Telefone</button>
                          <button onClick={() => copyText(`${selectedClient.name} | ${selectedClient.company} | ${money(selectedClient.value)} | ${selectedClient.status}`, "Resumo copiado.")} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"><Copy size={12} />Resumo</button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]">
                      <div className="border-b border-white/10 bg-white/[0.025] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
                              <StickyNote size={14} />
                            </div>

                            <div>
                              <p className="text-xs font-semibold">Histórico comercial</p>
                              <p className="mt-0.5 text-[10px] text-slate-500">Interações, SLA e cadência</p>
                            </div>
                          </div>

                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                            {selectedClient.notes.length} registros
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">Contato</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-200">{idleLabel(selectedClient)}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">SLA</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-200">{slaLabel(selectedClient)}</p>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="text-[10px] text-slate-500">Próxima</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-200">{selectedClient.nextFollowUp}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="flex gap-2">
                          <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Registrar nova interação..." className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500" />
                          <button onClick={addNote} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black"><Plus size={12} />Add</button>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="relative rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-3">
                            <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.55)]" />
                            <div className="pl-5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-emerald-100">Próxima ação recomendada</p>
                                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-100">ação</span>
                              </div>
                              <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/65">
                                {getLeadScore(selectedClient) >= 80
                                  ? "Priorizar contato hoje e conduzir para fechamento."
                                  : getRisk(selectedClient) === "Alto"
                                    ? "Reativar com mensagem objetiva antes de mover para perdido."
                                    : "Manter cadência de follow-up e registrar resposta do cliente."}
                              </p>
                            </div>
                          </div>

                          {selectedClient.notes.length === 0 && (
                            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                              <p className="text-[11px] text-slate-500">Nenhuma nota adicionada ainda.</p>
                              <p className="mt-1 text-[10px] text-slate-600">Use a timeline para registrar ligações, propostas, objeções e próximos passos.</p>
                            </div>
                          )}

                          {selectedClient.notes.map((note, index) => (
                            <div key={note.id} className="relative rounded-xl border border-white/10 bg-white/[0.035] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.055]">
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] ${index === 0 ? "border-sky-300/20 bg-sky-500/10 text-sky-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                                  {index === 0 ? <Sparkles size={12} /> : <StickyNote size={12} />}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold text-slate-200">{index === 0 ? "Última interação" : "Registro comercial"}</p>
                                    <span className="shrink-0 text-[9px] text-slate-600">{note.date}</span>
                                  </div>

                                  <p className="text-[11px] leading-relaxed text-slate-400">{note.text}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Selecione um cliente na tabela ou no Kanban.</p>
                )}
              </div>
              </aside>
            )}

            {activePage === "kanban" && (
              <aside className="w-[340px] shrink-0 space-y-4">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                  <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-200">
                          <Sparkles size={15} />
                        </div>

                        <div>
                          <p className="text-sm font-semibold">Inteligência do pipeline</p>
                          <p className="text-[10px] text-slate-500">Leitura comercial</p>
                        </div>
                      </div>

                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-200">
                        Online
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-slate-400">
                      O painel cruza score, valor, risco e tempo sem contato para indicar onde agir primeiro.
                    </p>
                  </div>

                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <p className="text-[9px] text-slate-500">Pressão</p>
                        <p className="mt-1 text-xs font-semibold">
                          {clients.filter((client) => getRisk(client) !== "Baixo").length} leads
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <p className="text-[9px] text-slate-500">Hoje</p>
                        <p className="mt-1 text-xs font-semibold">{analytics.todayFollowUps}</p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <p className="text-[9px] text-slate-500">Score</p>
                        <p className="mt-1 text-xs font-semibold">{analytics.averageScore}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => applySmartFilter("proposal")}
                        className="group w-full rounded-xl border border-amber-300/10 bg-amber-500/[0.06] p-3 text-left transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-500/[0.1]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-amber-100">Prioridade agora</p>
                          <Target size={13} className="text-amber-200" />
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-amber-100/60">
                          Revisar propostas quentes e acelerar fechamento antes de perder timing.
                        </p>
                      </button>

                      <button
                        onClick={() => applySmartFilter("silent")}
                        className="group w-full rounded-xl border border-rose-300/10 bg-rose-500/[0.06] p-3 text-left transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-500/[0.1]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-rose-100">Risco silencioso</p>
                          <AlertTriangle size={13} className="text-rose-200" />
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-rose-100/60">
                          Clientes parados há muitos dias precisam de ação para não esfriar.
                        </p>
                      </button>

                      <button
                        onClick={() => applySmartFilter("risk")}
                        className="group w-full rounded-xl border border-sky-300/10 bg-sky-500/[0.06] p-3 text-left transition-all duration-200 hover:border-sky-300/20 hover:bg-sky-500/[0.1]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-sky-100">Limpeza inteligente</p>
                          <Activity size={13} className="text-sky-200" />
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-sky-100/60">
                          Separar leads em risco alto para decidir reativação, pausa ou descarte.
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                {selectedClient && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Lead em foco</p>
                        <p className="text-[10px] text-slate-500">Próxima ação recomendada</p>
                      </div>

                      <span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                        {selectedClient.status}
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{selectedClient.name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-slate-500">{selectedClient.company}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Valor</p>
                          <p className="text-xs font-semibold">{money(selectedClient.value)}</p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span>Força comercial</span>
                          <span>{getLeadScore(selectedClient)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.35)]" style={{ width: `${getLeadScore(selectedClient)}%` }} />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-slate-500">Prioridade</p>
                          <p className="mt-0.5 font-semibold text-slate-200">{priorityLabel(selectedClient)}</p>
                        </div>

                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-slate-500">SLA</p>
                          <p className="mt-0.5 font-semibold text-slate-200">{slaLabel(selectedClient)}</p>
                        </div>
                      </div>

                      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-[10px] leading-relaxed text-slate-400">
                        Sugestão: enviar mensagem curta pelo WhatsApp, confirmar interesse e registrar a resposta na timeline.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-black"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>

                        <button onClick={() => setEditing(selectedClient)} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10">
                          <Edit3 size={12} /> Editar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
                  <div className="flex items-center gap-2">
                    <KanbanSquare size={15} className="text-slate-400" />
                    <p className="text-sm font-semibold">Pipeline visual</p>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
                      <p className="text-[11px] text-slate-200">Dica rápida</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Arraste clientes entre colunas para atualizar rapidamente o funil comercial.
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/5 p-2 transition-all duration-200 hover:bg-white/10">
                      <p className="text-[11px] text-slate-200">Fluxo recomendado</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Novo → Contato → Proposta → Fechado.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </section>
        </main>
      </div>

      {editing && (
        <ClientModal title="Editar cliente" client={editing} setClient={setEditing} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => deleteClient(editing.id)} saveLabel="Salvar alterações" showDelete />
      )}

      {creating && (
        <ClientModal title="Novo cliente" client={creating} setClient={setCreating} onClose={() => setCreating(null)} onSave={createClient} saveLabel="Criar cliente" />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]/95 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10">
              <CheckCircle2 size={16} className="text-emerald-300" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-100">Ação concluída</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{toast}</p>
            </div>

            <button
              onClick={() => setToast("")}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <X size={13} />
            </button>
          </div>

          <div className="h-0.5 w-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-emerald-300/70" />
          </div>
        </div>
      )}
    </div>
  );
}


function ClientModal({
  title,
  client,
  setClient,
  onClose,
  onSave,
  onDelete,
  saveLabel,
  showDelete = false,
}: {
  title: string;
  client: Client;
  setClient: React.Dispatch<React.SetStateAction<Client | null>>;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  saveLabel: string;
  showDelete?: boolean;
}) {
  const fieldBaseClass =
    "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-white/20 hover:bg-white/10 focus:border-white/25 focus:bg-white/[0.08]";

  const fieldLabelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d111a] p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Preencha os dados principais para manter o pipeline limpo e organizado.
            </p>
          </div>

          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
            <X size={15} />
          </button>
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>Nome do cliente</label>
            <input
              value={client.name}
              onChange={(event) => setClient({ ...client, name: event.target.value })}
              placeholder="Ex: Mariana Costa"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Empresa</label>
            <input
              value={client.company}
              onChange={(event) => setClient({ ...client, company: event.target.value })}
              placeholder="Ex: Alpha Digital"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Telefone / WhatsApp</label>
            <input
              value={client.phone}
              onChange={(event) => setClient({ ...client, phone: event.target.value })}
              placeholder="Ex: 5535999990000"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Email</label>
            <input
              value={client.email}
              onChange={(event) => setClient({ ...client, email: event.target.value })}
              placeholder="Ex: cliente@email.com"
              className={`${fieldBaseClass} select-text`}
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>Valor estimado</label>
            <input
              type="number"
              value={client.value}
              onChange={(event) => setClient({ ...client, value: Number(event.target.value) })}
              placeholder="Ex: 12000"
              className={`${fieldBaseClass} select-text`}
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Use apenas números. Exemplo: 12000.
            </p>
          </div>

          <div>
            <label className={fieldLabelClass}>Origem do lead</label>
            <input
              value={client.source}
              onChange={(event) => setClient({ ...client, source: event.target.value })}
              placeholder="Ex: Instagram, Site, WhatsApp"
              className={`${fieldBaseClass} select-text`}
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Antes aparecia como “Manual”; agora fica claro que é a origem.
            </p>
          </div>

          <div>
            <label className={fieldLabelClass}>Próximo follow-up</label>
            <input
              value={client.nextFollowUp}
              onChange={(event) => setClient({ ...client, nextFollowUp: event.target.value })}
              placeholder="Ex: Hoje, Amanhã, 30 dias"
              className={`${fieldBaseClass} select-text`}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Status do pipeline</label>
            <select
              value={client.status}
              onChange={(event) => setClient({ ...client, status: event.target.value as Status })}
              className={`${fieldBaseClass} bg-[#0d111a]`}
            >
              {statusList.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabelClass}>Tags comerciais</label>
            <input
              value={client.tags.join(", ")}
              onChange={(event) =>
                setClient({
                  ...client,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Ex: Quente, Alto valor, Urgente"
              className={`${fieldBaseClass} select-text`}
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Separe por vírgula para criar múltiplas tags.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-between gap-2">
          {showDelete && onDelete ? (
            <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              <Trash2 size={14} />
              Excluir
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
              Cancelar
            </button>

            <button onClick={onSave} className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:scale-[1.01] hover:bg-slate-100">
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
