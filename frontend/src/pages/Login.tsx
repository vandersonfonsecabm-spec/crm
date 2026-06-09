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
      setMessage("Não foi possível entrar pelo backend. Use o modo offline ou confira a API.");
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
      setMessage("Demo indisponível. Rode o seed/backend ou entre offline por enquanto.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080b12] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">CRM Enterprise</h1>
          <p className="mt-1 text-sm text-slate-400">Acesso operacional</p>
        </div>

        <div className="space-y-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-white/25"
          />
          <input
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder="Senha"
            type="password"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-white/25"
          />
        </div>

        {message && (
          <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100">
            {message}
          </p>
        )}

        <button
          onClick={handleBackendLogin}
          disabled={isLoading}
          className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:opacity-60"
        >
          {isLoading ? "Conectando..." : "Entrar com backend"}
        </button>

        <button
          onClick={handleDemoLogin}
          disabled={isLoading}
          className="mt-2 w-full rounded-xl border border-emerald-400/15 bg-emerald-500/[0.08] px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/[0.12] disabled:opacity-60"
        >
          Entrar demo
        </button>

        <button
          onClick={onLogin}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          Entrar offline
        </button>
      </div>
    </div>
  );
}
