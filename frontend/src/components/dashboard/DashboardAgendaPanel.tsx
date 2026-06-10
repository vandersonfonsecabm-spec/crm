import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import type { Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";

type FollowUpGroup = {
  label: string;
  hint: string;
  clients: Client[];
};

type DashboardAgendaPanelProps = {
  clients: Client[];
  followUpAgenda: FollowUpGroup[];
  recentActivities: RecentActivity[];
  smartAlerts: string[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardAgendaPanel({
  clients,
  followUpAgenda,
  recentActivities,
  smartAlerts,
  money,
  statusClass,
  onSelectClient,
  onApplySmartFilter,
}: DashboardAgendaPanelProps) {
  const silentClients = clients
    .filter((client) => client.lastContactDays >= 5)
    .sort((first, second) => second.lastContactDays - first.lastContactDays)
    .slice(0, 5);

  const agendaClients = followUpAgenda.flatMap((group) =>
    group.clients.map((client) => ({
      ...client,
      agendaLabel: group.label,
      agendaHint: group.hint,
    }))
  );

  const todayClients = agendaClients.filter((client) => client.nextFollowUp.toLowerCase() === "hoje");
  const totalAgendaValue = agendaClients.reduce((sum, client) => sum + client.value, 0);
  const urgentClients = agendaClients
    .sort((first, second) => {
      if (first.nextFollowUp.toLowerCase() === "hoje" && second.nextFollowUp.toLowerCase() !== "hoje") return -1;
      if (first.nextFollowUp.toLowerCase() !== "hoje" && second.nextFollowUp.toLowerCase() === "hoje") return 1;
      if (first.lastContactDays !== second.lastContactDays) return second.lastContactDays - first.lastContactDays;
      return second.value - first.value;
    })
    .slice(0, 8);

  return (
    <div className="space-y-4 pb-8">
      <section className="grid gap-3 md:grid-cols-3">
        <AgendaMetric
          icon={<CalendarDays size={15} />}
          title="Hoje"
          value={`${todayClients.length} follow-ups`}
          caption="Acoes do dia"
          tone="revenue"
        />
        <AgendaMetric
          icon={<AlertTriangle size={15} />}
          title="Silenciosos"
          value={`${silentClients.length} clientes`}
          caption="Retomar contato"
          tone="risk"
        />
        <AgendaMetric
          icon={<CheckCircle2 size={15} />}
          title="Valor agendado"
          value={money(totalAgendaValue)}
          caption="Pipeline em agenda"
          tone="pipeline"
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="saas-panel min-w-0 rounded-2xl p-4">
          <PanelTitle
            icon={<Clock size={15} className="text-sky-300" />}
            title="Janelas de follow-up"
            hint="Prioridade por prazo, urgencia e valor comercial."
          />

          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
            {followUpAgenda.map((group) => {
              const value = group.clients.reduce((sum, client) => sum + client.value, 0);
              const firstClient = group.clients[0];

              return (
                <button
                  key={group.label}
                  onClick={() => firstClient && onSelectClient(firstClient.id)}
                  disabled={!firstClient}
                  className="metric-card rounded-xl p-3 text-left transition hover:border-slate-400/24 disabled:cursor-default disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{group.label}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{group.hint}</p>
                    </div>

                    <span className="saas-chip rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      {group.clients.length}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-slate-500">{firstClient?.name ?? "Sem clientes"}</p>
                    <p className="shrink-0 text-xs font-semibold text-slate-200">{money(value)}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="saas-card mt-4 rounded-xl p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Fila operacional</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Clientes ordenados para acao rapida.</p>
              </div>
              <span className="saas-chip rounded-full px-2 py-0.5 text-[10px]">
                {agendaClients.length} itens
              </span>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {urgentClients.map((client) => (
                <button
                  key={`${client.agendaLabel}-${client.id}`}
                  onClick={() => onSelectClient(client.id)}
                  className="saas-row rounded-xl px-3 py-2 text-left transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                      {client.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-slate-500">
                    {client.agendaLabel} - {money(client.value)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="saas-panel rounded-2xl p-4">
            <PanelTitle
              icon={<AlertTriangle size={15} className="text-rose-300" />}
              title="Alertas operacionais"
              hint="Sinais que pedem acao antes de virar perda."
            />

            <div className="mt-4 space-y-2">
              {smartAlerts.map((alert, index) => (
                <button
                  key={alert}
                  onClick={() => onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                  className="saas-row w-full rounded-xl p-3 text-left transition"
                >
                  <p className="text-xs font-semibold text-slate-200">{alert}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Aplicar filtro inteligente</p>
                </button>
              ))}
            </div>
          </div>

          <div className="saas-panel rounded-2xl p-4">
            <PanelTitle
              icon={<Bell size={15} className="text-amber-300" />}
              title="Clientes silenciosos"
              hint="Contatos parados para retomada."
            />

            <div className="mt-4 space-y-2">
              {silentClients.length === 0 && <EmptyLine text="Nenhum cliente parado no momento." />}
              {silentClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="saas-row flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{client.lastContactDays} dias sem contato</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-300">{money(client.value)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="saas-panel min-w-0 rounded-2xl p-4">
        <PanelTitle
          icon={<StickyNote size={15} className="text-slate-300" />}
          title="Atividades recentes"
          hint="Notas e registros comerciais mais recentes."
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentActivities.length === 0 && <EmptyLine text="Nenhuma atividade recente registrada." />}
          {recentActivities.slice(0, 6).map((activity) => (
            <div key={activity.id} className="metric-card rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-100">{activity.client}</p>
                <span className="shrink-0 text-[10px] text-slate-500">{activity.date}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">{activity.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AgendaMetric({
  icon,
  title,
  value,
  caption,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  caption: string;
  tone: "pipeline" | "revenue" | "risk";
}) {
  const toneClass = {
    pipeline: "metric-pipeline text-teal-100",
    revenue: "metric-revenue text-sky-100",
    risk: "metric-risk text-rose-100",
  };

  return (
    <div className={`metric-card rounded-2xl p-3 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{title}</p>
          <p className="mt-1.5 truncate text-base font-semibold">{value}</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{caption}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.11] bg-white/[0.045]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/55">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-500/18 bg-slate-950/25 px-3 py-2">
      <p className="text-[11px] text-slate-500">{text}</p>
    </div>
  );
}
