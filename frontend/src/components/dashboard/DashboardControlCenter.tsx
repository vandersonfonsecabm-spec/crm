import { AlertTriangle, ArrowRight, ArrowUpRight, Plus, RefreshCw, Target } from "lucide-react";
import type { ReactNode } from "react";
import type { Analytics, Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";
import { Badge, EmptyState, SectionHeader, Surface } from "../ui";

type DashboardControlCenterProps = {
  clients: Client[];
  analytics: Analytics;
  backendCaption: string;
  smartAlerts: string[];
  recentActivities: RecentActivity[];
  emptyClient: Client;
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getPriority: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  setSelectedId: (clientId: number | null) => void;
  setCreating: (client: Client | null) => void;
  applySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardControlCenter({ clients, analytics, backendCaption, smartAlerts, recentActivities, emptyClient, money, statusClass, getPriority, getLeadScore, setSelectedId, setCreating, applySmartFilter }: DashboardControlCenterProps) {
  const priorityClients = [...clients]
    .sort((a, b) => {
      if (getPriority(a) !== getPriority(b)) return getPriority(a) === "Alta" ? -1 : 1;
      return getLeadScore(b) - getLeadScore(a);
    })
    .slice(0, 6);
  const highPriorityCount = clients.filter((client) => getPriority(client) === "Alta").length;
  const silentCount = clients.filter((client) => client.lastContactDays >= 7).length;
  const proposalCount = clients.filter((client) => client.status === "Proposta").length;
  const topPriority = priorityClients[0] ?? null;

  return (
    <Surface className="min-w-0 overflow-hidden">
      <SectionHeader
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"><RefreshCw aria-hidden="true" size={12} />{backendCaption}</span>
            <Badge variant={highPriorityCount > 0 ? "warning" : "success"}>{highPriorityCount} em atenção</Badge>
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{proposalCount} propostas</span>
          </div>
        )}
        description="Priorize a fila, resolva sinais críticos e avance a próxima oportunidade."
        status={topPriority ? <span className="text-[11px] text-[var(--text-muted)]">Próxima: <strong className="font-medium text-[var(--text-secondary)]">{topPriority.name}</strong></span> : undefined}
        title="Mesa de ação comercial"
      />

      <div className="grid min-w-0 items-start xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.7fr)]">
        <section className="min-w-0" aria-labelledby="commercial-queue-title">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-2.5">
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)]" id="commercial-queue-title">Fila comercial</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Ordem de abordagem por prioridade e score.</p>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">{priorityClients.length} em foco</span>
          </div>

          {priorityClients.length > 0 ? (
            <div className="divide-y divide-[var(--border-default)]">
              {priorityClients.map((client, index) => {
                const score = getLeadScore(client);
                return (
                  <button
                    aria-label={`Abrir ${client.name}, próxima ação ${client.nextFollowUp}`}
                    className="grid w-full min-w-0 gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] md:grid-cols-[32px_minmax(0,1fr)_132px_112px_16px] md:items-center"
                    key={client.id}
                    onClick={() => setSelectedId(client.id)}
                    type="button"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-subtle)] text-[10px] font-semibold text-[var(--text-secondary)]">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{client.name}</p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${statusClass(client.status)}`}>{client.status}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{client.company} · Prioridade {getPriority(client)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-[var(--text-muted)]">Próxima ação</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-secondary)]">{client.nextFollowUp}</p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)]">{money(client.value)}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Score {score}</p>
                    </div>
                    <ArrowRight aria-hidden="true" className="hidden text-[var(--icon-muted)] md:block" size={14} />
                  </button>
                );
              })}
            </div>
          ) : <EmptyState description="Nenhum cliente corresponde à fila comercial atual." title="Fila comercial vazia" />}
        </section>

        <aside className="min-w-0 border-t border-[var(--border-default)] bg-[var(--bg-muted)] xl:border-l xl:border-t-0">
          <section className="p-4" aria-labelledby="critical-signals-title">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]" id="critical-signals-title">Sinais críticos</h3>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Atalhos para filas que exigem atenção.</p>
              </div>
              <AlertTriangle className="text-[var(--warning)]" size={15} />
            </div>
            <div className="mt-3 divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
              {smartAlerts.map((alert, index) => (
                <button
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  key={alert}
                  onClick={() => applySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                  type="button"
                >
                  <span className="line-clamp-2">{alert}</span>
                  <ArrowUpRight aria-hidden="true" className="shrink-0 text-[var(--icon-muted)]" size={13} />
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-[var(--border-default)] p-4" aria-labelledby="quick-actions-title">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]" id="quick-actions-title">Ações rápidas</h3>
            <div className="mt-2 grid gap-1.5">
              <QuickCommand icon={<Target size={14} />} label={`Atacar propostas · ${proposalCount}`} onClick={() => applySmartFilter("proposal")} />
              <QuickCommand icon={<AlertTriangle size={14} />} label={`Reativar silenciosos · ${silentCount}`} onClick={() => applySmartFilter("silent")} />
              <QuickCommand icon={<Plus size={14} />} label="Nova oportunidade" onClick={() => setCreating({ ...emptyClient })} />
            </div>
          </section>

        </aside>
      </div>

      <section className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3" aria-labelledby="recent-activities-title">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]" id="recent-activities-title">Últimas atividades</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Contexto recente para a próxima abordagem.</p>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">{analytics.todayFollowUps} hoje</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {recentActivities.length > 0 ? recentActivities.slice(0, 3).map((activity) => (
            <div className="min-w-0 border-l-2 border-[var(--border-strong)] pl-3" key={activity.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-medium text-[var(--text-secondary)]">{activity.client}</p>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{activity.date}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">{activity.text}</p>
            </div>
          )) : <p className="text-[11px] text-[var(--text-muted)]">Nenhuma atividade recente registrada.</p>}
        </div>
      </section>
    </Surface>
  );
}

function QuickCommand({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]" onClick={onClick} type="button">
      <span className="text-[var(--icon-muted)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
