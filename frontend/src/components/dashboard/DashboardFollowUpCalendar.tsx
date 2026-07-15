import { CalendarClock, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAcompanhamentoResumo, type ApiAcompanhamentoResumo } from "../../services/crmApi";
import type { Client, Status } from "../../types/dashboard";
import { Badge, EmptyState, SectionHeader, Surface } from "../ui";

type FollowUpGroup = { label: string; hint: string; clients: Client[] };

type DashboardFollowUpCalendarProps = {
  todayFollowUps: number;
  followUpAgenda: FollowUpGroup[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardFollowUpCalendar({ todayFollowUps, followUpAgenda, money, statusClass, onSelectClient }: DashboardFollowUpCalendarProps) {
  const [summary, setSummary] = useState<ApiAcompanhamentoResumo | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadSummary() {
      try {
        const data = await fetchAcompanhamentoResumo();
        if (!ignore) setSummary(data);
      } catch {
        if (!ignore) setSummary(null);
      }
    }
    void loadSummary();
    return () => { ignore = true; };
  }, []);

  const allClients = followUpAgenda.flatMap((group) => group.clients.map((client) => ({ ...client, agendaLabel: group.label, agendaHint: group.hint })));
  const criticalClients = allClients
    .sort((a, b) => {
      if (a.nextFollowUp.toLowerCase() === "hoje" && b.nextFollowUp.toLowerCase() !== "hoje") return -1;
      if (a.nextFollowUp.toLowerCase() !== "hoje" && b.nextFollowUp.toLowerCase() === "hoje") return 1;
      if (a.lastContactDays !== b.lastContactDays) return b.lastContactDays - a.lastContactDays;
      return b.value - a.value;
    })
    .slice(0, 5);
  const todayCount = summary?.indicadores.paraHoje ?? todayFollowUps;
  const pendingCount = summary?.indicadores.pendentes ?? allClients.length;
  const criticalCount = summary?.indicadores.criticos ?? criticalClients.length;
  const totalValue = allClients.reduce((sum, client) => sum + client.value, 0);

  return (
    <Surface className="min-w-0 overflow-hidden">
      <SectionHeader
        actions={<Badge variant={todayCount > 0 ? "info" : "neutral"}>{todayCount} hoje</Badge>}
        description="Próximas janelas de contato e compromissos críticos."
        icon={<CalendarClock size={16} />}
        title="Próximos compromissos"
      />

      <div className="grid grid-cols-3 border-b border-[var(--border-default)]">
        {followUpAgenda.map((group, index) => {
          const firstClient = group.clients[0];
          const groupValue = group.clients.reduce((sum, client) => sum + client.value, 0);
          return (
            <button
              className={`min-w-0 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-muted)] disabled:cursor-default disabled:hover:bg-transparent ${index === 0 ? "bg-[var(--surface-subtle)]" : ""} ${index > 0 ? "border-l border-[var(--border-default)]" : ""}`}
              disabled={!firstClient}
              key={group.label}
              onClick={() => firstClient && onSelectClient(firstClient.id)}
              type="button"
            >
              <p className="text-[10px] text-[var(--text-muted)]">{group.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{group.clients.length}</p>
              <p className="truncate text-[10px] text-[var(--text-muted)]">{group.hint} · {money(groupValue)}</p>
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-[var(--border-default)]">
        {criticalClients.length > 0 ? criticalClients.map((client) => (
          <button
            className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)]"
            key={`${client.agendaLabel}-${client.id}`}
            onClick={() => onSelectClient(client.id)}
            type="button"
          >
            <div className="w-14 shrink-0">
              <p className="text-[10px] font-medium text-[var(--primary)]">{client.agendaLabel}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{client.agendaHint}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{client.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{client.company} · {money(client.value)}</p>
            </div>
            <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[9px] sm:inline-flex ${statusClass(client.status)}`}>{client.status}</span>
            <ChevronRight aria-hidden="true" className="shrink-0 text-[var(--icon-muted)]" size={14} />
          </button>
        )) : <EmptyState description="A agenda não possui acompanhamentos críticos neste momento." title="Agenda em dia" />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]">
        <span>{pendingCount} acompanhamentos · {criticalCount} críticos</span>
        <span className="font-medium text-[var(--text-secondary)]">{money(totalValue)} em oportunidades</span>
      </div>
    </Surface>
  );
}
