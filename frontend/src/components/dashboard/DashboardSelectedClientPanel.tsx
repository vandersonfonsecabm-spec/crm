import {
  Copy,
  Edit3,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Tag,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Client, Status } from "../../types/dashboard";
import DashboardClientTimeline from "./DashboardClientTimeline";
import { SmallButton } from "./DashboardDrawerPrimitives";

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
  onRequestWhatsapp: (client: Client) => void;
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
  onRequestWhatsapp,
}: DashboardSelectedClientPanelProps) {
  const leadScore = getLeadScore(selectedClient);
  const risk = getRisk(selectedClient);
  const sla = slaLabel(selectedClient);
  const fit = customerFitLabel(selectedClient);
  const owner = leadOwner(selectedClient);
  const message = whatsappMessage(selectedClient);

  return (
    <div className="p-3">
      <div className="saas-card rounded-2xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-xs font-bold text-teal-100 shadow-inner shadow-white/5">
              {initials(selectedClient.name)}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-100">
                {selectedClient.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {selectedClient.company}
              </p>
            </div>
          </div>

          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
            {selectedClient.status}
          </span>
        </div>

        <div className="mt-3 grid gap-1.5">
          <ContactRow
            icon={<Phone size={12} />}
            label="Telefone"
            value={selectedClient.phone}
            onCopy={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
          />
          <ContactRow
            icon={<Mail size={12} />}
            label="E-mail"
            value={selectedClient.email || "E-mail não informado"}
            onCopy={
              selectedClient.email
                ? () => onCopyText(selectedClient.email, "E-mail copiado.")
                : undefined
            }
          />
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_78px] gap-2">
          <div className="metric-card metric-pipeline rounded-xl p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-[0.14em] text-teal-100/55">
                Oportunidade
              </p>
              <TrendingUp size={12} className="text-teal-100/70" />
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-teal-50">
              {money(selectedClient.value)}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-slate-500">
              Valor potencial
            </p>
          </div>

          <div className="metric-card rounded-xl p-2.5">
            <p className="text-center text-[9px] uppercase tracking-[0.12em] text-slate-500">
              Score
            </p>
            <p className="mt-1 text-center text-xl font-semibold leading-none text-slate-100">
              {leadScore}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={leadScore >= 80 ? "h-full rounded-full bg-teal-200" : leadScore >= 60 ? "h-full rounded-full bg-amber-200" : "h-full rounded-full bg-slate-400"}
                style={{ width: `${leadScore}%` }}
              />
            </div>
          </div>
        </div>

        <div className="saas-tile mt-3 rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-100">Ação recomendada</p>
            <span className="saas-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]">
              <ShieldCheck size={10} />
              prioridade
            </span>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400">
            {nextActionLabel(selectedClient)}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <DecisionStat label="Perfil" value={compactFit(fit)} />
          <DecisionStat label="Resp." value={owner} />
          <DecisionStat label="Risco" value={risk} tone={risk === "Alto" ? "risk" : "neutral"} />
          <DecisionStat label="Saúde" value={compactHealth(sla)} tone={sla === "Crítico" ? "risk" : "neutral"} />
        </div>

        <div className="mt-3 rounded-xl border border-slate-500/12 bg-slate-950/20 px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
            <span>Potencial comercial</span>
            <span className="font-semibold text-slate-300">{leadScore}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${leadScore >= 80 ? "bg-teal-200" : leadScore >= 60 ? "bg-amber-200" : "bg-slate-400"}`}
              style={{ width: `${leadScore}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => onRequestWhatsapp(selectedClient)}
            className="saas-action rounded-xl border-emerald-300/18 bg-emerald-300/[0.075] px-2 py-2 text-left text-emerald-50 hover:border-emerald-200/28 hover:bg-emerald-300/[0.11]"
            type="button"
          >
            <MessageCircle size={14} className="mb-1 text-emerald-200" />
            <p className="text-[10px] font-semibold">WhatsApp</p>
          </button>

          <QuickAction
            icon={<Phone size={13} />}
            label="Telefone"
            onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
          />

          <QuickAction
            icon={<Copy size={13} />}
            label="Mensagem"
            onClick={() => onCopyText(message, "Mensagem copiada.")}
          />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Tags
            </p>
            <span className="text-[9px] text-slate-600">{selectedClient.tags.length}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {selectedClient.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onRemoveTagFromSelected(tag)}
                className={`rounded-full border px-2 py-0.5 text-[9px] transition hover:border-slate-200/24 hover:brightness-110 ${tagClass(tag)}`}
                title="Remover tag"
                type="button"
              >
                {tag} ×
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-500/16 bg-slate-950/24 px-2">
            <Tag size={12} className="shrink-0 text-slate-500" />
            <input
              value={tagText}
              onChange={(event) => onSetTagText(event.target.value)}
              placeholder="Nova tag..."
              className="min-w-0 flex-1 select-text bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-500"
            />
          </div>

          <button
            onClick={onAddTagToSelected}
            className="rounded-lg border border-slate-200/14 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-white"
            type="button"
          >
            Adicionar
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-700/35 pt-3">
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

function ContactRow({
  icon,
  label,
  value,
  onCopy,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-500/12 bg-slate-950/22 px-2.5 py-1.5">
      <span className="shrink-0 text-slate-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{label}</p>
        <p className="truncate text-[10px] text-slate-400">{value}</p>
      </div>
      {onCopy && (
        <button
          onClick={onCopy}
          className="shrink-0 rounded-md border border-slate-500/12 bg-slate-900/45 p-1 text-slate-500 transition hover:border-slate-300/18 hover:text-slate-200"
          title={`Copiar ${label.toLowerCase()}`}
          type="button"
        >
          <Copy size={11} />
        </button>
      )}
    </div>
  );
}

function DecisionStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "risk";
}) {
  return (
    <div className={`metric-card rounded-xl px-2 py-2 ${tone === "risk" ? "metric-risk" : ""}`}>
      <p className="text-[8px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-slate-200">
        {value}
      </p>
    </div>
  );
}

function QuickAction({
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
      className="saas-action rounded-xl px-2 py-2 text-left text-slate-300 hover:text-slate-100"
      type="button"
    >
      <span className="mb-1 block text-slate-400">{icon}</span>
      <p className="text-[10px] font-semibold">{label}</p>
    </button>
  );
}

function compactFit(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("premium")) return "Premium";
  if (normalized.includes("validado")) return "Cliente";
  if (normalized.includes("bom")) return "Bom";
  if (normalized.includes("recuper")) return "Recup.";
  if (normalized.includes("qualifica")) return "Qualif.";
  return value.split(" ")[0] || value;
}

function compactHealth(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("cr")) return "Crítica";
  if (normalized.includes("aten")) return "Atenção";
  return "Boa";
}
