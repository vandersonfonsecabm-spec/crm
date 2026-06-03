type Status = "Novo" | "Contato" | "Proposta" | "Fechado" | "Perdido";

type Note = {
  id: number;
  text: string;
  date: string;
};

type Client = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  value: number;
  status: Status;
  source: string;
  favorite: boolean;
  hot: boolean;
  lastContactDays: number;
  nextFollowUp: string;
  tags: string[];
  notes: Note[];
};

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
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Pipeline por etapa</p>
        <span className="text-[11px] text-slate-500">Distribuição comercial</span>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {statusList.map((status) => (
          <div
            key={status}
            className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">{status}</p>

              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(status)}`}>
                {clients.filter((client) => client.status === status).length}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-lg font-semibold">
                {money(
                  kanbanClients
                    .filter((client) => client.status === status)
                    .reduce((sum, client) => sum + client.value, 0)
                )}
              </p>

              <p className="mt-1 text-[10px] text-slate-500">Valor acumulado</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
