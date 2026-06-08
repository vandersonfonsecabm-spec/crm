import { Activity, AlertTriangle, ArrowUpRight, Command, Plus, Sparkles, Target, Zap } from "lucide-react";
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

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-500/10 text-sky-200">
              <Command size={16} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold">Comercial</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Central de decisão, sinais críticos e ações rápidas no mesmo fluxo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ControlSignal icon={<Zap size={11} />} label="Alertas" value={String(smartAlerts.length)} tone="rose" />
            <ControlSignal icon={<Sparkles size={11} />} label="Quentes" value={String(analytics.hotCount)} tone="amber" />
            <ControlSignal icon={<Activity size={11} />} label="Ativos" value={String(activeCount)} tone="sky" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Sinais críticos</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Alertas que alimentam a central de decisão.</p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-slate-300">
            leitura rápida
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {smartAlerts.map((alert, index) => (
            <button
              key={alert}
              onClick={() => applySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")}
              className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.055]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-semibold text-slate-200">{alert}</p>
                <ArrowUpRight size={12} className="shrink-0 text-slate-500" />
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500">Aplicar filtro inteligente</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-base font-semibold">Central de decisão</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Quem precisa de ação agora, ordenado por prioridade e potencial.</p>
            </div>

            <div className="flex gap-2">
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
                  className="grid min-w-0 gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.055] md:grid-cols-[minmax(0,1fr)_120px]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[11px] font-bold text-slate-200">
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
                      <p className="mt-2 text-[10px] text-slate-500">{money(client.value)} em oportunidade</p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-500">Score</span>
                      <span className="font-semibold text-slate-200">{score}/100</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${score >= 80 ? "bg-emerald-300" : score >= 60 ? "bg-amber-300" : "bg-slate-400"}`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Ações rápidas</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Comandos diretos para a carteira.</p>
              </div>

              <span className="rounded-full border border-sky-400/15 bg-sky-500/[0.06] px-2 py-1 text-[9px] text-sky-100">
                assistido
              </span>
            </div>

            <div className="space-y-2">
              <CommandAction
                icon={<Target size={15} />}
                title="Atacar propostas quentes"
                description={`${proposalCount} proposta(s) abertas com maior chance de fechamento.`}
                tone="amber"
                onClick={() => applySmartFilter("proposal")}
              />
              <CommandAction
                icon={<AlertTriangle size={15} />}
                title="Recuperar carteira parada"
                description={`${silentCount} cliente(s) sem contato recente pedem reativação.`}
                tone="rose"
                onClick={() => applySmartFilter("silent")}
              />
              <CommandAction
                icon={<Plus size={15} />}
                title="Adicionar oportunidade"
                description="Criar um novo lead manual sem sair da tela atual."
                tone="emerald"
                onClick={() => setCreating({ ...emptyClient })}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200">Últimas atividades</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Registros recentes da carteira.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <QueueBadge label="Hoje" value={String(analytics.todayFollowUps)} tone="sky" />
                <QueueBadge label="Silenciosos" value={String(silentCount)} tone="default" />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {recentActivities.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-2 text-[10px] text-slate-500">
                  Nenhuma atividade recente registrada.
                </p>
              ) : (
                recentActivities.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
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
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky";
}) {
  const classes = {
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
  };

  return (
    <div className={`min-w-[82px] rounded-xl border px-2.5 py-1.5 text-right ${classes[tone]}`}>
      <div className="flex items-center justify-end gap-1 opacity-75">
        <span className="text-[8px] uppercase tracking-[0.12em]">{label}</span>
        {icon}
      </div>
      <p className="mt-0.5 text-sm font-black leading-none">{value}</p>
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
    default: "border-white/10 bg-white/5 text-slate-300",
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
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
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "amber" | "rose" | "emerald";
  onClick: () => void;
}) {
  const classes = {
    amber: "border-amber-400/10 bg-amber-500/[0.045] text-amber-100 hover:border-amber-300/20 hover:bg-amber-500/[0.08]",
    rose: "border-rose-400/10 bg-rose-500/[0.045] text-rose-100 hover:border-rose-300/20 hover:bg-rose-500/[0.08]",
    emerald: "border-emerald-400/10 bg-emerald-500/[0.045] text-emerald-100 hover:border-emerald-300/20 hover:bg-emerald-500/[0.08]",
  };

  return (
    <button onClick={onClick} className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ${classes[tone]}`}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/20">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed opacity-65">{description}</p>
      </div>
    </button>
  );
}
