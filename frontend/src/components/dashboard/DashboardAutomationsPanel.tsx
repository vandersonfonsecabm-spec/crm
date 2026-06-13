import { Bell, Clock3, Flame, MessageCircle, PlayCircle, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";

type AutomationTone = "sky" | "rose" | "emerald";

type AutomationCardItem = {
  title: string;
  desc: string;
  badge: string;
  tone: AutomationTone;
  progress: string;
  impact: string;
  icon: ReactNode;
};

const automationCards: AutomationCardItem[] = [
  {
    title: "Follow-up automático",
    desc: "Agenda lembretes por etapa, prioridade e tempo sem contato.",
    badge: "Ativo",
    tone: "sky",
    progress: "72%",
    impact: "3h/sem",
    icon: <Bell size={14} className="text-sky-300" />,
  },
  {
    title: "Lead quente",
    desc: "Destaca oportunidades com score alto e valor relevante.",
    badge: "IA",
    tone: "rose",
    progress: "84%",
    impact: "Alto",
    icon: <Flame size={14} className="text-rose-300" />,
  },
  {
    title: "Mensagens rápidas",
    desc: "Organiza modelos para WhatsApp, retomada e proposta.",
    badge: "Template",
    tone: "emerald",
    progress: "64%",
    impact: "Médio",
    icon: <MessageCircle size={14} className="text-emerald-300" />,
  },
];

const journeyRules = [
  { title: "Novo lead recebido", desc: "Criar tarefa de primeiro contato em até 15 minutos.", status: "Ligado" },
  { title: "Proposta sem resposta", desc: "Sugerir retomada após 2 dias sem atividade.", status: "Ligado" },
  { title: "Cliente em risco", desc: "Alertar vendedor após 7 dias sem contato.", status: "Ligado" },
  { title: "Lead perdido", desc: "Agendar reativação comercial em 30 dias.", status: "Rascunho" },
];

export default function DashboardAutomationsPanel() {
  const activeRules = journeyRules.filter((rule) => rule.status === "Ligado").length;

  return (
    <div className="space-y-4">
      <section className="saas-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
                <Zap size={17} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">Central de automações</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Regras para acelerar atendimento, retomada e follow-up.</p>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400">
              Jornadas comerciais com controle manual preservado, reduzindo tarefas repetitivas sem perder contexto do cliente.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TopSignal label="Regras" value={`${activeRules}/4`} tone="emerald" />
            <TopSignal label="Templates" value="12" tone="sky" />
            <TopSignal label="Rascunho" value="1" tone="amber" />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {automationCards.map((item) => (
            <AutomationCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="saas-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-100">Jornadas comerciais</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Regras prontas para operar com supervisão humana.</p>
            </div>
            <span className="saas-chip rounded-full px-2 py-1 text-[10px]">{journeyRules.length} regras</span>
          </div>

          <div className="space-y-2">
            {journeyRules.map((rule, index) => (
              <div key={rule.title} className="saas-row rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-500/16 bg-slate-900/70 text-[10px] font-semibold text-slate-300">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-100">{rule.title}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{rule.desc}</p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${
                      rule.status === "Ligado"
                        ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200"
                        : "border-slate-500/16 bg-slate-950/25 text-slate-400"
                    }`}
                  >
                    {rule.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="saas-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-100">Leitura inteligente</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Próxima automação sugerida.</p>
            </div>
            <Sparkles size={15} className="text-slate-300" />
          </div>

          <div className="space-y-3">
            <div className="metric-card metric-pipeline rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100">Prioridade do dia</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Priorizar propostas quentes e leads com follow-up hoje antes de criar novas campanhas.
                  </p>
                </div>
                <PlayCircle size={15} className="shrink-0 text-teal-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="metric-card rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Economia</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">3h/semana</p>
              </div>

              <div className="metric-card metric-forecast rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Impacto</p>
                <p className="mt-1 text-sm font-semibold text-amber-100">Alto</p>
              </div>
            </div>

            <button className="saas-action flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] text-slate-300">
              <span>Preparar próxima automação</span>
              <Clock3 size={13} className="text-slate-500" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AutomationCard({
  title,
  desc,
  badge,
  tone,
  progress,
  impact,
  icon,
}: {
  title: string;
  desc: string;
  badge: string;
  tone: AutomationTone;
  progress: string;
  impact: string;
  icon: ReactNode;
}) {
  const classes = {
    sky: "metric-card metric-revenue text-sky-100",
    rose: "metric-card metric-risk text-rose-100",
    emerald: "metric-card metric-pipeline text-emerald-100",
  }[tone];

  return (
    <div className={`rounded-xl p-3 ${classes}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/25">
            {icon}
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{title}</p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] opacity-55">Impacto {impact}</p>
          </div>
        </div>

        <span className="saas-chip shrink-0 rounded-full px-2 py-0.5 text-[9px]">{badge}</span>
      </div>

      <p className="mt-2 text-[11px] leading-4 opacity-65">{desc}</p>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-slate-200/75" style={{ width: progress }} />
        </div>
        <span className="text-[9px] font-semibold opacity-70">{progress}</span>
      </div>
    </div>
  );
}

function TopSignal({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "amber" }) {
  const classes = {
    emerald: "metric-pipeline text-emerald-100",
    sky: "metric-revenue text-sky-100",
    amber: "metric-forecast text-amber-100",
  };

  return (
    <div className={`metric-card min-w-[82px] rounded-xl px-2.5 py-2 text-right ${classes[tone]}`}>
      <p className="text-[8px] uppercase tracking-[0.12em] opacity-65">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}
