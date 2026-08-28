import { useMemo } from "react";
import type { ApiDashboardSummary } from "../services/crmApi";
import { getLeadScore, getPriority, getRisk } from "../utils/dashboardHelpers";
import { classifyNextFollowUp } from "../utils/followUpProjection";
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
  summary: ApiDashboardSummary | null;
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
  summary,
}: UseDashboardAnalyticsParams) {
  const kanbanEnterpriseStats = useMemo(() => {
    if (summary) {
      return {
        totalValue: summary.analytics.totalValue,
        forecastValue: summary.analytics.forecastValue,
        wonValue: summary.analytics.wonValue,
        averageScore: summary.analytics.averageScore,
        highRiskCount: summary.analytics.highRiskCount,
        todayFollowUps: summary.analytics.todayFollowUps,
        activePipeline: summary.analytics.activePipeline,
        conversionRate: summary.analytics.conversionRate,
      };
    }
    const totalValue = kanbanClients.reduce((sum, client) => sum + client.value, 0);
    const forecastValue = kanbanClients
      .filter((client) => client.status === "Novo" || client.status === "Proposta")
      .reduce((sum, client) => sum + client.value, 0);
    const wonValue = kanbanClients
      .filter((client) => client.status === "Fechado")
      .reduce((sum, client) => sum + client.value, 0);
    const averageScore = Math.round(
      kanbanClients.reduce((sum, client) => sum + getLeadScore(client), 0) / Math.max(1, kanbanClients.length)
    );
    const highRiskCount = kanbanClients.filter((client) => getRisk(client) === "Alto").length;
    const todayFollowUps = kanbanClients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TODAY").length;
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
  }, [kanbanClients, summary]);

  const analytics = useMemo(() => {
    if (summary) {
      return {
        totalValue: summary.analytics.totalValue,
        wonValue: summary.analytics.wonValue,
        forecastValue: summary.analytics.forecastValue,
        hotCount: summary.analytics.hotCount,
        averageScore: summary.analytics.averageScore,
        todayFollowUps: summary.analytics.todayFollowUps,
      };
    }
    const totalValue = clients.reduce((sum, client) => sum + client.value, 0);
    const wonValue = clients.filter((client) => client.status === "Fechado").reduce((sum, client) => sum + client.value, 0);
    const forecastValue = clients
      .filter((client) => client.status === "Proposta" || client.status === "Novo")
      .reduce((sum, client) => sum + client.value, 0);
    const hotCount = clients.filter((client) => client.hot || getPriority(client) === "Alta").length;
    const averageScore = Math.round(clients.reduce((sum, client) => sum + getLeadScore(client), 0) / Math.max(1, clients.length));
    const todayFollowUps = clients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TODAY").length;

    return { totalValue, wonValue, forecastValue, hotCount, averageScore, todayFollowUps };
  }, [clients, summary]);

  const recentActivities = useMemo(() => {
    if (summary) {
      return summary.atividadesRecentes.map((activity) => ({
        id: `note-${activity.id}`,
        client: activity.cliente,
        text: activity.texto,
        date: new Date(activity.createdAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      }));
    }
    return clients
      .flatMap((client) =>
        client.notes.map((note) => ({
          activity: {
            id: `${client.id}-${note.id}`,
            client: client.name,
            text: note.text,
            date: note.date,
          },
          timestamp: note.createdAt ?? 0,
        }))
      )
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 5)
      .map((item) => item.activity);
  }, [clients, summary]);

  const followUpAgenda = useMemo(() => {
    const today = clients.filter((client) => ["TODAY", "OVERDUE"].includes(classifyNextFollowUp(client.nextFollowUp)));
    const tomorrow = clients.filter((client) => classifyNextFollowUp(client.nextFollowUp) === "TOMORROW");
    const later = clients.filter((client) => ["FUTURE", "LEGACY"].includes(classifyNextFollowUp(client.nextFollowUp)));

    return [
      { label: "Hoje", hint: "Ação imediata", clients: today },
      { label: "Amanhã", hint: "Próxima janela", clients: tomorrow },
      { label: "Depois", hint: "Nutrição", clients: later },
    ];
  }, [clients]);

  const smartAlerts = useMemo(() => {
    const highRisk = summary?.analytics.highRiskCount ?? clients.filter((client) => getRisk(client) === "Alto").length;
    const hotProposals = summary?.analytics.hotProposalCount ?? clients.filter((client) => client.hot && client.status === "Proposta").length;
    const silentClients = summary?.analytics.silentCount ?? clients.filter((client) => client.lastContactDays >= 7).length;

    return [
      `${highRisk} clientes em risco alto`,
      `${hotProposals} propostas quentes abertas`,
      `${silentClients} clientes sem contato recente`,
    ];
  }, [clients, summary]);

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
