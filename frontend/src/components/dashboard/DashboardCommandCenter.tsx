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
  setCreating,
  applySmartFilter,
}: DashboardCommandCenterProps) {
  return (
    <div className="saas-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Centro de Comando Comercial</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Prioridades, alertas executivos e ações rápidas guiadas por dados.
          </p>
        </div>

        <span className="saas-chip rounded-full px-2 py-1 text-[10px] font-medium">
          Operação assistida
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="saas-card rounded-xl p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Fila de prioridade</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Oportunidades com maior urgência comercial agora</p>
            </div>

            <div className="saas-chip rounded-lg px-2 py-1 text-[10px]">
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
                  onClick={() => setSelectedId(client.id)}
                  className="saas-row w-full rounded-xl p-2 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-500/16 bg-slate-900/70 text-[10px] font-bold">
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
            className="saas-action saas-accent-amber rounded-xl p-3 text-left"
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
            className="saas-action saas-accent-rose rounded-xl p-3 text-left"
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
            className="saas-action saas-accent-emerald rounded-xl p-3 text-left"
          >
            <div className="mb-3 flex items-center justify-between">
              <Plus size={15} className="text-emerald-300" />
              <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-100">Novo</span>
            </div>
            <p className="text-xs font-semibold text-emerald-100">Adicionar oportunidade</p>
            <p className="mt-1 text-[10px] text-emerald-100/60">Cria uma nova oportunidade sem sair do fluxo comercial.</p>
          </button>

          <div className="saas-card rounded-xl p-3 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Leitura executiva do dia</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Priorize propostas quentes, reative clientes silenciosos e mantenha acompanhamentos de hoje no topo.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
                  {analytics.todayFollowUps} acompanhamentos
                </span>
                <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
                  {clients.filter((client) => client.lastContactDays >= 7).length} silenciosos
                </span>
                <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
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
