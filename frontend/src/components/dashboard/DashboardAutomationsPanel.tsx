import { Bell, Flame, MessageCircle, Sparkles, Zap } from "lucide-react";

export default function DashboardAutomationsPanel() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045] hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10">
                <Zap size={15} className="text-violet-200" />
              </div>

              <div>
                <p className="text-sm font-semibold">Central de Automações</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Regras comerciais preparadas para backend real.
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400">
              Configure jornadas, lembretes e mensagens inteligentes para acelerar o atendimento sem perder o controle manual do vendedor.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.06] px-3 py-2">
            <p className="text-[10px] text-emerald-200/70">Status operacional</p>
            <p className="mt-0.5 text-xs font-semibold text-emerald-100">Pronto para integração</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { title: "Follow-up automático", desc: "Lembretes por etapa, prioridade e tempo parado.", badge: "Ativo", icon: <Bell size={14} className="text-sky-300" /> },
            { title: "Lead quente", desc: "Sinaliza oportunidades com score alto e valor relevante.", badge: "IA", icon: <Flame size={14} className="text-rose-300" /> },
            { title: "Mensagens rápidas", desc: "Modelos comerciais para WhatsApp e retomada.", badge: "Template", icon: <MessageCircle size={14} className="text-emerald-300" /> },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035] hover:shadow-lg hover:shadow-black/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                    {item.icon}
                  </div>

                  <p className="text-xs font-semibold">{item.title}</p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">
                  {item.badge}
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-4 text-slate-500">{item.desc}</p>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/60" style={{ width: item.badge === "IA" ? "84%" : item.badge === "Ativo" ? "72%" : "64%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Jornadas comerciais</p>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-slate-300">4 regras</span>
          </div>

          <div className="space-y-2">
            {[
              { title: "Novo lead recebido", desc: "Criar tarefa de primeiro contato em até 15 minutos.", status: "Ligado" },
              { title: "Proposta sem resposta", desc: "Sugerir retomada após 2 dias sem atividade.", status: "Ligado" },
              { title: "Cliente em risco", desc: "Alertar vendedor quando passar de 7 dias sem contato.", status: "Ligado" },
              { title: "Lead perdido", desc: "Agendar reativação comercial em 30 dias.", status: "Rascunho" },
            ].map((rule) => (
              <div key={rule.title} className="rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{rule.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{rule.desc}</p>
                  </div>

                  <span className={`rounded-full px-2 py-0.5 text-[9px] ${rule.status === "Ligado" ? "bg-emerald-500/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>
                    {rule.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.045]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Leitura IA</p>
            <Sparkles size={15} className="text-violet-300" />
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-violet-400/10 bg-violet-500/[0.06] p-3">
              <p className="text-xs font-semibold text-violet-100">Sugestão principal</p>
              <p className="mt-1 text-[11px] leading-4 text-violet-100/70">
                Priorizar propostas quentes e leads com follow-up hoje antes de criar novas campanhas.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] text-slate-500">Economia estimada</p>
                <p className="mt-1 text-sm font-semibold">3h/semana</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] text-slate-500">Impacto comercial</p>
                <p className="mt-1 text-sm font-semibold">Alto</p>
              </div>
            </div>

            <button className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10">
              Preparar próxima automação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
