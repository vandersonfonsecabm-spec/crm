import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MailPlus,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  ApiHttpError,
  type ApiUserRole,
  type AuthSession,
  type ManagedUser,
  type SecurityAuditEntry,
  type UserInvite,
  type UserSession,
  changeOwnPassword,
  createUserInvite,
  fetchManagedUsers,
  fetchSecurityAudit,
  fetchUserInvites,
  fetchUserProfile,
  fetchUserSessions,
  revokeOwnSession,
  revokeUserInvite,
  revokeUserSessions,
  resendUserInvite,
  setManagedUserActive,
  startAdminPasswordReset,
  updateManagedUser,
  updateUserProfile,
} from "../../services/crmApi";

type PanelProps = {
  mode: "users" | "profile";
  authSession: AuthSession;
  onToast: (message: string) => void;
  onLogout?: () => void;
};

const roleOptions: Array<{ value: ApiUserRole; label: string }> = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GERENTE", label: "Gerente" },
  { value: "VENDEDOR", label: "Vendedor" },
];

export default function DashboardUserSecurityPanel(props: PanelProps) {
  if (props.mode === "users") return <UsersPanel {...props} />;
  return <ProfilePanel {...props} />;
}

function UsersPanel({ authSession, onToast }: PanelProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [auditEntries, setAuditEntries] = useState<SecurityAuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [invite, setInvite] = useState({ nome: "", email: "", papel: "VENDEDOR" as ApiUserRole });

  const role = authSession.papel ?? authSession.usuario.papel;
  const isAdmin = role === "ADMIN";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [usersResult, inviteResult] = await Promise.all([
        fetchManagedUsers({ page: 1, limit: 50, busca: appliedSearch || undefined, ativo: showInactive ? undefined : true }),
        fetchUserInvites(),
      ]);
      setUsers(usersResult.data);
      setInvites(inviteResult.data);
      const auditResult = await fetchSecurityAudit({ page: 1, limit: 20 });
      setAuditEntries(auditResult.data);
    } catch (loadError) {
      setError(messageForError(loadError, "Não foi possível carregar a gestão de usuários."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // A consulta só muda após o operador aplicar a busca ou o filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, isAdmin, showInactive]);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    try {
      await action();
      await load();
    } catch (actionError) {
      onToast(messageForError(actionError, "Não foi possível concluir a ação."));
    } finally {
      setBusyKey("");
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite.nome.trim() || !invite.email.trim()) {
      onToast("Informe nome e e-mail para criar o convite.");
      return;
    }
    await runAction("invite", async () => {
      const result = await createUserInvite({ ...invite, nome: invite.nome.trim(), email: invite.email.trim() });
      setInvite({ nome: "", email: "", papel: "VENDEDOR" });
      onToast(result.invite.deliveryStatus === "TEST_CAPTURED" ? "Convite criado no capturador de teste." : "Convite registrado; entrega ainda não configurada.");
    });
  }

  if (!isAdmin) {
    return <AccessNotice title="Administração restrita" description="Somente administradores podem gerenciar usuários e convites desta empresa." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="users-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UsersRound size={18} className="text-[var(--accent-primary)]" />
                <h2 id="users-title" className="text-sm font-semibold text-[var(--text-primary)]">Usuários da empresa</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Controle acesso, papel e sessões sem definir senhas de terceiros.</p>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]" onClick={() => void load()} type="button">
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>

          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar usuário</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-xs outline-none focus:border-[var(--accent-primary)]" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" value={search} />
            </label>
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)]">
              <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
              Incluir inativos
            </label>
          </form>

          {error && <InlineError message={error} onRetry={() => void load()} />}
          {loading ? <PanelLoading label="Carregando usuários..." /> : users.length === 0 ? <EmptyPanel icon={<UserRound size={18} />} title="Nenhum usuário encontrado" description="Ajuste a busca ou crie um convite para adicionar alguém à equipe." /> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                    <th className="px-2 py-2 font-medium">Usuário</th>
                    <th className="px-2 py-2 font-medium">Papel</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Último acesso</th>
                    <th className="px-2 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => <UserRow key={user.id} user={user} busyKey={busyKey} currentUserId={authSession.usuario.id} onAction={runAction} onToast={onToast} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="invite-title">
          <div className="flex items-center gap-2">
            <UserRoundPlus size={18} className="text-[var(--accent-primary)]" />
            <h2 id="invite-title" className="text-sm font-semibold text-[var(--text-primary)]">Convidar usuário</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">A pessoa convidada define a própria senha. Nenhuma senha temporária é criada pelo administrador.</p>
          <form className="mt-4 space-y-3" onSubmit={handleInvite}>
            <Field label="Nome" value={invite.nome} onChange={(value) => setInvite((current) => ({ ...current, nome: value }))} />
            <Field label="E-mail" type="email" value={invite.email} onChange={(value) => setInvite((current) => ({ ...current, email: value }))} />
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Papel<select className="mt-1 h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-2 text-xs outline-none focus:border-[var(--accent-primary)]" onChange={(event) => setInvite((current) => ({ ...current, papel: event.target.value as ApiUserRole }))} value={invite.papel}>{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <button className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={busyKey === "invite"} type="submit">
              {busyKey === "invite" ? <LoaderCircle className="animate-spin" size={14} /> : <MailPlus size={14} />} Criar convite
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="pending-invites-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="pending-invites-title" className="text-sm font-semibold text-[var(--text-primary)]">Convites recentes</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">A entrega externa permanece pendente até um provedor ser configurado.</p>
          </div>
          <span className="rounded-full bg-[var(--bg-muted)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">{invites.filter((item) => !item.aceitoEm && !item.revogadoEm).length} pendentes</span>
        </div>
        {invites.length === 0 ? <p className="mt-4 text-xs text-[var(--text-muted)]">Nenhum convite registrado.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{invites.slice(0, 9).map((item) => <InviteRow key={item.id} invite={item} busyKey={busyKey} onAction={runAction} />)}</div>}
      </section>

      <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="security-audit-title">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-[var(--accent-primary)]" />
          <div>
            <h2 id="security-audit-title" className="text-sm font-semibold text-[var(--text-primary)]">Histórico de segurança</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Eventos sanitizados de acesso, sessões, senhas, convites e usuários.</p>
          </div>
        </div>
        {auditEntries.length === 0 ? <p className="mt-4 text-xs text-[var(--text-muted)]">Nenhum evento registrado ainda.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]"><th className="px-2 py-2 font-medium">Evento</th><th className="px-2 py-2 font-medium">Ator</th><th className="px-2 py-2 font-medium">Alvo</th><th className="px-2 py-2 font-medium">Resultado</th><th className="px-2 py-2 font-medium">Data</th></tr></thead><tbody>{auditEntries.map((entry) => <tr className="border-b border-[var(--border-default)] last:border-0" key={entry.id}><td className="px-2 py-2 font-medium text-[var(--text-primary)]">{entry.acao}</td><td className="px-2 py-2 text-[var(--text-secondary)]">{entry.ator}</td><td className="px-2 py-2 text-[var(--text-secondary)]">{entry.alvo || "—"}</td><td className="px-2 py-2 text-[var(--text-secondary)]">{entry.resultado}</td><td className="whitespace-nowrap px-2 py-2 text-[var(--text-muted)]">{formatDate(entry.createdAt)}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function UserRow({ user, currentUserId, busyKey, onAction, onToast }: { user: ManagedUser; currentUserId?: number; busyKey: string; onAction: (key: string, action: () => Promise<void>) => Promise<void>; onToast: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.nome);
  const [role, setRole] = useState(user.papel);
  const isSelf = user.id === currentUserId;
  const actionPrefix = `user-${user.id}`;

  return <tr className="border-b border-[var(--border-default)] last:border-0">
    <td className="px-2 py-3"><div className="min-w-[200px]"><p className="font-medium text-[var(--text-primary)]">{user.nome}{isSelf && <span className="ml-2 text-[11px] text-[var(--text-muted)]">Você</span>}</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{user.email}</p></div></td>
    <td className="px-2 py-3">{editing ? <select className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-2 text-xs" onChange={(event) => setRole(event.target.value as ApiUserRole)} value={role}>{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <span className="text-[var(--text-secondary)]">{roleLabel(user.papel)}</span>}</td>
    <td className="px-2 py-3"><StatusPill active={user.ativo} /></td>
    <td className="whitespace-nowrap px-2 py-3 text-[var(--text-muted)]">{formatDate(user.ultimoLoginEm)}</td>
    <td className="px-2 py-3"><div className="flex justify-end gap-1.5">
      {editing ? <>
        <button aria-label={`Salvar alterações de ${user.nome}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] text-emerald-700 hover:bg-emerald-50" disabled={busyKey === `${actionPrefix}-save`} onClick={() => void onAction(`${actionPrefix}-save`, async () => { await updateManagedUser(user.id, { nome: name.trim(), papel: role }); setEditing(false); onToast("Usuário atualizado."); })} title="Salvar alterações" type="button"><Check size={14} /></button>
        <button aria-label="Cancelar edição" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-muted)]" onClick={() => { setName(user.nome); setRole(user.papel); setEditing(false); }} title="Cancelar" type="button"><X size={14} /></button>
      </> : <>
        <button aria-label={`Editar ${user.nome}`} className="rounded-md border border-[var(--border-default)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]" onClick={() => setEditing(true)} type="button">Editar</button>
        <button aria-label={`${user.ativo ? "Desativar" : "Reativar"} ${user.nome}`} className="rounded-md border border-[var(--border-default)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] disabled:opacity-50" disabled={busyKey === `${actionPrefix}-status` || isSelf && user.ativo} onClick={() => { if (!confirmSecurityAction(`${user.ativo ? "Desativar" : "Reativar"} ${user.nome}?`)) return; void onAction(`${actionPrefix}-status`, async () => { await setManagedUserActive(user.id, !user.ativo); onToast(user.ativo ? "Usuário desativado." : "Usuário reativado."); }); }} type="button">{user.ativo ? "Desativar" : "Reativar"}</button>
        <button aria-label={`Iniciar reset de senha para ${user.nome}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]" disabled={busyKey === `${actionPrefix}-reset`} onClick={() => { if (!confirmSecurityAction(`Iniciar reset de senha para ${user.nome}?`)) return; void onAction(`${actionPrefix}-reset`, async () => { const result = await startAdminPasswordReset(user.id); onToast(result.deliveryStatus === "TEST_CAPTURED" ? "Reset capturado no ambiente de teste." : "Reset iniciado; entrega ainda não configurada."); }); }} title="Iniciar reset de senha" type="button"><KeyRound size={14} /></button>
        <button aria-label={`Revogar sessões de ${user.nome}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]" disabled={busyKey === `${actionPrefix}-sessions`} onClick={() => { if (!confirmSecurityAction(`Revogar todas as sessões de ${user.nome}?`)) return; void onAction(`${actionPrefix}-sessions`, async () => { const result = await revokeUserSessions(user.id); onToast(`${result.revoked} sessão(ões) revogada(s).`); }); }} title="Revogar sessões" type="button"><LogOut size={14} /></button>
      </>}
    </div></td>
  </tr>;
}

function InviteRow({ invite, busyKey, onAction }: { invite: UserInvite; busyKey: string; onAction: (key: string, action: () => Promise<void>) => Promise<void> }) {
  const resolved = Boolean(invite.aceitoEm || invite.revogadoEm);
  return <article className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--text-primary)]">{invite.nome}</p><p className="truncate text-[11px] text-[var(--text-muted)]">{invite.email}</p></div><StatusPill active={!resolved} label={invite.aceitoEm ? "Aceito" : invite.revogadoEm ? "Revogado" : invite.deliveryStatus === "PENDING_DELIVERY" ? "Pendente" : "Ativo"} /></div><div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]"><span>{roleLabel(invite.papel)} · expira {formatDate(invite.expiraEm)}</span>{!resolved && <span className="flex gap-1"><button className="rounded-md border border-[var(--border-default)] px-2 py-1 hover:bg-[var(--bg-muted)]" disabled={busyKey === `invite-${invite.id}-resend`} onClick={() => { if (!confirmSecurityAction("Reenviar este convite?")) return; void onAction(`invite-${invite.id}-resend`, async () => { await resendUserInvite(invite.id); }); }} type="button">Reenviar</button><button className="rounded-md border border-[var(--border-default)] px-2 py-1 hover:bg-[var(--bg-muted)]" disabled={busyKey === `invite-${invite.id}-revoke`} onClick={() => { if (!confirmSecurityAction("Cancelar este convite?")) return; void onAction(`invite-${invite.id}-revoke`, async () => { await revokeUserInvite(invite.id); }); }} type="button">Cancelar</button></span>}</div></article>;
}

function ProfilePanel({ authSession, onToast, onLogout }: PanelProps) {
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [name, setName] = useState(authSession.usuario.nome);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sessionBusy, setSessionBusy] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [profileResult, sessionResult] = await Promise.all([fetchUserProfile(), fetchUserSessions()]);
      setProfile(profileResult.usuario);
      setName(profileResult.usuario.nome);
      setSessions(sessionResult.data);
    } catch (error) {
      onToast(messageForError(error, "Não foi possível carregar seu perfil."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // O carregamento é inicial e o callback mantém o contrato local do painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateUserProfile({ nome: name.trim() });
      setProfile(updated);
      onToast("Perfil atualizado.");
    } catch (error) {
      onToast(messageForError(error, "Não foi possível atualizar o perfil."));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwords.next.length < 12) return onToast("A nova senha deve ter pelo menos 12 caracteres.");
    if (passwords.next !== passwords.confirm) return onToast("A confirmação da nova senha não confere.");
    setPasswordSaving(true);
    try {
      await changeOwnPassword({ senhaAtual: passwords.current, novaSenha: passwords.next });
      setPasswords({ current: "", next: "", confirm: "" });
      await load();
      onToast("Senha alterada. As outras sessões foram encerradas.");
    } catch (error) {
      onToast(messageForError(error, "Não foi possível alterar a senha."));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function revokeSession(id: string) {
    setSessionBusy(id);
    try {
      if (!confirmSecurityAction("Revogar esta sessão?")) return;
      await revokeOwnSession(id);
      await load();
      onToast("Sessão revogada.");
    } catch (error) {
      onToast(messageForError(error, "Não foi possível revogar a sessão."));
    } finally {
      setSessionBusy("");
    }
  }

  async function logoutAll() {
    setSessionBusy("all");
    try {
      if (!confirmSecurityAction("Sair de todos os dispositivos?")) return;
      await revokeUserSessions();
      onToast("Todas as sessões foram encerradas.");
      onLogout?.();
    } catch (error) {
      onToast(messageForError(error, "Não foi possível encerrar as sessões."));
    } finally {
      setSessionBusy("");
    }
  }

  const activeSessions = useMemo(() => sessions.filter((session) => session.active), [sessions]);

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-4">
      <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="profile-title">
        <div className="flex items-center gap-2"><UserRound size={18} className="text-[var(--accent-primary)]" /><h2 id="profile-title" className="text-sm font-semibold text-[var(--text-primary)]">Perfil</h2></div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Atualize apenas os dados pessoais permitidos pela sua conta.</p>
        {loading ? <PanelLoading label="Carregando perfil..." /> : <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={saveProfile}>
          <Field label="Nome" value={name} onChange={setName} />
          <ReadOnlyField label="E-mail" value={profile?.email || authSession.usuario.email || "Não informado"} />
          <ReadOnlyField label="Empresa" value={profile?.empresaId ? authSession.empresa?.nome || "Empresa atual" : "Empresa atual"} />
          <ReadOnlyField label="Papel" value={roleLabel(profile?.papel || authSession.papel || authSession.usuario.papel || "VENDEDOR")} />
          <div className="sm:col-span-2"><button className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white disabled:opacity-60" disabled={saving || !name.trim()} type="submit">{saving && <LoaderCircle className="animate-spin" size={14} />} Salvar perfil</button></div>
        </form>}
      </section>

      <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="password-title">
        <div className="flex items-center gap-2"><KeyRound size={18} className="text-[var(--accent-primary)]" /><h2 id="password-title" className="text-sm font-semibold text-[var(--text-primary)]">Trocar senha</h2></div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Use uma frase-senha com pelo menos 12 caracteres. As demais sessões serão revogadas.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={savePassword}>
          <PasswordField label="Senha atual" value={passwords.current} onChange={(value) => setPasswords((current) => ({ ...current, current: value }))} />
          <span className="hidden sm:block" />
          <PasswordField label="Nova senha" value={passwords.next} onChange={(value) => setPasswords((current) => ({ ...current, next: value }))} />
          <PasswordField label="Confirmar nova senha" value={passwords.confirm} onChange={(value) => setPasswords((current) => ({ ...current, confirm: value }))} />
          <div className="sm:col-span-2"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-60" disabled={passwordSaving} type="submit">{passwordSaving && <LoaderCircle className="animate-spin" size={14} />} Alterar senha</button></div>
        </form>
      </section>
    </div>

    <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="sessions-title">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MonitorSmartphone size={18} className="text-[var(--accent-primary)]" /><h2 id="sessions-title" className="text-sm font-semibold text-[var(--text-primary)]">Sessões ativas</h2></div><p className="mt-1 whitespace-nowrap text-[10px] text-[var(--text-muted)]">{loading ? "Carregando sessões..." : `${activeSessions.length} sessão(ões) válida(s). Tokens não são exibidos.`}</p></div><ShieldCheck size={17} className="text-emerald-600" /></div>
      {loading ? <PanelLoading label="Carregando sessões..." /> : <div className="mt-4 space-y-2">{sessions.length === 0 ? <EmptyPanel icon={<LockKeyhole size={17} />} title="Nenhuma sessão" description="Faça login novamente para criar uma sessão ativa." /> : sessions.map((session) => <article className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3" key={session.id}><div className="flex items-start gap-3"><MonitorSmartphone size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium text-[var(--text-primary)]">{session.current ? "Este dispositivo" : "Outro dispositivo"}</p><StatusPill active={session.active} label={session.active ? "Ativa" : "Encerrada"} /></div><p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{session.userAgent}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">Último uso: {formatDate(session.lastUsedAt)}</p></div>{session.active && !session.current && <button aria-label="Revogar sessão" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]" disabled={sessionBusy === session.id} onClick={() => void revokeSession(session.id)} title="Revogar sessão" type="button"><LogOut size={14} /></button>}</div></article>)}</div>}
      <button className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" disabled={sessionBusy === "all" || activeSessions.length === 0} onClick={() => void logoutAll()} type="button">{sessionBusy === "all" && <LoaderCircle className="animate-spin" size={14} />} Sair de todos os dispositivos</button>
    </section>
  </div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-xs font-medium text-[var(--text-secondary)]">{label}<input autoComplete={type === "email" ? "email" : "off"} className="mt-1 h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs outline-none focus:border-[var(--accent-primary)]" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-medium text-[var(--text-secondary)]">{label}<input autoComplete="new-password" className="mt-1 h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs outline-none focus:border-[var(--accent-primary)]" minLength={12} onChange={(event) => onChange(event.target.value)} type="password" value={value} /></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="text-xs font-medium text-[var(--text-secondary)]">{label}<div className="mt-1 flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 text-xs text-[var(--text-muted)]">{value}</div></div>;
}

function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{label || (active ? "Ativo" : "Inativo")}</span>;
}

function AccessNotice({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={17} /> {title}</div><p className="mt-2 text-xs leading-5">{description}</p></div>;
}

function PanelLoading({ label }: { label: string }) {
  return <div className="flex items-center gap-2 py-8 text-xs text-[var(--text-muted)]"><LoaderCircle className="animate-spin" size={15} /> {label}</div>;
}

function EmptyPanel({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-muted)]"><span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)]">{icon}</span><p className="mt-3 text-xs font-semibold text-[var(--text-primary)]">{title}</p><p className="mt-1 max-w-xs text-[11px] leading-4">{description}</p></div>;
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{message}</span><button className="inline-flex items-center gap-1 font-semibold" onClick={onRetry} type="button"><RefreshCw size={13} /> Tentar novamente</button></div>;
}

function roleLabel(role: ApiUserRole) {
  return roleOptions.find((option) => option.value === role)?.label || role;
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Indisponível" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function messageForError(error: unknown, fallback: string) {
  if (error instanceof ApiHttpError && error.status === 401) return "Sessão expirada. Entre novamente para continuar.";
  return error instanceof Error && error.message ? error.message : fallback;
}

function confirmSecurityAction(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}
