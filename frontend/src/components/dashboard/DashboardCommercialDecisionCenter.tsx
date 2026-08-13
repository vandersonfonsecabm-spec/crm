import { Activity, AlertTriangle, Edit3, MessageCircle, Phone, ShieldCheck, Sparkles, Target } from "lucide-react";
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
  onEditClient: (client: Client) => void;
  onCopyText: (text: string, message: string) => void;
  onRequestWhatsapp: (client: Client) => void;
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
  onEditClient,
  onCopyText,
  onRequestWhatsapp,
  onApplySmartFilter,
  mode,
}: DashboardCommercialDecisionCenterProps) {
  const highRiskClients = clients.filter((client) => getRisk(client) === "Alto");
  const hotOpportunities = clients.filter((client) => client.hot || client.value >= 12000);
  const proposalValue = clients
    .filter((client) => client.status === "Proposta")
    .reduce((sum, client) => sum + client.value, 0);

  const leadScore = selectedClient ? getLeadScore(selectedClient) : 0;

  return (
    <div className="saas-panel decision-drawer rounded-2xl">
      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
              <Sparkles size={15} />
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">Central comercial</p>
              <p className="text-[10px] text-slate-600">Decisão, risco e ação imediata</p>
            </div>
          </div>

          <span className="saas-chip shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold">Ativo</span>
        </div>
      </div>

      <div className="p-3">
        {selectedClient ? (
          <div className="saas-card rounded-2xl p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{selectedClient.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{selectedClient.company}</p>
              </div>

              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(selectedClient.status)}`}>
                {selectedClient.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_78px] gap-2">
              <div className="metric-card metric-pipeline rounded-xl p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-teal-700">Ticket em foco</p>
                <p className="mt-1 truncate text-sm font-semibold text-teal-800">{money(selectedClient.value)}</p>
              </div>

              <div className="metric-card rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500">Score</p>
                <p className="mt-0.5 text-xl font-semibold leading-none text-slate-900">{leadScore}</p>
              </div>
            </div>

            <div className="saas-tile mt-3 rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[10px]">
                <span className="font-semibold text-slate-900">Ação recomendada</span>
                <span className="saas-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]">
                  <ShieldCheck size={10} />
                  agora
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-700">{nextActionLabel(selectedClient)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-700">
              <DecisionMini label="Prioridade" value={priorityLabel(selectedClient)} />
              <DecisionMini label="Saúde" value={slaLabel(selectedClient)} />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Força comercial</span>
                <span>{leadScore}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${leadScore >= 80 ? "bg-emerald-600" : leadScore >= 60 ? "bg-amber-500" : "bg-slate-500"}`}
                  style={{ width: `${leadScore}%` }}
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                onClick={() => onRequestWhatsapp(selectedClient)}
                className="min-h-11 rounded-xl bg-slate-100 px-2 py-2 text-left text-slate-900 transition hover:bg-white"
                type="button"
              >
                <MessageCircle size={14} className="mb-1" />
                <p className="text-[10px] font-semibold">WhatsApp</p>
              </button>

              <ActionButton
                icon={<Phone size={13} className="mb-1 text-emerald-700" />}
                label="Telefone"
                onClick={() => onCopyText(selectedClient.phone, "Telefone copiado.")}
              />

              <ActionButton
                icon={<Edit3 size={13} className="mb-1 text-sky-700" />}
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
            <RadarMetric label="Risco alto" value={`${highRiskClients.length} oportunidades`} tone="rose" icon={<AlertTriangle size={12} className="text-rose-700" />} />
            <RadarMetric label="Quentes" value={`${hotOpportunities.length} oportunidades`} tone="amber" icon={<Target size={12} className="text-amber-700" />} />
            <RadarMetric label="Hoje" value={`${analytics.todayFollowUps} ações`} tone="sky" icon={<Activity size={12} className="text-sky-700" />} />
            <RadarMetric label="Propostas" value={money(proposalValue)} tone="violet" icon={<Sparkles size={12} className="text-violet-700" />} />
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <FilterAction tone="amber" label="Propostas" onClick={() => onApplySmartFilter("proposal")} />
          <FilterAction tone="rose" label="Silenciosos" onClick={() => onApplySmartFilter("silent")} />
          <FilterAction tone="sky" label="Risco" onClick={() => onApplySmartFilter("risk")} />
        </div>

        {mode === "kanban" && (
          <p className="saas-card mt-3 rounded-xl px-2 py-1.5 text-[10px] leading-relaxed text-slate-500">
            Arraste oportunidades entre etapas e use esta central para decidir onde agir primeiro.
          </p>
        )}
      </div>
    </div>
  );
}
