import { Building2, History, RefreshCw, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPlatformTenant,
  fetchPlatformTenantAutomationsAudit,
  fetchPlatformTenants,
  updatePlatformTenantAutomations,
  type ApiHttpError,
  type PlatformCapabilityAudit,
  type PlatformTenant,
} from "../../services/crmApi";
import { Badge, Button, EmptyState, ErrorState, Input, Pagination, SectionHeader, StatusBadge, Surface, Textarea } from "../ui";
import { cx } from "../ui/utils";

const pageSize = 12;
const auditPageSize = 6;

export default function DashboardPlatformTenantsPanel() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selected, setSelected] = useState<PlatformTenant | null>(null);
  const [audit, setAudit] = useState<PlatformCapabilityAudit[]>([]);
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const automationsEnabled = selected?.capabilities.automations.enabled === true;
  const selectedTenantId = selected?.id ?? null;

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchPlatformTenants({ page, limit: pageSize, busca: appliedSearch });
      setTenants(response.data);
      setTotalPages(response.pagination.totalPages);
      setSelected((current) => {
        if (!response.data.length) return null;
        if (!current || !response.data.some((tenant) => tenant.id === current.id)) {
          setAuditPage(1);
          return response.data[0];
        }
        return current;
      });
      if (!response.data.length) {
        setSelected(null);
        setAudit([]);
      }
    } catch (apiError) {
      setError(platformErrorMessage(apiError));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  const loadTenant = useCallback(async (id: number) => {
    setDetailLoading(true);
    setError("");
    try {
      setSelected(await fetchPlatformTenant(id));
      setAuditPage(1);
    } catch (apiError) {
      setError(platformErrorMessage(apiError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (id: number) => {
    try {
      const response = await fetchPlatformTenantAutomationsAudit(id, { page: auditPage, limit: auditPageSize });
      setAudit(response.data);
      setAuditTotalPages(response.pagination.totalPages);
    } catch {
      setAudit([]);
      setAuditTotalPages(0);
    }
  }, [auditPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTenants();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadTenants]);

  useEffect(() => {
    if (!selectedTenantId) return;
    const timeout = window.setTimeout(() => {
      void loadAudit(selectedTenantId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [selectedTenantId, loadAudit]);

  async function submitCapabilityChange(enabled: boolean) {
    if (!selected) return;
    const action = enabled ? "ativar" : "desativar";
    const confirmed = window.confirm(
      enabled
        ? `Ativar Automações somente para ${selected.nome}? Nenhuma regra será criada ou executada.`
        : `Desativar Automações somente para ${selected.nome}? Regras e histórico serão preservados, mas novas execuções ficarão bloqueadas.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await updatePlatformTenantAutomations(selected.id, { enabled, reason: reason.trim() || undefined });
      await loadTenant(selected.id);
      await loadAudit(selected.id);
      setReason("");
      setMessage(result.changed ? `Automações ${enabled ? "ativadas" : "desativadas"} para este tenant.` : "O tenant já estava nesse estado.");
    } catch (apiError) {
      setError(platformErrorMessage(apiError) || `Nao foi possivel ${action} a capability agora.`);
    } finally {
      setSaving(false);
    }
  }

  const selectedMeta = useMemo(() => {
    if (!selected) return [];
    return [
      { label: "ID", value: String(selected.id) },
      { label: "Slug", value: selected.slug },
      { label: "Status", value: selected.ativo ? "Ativo" : "Inativo" },
      { label: "Atualizado", value: formatDate(selected.updatedAt) },
    ];
  }, [selected]);

  return (
    <section className="space-y-3" aria-label="Operações da plataforma">
      <Surface className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeader
            description="Operações internas restritas para controlar a capability de automações por tenant."
            icon={<ShieldCheck size={15} />}
            title="Tenants da plataforma"
          />
          <form
            className="flex w-full max-w-md items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            <Input aria-label="Buscar tenant" placeholder="Buscar por nome ou slug" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Button leftIcon={<Search size={14} />} type="submit">Buscar</Button>
          </form>
        </div>
      </Surface>

      {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{message}</div>}
      {error && <ErrorState className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]" description={error} onRetry={() => void loadTenants()} title="Operação indisponível" />}

      <div className="grid min-h-[520px] gap-3 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <Surface className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[var(--border-default)] px-4 py-3">
            <SectionHeader description="Lista paginada sem dados comerciais." icon={<Building2 size={15} />} title="Empresas" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <LoadingRows />
            ) : tenants.length ? (
              <div className="space-y-1">
                {tenants.map((tenant) => (
                  <button
                    className={cx(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                      selected?.id === tenant.id
                        ? "border-[var(--primary)] bg-emerald-50"
                        : "border-transparent hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]",
                    )}
                    key={tenant.id}
                    onClick={() => void loadTenant(tenant.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{tenant.nome}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{tenant.slug}</p>
                      </div>
                      <StatusBadge
                        label={tenant.capabilities.automations.enabled ? "Automações ativas" : "Automações inativas"}
                        status={tenant.capabilities.automations.enabled ? "ativo" : "inativo"}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState description="Ajuste a busca para localizar tenants existentes." title="Nenhum tenant encontrado" />
            )}
          </div>
          <div className="border-t border-[var(--border-default)] p-3">
            <Pagination className="border-t-0 px-0 py-0" page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </Surface>

        <Surface className="min-w-0 overflow-hidden p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">{selected.nome}</h2>
                    <StatusBadge status={selected.ativo ? "ativo" : "inativo"} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Controle individual da capability AUTOMATIONS. Sem impersonação, massa ou dados comerciais.</p>
                </div>
                <Button disabled={detailLoading} leftIcon={<RefreshCw size={14} />} onClick={() => void loadTenant(selected.id)}>Atualizar</Button>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                {selectedMeta.map((item) => (
                  <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2" key={item.label}>
                    <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">{item.label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={automationsEnabled ? "success" : "neutral"}>{automationsEnabled ? "Ativa" : "Inativa"}</Badge>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">Capability AUTOMATIONS</p>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Ativar a capability libera a área de H7 para este tenant. O worker segue controlado por variável própria e não inicia por esta ação.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={saving || automationsEnabled} leftIcon={<ShieldCheck size={14} />} loading={saving && !automationsEnabled} onClick={() => void submitCapabilityChange(true)} variant="primary">
                      Ativar
                    </Button>
                    <Button disabled={saving || !automationsEnabled} leftIcon={<ShieldOff size={14} />} loading={saving && automationsEnabled} onClick={() => void submitCapabilityChange(false)} variant="destructive">
                      Desativar
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Textarea
                    aria-label="Motivo opcional"
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Motivo opcional da alteração"
                    rows={3}
                    value={reason}
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">O motivo é registrado na auditoria quando houver mudança real de estado.</p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <History size={14} />
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Histórico de Automações</h3>
                </div>
                {audit.length ? (
                  <div className="space-y-2">
                    {audit.map((entry) => (
                      <div className="rounded-md border border-[var(--border-default)] px-3 py-2 text-xs" key={entry.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[var(--text-primary)]">
                            {entry.newEnabled ? "Ativou" : "Desativou"} AUTOMATIONS
                          </p>
                          <span className="text-[11px] text-[var(--text-muted)]">{formatDate(entry.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Por {entry.actor?.nome ?? "Operador removido"} · anterior: {entry.previousEnabled === null ? "sem registro" : entry.previousEnabled ? "ativo" : "inativo"}
                        </p>
                        {entry.reason && <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{entry.reason}</p>}
                      </div>
                    ))}
                    <Pagination className="px-0" page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} />
                  </div>
                ) : (
                  <EmptyState description="Alterações idempotentes não geram auditoria falsa." title="Nenhuma alteração registrada" />
                )}
              </div>
            </div>
          ) : (
            <EmptyState description="Selecione um tenant existente para consultar a capability de Automações." title="Nenhum tenant selecionado" />
          )}
        </Surface>
      </div>
    </section>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="h-14 rounded-md bg-[var(--bg-muted)]" key={index} />
      ))}
    </div>
  );
}

function platformErrorMessage(error: unknown) {
  const apiError = error as ApiHttpError;
  if (apiError?.status === 401) return "Sessão expirada. Entre novamente para continuar.";
  if (apiError?.status === 403) return "Acesso restrito ao operador da plataforma.";
  if (apiError?.status === 404) return "Tenant não encontrado.";
  if (apiError?.status === 422) return apiError.message;
  if (apiError?.status === 429) return "Muitas operações em pouco tempo. Aguarde e tente novamente.";
  return "Não foi possível carregar operações da plataforma agora.";
}

function formatDate(value?: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
