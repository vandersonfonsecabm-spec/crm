import { Activity, AlertTriangle, Clock3, Database, RefreshCw, Server, ShieldCheck, Webhook } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchPlatformObservabilitySummary, type PlatformObservabilitySummary } from "../../services/crmApi";
import { Badge, Button, ErrorState, LoadingState, SectionHeader, StatusBadge, Surface } from "../ui";

/**
 * Intent: a platform operator sees whether work is flowing without reading raw logs.
 * Hierarchy: lease/error health is the focal signal; per-queue counts are secondary evidence.
 * Palette/depth: existing semantic tokens and border-first surfaces keep operational severity legible without decoration.
 * Spacing/typography: 4px rhythm, compact tabular counts and text labels preserve scan speed.
 */

export default function DashboardPlatformObservabilityPanel() {
  const [summary, setSummary] = useState<PlatformObservabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPlatformObservabilitySummary({ signal });
      if (!signal?.aborted) setSummary(result);
    } catch (nextError) {
      if (signal?.aborted) return;
      setError(nextError instanceof Error ? nextError.message : "Não foi possível carregar a observabilidade da plataforma.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [load]);

  return (
    <Surface className="min-w-0 overflow-hidden" data-testid="platform-observability-panel">
      <SectionHeader
        actions={<Button disabled={loading} leftIcon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()} size="sm" variant="secondary">Atualizar</Button>}
        description="Resumo sanitizado de worker, filas, leases e falhas; disponível somente para operador de plataforma."
        icon={<Activity size={15} />}
        status={<Badge variant="info">Somente leitura</Badge>}
        title="Observabilidade técnica"
      />
      {loading && !summary && <div className="p-4"><LoadingState label="Consultando operação da plataforma" rows={3} /></div>}
      {error && !summary && <div className="p-4"><ErrorState description={error} onRetry={() => void load()} title="Observabilidade indisponível" /></div>}
      {summary && (
        <div className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={<Server size={14} />} label="Worker / checkpoints" tone={summary.worker.health === "HEALTHY" ? "success" : summary.worker.health === "STALE" ? "danger" : "warning"} value={summary.worker.checkpointCount} />
            <Metric icon={<ShieldCheck size={14} />} label="Leases ativos" tone={summary.worker.activeLeases > 0 ? "success" : "neutral"} value={summary.worker.activeLeases} />
            <Metric icon={<AlertTriangle size={14} />} label="Leases expirados" tone={summary.worker.expiredLeases > 0 ? "warning" : "neutral"} value={summary.worker.expiredLeases} />
            <Metric icon={<AlertTriangle size={14} />} label="Erros de integração abertos" tone={summary.unresolvedIntegrationErrors > 0 ? "danger" : "neutral"} value={summary.unresolvedIntegrationErrors} />
            <Metric icon={<RefreshCw size={14} />} label="Jobs em retry" tone={summary.retryingJobs > 0 ? "warning" : "neutral"} value={summary.retryingJobs} />
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            <QueueCard icon={<Activity size={14} />} label="Jobs de automação" values={summary.jobs} />
            <QueueCard icon={<Activity size={14} />} label="Execuções" values={summary.executions} />
            <QueueCard icon={<Webhook size={14} />} label="Webhooks" values={summary.webhooks} />
            <QueueCard icon={<Database size={14} />} label="Outbox" values={mergeCountMaps({ email: summary.outbox.email, stock: summary.outbox.stock })} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <QueueCard icon={<ShieldCheck size={14} />} label="Estado de credenciais (sem segredos)" values={summary.credentials} />
            <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[11px] text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-secondary)]">Último erro de integração</p>
              <p className="mt-2">{summary.lastIntegrationErrorAt ? formatDate(summary.lastIntegrationErrorAt) : "Nenhum erro aberto"}</p>
              <p className="mt-2 text-[10px]">Somente horário e contadores são exibidos; payloads, tokens e stack traces permanecem restritos.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] pt-3 text-[10px] text-[var(--text-muted)]">
            <Clock3 aria-hidden="true" size={12} />
            <span>{summary.worker.lastCheckpointAt ? `Worker ${workerHealthLabel(summary.worker.health)} · último checkpoint: ${formatDate(summary.worker.lastCheckpointAt)}` : "Worker sem checkpoint persistido"}</span>
            <span aria-hidden="true">·</span>
            <span>Atualizado em {formatDate(summary.generatedAt)}</span>
          </div>
          {summary.worker.healthBySubsystem && <p className="text-[10px] text-[var(--text-muted)]">Checkpoints por subsistema: {formatSubsystemHealth(summary.worker.healthBySubsystem)}</p>}
          {error && <p className="text-[11px] text-[var(--warning)]" role="status">A última atualização não foi concluída; os dados exibidos são a leitura anterior.</p>}
        </div>
      )}
    </Surface>
  );
}

function workerHealthLabel(health: PlatformObservabilitySummary["worker"]["health"]) {
  if (health === "HEALTHY") return "saudável";
  if (health === "STALE") return "atrasado";
  return "sem evidência";
}

function formatSubsystemHealth(values: Record<string, "HEALTHY" | "STALE" | "UNKNOWN">) {
  return Object.entries(values).map(([key, value]) => `${key}: ${workerHealthLabel(value)}`).join(" · ");
}

function Metric({ icon, label, tone = "neutral", value }: { icon: React.ReactNode; label: string; tone?: "success" | "warning" | "danger" | "neutral"; value: number }) {
  const status = tone === "success" ? "sucesso" : tone === "warning" ? "alerta" : tone === "danger" ? "erro" : "informacao";
  return (
    <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><span aria-hidden="true">{icon}</span><span>{label}</span></div>
      <div className="mt-2 flex items-center justify-between gap-2"><strong className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</strong><StatusBadge status={status} label={tone === "neutral" ? "Normal" : undefined} /></div>
    </div>
  );
}

function QueueCard({ icon, label, values }: { icon: React.ReactNode; label: string; values: Record<string, number> }) {
  const entries = Object.entries(values).filter(([, value]) => value > 0);
  return (
    <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)]"><span className="text-[var(--icon-default)]">{icon}</span>{label}</div>
      {entries.length ? <dl className="mt-2 space-y-1.5">{entries.map(([key, value]) => <div className="flex items-center justify-between gap-3 text-[11px]" key={key}><dt className="truncate text-[var(--text-muted)]">{key}</dt><dd className="font-semibold tabular-nums text-[var(--text-primary)]">{value}</dd></div>)}</dl> : <p className="mt-2 text-[11px] text-[var(--text-muted)]">Nenhuma operação pendente.</p>}
    </div>
  );
}

function mergeCountMaps(namespaces: Record<string, Record<string, number>>) {
  return Object.entries(namespaces).reduce<Record<string, number>>((merged, [namespace, values]) => {
    for (const [key, value] of Object.entries(values || {})) merged[`${namespace}:${key}`] = Number(value || 0);
    return merged;
  }, {});
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "não informado" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
