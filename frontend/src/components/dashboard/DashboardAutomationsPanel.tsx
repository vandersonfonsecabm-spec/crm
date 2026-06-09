import { Bell, Flame, MessageCircle, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";

type AutomationTone = "sky" | "rose" | "emerald";

type AutomationCardItem = {
  title: string;
  desc: string;
  badge: string;
  tone: AutomationTone;
  progress: string;
  icon: ReactNode;
};

const automationCards: AutomationCardItem[] = [
  {
    title: "Follow-up automático",
    desc: "Agenda lembretes por etapa, prioridade e tempo sem contato.",
    badge: "Ativo",
    tone: "sky",
    progress: "72%",
    icon: <Bell size={14} className="text-sky-300" />,
  },
  {
    title: "Lead quente",
    desc: "Destaca oportunidades com score alto e valor relevante.",
    badge: "IA",
    tone: "rose",
    progress: "84%",
    icon: <Flame size={14} className="text-rose-300" />,
  },
  {
    title: "Mensagens rápidas",
    desc: "Organiza modelos para WhatsApp, retomada e proposta.",
    badge: "Template",
    tone: "emerald",
    progress: "64%",
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
  return (
    <div className="space-y-4">
      <section className="saas-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-300/18 bg-teal-300/[0.06] text-teal-100">
                <Zap size={15} />
              </div>

              <div>
                <p className="text-sm font-semibold">Central de automações</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Regras para acelerar atendimento, retomada e follow-up.
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400">
              Configure jornadas comerciais com controle manual preservado, reduzindo tarefas repetitivas sem perder contexto do cliente.
            </p>
          </div>

          <div className="saas-tile saas-accent-emerald rounded-xl px-3 py-2">
            <p className="text-[10px] text-slate-500">Status operacional</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-100">Operação monitorada</p>
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Jornadas comerciais</p>
            <span className="saas-chip rounded-full px-2 py-1 text-[10px]">4 regras</span>
          </div>

          <div className="space-y-2">
            {journeyRules.map((rule) => (
              <div key={rule.title} className="saas-row rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{rule.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{rule.desc}</p>
                  </div>

                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] ${
                      rule.status === "Ligado"
                        ? "border-emerald-300/20 bg-slate-950/25 text-emerald-200"
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Leitura inteligente</p>
            <Sparkles size={15} className="text-slate-300" />
          </div>

          <div className="space-y-3">
            <div className="saas-tile rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-100">Prioridade do dia</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Priorizar propostas quentes e leads com follow-up hoje antes de criar novas campanhas.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="saas-card rounded-xl p-3">
                <p className="text-[10px] text-slate-500">Economia estimada</p>
                <p className="mt-1 text-sm font-semibold">3h/semana</p>
              </div>

              <div className="saas-card rounded-xl p-3">
                <p className="text-[10px] text-slate-500">Impacto comercial</p>
                <p className="mt-1 text-sm font-semibold">Alto</p>
              </div>
            </div>

            <button className="saas-action w-full rounded-xl px-3 py-2 text-left text-[11px] text-slate-300">
              Preparar próxima automação
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
  icon,
}: {
  title: string;
  desc: string;
  badge: string;
  tone: AutomationTone;
  progress: string;
  icon: ReactNode;
}) {
  const accentClass = {
    sky: "saas-accent-sky",
    rose: "saas-accent-rose",
    emerald: "saas-accent-emerald",
  }[tone];

  return (
    <div className={`saas-tile ${accentClass} rounded-xl p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950/25">
            {icon}
          </div>

          <p className="truncate text-xs font-semibold">{title}</p>
        </div>

        <span className="saas-chip rounded-full px-2 py-0.5 text-[9px]">{badge}</span>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-slate-500">{desc}</p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-slate-300/70" style={{ width: progress }} />
      </div>
    </div>
  );
}
