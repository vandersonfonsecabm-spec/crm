import { useMemo } from "react";
import { getLeadScore, getPriority, getRisk } from "../utils/dashboardHelpers";
import type { Client, SortBy, Status } from "../types/dashboard";

type UseDashboardAnalyticsParams = {
  clients: Client[];
  kanbanClients: Client[];
  search: string;
  statusFilter: Status | "Todos";
  onlyFavorites: boolean;
  onlyHot: boolean;
  onlyRisk: boolean;
  onlySilent: boolean;
  sortBy: SortBy;
};

export default function useDashboardAnalytics({
  clients,
  kanbanClients,
  search,
  statusFilter,
  onlyFavorites,
  onlyHot,
  onlyRisk,
  onlySilent,
  sortBy,
}: UseDashboardAnalyticsParams) {
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

  return {
    analytics,
    kanbanEnterpriseStats,
    recentActivities,
    followUpAgenda,
    smartAlerts,
    activeFiltersCount,
  };
}
