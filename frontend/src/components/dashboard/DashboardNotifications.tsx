import { Bell, Check, Clock3, ExternalLink, Loader2, Settings, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import {
  ApiHttpError,
  fetchNotificationSummary,
  fetchNotificationSettings,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  snoozeNotification,
  unsnoozeNotification,
  updateNotificationPreferences,
  updateNotificationSettings,
  type NotificationItem,
  type NotificationSettings,
  type NotificationTargetKind,
} from "../../services/crmApi";

type DashboardNotificationsProps = {
  onOpenTarget: (target: { tipo: NotificationTargetKind; id: number; rota: string }) => void;
  canManage?: boolean;
  readOnly?: boolean;
};

export default function DashboardNotifications({ onOpenTarget, canManage = false, readOnly = false }: DashboardNotificationsProps) {
  const [summary, setSummary] = useState<{ unread: number; total: number; loadedAt: string } | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [snoozed, setSnoozed] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(readOnly);
  const [tenantDisabled, setTenantDisabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (readOnly || disabled || tenantDisabled) return;
    setIsLoading(true);
    try {
      const [nextSummary, nextList] = await Promise.all([
        fetchNotificationSummary({ signal }),
        fetchNotifications({ limit: 20 }, { signal }),
      ]);
      if (signal?.aborted) return;
      setSummary(nextSummary);
      setItems(nextList.data);
      setSnoozed(nextList.snoozed);
      setError(false);
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof ApiHttpError && (cause.status === 404 || cause.status === 403)) {
        if (canManage && cause.status === 404) setTenantDisabled(true);
        else setDisabled(true);
        return;
      }
      setError(true);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [canManage, disabled, readOnly, tenantDisabled]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(false);
    try {
      const next = await fetchNotificationSettings();
      setSettings(next);
      setTenantDisabled(next.empresa?.habilitada === false);
    } catch {
      setSettingsError(true);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (readOnly) return;
    const controller = new AbortController();
    requestRef.current = controller;
    void load(controller.signal);
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load(controller.signal);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, readOnly]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      const focusTarget = showSettings ? settingsBackRef.current : firstItemRef.current;
      (focusTarget ?? panelHeadingRef.current)?.focus({ preventScroll: true });
    });
    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, showSettings]);

  const unread = summary?.unread ?? 0;
  const badge = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;
  if (disabled || (tenantDisabled && !canManage)) return null;

  async function openItem(item: NotificationItem) {
    if (item.nova) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, nova: false, lidaEm: new Date().toISOString() } : entry));
      setSummary((current) => current ? { ...current, unread: Math.max(0, current.unread - 1) } : current);
      void markNotificationRead(item.id).catch(() => undefined);
    }
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    if (item.destino) onOpenTarget(item.destino);
  }

  async function markAll() {
    const cutoffAt = summary?.loadedAt;
    setItems((current) => current.map((item) => ({ ...item, nova: false, lidaEm: item.lidaEm || cutoffAt || new Date().toISOString() })));
    setSummary((current) => current ? { ...current, unread: 0 } : current);
    try {
      await markAllNotificationsRead(cutoffAt);
      await load();
    } catch {
      setError(true);
    }
  }

  async function snooze(item: NotificationItem) {
    try {
      const updated = await snoozeNotification(item.id, { minutes: 60 });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSnoozed((current) => [updated, ...current.filter((entry) => entry.id !== item.id)]);
      setSummary((current) => current ? { ...current, unread: Math.max(0, current.unread - (item.nova ? 1 : 0)), total: Math.max(0, current.total - 1) } : current);
    } catch {
      setError(true);
    }
  }

  async function unsnooze(item: NotificationItem) {
    try {
      const updated = await unsnoozeNotification(item.id);
      setSnoozed((current) => current.filter((entry) => entry.id !== item.id));
      setItems((current) => [updated, ...current]);
      setSummary((current) => current ? { ...current, total: current.total + 1 } : current);
    } catch {
      setError(true);
    }
  }

  async function savePreferences() {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const response = await updateNotificationPreferences({
        antecedenciaPadraoMinutos: settings.usuario.antecedenciaPadraoMinutos,
        habilitada: settings.usuario.habilitada,
      });
      setSettings((current) => current ? { ...current, usuario: response.usuario } : current);
    } catch {
      setSettingsError(true);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveCompanySettings() {
    if (!settings?.empresa || !canManage) return;
    setSettingsSaving(true);
    try {
      const response = await updateNotificationSettings({
        habilitada: settings.empresa.habilitada,
        antecedenciaPadraoMinutos: settings.empresa.antecedenciaPadraoMinutos,
      });
      setSettings((current) => current ? { ...current, empresa: response.empresa } : current);
      setTenantDisabled(response.empresa.habilitada === false);
      if (response.empresa.habilitada) void load();
    } catch {
      setSettingsError(true);
    } finally {
      setSettingsSaving(false);
    }
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-notification-item]"));
    const current = document.activeElement as HTMLButtonElement | null;
    const index = current ? buttons.indexOf(current) : -1;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (!buttons.length) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], select, input, textarea") ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div ref={shellRef} className="dashboard-notifications relative">
      <button
        ref={triggerRef}
        type="button"
        className="topbar-icon-button relative flex h-11 w-11 items-center justify-center rounded-md"
        aria-label={badge ? `Notificações, ${badge} novas` : "Notificações"}
        aria-expanded={isOpen}
        aria-controls={titleId}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) void load();
        }}
      >
        <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
        {badge && <span className="notification-count-badge" aria-hidden="true">{badge}</span>}
      </button>

      {isOpen && (
        <section ref={panelRef} id={titleId} className="notifications-panel" role="dialog" aria-modal="true" aria-labelledby={`${titleId}-heading`} onKeyDown={handlePanelKeyDown}>
          <div className="notifications-panel-header">
            <div>
              <h2 ref={panelHeadingRef} id={`${titleId}-heading`} tabIndex={-1} className="text-sm font-semibold">Notificações</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{summary ? `${summary.unread} novas` : "Atualizando"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="notification-header-action" onClick={() => { setShowSettings(true); void loadSettings(); }}>
                <Settings size={13} aria-hidden="true" /> Configurações
              </button>
              <button type="button" className="notification-header-action" onClick={() => void markAll()} disabled={isLoading || !items.some((item) => item.nova)}>
                <Check size={13} aria-hidden="true" /> Marcar todas como lidas
              </button>
              <button type="button" className="notification-close" aria-label="Fechar notificações" onClick={() => { setIsOpen(false); triggerRef.current?.focus({ preventScroll: true }); }}><X size={16} aria-hidden="true" /></button>
            </div>
          </div>

          {tenantDisabled && canManage && !showSettings ? (
            <div className="notification-state notification-state-disabled">
              <p>A Central de notificações está desativada para esta empresa.</p>
              <button type="button" onClick={() => { setShowSettings(true); void loadSettings(); }}>Abrir configurações</button>
            </div>
          ) : showSettings ? (
            <NotificationSettingsPanel
              settings={settings}
              canManage={canManage}
              loading={settingsLoading}
              saving={settingsSaving}
              error={settingsError}
              onBack={() => setShowSettings(false)}
              backRef={settingsBackRef}
              onChange={(next) => setSettings(next)}
              onSavePreferences={() => void savePreferences()}
              onSaveCompany={() => void saveCompanySettings()}
            />
          ) : <div className="notifications-panel-body" onKeyDown={handleListKeyDown}>
            {isLoading && !items.length && <p className="notification-state"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Carregando notificações…</p>}
            {!isLoading && error && <div className="notification-state notification-state-error"><p>Não foi possível atualizar as notificações.</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
            {!isLoading && !error && !items.length && !snoozed.length && <p className="notification-state">Tudo em dia. Você não tem novas notificações.</p>}
            {!!items.length && <NotificationGroup title="Novas e recentes" items={items} firstItemRef={firstItemRef} onOpen={openItem} onSnooze={snooze} />}
            {!!snoozed.length && <NotificationGroup title="Lembrar depois" items={snoozed} onOpen={openItem} onUnsnooze={unsnooze} />}
          </div>}
        </section>
      )}
    </div>
  );
}

