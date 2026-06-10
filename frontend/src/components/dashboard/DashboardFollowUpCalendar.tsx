import type { Client, Status } from "../../types/dashboard";

type FollowUpGroup = {
  label: string;
  hint: string;
  clients: Client[];
};

type DashboardFollowUpCalendarProps = {
  todayFollowUps: number;
  followUpAgenda: FollowUpGroup[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardFollowUpCalendar({
  todayFollowUps,
  followUpAgenda,
  money,
  statusClass,
  onSelectClient,
}: DashboardFollowUpCalendarProps) {
  const allClients = followUpAgenda.flatMap((group) =>
    group.clients.map((client) => ({
      ...client,
      agendaLabel: group.label,
      agendaHint: group.hint,
    }))
  );

  const criticalClients = allClients
    .sort((a, b) => {
      if (a.nextFollowUp.toLowerCase() === "hoje" && b.nextFollowUp.toLowerCase() !== "hoje") return -1;
      if (a.nextFollowUp.toLowerCase() !== "hoje" && b.nextFollowUp.toLowerCase() === "hoje") return 1;
      if (a.lastContactDays !== b.lastContactDays) return b.lastContactDays - a.lastContactDays;
      return b.value - a.value;
    })
    .slice(0, 4);

  const totalValue = allClients.reduce((sum, client) => sum + client.value, 0);

  return (
    <div className="saas-panel rounded-2xl">
      <div className="border-b border-slate-700/40 bg-slate-950/18 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Agenda executiva</p>
              <span className="rounded-full border border-emerald-400/15 bg-emerald-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-emerald-100">
                {todayFollowUps} hoje
              </span>
            </div>

            <p className="mt-0.5 text-[10px] text-slate-500">
              Follow-ups críticos, janelas próximas e valor comercial em aberto.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="metric-card rounded-xl px-3 py-1.5 text-right">
              <p className="text-[9px] text-slate-500">Agenda</p>
              <p className="text-xs font-semibold text-slate-100">{allClients.length} leads</p>
            </div>

            <div className="metric-card metric-pipeline rounded-xl px-3 py-1.5 text-right">
              <p className="text-[9px] text-emerald-100/55">Valor</p>
              <p className="text-xs font-semibold text-emerald-100">{money(totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="grid gap-2 md:grid-cols-3">
          {followUpAgenda.map((group) => {
            const groupValue = group.clients.reduce((sum, client) => sum + client.value, 0);
            const firstClient = group.clients[0];

            return (
              <button
                key={group.label}
                onClick={() => {
                  if (firstClient) onSelectClient(firstClient.id);
                }}
                disabled={!firstClient}
                className="metric-card rounded-xl p-2 text-left transition-all duration-200 hover:border-slate-400/24 disabled:cursor-default disabled:opacity-70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200">{group.label}</p>
                    <p className="mt-0.5 truncate text-[9px] text-slate-500">{group.hint}</p>
                  </div>

                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-slate-300">
                    {group.clients.length}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[10px] text-slate-500">
                    {firstClient ? firstClient.name : "Sem follow-up"}
                  </p>

                  <p className="shrink-0 text-[10px] font-semibold text-slate-300">{money(groupValue)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="saas-card mt-3 rounded-xl p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-200">Follow-ups críticos</p>
              <p className="mt-0.5 text-[9px] text-slate-500">
                Próximos clientes que merecem atenção rápida.
              </p>
            </div>

            <span className="saas-chip rounded-full px-2 py-0.5 text-[9px]">
              top {criticalClients.length}
            </span>
          </div>

          {criticalClients.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {criticalClients.map((client) => (
                <button
                  key={`${client.agendaLabel}-${client.id}`}
                  onClick={() => onSelectClient(client.id)}
                  className="saas-row min-w-0 rounded-xl px-2 py-1.5 text-left transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-semibold text-slate-200">{client.name}</p>

                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${statusClass(client.status)}`}>
                      {client.status}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-[9px] text-slate-500">
                    {client.agendaLabel} • {money(client.value)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-500/18 bg-slate-950/25 px-3 py-2">
              <p className="text-[10px] text-slate-500">Nenhum follow-up crítico no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
