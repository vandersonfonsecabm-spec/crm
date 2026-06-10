import { ArrowRight, Database, LockKeyhole, Mail, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { loginDemoWithBackend, loginWithBackend } from "../services/crmApi";

type LoginProps = {
  onLogin: () => void;
};

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleBackendLogin() {
    if (!email.trim() || !senha.trim()) {
      setMessage("Informe email e senha para conectar ao backend.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      await loginWithBackend(email.trim(), senha);
      onLogin();
    } catch {
      setMessage("Nao foi possivel entrar pelo backend. Use o modo demo ou confira a API.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoLogin() {
    setIsLoading(true);
    setMessage("");

    try {
      await loginDemoWithBackend();
      onLogin();
    } catch {
      setMessage("Demo indisponivel. Rode o seed/backend ou entre offline por enquanto.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOfflineLogin() {
    setMessage("");
    onLogin();
  }

  return (
    <main className="premium-shell flex min-h-screen items-center justify-center overflow-hidden bg-[#060b12] px-4 py-8 text-white">
      <section className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="saas-panel hidden min-h-[540px] rounded-2xl p-5 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/18 bg-teal-300/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-200" />
              CRM Agro SaaS
            </div>

            <div className="mt-10 max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Operacao comercial
              </p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-50">
                Acesso seguro ao painel de vendas e atendimento.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400">
                Carteira, pipeline, agenda e decisao comercial em um ambiente unico para o time operar com clareza.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <LoginSignal icon={<ShieldCheck size={15} />} label="Sessao" value="Protegida" tone="pipeline" />
            <LoginSignal icon={<Database size={15} />} label="Dados" value="Backend" tone="revenue" />
            <LoginSignal icon={<Wifi size={15} />} label="Demo" value="Disponivel" tone="forecast" />
          </div>
        </div>

        <div className="saas-panel rounded-2xl p-4 shadow-2xl shadow-black/35 sm:p-5">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/18 bg-teal-300/[0.07] text-teal-100">
                <Sparkles size={18} />
              </div>

              <div className="min-w-0">
                <p className="text-base font-semibold leading-tight">CRM Enterprise</p>
                <p className="mt-1 text-[11px] text-slate-500">Acesso operacional</p>
              </div>
            </div>

            <span className="saas-chip rounded-full px-2.5 py-1 text-[10px] font-semibold">
              seguro
            </span>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleBackendLogin();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Email
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-500/16 bg-slate-950/35 px-3 py-2.5 transition focus-within:border-teal-300/28 focus-within:bg-slate-900/70">
                <Mail size={15} className="shrink-0 text-slate-500" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="demo@crm.com"
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Senha
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-500/16 bg-slate-950/35 px-3 py-2.5 transition focus-within:border-teal-300/28 focus-within:bg-slate-900/70">
                <LockKeyhole size={15} className="shrink-0 text-slate-500" />
                <input
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Digite sua senha"
                  type="password"
                  autoComplete="current-password"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </label>

            {message && (
              <p className="rounded-xl border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="premium-button mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Conectando..." : "Entrar com backend"}
              {!isLoading && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={isLoading}
              className="saas-action rounded-xl px-3 py-3 text-left text-xs font-semibold text-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="block">Entrar demo</span>
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Base pronta para teste</span>
            </button>

            <button
              type="button"
              onClick={handleOfflineLogin}
              disabled={isLoading}
              className="saas-action rounded-xl px-3 py-3 text-left text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="block">Entrar offline</span>
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Usar dados locais</span>
            </button>
          </div>

          <div className="metric-card mt-5 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-teal-300/18 bg-teal-300/[0.065] text-teal-100">
                <ShieldCheck size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-200">Ambiente de acesso</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Use backend para sessao real, demo para validar rapidamente ou offline durante ajustes locais.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginSignal({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "pipeline" | "revenue" | "forecast";
}) {
  const toneClass = {
    pipeline: "metric-pipeline text-teal-100",
    revenue: "metric-revenue text-sky-100",
    forecast: "metric-forecast text-amber-100",
  };

  return (
    <div className={`metric-card rounded-xl p-3 ${toneClass[tone]}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] opacity-70">{label}</p>
        {icon}
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