function NotificationSettingsPanel({
  settings,
  canManage,
  loading,
  saving,
  error,
  onBack,
  backRef,
  onChange,
  onSavePreferences,
  onSaveCompany,
}: {
  settings: NotificationSettings | null;
  canManage: boolean;
  loading: boolean;
  saving: boolean;
  error: boolean;
  onBack: () => void;
  backRef: RefObject<HTMLButtonElement | null>;
  onChange: (settings: NotificationSettings) => void;
  onSavePreferences: () => void;
  onSaveCompany: () => void;
}) {
  if (loading && !settings) return <p className="notification-state"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Carregando configurações…</p>;
  if (!settings) return <div className="notification-state notification-state-error"><p>{error ? "Não foi possível carregar as configurações." : "Configurações indisponíveis."}</p><button type="button" onClick={onBack}>Voltar</button></div>;
  const company = settings.empresa;
  return (
    <div className="notifications-settings">
      <button ref={backRef} type="button" className="notification-settings-back" onClick={onBack}>← Voltar para notificações</button>
      {error && <p className="notification-settings-error">Não foi possível salvar agora.</p>}
      <section aria-labelledby="notification-user-settings-title">
        <h3 id="notification-user-settings-title">Minhas preferências</h3>
        <label>
          <span>Antecedência dos acompanhamentos</span>
          <select value={settings.usuario.antecedenciaPadraoMinutos} onChange={(event) => onChange({ ...settings, usuario: { ...settings.usuario, antecedenciaPadraoMinutos: Number(event.target.value) } })}>
            <option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={1440}>1 dia</option>
          </select>
        </label>
        <label className="notification-settings-check"><input type="checkbox" checked={settings.usuario.habilitada} onChange={(event) => onChange({ ...settings, usuario: { ...settings.usuario, habilitada: event.target.checked } })} /> Receber minhas notificações</label>
        <button type="button" className="notification-settings-save" onClick={onSavePreferences} disabled={saving}>Salvar preferências</button>
      </section>
      {canManage && (
        <section aria-labelledby="notification-company-settings-title">
          <h3 id="notification-company-settings-title">Configuração da empresa</h3>
          <label className="notification-settings-check"><input type="checkbox" checked={company?.habilitada === true} onChange={(event) => onChange({ ...settings, empresa: company ? { ...company, habilitada: event.target.checked } : { antecedenciaPadraoMinutos: 30, diasSemContato: 7, diasProdutoDesatualizado: 30, diasAntesVencimento: 7, habilitada: event.target.checked } })} /> Central habilitada para a empresa</label>
          <label>
            <span>Antecedência padrão</span>
            <select value={company?.antecedenciaPadraoMinutos ?? 30} onChange={(event) => onChange({ ...settings, empresa: company ? { ...company, antecedenciaPadraoMinutos: Number(event.target.value) } : null })}>
              <option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={1440}>1 dia</option>
            </select>
          </label>
          <button type="button" className="notification-settings-save" onClick={onSaveCompany} disabled={saving || !company}>Salvar configuração da empresa</button>
        </section>
      )}
    </div>
  );
}

