import { AlertTriangle, Plus, Target } from "lucide-react";
import type { Analytics, Client, Status } from "../../types/dashboard";

type DashboardCommandCenterProps = {
  clients: Client[];
  analytics: Analytics;
  emptyClient: Client;
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getPriority: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  setSelectedId: (clientId: number) => void;
  setActivePage: (page: "dashboard" | "clientes" | "kanban" | "automacoes") => void;
  setCreating: (client: Client) => void;
  applySmartFilter: (type: "risk" | "proposal" | "silent") => void;
};

export default function DashboardCommandCenter({
  clients,
  analytics,
  emptyClient,
  money,
  statusClass,
  getPriority,
  getLeadScore,
  setSelectedId,
  setActivePage,
  setCreating,
  applySmartFilter,
}: DashboardCommandCenterProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Centro de Comando Comercial</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Prioridades, alertas executivos e ações rápidas guiadas por dados.
          </p>
        </div>

        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
          Operação assistida
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Fila de prioridade</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Leads com maior urgência comercial agora</p>
            </div>

            <div className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-slate-300">
              {clients.filter((client) => getPriority(client) === "Alta").length} críticos
            </div>
          </div>

          <div className="space-y-2">
            {[...clients]
              .sort((a, b) => getLeadScore(b) - getLeadScore(a))
              .slice(0, 3)
              .map((client, index) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedId(client.id);
                    setActivePage("clientes");
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.025] p-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{client.name}</p>
                        <p className="truncate text-[10px] text-slate-500">{client.company}</p>
                      </div>
                    </div>

                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                      {client.status}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span>{money(client.value)}</span>
                    <span>Score {getLeadScore(client)}/100</span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-white" style={{ width: `${getLeadScore(client)}%` }} />
                  </div>
                </button>
              ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            onClick={() => applySmartFilter("proposal")}
            className="rounded-xl border border-amber-400/10 bg-amber-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/20 hover:bg-amber-500/[0.08]"
          >
            <div className="mb-3 flex items-center justify-between">
              <Target size={15} className="text-amber-300" />
              <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-100">Foco</span>
            </div>
            <p className="text-xs font-semibold text-amber-100">Atacar propostas quentes</p>
            <p className="mt-1 text-[10px] text-amber-100/60">Filtra oportunidades com maior chance de fechamento.</p>
          </button>

          <button
            onClick={() => applySmartFilter("risk")}
            className="rounded-xl border border-rose-400/10 bg-rose-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300/20 hover:bg-rose-500/[0.08]"
          >
            <div className="mb-3 flex items-center justify-between">
              <AlertTriangle size={15} className="text-rose-300" />
              <span className="rounded-full bg-rose-300/10 px-2 py-0.5 text-[9px] text-rose-100">Risco</span>
            </div>
            <p className="text-xs font-semibold text-rose-100">Recuperar carteira parada</p>
            <p className="mt-1 text-[10px] text-rose-100/60">Mostra clientes críticos antes que esfriem.</p>
          </button>

          <button
            onClick={() => setCreating({ ...emptyClient })}
            className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/20 hover:bg-emerald-500/[0.08]"
          >
            <div className="mb-3 flex items-center justify-between">
              <Plus size={15} className="text-emerald-300" />
              <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-100">Novo</span>
            </div>
            <p className="text-xs font-semibold text-emerald-100">Adicionar oportunidade</p>
            <p className="mt-1 text-[10px] text-emerald-100/60">Cria um novo lead sem sair do fluxo comercial.</p>
          </button>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Leitura executiva do dia</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Priorize propostas quentes, reative clientes silenciosos e mantenha follow-ups de hoje no topo.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                  {analytics.todayFollowUps} follow-ups
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                  {clients.filter((client) => client.lastContactDays >= 7).length} silenciosos
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                  {analytics.hotCount} quentes
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
