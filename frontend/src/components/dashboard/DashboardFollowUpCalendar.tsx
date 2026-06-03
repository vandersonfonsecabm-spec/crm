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
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Mini calendário de follow-up</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Próximas ações comerciais organizadas por urgência.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-400">
          {todayFollowUps} hoje
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {followUpAgenda.map((group) => (
          <div
            key={group.label}
            className="rounded-2xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-200">{group.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{group.hint}</p>
              </div>

              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                {group.clients.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {group.clients.slice(0, 3).map((client) => (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate-200">
                      {client.name}
                    </p>

                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                      {client.status}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                    {client.company} • {money(client.value)}
                  </p>
                </button>
              ))}

              {group.clients.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3">
                  <p className="text-[10px] text-slate-500">
                    Nenhum follow-up nesta janela.
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