function NotificationGroup({ title, items, firstItemRef, onOpen, onSnooze, onUnsnooze }: { title: string; items: NotificationItem[]; firstItemRef?: RefObject<HTMLButtonElement | null>; onOpen: (item: NotificationItem) => void; onSnooze?: (item: NotificationItem) => void; onUnsnooze?: (item: NotificationItem) => void }) {
  return (
    <section className="notification-group" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={item.id} className={`notification-item ${item.nova ? "notification-item-unread" : ""}`}>
            <button ref={index === 0 ? firstItemRef : undefined} data-notification-item type="button" className="notification-item-main" aria-label={`${item.nova ? "Nova" : "Lida"}. Prioridade ${priorityLabel(item.prioridade)}. ${item.titulo}${item.corpo ? `. ${item.corpo}` : ""}`} onClick={() => void onOpen(item)}>
              <span className={`notification-priority-dot notification-priority-${item.prioridade.toLowerCase()}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="sr-only">{item.nova ? "Nova. " : "Lida. "}Prioridade: {priorityLabel(item.prioridade)}. </span>
                <strong>{item.titulo}</strong>
                {item.corpo && <span>{item.corpo}</span>}
                <small>{formatRelative(item.ocorridoEm)}{item.destino ? ` · ${targetLabel(item.destino.tipo)}` : ""}</small>
              </span>
              {item.destino && <ExternalLink size={13} className="shrink-0 text-slate-400" aria-hidden="true" />}
            </button>
            <div className="notification-item-actions">
              {onSnooze && <button type="button" aria-label="Lembrar esta notificação depois" onClick={() => void onSnooze(item)}><Clock3 size={13} aria-hidden="true" /> Lembrar depois</button>}
              {onUnsnooze && <button type="button" aria-label="Desfazer lembrar depois" onClick={() => void onUnsnooze(item)}>Reativar</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function priorityLabel(priority: NotificationItem["prioridade"]) {
  if (priority === "CRITICA") return "crítica";
  if (priority === "ATENCAO") return "atenção";
  return "normal";
}

function targetLabel(kind: NotificationTargetKind) {
  if (kind === "CONVERSATION") return "Caixa de entrada";
  if (kind === "FOLLOW_UP") return "Agenda";
  return "Negócios";
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Agora";
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
