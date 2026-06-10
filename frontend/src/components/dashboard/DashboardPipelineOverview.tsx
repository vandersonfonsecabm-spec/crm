import type { Client, Status } from "../../types/dashboard";

type DashboardPipelineOverviewProps = {
  statusList: Status[];
  clients: Client[];
  kanbanClients: Client[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
};

export default function DashboardPipelineOverview({
  statusList,
  clients,
  kanbanClients,
  money,
  statusClass,
}: DashboardPipelineOverviewProps) {
  const totalPipelineValue = kanbanClients.reduce((sum, client) => sum + client.value, 0);
  const activeClients = kanbanClients.filter((client) => client.status !== "Fechado" && client.status !== "Perdido").length;
  const closedValue = kanbanClients
    .filter((client) => client.status === "Fechado")
    .reduce((sum, client) => sum + client.value, 0);

  return (
    <div className="saas-panel rounded-2xl">
      <div className="border-b border-slate-700/40 bg-slate-950/18 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-100">Pipeline por etapa</p>
              <span className="rounded-full border border-sky-400/15 bg-sky-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-sky-100">
                {activeClients} ativos
              </span>
            </div>

            <p className="mt-0.5 text-[10px] text-slate-500">Distribuicao compacta de valor, volume e conversao.</p>
          </div>

          <div className="flex items-center gap-2">
            <PipelineSignal label="Total" value={money(totalPipelineValue)} />
            <PipelineSignal label="Ganho" value={money(closedValue)} tone="emerald" />
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="grid gap-2 md:grid-cols-5">
          {statusList.map((status) => {
            const statusClients = kanbanClients.filter((client) => client.status === status);
            const statusValue = statusClients.reduce((sum, client) => sum + client.value, 0);
            const clientCount = clients.filter((client) => client.status === status).length;
            const share = totalPipelineValue > 0 ? Math.round((statusValue / totalPipelineValue) * 100) : 0;
            const topClient = [...statusClients].sort((a, b) => b.value - a.value)[0];

            return (
              <div
                key={status}
                className="metric-card min-w-0 rounded-xl p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/24 hover:shadow-lg hover:shadow-black/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{status}</p>

                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${statusClass(status)}`}>
                    {clientCount}
                  </span>
                </div>

                <div className="mt-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{money(statusValue)}</p>

                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-teal-200/80" style={{ width: `${share}%` }} />
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[9px] text-slate-500">{topClient ? topClient.name : "Sem leads"}</p>

                  <span className="shrink-0 text-[9px] font-semibold text-slate-400">{share}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PipelineSignal({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  const classes =
    tone === "emerald"
      ? "metric-pipeline text-emerald-100"
      : "text-slate-100";

  return (
    <div className={`metric-card rounded-xl border px-3 py-1.5 text-right ${classes}`}>
      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-xs font-semibold">{value}</p>
    </div>
  );
}
