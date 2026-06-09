import type { SmartFilterType } from "../../types/dashboard";

type DashboardSmartAlertsProps = {
  smartAlerts: string[];
  onApplySmartFilter: (type: SmartFilterType) => void;
};

export default function DashboardSmartAlerts({
  smartAlerts,
  onApplySmartFilter,
}: DashboardSmartAlertsProps) {
  return (
    <div className="premium-panel mt-3 rounded-2xl p-3 transition-all duration-300 hover:border-cyan-200/18">
      <p className="text-xs font-semibold">Sinais comerciais</p>

      <div className="mt-3 space-y-2">
        {smartAlerts.map((alert, index) => (
          <button
            key={alert}
            onClick={() =>
              onApplySmartFilter(index === 0 ? "risk" : index === 1 ? "proposal" : "silent")
            }
            className="w-full rounded-xl bg-white/5 p-2 text-left text-[11px] text-slate-300 transition-all duration-200 hover:bg-white/[0.07]"
          >
            {alert}
          </button>
        ))}
      </div>
    </div>
  );
}
