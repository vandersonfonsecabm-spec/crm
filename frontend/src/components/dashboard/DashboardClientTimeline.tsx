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
    <div className="saas-card mt-3 overflow-hidden rounded-2xl">
      <div className="border-b border-slate-700/40 bg-slate-950/18 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-teal-300/18 bg-teal-300/[0.06] text-teal-100">
              <StickyNote size={14} />
            </div>

            <div>
              <p className="text-xs font-semibold">Timeline comercial</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {idleLabel} sem contato - próxima {selectedClient.nextFollowUp}
              </p>
            </div>
          </div>

          <span className="saas-chip rounded-full px-2 py-1 text-[10px]">
            {selectedClient.notes.length}
          </span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(event) => onSetNoteText(event.target.value)}
            placeholder="Registrar interação..."
            className="flex-1 select-text rounded-lg border border-slate-500/16 bg-slate-950/25 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500 focus:border-teal-300/24"
          />
          <button onClick={onAddNote} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-white">
            <Plus size={12} />
            Add
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="saas-tile saas-accent-emerald relative rounded-xl p-2.5">
            <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-emerald-300" />
            <div className="pl-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-100">Ação recomendada</p>
                <span className="saas-chip rounded-full px-2 py-0.5 text-[9px]">ação</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {getLeadScore(selectedClient) >= 80
                  ? "Priorizar contato hoje e conduzir para fechamento."
                  : getRisk(selectedClient) === "Alto"
                    ? "Reativar com mensagem objetiva antes de mover para perdido."
                    : "Manter cadencia de follow-up e registrar resposta do cliente."}
              </p>
            </div>
          </div>

          {selectedClient.notes.length === 0 && (
            <div className="saas-tile rounded-xl p-2.5">
              <p className="text-[11px] text-slate-500">Nenhuma nota adicionada ainda.</p>
              <p className="mt-1 text-[10px] text-slate-600">Registre ligações, propostas, objeções e próximos passos.</p>
            </div>
          )}

          {selectedClient.notes.map((note, index) => (
            <div
              key={note.id}
              className="saas-row relative rounded-xl p-2.5"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] ${
                    index === 0
                      ? "border-sky-300/20 bg-slate-950/25 text-sky-200"
                      : "border-slate-500/16 bg-slate-950/25 text-slate-400"
                  }`}
                >
                  {index === 0 ? <Sparkles size={12} /> : <StickyNote size={12} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-200">
                      {index === 0 ? "Última interação" : "Registro comercial"}
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
