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

type DashboardRecentViewsProps = {
  recentViewedClients: number[];
  clients: Client[];
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  onSelectClient: (clientId: number) => void;
};

export default function DashboardRecentViews({
  recentViewedClients,
  clients,
  money,
  statusClass,
  onSelectClient,
}: DashboardRecentViewsProps) {
  const recentClients = recentViewedClients
    .map((id) => clients.find((client) => client.id === id))
    .filter((client): client is Client => Boolean(client));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Acessos recentes</p>

        <span className="text-[11px] text-slate-500">
          Retomar atendimento
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {recentClients.map((client) => (
          <button
            key={client.id}
            onClick={() => onSelectClient(client.id)}
            className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold">
                {client.name}
              </p>

              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                {client.status}
              </span>
            </div>

            <p className="mt-1 truncate text-[10px] text-slate-500">
              {client.company}
            </p>

            <p className="mt-3 text-[11px] font-semibold">
              {money(client.value)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}