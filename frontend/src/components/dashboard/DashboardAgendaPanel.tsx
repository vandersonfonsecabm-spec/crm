import { AlertTriangle, Bell, Clock, StickyNote } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="premium-panel rounded-2xl p-4">
          <PanelTitle icon={<Clock size={15} className="text-sky-300" />} title="Janelas de follow-up" hint="Agenda comercial por urgência e próxima ação." />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {followUpAgenda.map((group) => {
              const value = group.clients.reduce((sum, client) => sum + client.value, 0);
              const firstClient = group.clients[0];

              return (
                <button
                  key={group.label}
                  onClick={() => firstClient && onSelectClient(firstClient.id)}
                  disabled={!firstClient}
                  className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{group.label}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{group.hint}</p>
                    </div>

                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
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

          <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-200">Fila do dia</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                {agendaClients.length} itens
              </span>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {agendaClients.slice(0, 6).map((client) => (
                <button
                  key={`${client.agendaLabel}-${client.id}`}
                  onClick={() => onSelectClient(client.id)}
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
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

        <div className="space-y-4">
          <div className="premium-panel rounded-2xl p-4">
            <PanelTitle icon={<AlertTriangle size={15} className="text-rose-300" />} title="Alertas operacionais" hint="Sinais que pedem ação antes de virar perda." />

            <div className="mt-4 space-y-2">
              {smartAlerts.map((alert, index) => (
                <button
                  key={alert}
                  onClick={() => onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                  className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <p className="text-xs font-semibold text-slate-200">{alert}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Aplicar filtro inteligente</p>
                </button>
              ))}
            </div>
          </div>

          <div className="premium-panel rounded-2xl p-4">
            <PanelTitle icon={<Bell size={15} className="text-amber-300" />} title="Clientes silenciosos" hint="Contatos parados para retomada." />

            <div className="mt-4 space-y-2">
              {silentClients.length === 0 && <EmptyLine text="Nenhum cliente parado no momento." />}
              {silentClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
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

      <section className="premium-panel rounded-2xl p-4">
        <PanelTitle icon={<StickyNote size={15} className="text-violet-300" />} title="Atividades recentes" hint="Notas e registros comerciais mais recentes." />

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentActivities.length === 0 && <EmptyLine text="Nenhuma atividade recente registrada." />}
          {recentActivities.slice(0, 6).map((activity) => (
            <div key={activity.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
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

function PanelTitle({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
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
    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[11px] text-slate-500">{text}</p>
    </div>
  );
}
