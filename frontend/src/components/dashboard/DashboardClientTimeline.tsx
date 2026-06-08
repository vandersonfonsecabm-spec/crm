import { Plus, Sparkles, StickyNote } from "lucide-react";
import type { Client } from "../../types/dashboard";

type DashboardClientTimelineProps = {
  selectedClient: Client;
  noteText: string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  onSetNoteText: (value: string) => void;
  onAddNote: () => void;
};

export default function DashboardClientTimeline({
  selectedClient,
  noteText,
  getLeadScore,
  getRisk,
  onSetNoteText,
  onAddNote,
}: DashboardClientTimelineProps) {
  const idleLabel = getIdleLabel(selectedClient);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="border-b border-white/10 bg-white/[0.025] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
              <StickyNote size={14} />
            </div>

            <div>
              <p className="text-xs font-semibold">Timeline comercial</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {idleLabel} sem contato - proxima {selectedClient.nextFollowUp}
              </p>
            </div>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
            {selectedClient.notes.length}
          </span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(event) => onSetNoteText(event.target.value)}
            placeholder="Registrar interacao..."
            className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
          />
          <button onClick={onAddNote} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black">
            <Plus size={12} />
            Add
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="relative rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
            <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.55)]" />
            <div className="pl-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-emerald-100">Acao recomendada</p>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-100">acao</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/65">
                {getLeadScore(selectedClient) >= 80
                  ? "Priorizar contato hoje e conduzir para fechamento."
                  : getRisk(selectedClient) === "Alto"
                    ? "Reativar com mensagem objetiva antes de mover para perdido."
                    : "Manter cadencia de follow-up e registrar resposta do cliente."}
              </p>
            </div>
          </div>

          {selectedClient.notes.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5">
              <p className="text-[11px] text-slate-500">Nenhuma nota adicionada ainda.</p>
              <p className="mt-1 text-[10px] text-slate-600">Registre ligacoes, propostas, objecoes e proximos passos.</p>
            </div>
          )}

          {selectedClient.notes.map((note, index) => (
            <div
              key={note.id}
              className="relative rounded-xl border border-white/10 bg-white/[0.035] p-2.5 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.055]"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] ${
                    index === 0
                      ? "border-sky-300/20 bg-sky-500/10 text-sky-200"
                      : "border-white/10 bg-white/5 text-slate-400"
                  }`}
                >
                  {index === 0 ? <Sparkles size={12} /> : <StickyNote size={12} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-200">
                      {index === 0 ? "Ultima interacao" : "Registro comercial"}
                    </p>
                    <span className="shrink-0 text-[9px] text-slate-600">{note.date}</span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-400">{note.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getIdleLabel(client: Client) {
  if (client.lastContactDays === 0) return "Hoje";
  if (client.lastContactDays === 1) return "1 dia";
  return `${client.lastContactDays} dias`;
}
