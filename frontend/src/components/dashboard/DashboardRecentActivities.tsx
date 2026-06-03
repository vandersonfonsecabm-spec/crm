type RecentActivity = {
  id: string;
  client: string;
  text: string;
  date: string;
};

type SmartFilterType = "risk" | "proposal" | "silent";

type DashboardRecentActivitiesProps = {
  smartAlerts: string[];
  recentActivities: RecentActivity[];
  onApplySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardRecentActivities({
  smartAlerts,
  recentActivities,
  onApplySmartFilter,
}: DashboardRecentActivitiesProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Atividades comerciais</p>
        <span className="text-[11px] text-slate-500">
          Sinais, registros e próximos passos
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {smartAlerts.map((alert, index) => (
            <button
              key={alert}
              onClick={() =>
                onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")
              }
              className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <p className="text-xs font-semibold text-slate-200">{alert}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                Clique para aplicar filtro inteligente
              </p>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {recentActivities.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30">
              <p className="text-xs font-semibold text-slate-300">
                Nenhuma atividade recente
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Adicione notas no cliente selecionado para construir uma timeline comercial mais rica.
              </p>
            </div>
          )}

          {recentActivities.slice(0, 3).map((activity) => (
            <div
              key={activity.id}
              className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30"
            >
              <p className="text-xs font-semibold text-slate-200">{activity.client}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                {activity.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
