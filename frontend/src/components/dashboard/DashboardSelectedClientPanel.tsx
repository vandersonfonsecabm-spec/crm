import { Copy, Edit3, MessageCircle, Phone } from "lucide-react";
import type { Client, Status } from "../../types/dashboard";
import DashboardClientTimeline from "./DashboardClientTimeline";
import { ActionButton, DecisionMini, SmallButton } from "./DashboardDrawerPrimitives";

type DashboardSelectedClientPanelProps = {
  selectedClient: Client;
  noteText: string;
  tagText: string;
  money: (value: number) => string;
  initials: (name: string) => string;
  statusClass: (status: Status) => string;
  tagClass: (tag: string) => string;
  customerFitLabel: (client: Client) => string;
  leadOwner: (client: Client) => string;
  nextActionLabel: (client: Client) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  slaLabel: (client: Client) => string;
  whatsappMessage: (client: Client) => string;
  onSetNoteText: (value: string) => void;
  onSetTagText: (value: string) => void;
  onAddNote: () => void;
  onAddTagToSelected: () => void;
  onRemoveTagFromSelected: (tag: string) => void;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
};

export default function DashboardSelectedClientPanel({
  selectedClient,
  noteText,
  tagText,
  money,
  initials,
  statusClass,
  tagClass,
  customerFitLabel,
  leadOwner,
  nextActionLabel,
  getLeadScore,
  getRisk,
  slaLabel,
  whatsappMessage,
  onSetNoteText,
  onSetTagText,
  onAddNote,
  onAddTagToSelected,
  onRemoveTagFromSelected,
  onEditClient,
  onCopyText,
}: DashboardSelectedClientPanelProps) {
  const leadScore = getLeadScore(selectedClient);

  return (
    <div className="p-3">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-black shadow-[0_0_22px_rgba(255,255,255,0.12)]">
              {initials(selectedClient.name)}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{selectedClient.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{selectedClient.company}</p>
            </div>
          </div>

          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
            {selectedClient.status}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_86px] gap-2">
          <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-100/50">Valor potencial</p>
            <p className="mt-1 text-sm font-semibold text-emerald-100">{money(selectedClient.value)}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-center">
            <p className="text-[9px] text-slate-500">Score</p>
            <p className="mt-0.5 text-xl font-black leading-none text-slate-100">{leadScore}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.055] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-violet-100">Proxima melhor acao</p>
            <span className="rounded-full border border-violet-300/10 bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">
              decisao
            </span>
          </div>

          <p className="text-[10px] leading-relaxed text-violet-100/70">{nextActionLabel(selectedClient)}</p>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <DecisionMini label="Fit" value={customerFitLabel(selectedClient)} />
          <DecisionMini label="Dono" value={leadOwner(selectedClient)} />
          <DecisionMini label="Risco" value={getRisk(selectedClient)} />
          <DecisionMini label="SLA" value={slaLabel(selectedClient)} />
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>Forca comercial</span>
            <span>{leadScore}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.35)]"
              style={{ width: `${leadScore}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <a
            href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white px-2 py-2 text-left text-black transition hover:opacity-90"
          >
            <MessageCircle size={14} className="mb-1" />
            <p className="text-[10px] font-black">WhatsApp</p>
          </a>

          <ActionButton
            icon={<Phone size={13} className="mb-1 text-emerald-300" />}
            label="Telefone"
            onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
          />

          <ActionButton
            icon={<Copy size={13} className="mb-1 text-sky-300" />}
            label="Mensagem"
            onClick={() => onCopyText(whatsappMessage(selectedClient), "Mensagem copiada.")}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {selectedClient.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onRemoveTagFromSelected(tag)}
              className={`rounded-full border px-2 py-0.5 text-[9px] ${tagClass(tag)}`}
            >
              {tag} x
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={tagText}
            onChange={(event) => onSetTagText(event.target.value)}
            placeholder="Nova tag..."
            className="flex-1 select-text rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500"
          />
          <button onClick={onAddTagToSelected} className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-black">
            Tag
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <SmallButton onClick={() => onEditClient(selectedClient)} icon={<Edit3 size={12} />} label="Editar" />
          <SmallButton
            onClick={() =>
              onCopyText(
                `${selectedClient.name} | ${selectedClient.company} | ${money(selectedClient.value)} | ${selectedClient.status}`,
                "Resumo copiado."
              )
            }
            icon={<Copy size={12} />}
            label="Resumo"
          />
        </div>
      </div>

      <DashboardClientTimeline
        selectedClient={selectedClient}
        noteText={noteText}
        getLeadScore={getLeadScore}
        getRisk={getRisk}
        onSetNoteText={onSetNoteText}
        onAddNote={onAddNote}
      />
    </div>
  );
}
