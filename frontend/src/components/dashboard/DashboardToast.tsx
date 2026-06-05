import { CheckCircle2, X } from "lucide-react";

type DashboardToastProps = {
  toast: string;
  onClose: () => void;
};

export default function DashboardToast({ toast, onClose }: DashboardToastProps) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]/95 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10">
          <CheckCircle2 size={16} className="text-emerald-300" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100">Ação concluída</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{toast}</p>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
        >
          <X size={13} />
        </button>
      </div>

      <div className="h-0.5 w-full bg-white/10">
        <div className="h-full w-2/3 rounded-full bg-emerald-300/70" />
      </div>
    </div>
  );
}
