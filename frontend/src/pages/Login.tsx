import { ArrowRight, Sprout } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "../components/ui";
import { loginWithBackend } from "../services/crmApi";

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
      setMessage("Informe e-mail e senha para acessar.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      await loginWithBackend(email.trim(), senha);
      onLogin();
    } catch {
      setMessage("Não foi possível conectar com estes dados. Revise o e-mail, a senha e a disponibilidade do serviço.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-shell flex min-h-screen items-center justify-center px-4 py-8">
      <section aria-labelledby="login-title" className="w-full max-w-[420px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-md)] sm:p-7">
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--primary)]">
            <Sprout aria-hidden="true" size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--text-muted)]">CRM Agro SaaS</p>
            <h1 className="mt-0.5 text-[21px] font-semibold leading-7 text-[var(--text-primary)]" id="login-title">Acesso ao CRM</h1>
          </div>
        </div>

        <form
          aria-busy={isLoading}
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleBackendLogin();
          }}
        >
          <Input
            autoComplete="email"
            autoFocus
            disabled={isLoading}
            label="E-mail"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seuemail@empresa.com.br"
            type="email"
            value={email}
          />

          <Input
            autoComplete="current-password"
            disabled={isLoading}
            label="Senha"
            onChange={(event) => setSenha(event.target.value)}
            placeholder="Digite sua senha"
            type="password"
            value={senha}
          />

          {message && (
            <p aria-live="polite" className="rounded-md border border-[color:rgba(179,58,69,0.28)] bg-[#fff1f2] px-3 py-2.5 text-[11px] leading-4 text-[var(--danger)]" role="alert">
              {message}
            </p>
          )}

          <Button className="login-submit-button w-full" loading={isLoading} rightIcon={<ArrowRight size={15} />} type="submit" variant="primary">
            Entrar
          </Button>
        </form>

        <p className="mt-5 border-t border-[var(--border-default)] pt-4 text-center text-[11px] leading-4 text-[var(--text-muted)]">
          Use a conta ativa vinculada à sua empresa.
        </p>
      </section>
    </main>
  );
}
