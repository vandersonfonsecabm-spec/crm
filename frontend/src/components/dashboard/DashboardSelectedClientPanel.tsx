import { Copy, Edit3, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
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
      <div className="saas-card rounded-2xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.08] text-xs font-bold text-teal-100">
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

        <div className="mt-3 grid gap-2">
          <ContactLine icon={<Phone size={12} />} value={selectedClient.phone} />
          <ContactLine icon={<Mail size={12} />} value={selectedClient.email || "Email nao informado"} />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_86px] gap-2">
          <div className="metric-card metric-pipeline rounded-xl p-2.5">
            <p className="text-[9px] uppercase tracking-[0.14em] text-teal-100/55">Valor potencial</p>
            <p className="mt-1 text-sm font-semibold text-teal-100">{money(selectedClient.value)}</p>
          </div>

          <div className="metric-card rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-slate-500">Score</p>
            <p className="mt-0.5 text-xl font-semibold leading-none text-slate-100">{leadScore}</p>
          </div>
        </div>

        <div className="saas-tile mt-3 rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-100">Proxima melhor acao</p>
            <span className="saas-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]">
              <ShieldCheck size={10} />
              decisao
            </span>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400">{nextActionLabel(selectedClient)}</p>
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
              className={`h-full rounded-full ${leadScore >= 80 ? "bg-emerald-300" : leadScore >= 60 ? "bg-amber-300" : "bg-slate-400"}`}
              style={{ width: `${leadScore}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <a
            href={`https://wa.me/${selectedClient.phone}?text=${encodeURIComponent(whatsappMessage(selectedClient))}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-slate-100 px-2 py-2 text-left text-slate-950 transition hover:bg-white"
          >
            <MessageCircle size={14} className="mb-1" />
            <p className="text-[10px] font-semibold">WhatsApp</p>
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
            className="flex-1 select-text rounded-lg border border-slate-500/16 bg-slate-950/25 px-2 py-1.5 text-xs outline-none placeholder:text-slate-500 focus:border-teal-300/24"
          />
          <button onClick={onAddTagToSelected} className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-white">
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

function ContactLine({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-500/12 bg-slate-950/24 px-2.5 py-2 text-[10px] text-slate-400">
      <span className="shrink-0 text-slate-500">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
