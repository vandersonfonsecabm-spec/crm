import { Bot, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiHttpError } from "../../services/crmApi";
import { fetchAICommerceConnectionStatus, fetchAICommerceSettings, updateAICommerceSettings, validateMockAICommerceConnection } from "../../services/aiCommerceApi";
import type { AICommerceConnectionStatus, AICommerceMode, AICommerceSettings } from "../../services/aiCommerceApi";
import { Badge, Button, EmptyState, ErrorState, LoadingState, SectionHeader, Select, Surface } from "../ui";

/**
 * Intent: operator understands the foundation boundary and chooses a safe tenant mode;
 * hierarchy: OFF/approval policy is focal, provider status is supporting evidence;
 * palette: graphite workbench, moss for verified mock, amber for review-required state;
 * depth/spacing: borders-only, 4px rhythm, controls remain easy to scan on mobile.
 */
export default function CommerceSettingsPanel({ enabled = true }: { enabled?: boolean }) {
  const [settings, setSettings] = useState<AICommerceSettings | null>(null);
  const [connection, setConnection] = useState<AICommerceConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setSettings({ ...defaultOffSettings() });
      setConnection(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextSettings, nextConnection] = await Promise.all([fetchAICommerceSettings(), fetchAICommerceConnectionStatus()]);
      setSettings(nextSettings);
      setConnection(nextConnection);
    } catch (nextError) {
      setError(settingsErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveMode(mode: AICommerceMode) {
    if (!settings || busy) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const next = await updateAICommerceSettings({ mode, enabled: mode !== "OFF", allowedTools: settings.allowedTools, maxTools: settings.maxTools, maxContextMessages: settings.maxContextMessages, maxProducts: settings.maxProducts, humanApprovalRequired: true, catalogVisibilityPolicy: settings.catalogVisibilityPolicy, exactQuantityPolicy: settings.exactQuantityPolicy, stalePolicy: settings.stalePolicy, noPricePolicy: settings.noPricePolicy, revision: settings.revision });
      setSettings(next);
      setFeedback(mode === "OFF" ? "IA Comercial permanece desligada para este tenant." : `Modo ${modeLabel(mode)} salvo. Nenhum envio automático foi habilitado.`);
    } catch (nextError) {
      setError(settingsErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function validateMock() {
    setBusy(true);
    setError("");
    try {
      const next = await validateMockAICommerceConnection();
      setConnection(next);
      setFeedback("Mock determinístico validado; não há conexão externa.");
    } catch (nextError) {
      setError(settingsErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Carregando configurações da IA Comercial" rows={5} />;
  if (error && !settings) return <Surface><ErrorState description="A Inbox e o catálogo permanecem disponíveis sem a fundação de IA." onRetry={() => void load()} state={error.toLowerCase().includes("acesso") ? "restricted" : "unavailable"} title={error} /></Surface>;
  if (!settings) return <Surface><EmptyState description="A configuração ainda não está disponível neste ambiente." icon={<Bot size={19} />} state="empty" title="Fundação não configurada" /></Surface>;
  if (!enabled) return <section aria-label="Configurações da IA Comercial" className="space-y-3" data-testid="ai-commerce-settings-panel"><Surface><div className="p-4"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Fundação comercial OFF</h2><p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">O tenant não possui a capacidade AI_COMMERCE habilitada. Nenhum endpoint de IA é chamado e nenhum provedor real está conectado.</p></div></Surface></section>;

  const connectionReady = connection?.status === "MOCK_AVAILABLE";
  return <section aria-label="Configurações da IA Comercial" className="space-y-3" data-testid="ai-commerce-settings-panel">
    <Surface>
      <SectionHeader actions={<Button disabled={busy} leftIcon={<RefreshCw size={13} />} onClick={() => void load()} size="sm" variant="ghost">Atualizar</Button>} description="A conexão real ainda não foi escolhida. Esta tela configura apenas o comportamento tenant-scoped da fundação." icon={<Bot size={16} />} title="IA Comercial" status={<Badge variant={settings.mode === "OFF" ? "neutral" : "primary"}>{modeLabel(settings.mode)}</Badge>} />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <InfoCard icon={<LockKeyhole size={15} />} label="Provedor real" value="Não conectado" detail="Nenhuma chave é coletada nesta missão." />
        <InfoCard icon={<Sparkles size={15} />} label="Conexão interna" value={connection?.status === "MOCK_AVAILABLE" ? "Mock disponível" : "Slot não configurado"} detail="Determinístico, sem rede e sem custo." tone={connectionReady ? "success" : "neutral"} />
      </div>
    </Surface>

    {feedback && <div aria-live="polite" className="rounded-[8px] border border-[var(--success-border)] bg-[var(--success-subtle)] px-3 py-2 text-[11px] text-[var(--success)]">{feedback}</div>}
    {error && <div aria-live="assertive" className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-subtle)] px-3 py-2 text-[11px] text-[var(--danger)]">{error}</div>}

    <Surface>
      <SectionHeader description="OFF é o padrão. Modos que geram draft nunca enviam mensagem nem alteram o composer automaticamente." icon={<ShieldCheck size={16} />} title="Política do tenant" />
      <div className="space-y-3 p-4">
        <Select label="Modo operacional" onChange={(event) => void saveMode(event.target.value as AICommerceMode)} value={settings.mode}>
          <option value="OFF">OFF — nenhuma execução</option>
          <option value="SHADOW">SHADOW — registra, não mostra</option>
          <option value="SUGGESTION_ONLY">SUGGESTION_ONLY — mostra draft</option>
          <option value="HUMAN_APPROVAL">HUMAN_APPROVAL — cada ação exige aprovação</option>
        </Select>
        <div className="grid gap-2 text-[11px] sm:grid-cols-2">
          <PolicyRow label="Aprovação humana" value={settings.humanApprovalRequired ? "Obrigatória" : "Bloqueada pelo contrato"} />
          <PolicyRow label="Máximo de ferramentas" value={String(Math.min(5, Math.max(0, settings.maxTools)))} />
          <PolicyRow label="Mensagens no contexto" value={String(Math.min(20, Math.max(0, settings.maxContextMessages)))} />
          <PolicyRow label="Ofertas por resposta" value={String(Math.min(3, Math.max(0, settings.maxProducts)))} />
          <PolicyRow label="Quantidade exata para cliente" value="Não autorizada por padrão" />
          <PolicyRow label="Estoque stale/unknown" value="Exige confirmação" />
        </div>
      </div>
    </Surface>

    <Surface>
      <SectionHeader description="Use apenas para testar cenários sintéticos e controlados; nenhum dado sai do CRM." icon={<Sparkles size={16} />} title="Validação do MockCommerceAI" />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="max-w-xl text-[11px] leading-4 text-[var(--text-secondary)]">O mock não é um modelo real e não pode ser ativado fora do tenant allowlisted. Prompt, segredo e ferramenta genérica não fazem parte deste contrato.</p><Button disabled={busy} leftIcon={<CheckCircle2 size={13} />} loading={busy} onClick={() => void validateMock()} size="sm" variant="secondary">Validar mock</Button></div>
    </Surface>
  </section>;
}

function InfoCard({ detail, icon, label, tone = "neutral", value }: { detail: string; icon: ReactNode; label: string; tone?: "success" | "neutral"; value: string }) {
  return <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3"><div className="flex items-center gap-2 text-[var(--text-muted)]"><span aria-hidden="true" className={tone === "success" ? "text-[var(--success)]" : "text-[var(--icon-default)]"}>{icon}</span><span className="text-[10px] font-semibold uppercase tracking-[.08em]">{label}</span></div><p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{value}</p><p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{detail}</p></div>;
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-3 rounded-[5px] border border-[var(--border-default)] px-3 py-2"><span className="text-[var(--text-muted)]">{label}</span><strong className="text-right font-semibold text-[var(--text-primary)]">{value}</strong></div>;
}

function modeLabel(mode: AICommerceMode) {
  return mode === "SUGGESTION_ONLY" ? "Sugestão" : mode === "HUMAN_APPROVAL" ? "Aprovação humana" : mode === "SHADOW" ? "Shadow" : "OFF";
}

function settingsErrorMessage(error: unknown) {
  if (error instanceof ApiHttpError && error.status === 403) return "Acesso às configurações de IA Comercial não permitido para este perfil.";
  if (error instanceof ApiHttpError && error.status === 404) return "A fundação comercial ainda não foi publicada neste ambiente.";
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível carregar as configurações agora.";
}

function defaultOffSettings(): AICommerceSettings {
  return { enabled: false, mode: "OFF", allowedTools: [], maxTools: 5, maxContextMessages: 20, maxProducts: 3, humanApprovalRequired: true, revision: 1 };
}
