import { AlertTriangle, Check, FileUp, LoaderCircle, RefreshCw, ShieldAlert, Waves, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiHttpError, cancelStockImport, confirmStockImport, createStockSource, fetchStockFreshness, fetchStockLot, fetchStockProduct, fetchStockQualityIssues, fetchStockSource, fetchStockSources, getAuthSession, getSessionRole, previewStockCsv, syncStockSource, validateStockSource, type StockBalance, type StockImportPreview, type StockLot, type StockProduct, type StockQualityIssue, type StockSource } from "../../services/crmApi";
import { Button, EmptyState, ErrorState, Input, LoadingState, SectionHeader, Select, Surface, Textarea } from "../ui";

type LoadState = "loading" | "ready" | "error" | "restricted";

export default function StockControlPanel({ detail = null }: { detail?: string | null }) {
  const [state, setState] = useState<LoadState>("loading");
  const [sources, setSources] = useState<StockSource[]>([]);
  const [freshness, setFreshness] = useState<StockBalance[]>([]);
  const [issues, setIssues] = useState<StockQualityIssue[]>([]);
  const [retry, setRetry] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<StockImportPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [sourceNotice, setSourceNotice] = useState("");
  const [sourceAction, setSourceAction] = useState<number | null>(null);
  const [importAction, setImportAction] = useState<"confirm" | "cancel" | null>(null);
  const [importActionError, setImportActionError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [detailRow, setDetailRow] = useState<StockProduct | StockLot | StockSource | null>(null);
  const [detailError, setDetailError] = useState("");

  const detailTarget = useMemo(() => {
    const match = String(detail || "").match(/^(produtos|lotes|fontes):(\d+)$/);
    return match ? { kind: match[1], id: Number(match[2]) } : null;
  }, [detail]);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchStockSources(), fetchStockFreshness(), fetchStockQualityIssues()]).then(([sourceResult, freshnessResult, issueResult]) => {
      if (!active) return;
      setSources(sourceResult.items);
      setFreshness(freshnessResult.items);
      setIssues(issueResult.items);
      setState("ready");
    }).catch((error) => {
      if (!active) return;
      setState(error instanceof ApiHttpError && error.status === 403 ? "restricted" : "error");
    });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!detailTarget) return;
    let active = true;
    const request = detailTarget.kind === "produtos" ? fetchStockProduct(detailTarget.id) : detailTarget.kind === "lotes" ? fetchStockLot(detailTarget.id) : fetchStockSource(detailTarget.id);
    void request.then((result) => {
      if (!active) return;
      setDetailRow(result.item);
      setDetailError("");
    }).catch((error) => { if (active) setDetailError(error instanceof Error ? error.message : "Detalhe indisponível."); });
    return () => { active = false; };
  }, [detailTarget]);

  const freshnessSummary = useMemo(() => ({
    fresh: freshness.filter((item) => item.freshnessEstado === "FRESH").length,
    stale: freshness.filter((item) => item.freshnessEstado === "STALE").length,
    unknown: freshness.filter((item) => !item.freshnessEstado || item.freshnessEstado === "UNKNOWN").length,
  }), [freshness]);
  const canManageSources = getSessionRole(getAuthSession()) === "ADMIN";
  const csvSources = sources.filter((source) => source.tipoFonte === "FILE_IMPORT_CSV");
  const activeCsvSources = csvSources.filter((source) => source.statusCiclo === "ACTIVE");
  const pendingCsvSources = csvSources.filter((source) => ["DRAFT", "AUTH_ERROR", "DISABLED"].includes(source.statusCiclo || "DRAFT"));
  const syncableSources = sources.filter((source) => source.tipoFonte !== "FILE_IMPORT_CSV" && source.statusCiclo === "ACTIVE");

  function replaceSource(next: StockSource) {
    setSources((current) => current.some((source) => source.id === next.id) ? current.map((source) => source.id === next.id ? next : source) : [...current, next]);
  }

  async function createSource() {
    if (!canManageSources || !sourceName.trim()) return;
    setSourceAction(-1); setSourceError(""); setSourceNotice("");
    try {
      const result = await createStockSource({ tipoFonte: "FILE_IMPORT_CSV", nome: sourceName.trim() });
      replaceSource(result.item); setSourceName(""); setSourceNotice("Fonte CSV criada. Valide-a antes de gerar a prévia.");
    } catch (error) { setSourceError(error instanceof Error ? error.message : "Não foi possível criar a fonte CSV."); }
    finally { setSourceAction(null); }
  }

  async function validateSource(id: number) {
    if (!canManageSources) return;
    setSourceAction(id); setSourceError(""); setSourceNotice("");
    try {
      const result = await validateStockSource(id);
      replaceSource(result.item); if (result.item.statusCiclo === "ACTIVE") setSourceId(String(id));
    } catch (error) { setSourceError(error instanceof Error ? error.message : "Não foi possível validar a fonte."); }
    finally { setSourceAction(null); }
  }

  async function syncSource(id: number) {
    if (!canManageSources) return;
    setSourceAction(id); setSourceError(""); setSyncStatus("");
    try {
      const result = await syncStockSource(id);
      setSyncStatus(`Sincronização ${result.item.estado || "iniciada"}.`);
    } catch (error) { setSourceError(error instanceof Error ? error.message : "Não foi possível iniciar a sincronização."); }
    finally { setSourceAction(null); }
  }

  async function previewImport() {
    const id = Number(sourceId);
    if (!Number.isSafeInteger(id) || !content.trim()) return;
    setPreviewing(true); setPreviewError(""); setPreview(null);
    try {
      const idempotencyKey = `stock-preview-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      const result = await previewStockCsv({ fonteId: id, content, filename: filename.trim() || undefined, delimiter: "comma", idempotencyKey });
      const importItem: StockImportPreview = result.item.importacao ?? (result.item as unknown as StockImportPreview);
      setPreview(importItem);
    } catch (error) { setPreviewError(error instanceof Error ? error.message : "Não foi possível gerar a prévia segura."); }
    finally { setPreviewing(false); }
  }

  async function finalizeImport(action: "confirm" | "cancel") {
    const importId = preview?.id;
    const revision = preview?.revision;
    if (!importId || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return;
    setImportAction(action); setImportActionError("");
    try {
      const next = action === "confirm"
        ? (await confirmStockImport(importId, { revision, allowPartial: Number(preview?.rejectedCount || 0) > 0 })).item
        : (await cancelStockImport(importId, revision)).item;
      setPreview(next);
    } catch (error) { setImportActionError(error instanceof Error ? error.message : "Não foi possível concluir a importação."); }
    finally { setImportAction(null); }
  }

  if (state === "loading") return <LoadingState label="Carregando controle de estoque" rows={6} />;
  if (state === "restricted") return <Surface><ErrorState state="restricted" title="Acesso ao estoque não permitido" description="Seu perfil não possui acesso a este controle operacional." /></Surface>;
  if (state === "error") return <Surface><ErrorState state="unavailable" title="Estoque indisponível" description="Não foi possível carregar a verdade operacional agora." onRetry={() => { setState("loading"); setRetry((value) => value + 1); }} /></Surface>;

  return <section className="space-y-3" aria-label="Controle operacional de estoque">
    {detailTarget && <Surface><SectionHeader title={detailTarget.kind === "produtos" ? "Detalhe do produto" : detailTarget.kind === "lotes" ? "Detalhe do lote" : "Detalhe da fonte"} description="Leitura canônica tenant-scoped." />{detailError ? <ErrorState state="unavailable" title="Detalhe indisponível" description={detailError} /> : !detailRow ? <EmptyState state="empty" title="Registro não encontrado" description="O target pode ter sido removido ou não pertence ao tenant atual." /> : <dl className="grid gap-3 border-t border-[var(--border-default)] p-4 text-xs sm:grid-cols-2"><DetailField label="ID canônico" value={detailRow.id} /><DetailField label="Nome" value={detailName(detailRow)} /><DetailField label="Estado" value={detailState(detailRow)} /><DetailField label="Atualizado" value={detailUpdatedAt(detailRow)} /></dl>}</Surface>}
    <Surface className="overflow-hidden">
      <SectionHeader title="Controle de estoque" icon={<Waves size={16} />} description="Saldos, qualidade e importação sob uma única leitura operacional." />
      <div className="grid border-t border-[var(--border-default)] sm:grid-cols-3">
        <FreshnessCell label="FRESH" value={freshnessSummary.fresh} tone="text-[var(--success)]" />
        <FreshnessCell label="STALE" value={freshnessSummary.stale} tone="text-[var(--warning)]" />
        <FreshnessCell label="UNKNOWN" value={freshnessSummary.unknown} tone="text-[var(--text-muted)]" />
      </div>
      <p className="border-t border-[var(--border-default)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">A faixa de freshness não infere saldo: UNKNOWN e STALE exigem conferência da fonte.</p>
    </Surface>

    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <Surface>
        <SectionHeader title="Qualidade e mapeamentos" icon={<ShieldAlert size={16} />} description="Problemas reportados pelas fontes, sem preencher valores ausentes." />
        {issues.length === 0 ? <EmptyState state="empty" title="Nenhum problema de qualidade aberto" description="A fonte não reportou pendências de mapeamento ou consistência." /> : <ul className="divide-y divide-[var(--border-default)]" aria-label="Problemas de qualidade">{issues.slice(0, 8).map((issue) => <li className="flex gap-3 px-4 py-3" key={issue.id}><AlertTriangle className={issue.severidade === "CRITICAL" ? "text-[var(--danger)]" : "text-[var(--warning)]"} size={15} /><div className="min-w-0"><p className="text-xs font-semibold text-[var(--text-primary)]">{issue.tipo || "Problema de qualidade"}</p><p className="mt-0.5 break-words text-[11px] text-[var(--text-muted)]">{issue.targetRef || "Referência não informada"} · {issue.estado || "UNKNOWN"}</p></div></li>)}</ul>}
      </Surface>
      <Surface>
        <SectionHeader title="Prévia CSV" icon={<FileUp size={16} />} description="Nenhuma linha é aplicada antes de você revisar a prévia." />
        {activeCsvSources.length === 0 ? <EmptyState state="unavailable" title="Nenhuma fonte CSV ativa" description="Crie e valide uma fonte CSV antes de importar." /> : <div className="space-y-3 p-4">
          <Select label="Fonte CSV" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPreview(null); }}><option value="">Selecione uma fonte</option>{activeCsvSources.map((source) => <option key={source.id} value={source.id}>{source.nome || `Fonte ${source.id}`}</option>)}</Select>
          <Input label="Nome seguro do arquivo" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="estoque.csv" />
          <Textarea label="Conteúdo CSV" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole o CSV para gerar uma prévia" />
          {previewError && <p role="alert" className="text-xs text-[var(--danger)]">{previewError}</p>}
          {preview && <div role="status" className="rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]"><p>Prévia {preview.status || "gerada"}: <strong className="text-[var(--success)]">{preview.acceptedCount ?? 0} aceitas</strong> · <strong className="text-[var(--danger)]">{preview.rejectedCount ?? 0} rejeitadas</strong></p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Lote #{preview.id} · revisão {preview.revision ?? "indisponível"}</p>{importActionError && <p className="mt-2 text-[var(--danger)]" role="alert">{importActionError}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={preview.status !== "READY" || !preview.revision} loading={importAction === "confirm"} leftIcon={<Check size={13} />} onClick={() => void finalizeImport("confirm")} size="sm" variant="primary">{Number(preview.rejectedCount || 0) > 0 ? "Confirmar aceitas (parcial)" : "Confirmar importação"}</Button><Button disabled={! ["READY", "PREVIEW"].includes(preview.status || "")} loading={importAction === "cancel"} leftIcon={<X size={13} />} onClick={() => void finalizeImport("cancel")} size="sm" variant="secondary">Cancelar prévia</Button></div></div>}
          <Button className="w-full" disabled={!sourceId || !content.trim()} loading={previewing} onClick={() => void previewImport()} variant="primary">Gerar prévia segura</Button>
        </div>}
      </Surface>
    </div>
    {canManageSources && <Surface><SectionHeader title="Fontes e sincronizações" description="Somente fontes já suportadas pelo runtime podem ser validadas ou sincronizadas." />{sourceError && <p className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-[var(--danger)]" role="alert">{sourceError}</p>}{sourceNotice && <p className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-[var(--success)]" role="status">{sourceNotice}</p>}{syncStatus && <p className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-[var(--success)]" role="status">{syncStatus}</p>}<div className="grid gap-3 border-t border-[var(--border-default)] p-4 md:grid-cols-[minmax(0,1fr)_auto]" data-stock-source-create><Input label="Nova fonte CSV" value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Estoque da loja" /><Button disabled={!sourceName.trim()} loading={sourceAction === -1} onClick={() => void createSource()} leftIcon={<FileUp size={13} />} size="sm" variant="secondary">Criar fonte CSV</Button></div>{pendingCsvSources.length > 0 && <div className="border-t border-[var(--border-default)] p-4"><p className="text-xs font-semibold text-[var(--text-primary)]">Fontes aguardando validação</p><ul className="mt-2 space-y-2">{pendingCsvSources.map((source) => <li className="flex items-center justify-between gap-2 text-xs" key={source.id}><span className="min-w-0 truncate text-[var(--text-secondary)]">{source.nome || `Fonte ${source.id}`} · {source.statusCiclo || "DRAFT"}</span><Button disabled={sourceAction === source.id} loading={sourceAction === source.id} onClick={() => void validateSource(source.id)} size="sm" variant="secondary">Validar</Button></li>)}</ul></div>}{syncableSources.length > 0 && <div className="border-t border-[var(--border-default)] p-4"><p className="text-xs font-semibold text-[var(--text-primary)]">Fontes sincronizáveis</p><ul className="mt-2 space-y-2">{syncableSources.map((source) => <li className="flex items-center justify-between gap-2 text-xs" key={source.id}><span className="min-w-0 truncate text-[var(--text-secondary)]">{source.nome || `Fonte ${source.id}`} · {source.tipoFonte}</span><Button disabled={sourceAction === source.id} loading={sourceAction === source.id} onClick={() => void syncSource(source.id)} size="sm" variant="secondary"><LoaderCircle size={13} />Sincronizar</Button></li>)}</ul></div>}</Surface>}
    <div className="flex justify-end"><Button leftIcon={<RefreshCw size={14} />} onClick={() => { setState("loading"); setRetry((value) => value + 1); }} size="sm" variant="secondary">Atualizar leitura</Button></div>
  </section>;
}

function DetailField({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</dt><dd className="mt-1 break-words font-medium text-[var(--text-primary)]">{value}</dd></div>;
}

function detailName(row: StockProduct | StockLot | StockSource) {
  if (typeof (row as StockProduct).nomeExibicao === "string") return (row as StockProduct).nomeExibicao || "Indisponível";
  if (typeof (row as StockSource).nome === "string") return (row as StockSource).nome || "Indisponível";
  if (typeof (row as StockLot).codigoLote === "string") return (row as StockLot).codigoLote || "Lote sem código";
  return "Indisponível";
}

function detailState(row: StockProduct | StockLot | StockSource) {
  const value = (row as StockLot).estado || (row as StockSource).statusCiclo;
  return typeof value === "string" && value ? value : "READY";
}

function detailUpdatedAt(row: StockProduct | StockLot | StockSource) {
  const value = (row as StockProduct).updatedAt || (row as StockLot).observedAt;
  return typeof value === "string" && value ? value : "Indisponível";
}

function FreshnessCell({ label, tone, value }: { label: string; tone: string; value: number }) {
  return <div className="border-b border-[var(--border-default)] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] font-bold tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p></div>;
}
