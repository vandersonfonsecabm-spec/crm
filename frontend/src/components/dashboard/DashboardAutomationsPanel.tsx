import {
  Bell,
  CheckCircle2,
  Clock3,
  Edit3,
  Flame,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

type AutomationTone = "emerald" | "sky" | "amber" | "rose";
type RuleStatus = "Ativa" | "Pausada";

type AutomationRule = {
  title: string;
  description: string;
  trigger: string;
  action: string;
  status: RuleStatus;
  impact: string;
  metric: string;
  tone: AutomationTone;
  icon: ReactNode;
};

type CommercialTemplate = {
  title: string;
  description: string;
  tone: AutomationTone;
  icon: ReactNode;
};

const automationRules: AutomationRule[] = [
  {
    title: "Follow-up de proposta",
    description: "Mantém propostas abertas no radar do time comercial.",
    trigger: "Cliente em proposta por 2 dias",
    action: "Gerar lembrete comercial",
    status: "Ativa",
    impact: "8 follow-ups",
    metric: "R$ 28.200,00 monitorados",
    tone: "sky",
    icon: <Bell size={15} />,
  },
  {
    title: "Cliente sem contato",
    description: "Sinaliza clientes que perderam ritmo de relacionamento.",
    trigger: "5 dias sem interação",
    action: "Sinalizar prioridade",
    status: "Ativa",
    impact: "3 retomadas",
    metric: "Carteira silenciosa",
    tone: "amber",
    icon: <Clock3 size={15} />,
  },
  {
    title: "Lead quente",
    description: "Destaca oportunidades com score alto e ticket relevante.",
    trigger: "Score acima de 85",
    action: "Marcar oportunidade quente",
    status: "Ativa",
    impact: "4 oportunidades",
    metric: "Alta intenção",
    tone: "rose",
    icon: <Flame size={15} />,
  },
  {
    title: "Carteira em risco",
    description: "Apoia o gestor na revisão de contas com queda de atividade.",
    trigger: "Risco comercial alto",
    action: "Alertar responsável",
    status: "Pausada",
    impact: "1 alerta",
    metric: "Revisão manual",
    tone: "rose",
    icon: <ShieldCheck size={15} />,
  },
];

const commercialTemplates: CommercialTemplate[] = [
  {
    title: "Recuperar proposta parada",
    description: "Retomada objetiva para negociação sem resposta.",
    tone: "amber",
    icon: <MessageCircle size={14} />,
  },
  {
    title: "Lembrar follow-up de hoje",
    description: "Prioriza clientes com janela aberta no dia.",
    tone: "sky",
    icon: <Bell size={14} />,
  },
  {
    title: "Reativar cliente silencioso",
    description: "Sinaliza contas sem contato recente.",
    tone: "emerald",
    icon: <RotateCcw size={14} />,
  },
  {
    title: "Marcar oportunidade quente",
    description: "Destaca maior chance de fechamento.",
    tone: "rose",
    icon: <Flame size={14} />,
  },
];

const recentEvents = [
  { client: "Rafael Lima", event: "entrou na fila de follow-up.", meta: "Proposta aberta" },
  { client: "Mariana Costa", event: "recebeu alerta de proposta.", meta: "Alta prioridade" },
  { client: "Felipe Andrade", event: "foi marcado como cliente em expansão.", meta: "Carteira ativa" },
  { client: "Daniel Martins", event: "voltou para revisão comercial.", meta: "Sem contato recente" },
];

const toneClass: Record<AutomationTone, string> = {
  emerald: "metric-pipeline text-emerald-100",
  sky: "metric-revenue text-sky-100",
  amber: "metric-forecast text-amber-100",
  rose: "metric-risk text-rose-100",
};

const iconToneClass: Record<AutomationTone, string> = {
  emerald: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200",
  sky: "border-sky-300/20 bg-sky-300/[0.08] text-sky-200",
  amber: "border-amber-300/20 bg-amber-300/[0.08] text-amber-200",
  rose: "border-rose-300/20 bg-rose-300/[0.08] text-rose-200",
};

export default function DashboardAutomationsPanel() {
  return (
    <div className="space-y-4">
      <section className="saas-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
              <Zap size={17} />
            </div>

            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-100">Automações</p>
              <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-400">
                Regras comerciais para manter follow-ups, propostas e carteira em movimento.
              </p>
            </div>
          </div>

          <div className="metric-card metric-pipeline rounded-xl px-3 py-2 text-right text-teal-100">
            <p className="text-[9px] uppercase tracking-[0.14em] text-teal-100/65">Decisão assistida</p>
            <p className="mt-1 text-xs font-semibold">Controle do time</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="saas-panel min-w-0 rounded-2xl p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">Regras ativas</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Gatilhos comerciais com ação revisável pelo time.</p>
            </div>
            <span className="saas-chip shrink-0 rounded-full px-2 py-1 text-[10px]">4 regras</span>
          </div>

          <div className="grid gap-2">
            {automationRules.map((rule) => (
              <RuleCard key={rule.title} rule={rule} />
            ))}
          </div>
        </section>

        <aside className="grid min-w-0 gap-4">
          <section className="saas-panel rounded-2xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">Templates comerciais</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Modelos prontos para organizar próximas regras.</p>
              </div>
              <Target size={15} className="shrink-0 text-slate-400" />
            </div>

            <div className="space-y-2">
              {commercialTemplates.map((template) => (
                <TemplateItem key={template.title} template={template} />
              ))}
            </div>
          </section>

          <section className="saas-panel rounded-2xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">Histórico recente</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Movimentos comerciais sem dados sensíveis.</p>
              </div>
              <CheckCircle2 size={15} className="shrink-0 text-emerald-200" />
            </div>

            <div className="space-y-2">
              {recentEvents.map((event) => (
                <HistoryItem key={`${event.client}-${event.meta}`} {...event} />
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="saas-panel rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] leading-5 text-slate-400">
          <ShieldCheck size={15} className="shrink-0 text-teal-200" />
          <span>As regras ajudam a priorizar a carteira sem substituir a decisão do time.</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block" />
          <span>Revise alertas antes de agir com o cliente.</span>
        </div>
      </section>
    </div>
  );
}

function RuleCard({ rule }: { rule: AutomationRule }) {
  const isActive = rule.status === "Ativa";

  return (
    <article className="saas-row rounded-xl p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconToneClass[rule.tone]}`}>
          {rule.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-slate-100">{rule.title}</p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                isActive
                  ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200"
                  : "border-slate-500/16 bg-slate-950/25 text-slate-400"
              }`}
            >
              {rule.status}
            </span>
          </div>

          <p className="mt-1 text-[11px] leading-4 text-slate-500">{rule.description}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <RuleDetail label="Gatilho" value={rule.trigger} />
        <RuleDetail label="Ação gerada" value={rule.action} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className={`metric-card rounded-lg px-2.5 py-2 ${toneClass[rule.tone]}`}>
          <p className="text-[9px] uppercase tracking-[0.14em] opacity-60">Impacto</p>
          <p className="mt-0.5 truncate text-xs font-semibold">{rule.impact}</p>
        </div>
        <div className="metric-card rounded-lg px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Leitura</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-200">{rule.metric}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 sm:justify-end">
        <button type="button" className="saas-action inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-300 sm:flex-none">
          <Edit3 size={12} />
          Editar
        </button>
        <button type="button" className="saas-action inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-300 sm:flex-none">
          {isActive ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
          {isActive ? "Pausar" : "Ativar"}
        </button>
      </div>
    </article>
  );
}

function RuleDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-500/12 bg-slate-950/25 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-300">{value}</p>
    </div>
  );
}

function TemplateItem({ template }: { template: CommercialTemplate }) {
  return (
    <button type="button" className="saas-action flex w-full items-start gap-3 rounded-xl p-3 text-left">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconToneClass[template.tone]}`}>
        {template.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-slate-100">{template.title}</p>
          <span className="saas-chip shrink-0 rounded-full px-2 py-0.5 text-[9px]">pronto</span>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{template.description}</p>
      </div>
    </button>
  );
}

function HistoryItem({ client, event, meta }: { client: string; event: string; meta: string }) {
  return (
    <div className="saas-row rounded-xl px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-200/80" />
        <div className="min-w-0">
          <p className="text-[11px] leading-4 text-slate-300">
            <span className="font-semibold text-slate-100">{client}</span> {event}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">{meta}</p>
        </div>
      </div>
    </div>
  );
}
