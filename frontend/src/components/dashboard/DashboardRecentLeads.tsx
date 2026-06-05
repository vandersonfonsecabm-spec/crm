import type { Client, Status } from "../../types/dashboard";

type DashboardRecentLeadsProps = {
  clients: Client[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getLeadScore: (client: Client) => number;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardRecentLeads({
  clients,
  money,
  statusClass,
  getLeadScore,
  onSelectClient,
}: DashboardRecentLeadsProps) {
  const recentLeads = clients.slice(0, 4);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Leads em destaque</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Últimas oportunidades com leitura rápida de valor e score.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400">
          {recentLeads.length} leads
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {recentLeads.map((client) => {
          const score = getLeadScore(client);

          return (
            <button
              key={client.id}
              onClick={() => onSelectClient(client.id)}
              className="group rounded-xl border border-white/10 bg-black/20 p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-black/25"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{client.company}</p>
                </div>

                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                  {client.status}
                </span>
              </div>

              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] text-slate-500">Valor</p>
                  <p className="truncate text-xs font-semibold text-slate-200">{money(client.value)}</p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] text-slate-500">Score</p>
                  <p className="text-xs font-semibold text-slate-200">{score}</p>
                </div>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
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
  );
}
