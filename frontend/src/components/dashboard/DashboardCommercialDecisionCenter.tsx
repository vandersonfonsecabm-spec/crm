import { Activity, AlertTriangle, Edit3, MessageCircle, Phone, Sparkles, Target } from "lucide-react";
import type { Analytics, Client, SmartFilterType, Status } from "../../types/dashboard";
import { ActionButton, DecisionMini, EmptyDecisionState, FilterAction, RadarMetric } from "./DashboardDrawerPrimitives";

type DashboardCommercialDecisionCenterProps = {
  selectedClient: Client | null;
  clients: Client[];
  analytics: Analytics;
  money: (value: number) => string;
  statusClass: (status: Status) => string;
  getLeadScore: (client: Client) => number;
  getRisk: (client: Client) => string;
  slaLabel: (client: Client) => string;
  priorityLabel: (client: Client) => string;
  nextActionLabel: (client: Client) => string;
  whatsappMessage: (client: Client) => string;
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onApplySmartFilter: (type: SmartFilterType) => void;
  mode: "kanban" | "default";
};

export default function DashboardCommercialDecisionCenter({
  selectedClient,
  clients,
  analytics,
  money,
  statusClass,
  getLeadScore,
  getRisk,
  slaLabel,
  priorityLabel,
  nextActionLabel,
  whatsappMessage,
  onEditClient,
  onCopyText,
  onApplySmartFilter,
  mode,
}: DashboardCommercialDecisionCenterProps) {
  const highRiskClients = clients.filter((client) => getRisk(client) === "Alto");
  const hotOpportunities = clients.filter((client) => client.hot || client.value >= 12000);
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(0,0,0,0.25)] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
      <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.035] to-transparent p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-200">
              <Sparkles size={15} />
            </div>

            <div>
              <p className="text-sm font-semibold">Central comercial</p>
              <p className="text-[10px] text-slate-500">Decisao, risco e acao imediata</p>
            </div>
          </div>

          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-200">
            Ativo
          </span>
        </div>
      </div>

      <div className="p-3">
        {selectedClient ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{selectedClient.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{selectedClient.company}</p>
              </div>

              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                {selectedClient.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_74px] gap-2">
              <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-100/50">Ticket em foco</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">{money(selectedClient.value)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-center">
                <p className="text-[9px] text-slate-500">Score</p>
                <p className="mt-0.5 text-xl font-black leading-none text-slate-100">{getLeadScore(selectedClient)}</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.055] p-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-semibold text-violet-100">Ação recomendada</span>
                <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[9px] text-violet-100">agora</span>
              </div>
              <p className="text-[10px] leading-relaxed text-violet-100/65">{nextActionLabel(selectedClient)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
              <DecisionMini label="Prioridade" value={priorityLabel(selectedClient)} />
              <DecisionMini label="Saúde" value={slaLabel(selectedClient)} />
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
                icon={<Edit3 size={13} className="mb-1 text-sky-300" />}
                label="Editar"
                onClick={() => onEditClient(selectedClient)}
              />
            </div>
          </div>
        ) : (
          <EmptyDecisionState />
        )}

        {mode !== "kanban" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <RadarMetric label="Risco alto" value={`${highRiskClients.length} leads`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-200" />} />
            <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-200" />} />
            <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} ações`} tone="sky" icon={<Activity size={12} className="text-sky-200" />} />
            <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-violet-200" />} />
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
          <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
          <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
        </div>

        {mode === "kanban" && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[10px] leading-relaxed text-slate-500">
            Arraste leads entre etapas e use esta central para decidir onde agir primeiro.
          </p>
        )}
      </div>
    </div>
  );
}
