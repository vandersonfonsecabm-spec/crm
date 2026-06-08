import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyDecisionState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
        <Sparkles size={16} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-300">Selecione um lead</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Clique em um cliente na tabela ou no Kanban para abrir a central de decisao comercial.
      </p>
    </div>
  );
}

export function DecisionMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}

export function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
    >
      {icon}
      <p className="text-[9px] font-semibold text-slate-300">{label}</p>
    </button>
  );
}

export function SmallButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
    >
      {icon}
      {label}
    </button>
  );
}

export function FilterAction({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "amber" | "rose" | "sky";
  onClick: () => void;
}) {
  const classes = {
    amber: "border-amber-300/10 bg-amber-500/[0.06] text-amber-100 hover:bg-amber-500/[0.10]",
    rose: "border-rose-300/10 bg-rose-500/[0.06] text-rose-100 hover:bg-rose-500/[0.10]",
    sky: "border-sky-300/10 bg-sky-500/[0.06] text-sky-100 hover:bg-sky-500/[0.10]",
  };

  return (
    <button onClick={onClick} className={`rounded-xl border px-2 py-2 text-[10px] font-semibold transition ${classes[tone]}`}>
      {label}
    </button>
  );
}

export function RadarMetric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky" | "violet";
  icon: ReactNode;
}) {
  const classes = {
    rose: "border-rose-400/10 bg-rose-500/[0.055] text-rose-100",
    amber: "border-amber-400/10 bg-amber-500/[0.055] text-amber-100",
    sky: "border-sky-400/10 bg-sky-500/[0.055] text-sky-100",
    violet: "border-violet-400/10 bg-violet-500/[0.055] text-violet-100",
  };

  return (
    <div className={`rounded-xl border p-2 ${classes[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] opacity-65">{label}</p>
        {icon}
      </div>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
