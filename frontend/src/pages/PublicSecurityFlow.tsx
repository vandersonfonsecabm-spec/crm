import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck, Sprout, UserRoundPlus } from "lucide-react";
import { acceptUserInvite, requestPasswordRecovery, resetPasswordWithToken } from "../services/crmApi";

type SecurityFlowProps = {
  mode: "recovery" | "reset" | "invite";
  onBack: () => void;
};

export default function PublicSecurityFlow({ mode, onBack }: SecurityFlowProps) {
  const [token, setToken] = useState(() => {
    if (mode === "recovery" || typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  });
  const [email, setEmail] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "recovery" && token) window.history.replaceState({}, document.title, window.location.pathname);
  }, [mode, token]);

  const title = mode === "recovery" ? "Recuperar acesso" : mode === "reset" ? "Definir nova senha" : "Aceitar convite";
  const description = mode === "recovery"
    ? "Informe seu e-mail e a empresa. A resposta será a mesma exista ou não uma conta cadastrada."
    : mode === "reset"
      ? "Escolha uma nova senha para concluir a recuperação."
      : "Defina sua senha para entrar na empresa convidante.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      if (mode === "recovery") {
        const result = await requestPasswordRecovery(email.trim(), companySlug.trim());
        setMessage(result.message);
        return;
      }
      if (!token.trim()) {
        setMessage("Cole o token recebido para continuar.");
        return;
      }
      if (password.length < 12) {
        setMessage("A senha deve ter pelo menos 12 caracteres.");
        return;
      }
      if (password !== confirmation) {
        setMessage("A confirmação da senha não confere.");
        return;
      }
      if (mode === "reset") {
        await resetPasswordWithToken({ token: token.trim(), novaSenha: password });
      } else {
        await acceptUserInvite({ token: token.trim(), nome: name.trim() || undefined, senha: password });
      }
      setToken("");
      setPassword("");
      setConfirmation("");
      setCompleted(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir esta etapa.");
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return <main className="login-shell flex min-h-screen items-center justify-center px-4 py-8"><section className="w-full max-w-[420px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-md)] sm:p-7"><FlowMark /><div className="mt-6 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck size={20} /></span><h1 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">Tudo pronto</h1><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{mode === "recovery" ? "Confira o canal configurado para receber as instruções." : "Sua senha foi definida. Você já pode voltar ao acesso."}</p><button className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white" onClick={onBack} type="button"><ArrowLeft size={14} /> Voltar ao login</button></div></section></main>;
  }

  return <main className="login-shell flex min-h-screen items-center justify-center px-4 py-8"><section className="w-full max-w-[420px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-md)] sm:p-7"><FlowMark /><div className="mt-6"><button className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={onBack} type="button"><ArrowLeft size={14} /> Voltar ao login</button><h1 className="mt-5 text-xl font-semibold text-[var(--text-primary)]">{title}</h1><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p></div><form className="mt-5 space-y-4" onSubmit={submit}>
    {mode === "recovery" && <><Field autoComplete="email" label="E-mail" onChange={setEmail} placeholder="seuemail@empresa.com.br" type="email" value={email} /><Field autoComplete="organization" label="Empresa" onChange={setCompanySlug} placeholder="identificador-da-empresa" type="text" value={companySlug} /></>}
    {mode !== "recovery" && <Field autoComplete="off" label="Token de acesso" onChange={setToken} placeholder="Cole o token recebido" type="text" value={token} />}
    {mode === "invite" && <Field autoComplete="name" label="Nome" onChange={setName} placeholder="Seu nome" type="text" value={name} />}
    {mode !== "recovery" && <><Field autoComplete="new-password" label="Nova senha" onChange={setPassword} placeholder="Mínimo de 12 caracteres" type="password" value={password} /><Field autoComplete="new-password" label="Confirmar senha" onChange={setConfirmation} placeholder="Repita a nova senha" type="password" value={confirmation} /></>}
    {message && <p aria-live="polite" className="rounded-md border border-[color:rgba(179,58,69,0.28)] bg-[#fff1f2] px-3 py-2.5 text-[11px] leading-4 text-[var(--danger)]" role="alert">{message}</p>}
    <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">{mode === "recovery" ? <Mail size={15} /> : mode === "reset" ? <KeyRound size={15} /> : <UserRoundPlus size={15} />} {loading ? "Processando..." : mode === "recovery" ? "Solicitar instruções" : "Continuar"}<ArrowRight size={14} /></button>
  </form></section></main>;
}

function FlowMark() {
  return <div className="flex items-center gap-3 border-b border-[var(--border-default)] pb-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--primary)]"><Sprout aria-hidden="true" size={19} /></div><div><p className="text-[11px] font-medium text-[var(--text-muted)]">CRM Agro SaaS</p><p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">Segurança da conta</p></div></div>;
}

function Field({ label, value, onChange, placeholder, type, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type: string; autoComplete: string }) {
  return <label className="block text-xs font-medium text-[var(--text-secondary)]">{label}<input autoComplete={autoComplete} className="mt-1 h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs outline-none focus:border-[var(--accent-primary)]" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} /></label>;
}
