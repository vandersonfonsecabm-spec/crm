import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyDecisionState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-500/20 bg-slate-950/25 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/70 text-slate-400">
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
    <div className="saas-tile rounded-xl p-2">
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
      className="saas-action rounded-xl px-2 py-1.5 text-left"
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
      className="inline-flex items-center gap-1 rounded-lg border border-slate-500/14 bg-slate-900/45 px-2 py-1.5 text-[11px] text-slate-300 transition hover:bg-slate-800/70"
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
    amber: "saas-accent-amber text-amber-100",
    rose: "saas-accent-rose text-rose-100",
    sky: "saas-accent-sky text-sky-100",
  };

  return (
    <button onClick={onClick} className={`saas-action rounded-xl px-2 py-2 text-[10px] font-semibold ${classes[tone]}`}>
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
    rose: "saas-accent-rose text-rose-100",
    amber: "saas-accent-amber text-amber-100",
    sky: "saas-accent-sky text-sky-100",
    violet: "text-slate-100",
  };

  return (
    <div className={`saas-tile rounded-xl p-2 ${classes[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] opacity-65">{label}</p>
        {icon}
      </div>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}
