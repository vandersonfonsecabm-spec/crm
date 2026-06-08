import type { Client, Status } from "../../types/dashboard";

type DashboardRecentLeadsProps = {
  clients: Client[];
  recentViewedClients: number[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getLeadScore: (client: Client) => number;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardRecentLeads({
  clients,
  recentViewedClients,
  money,
  statusClass,
  getLeadScore,
  onSelectClient,
}: DashboardRecentLeadsProps) {
  const recentLeads = clients.slice(0, 4);
  const hotLeads = [...clients]
    .filter((client) => client.hot || getLeadScore(client) >= 80)
    .sort((a, b) => getLeadScore(b) - getLeadScore(a))
    .slice(0, 3);

  const silentLeads = [...clients]
    .filter((client) => client.lastContactDays >= 7)
    .sort((a, b) => b.lastContactDays - a.lastContactDays)
    .slice(0, 3);

  const viewedLeads = recentViewedClients
    .map((clientId) => clients.find((client) => client.id === clientId))
    .filter((client): client is Client => Boolean(client))
    .slice(0, 3);

  const totalHotValue = hotLeads.reduce((sum, client) => sum + client.value, 0);
  const totalSilentValue = silentLeads.reduce((sum, client) => sum + client.value, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Inteligência de leads</p>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-slate-300">
                {clients.length} ativos
              </span>
            </div>

            <p className="mt-0.5 text-[10px] text-slate-500">
              Leads recentes, oportunidades quentes, visualizados e risco silencioso em uma visão única.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] px-3 py-1.5 text-right">
              <p className="text-[9px] text-emerald-100/55">Quentes</p>
              <p className="text-xs font-semibold text-emerald-100">{money(totalHotValue)}</p>
            </div>

            <div className="rounded-xl border border-rose-400/10 bg-rose-500/[0.045] px-3 py-1.5 text-right">
              <p className="text-[9px] text-rose-100/55">Em risco</p>
              <p className="text-xs font-semibold text-rose-100">{money(totalSilentValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-200">Leads em destaque</p>
              <p className="mt-0.5 text-[9px] text-slate-500">Últimas oportunidades com valor e score.</p>
            </div>

            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] text-slate-400">
              top {recentLeads.length}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {recentLeads.map((client) => {
              const score = getLeadScore(client);

              return (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="group min-w-0 rounded-xl border border-white/10 bg-black/20 p-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055] hover:shadow-lg hover:shadow-black/25"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-slate-100">{client.name}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500">{client.company}</p>
                    </div>

                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${statusClass(client.status)}`}>
                      {client.status}
                    </span>
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[8px] text-slate-500">Valor</p>
                      <p className="truncate text-[11px] font-semibold text-slate-200">{money(client.value)}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-[8px] text-slate-500">Score</p>
                      <p className="text-[11px] font-semibold text-slate-200">{score}</p>
                    </div>
                  </div>

                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        score >= 80 ? "bg-emerald-300" : score >= 60 ? "bg-amber-300" : "bg-slate-400"
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <LeadMiniList
            title="Quentes"
            emptyText="Nenhum lead quente agora."
            clients={hotLeads}
            money={money}
            statusClass={statusClass}
            getLeadScore={getLeadScore}
            onSelectClient={onSelectClient}
          />

          <LeadMiniList
            title="Visualizados"
            emptyText="Nenhum lead visualizado ainda."
            clients={viewedLeads}
            money={money}
            statusClass={statusClass}
            getLeadScore={getLeadScore}
            onSelectClient={onSelectClient}
          />

          <LeadMiniList
            title="Risco silencioso"
            emptyText="Nenhum lead parado."
            clients={silentLeads}
            money={money}
            statusClass={statusClass}
            getLeadScore={getLeadScore}
            onSelectClient={onSelectClient}
          />
        </div>
      </div>
    </div>
  );
}

function LeadMiniList({
  title,
  emptyText,
  clients,
  money,
  statusClass,
  getLeadScore,
  onSelectClient,
}: {
  title: string;
  emptyText: string;
  clients: Client[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getLeadScore: (client: Client) => number;
  onSelectClient: (clientId: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-slate-200">{title}</p>
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] text-slate-400">
          {clients.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {clients.length > 0 ? (
          clients.map((client) => (
            <button
              key={`${title}-${client.id}`}
              onClick={() => onSelectClient(client.id)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.025] px-2 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.055]"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold text-slate-200">{client.name}</p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-500">{money(client.value)}</p>
                </div>

                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${statusClass(client.status)}`}>
                  {getLeadScore(client)}
                </span>
              </div>
            </button>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-2 py-1.5 text-[9px] text-slate-600">
            {emptyText}
          </p>
        )}
      </div>
    </div>
  );
}
