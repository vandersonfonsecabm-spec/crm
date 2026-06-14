import {
  AlertTriangle,
  ArrowUpRight,
  Command,
  Plus,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ActivePage, Analytics, Client, RecentActivity, SmartFilterType, Status } from "../../types/dashboard";

type DashboardControlCenterProps = {
  clients: Client[];
  analytics: Analytics;
  smartAlerts: string[];
  recentActivities: RecentActivity[];
  emptyClient: Client;
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getPriority: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  setSelectedId: (clientId: number | null) => void;
  setActivePage: (page: ActivePage) => void;
  setCreating: (client: Client | null) => void;
  applySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardControlCenter({
  clients,
  analytics,
  smartAlerts,
  recentActivities,
  emptyClient,
  money,
  statusClass,
  getPriority,
  getLeadScore,
  setSelectedId,
  setActivePage,
  setCreating,
  applySmartFilter,
}: DashboardControlCenterProps) {
  const priorityClients = [...clients]
    .sort((a, b) => {
      if (getPriority(a) !== getPriority(b)) return getPriority(a) === "Alta" ? -1 : 1;
      return getLeadScore(b) - getLeadScore(a);
    })
    .slice(0, 5);

  const highPriorityCount = clients.filter((client) => getPriority(client) === "Alta").length;
  const silentCount = clients.filter((client) => client.lastContactDays >= 7).length;
  const proposalCount = clients.filter((client) => client.status === "Proposta").length;
  const activeCount = clients.filter((client) => client.status !== "Perdido").length;
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  return (
    <section className="space-y-3">
      <div className="saas-panel rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
              <Command size={17} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">Comercial</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Prioridades, oportunidades e próximas ações em um painel limpo.
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            <ControlSignal icon={<Zap size={12} />} label="Alertas" value={String(smartAlerts.length)} tone="rose" />
            <ControlSignal icon={<Sparkles size={12} />} label="Quentes" value={String(analytics.hotCount)} tone="amber" />
            <ControlSignal icon={<Users size={12} />} label="Ativos" value={String(activeCount)} tone="sky" />
            <ControlSignal icon={<Target size={12} />} label="Funil" value={money(proposalValue)} tone="pipeline" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="min-w-0 space-y-3">
          <div className="saas-panel rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-100">Sinais críticos</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Filtros inteligentes para decidir onde agir primeiro.</p>
              </div>

              <span className="saas-chip rounded-full px-2 py-1 text-[9px]">leitura rápida</span>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {smartAlerts.map((alert, index) => (
                <button
                  key={alert}
                  onClick={() => applySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
                  className="saas-row min-w-0 rounded-xl px-3 py-2.5 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-[11px] font-semibold text-slate-200">{alert}</p>
                    <ArrowUpRight size={12} className="shrink-0 text-slate-500" />
                  </div>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-slate-600">aplicar filtro</p>
                </button>
              ))}
            </div>
          </div>

          <div className="saas-panel rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-100">Fila comercial</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Oportunidades ordenadas por urgência, score e potencial de receita.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <QueueBadge label="Críticos" value={String(highPriorityCount)} tone="rose" />
                <QueueBadge label="Propostas" value={String(proposalCount)} tone="amber" />
              </div>
            </div>

            <div className="grid gap-2">
              {priorityClients.map((client, index) => {
                const score = getLeadScore(client);

                return (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedId(client.id);
                      setActivePage("clientes");
                    }}
                    className="saas-row grid min-w-0 gap-3 rounded-xl p-3 text-left md:grid-cols-[minmax(0,1fr)_150px]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/70 text-xs font-bold text-slate-200">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-100">{client.name}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${statusClass(client.status)}`}>
                            {client.status}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{client.company}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                          <span>{money(client.value)}</span>
                          <span>Prioridade {getPriority(client)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 self-center">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-500">Score</span>
                        <span className="font-semibold text-slate-200">{score}/100</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${score >= 80 ? "bg-emerald-300" : score >= 60 ? "bg-amber-300" : "bg-slate-400"}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="saas-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-100">Ações rápidas</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Comandos diretos para limpar a fila.</p>
              </div>

              <span className="saas-chip rounded-full px-2 py-1 text-[9px]">assistido</span>
            </div>

            <div className="space-y-2">
              <CommandAction
                icon={<Target size={15} />}
                title="Atacar propostas"
                description={`${proposalCount} proposta(s) abertas com alto potencial.`}
                tone="amber"
                onClick={() => applySmartFilter("proposal")}
              />
              <CommandAction
                icon={<AlertTriangle size={15} />}
                title="Reativar silenciosos"
                description={`${silentCount} cliente(s) sem contato recente.`}
                tone="rose"
                onClick={() => applySmartFilter("silent")}
              />
              <CommandAction
                icon={<Plus size={15} />}
                title="Nova oportunidade"
                description="Criar oportunidade manual sem sair do fluxo comercial."
                tone="emerald"
                onClick={() => setCreating({ ...emptyClient })}
              />
            </div>
          </div>

          <div className="saas-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">Últimas atividades</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Movimentos recentes da carteira.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <QueueBadge label="Hoje" value={String(analytics.todayFollowUps)} tone="sky" />
                <QueueBadge label="Silenciosos" value={String(silentCount)} tone="default" />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {recentActivities.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-500/18 bg-slate-950/20 px-3 py-2 text-[10px] text-slate-500">
                  Nenhuma atividade recente registrada.
                </p>
              ) : (
                recentActivities.slice(0, 4).map((activity) => (
                  <div key={activity.id} className="saas-row rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-slate-200">{activity.client}</p>
                      <span className="shrink-0 text-[9px] text-slate-600">{activity.date}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{activity.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlSignal({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky" | "pipeline";
}) {
  const classes = {
    rose: "metric-card metric-risk text-rose-100",
    amber: "metric-card metric-forecast text-amber-100",
    sky: "metric-card metric-revenue text-sky-100",
    pipeline: "metric-card metric-pipeline text-teal-100",
  };

  return (
    <div className={`min-w-0 rounded-xl border px-2.5 py-2 text-right ${classes[tone]}`}>
      <div className="flex items-center justify-end gap-1 opacity-75">
        <span className="truncate text-[8px] uppercase tracking-[0.12em]">{label}</span>
        {icon}
      </div>
      <p className="mt-1 truncate text-sm font-semibold leading-none">{value}</p>
    </div>
  );
}

function QueueBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "rose" | "amber" | "sky";
}) {
  const classes = {
    default: "metric-card text-slate-300",
    rose: "metric-card metric-risk text-rose-100",
    amber: "metric-card metric-forecast text-amber-100",
    sky: "metric-card metric-revenue text-sky-100",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-[9px] ${classes[tone]}`}>
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}

function CommandAction({
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone: "amber" | "rose" | "emerald";
  onClick: () => void;
}) {
  const classes = {
    amber: "saas-accent-amber text-amber-100",
    rose: "saas-accent-rose text-rose-100",
    emerald: "saas-accent-emerald text-emerald-100",
  };

  return (
    <button onClick={onClick} className={`saas-action flex w-full items-start gap-3 rounded-xl p-2.5 text-left ${classes[tone]}`}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950/25">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed opacity-65">{description}</p>
      </div>
    </button>
  );
}
