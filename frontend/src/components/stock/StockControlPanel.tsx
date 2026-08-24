import { AlertTriangle, FileUp, RefreshCw, ShieldAlert, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiHttpError, fetchStockFreshness, fetchStockLot, fetchStockProduct, fetchStockQualityIssues, fetchStockSource, fetchStockSources, previewStockCsv, type StockBalance, type StockImportPreview, type StockLot, type StockProduct, type StockQualityIssue, type StockSource } from "../../services/crmApi";
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
  const [preview, setPreview] = useState<{ accepted?: number; rejected?: number; status?: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
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
  const csvSources = sources.filter((source) => source.tipoFonte === "FILE_IMPORT_CSV");

  async function previewImport() {
    const id = Number(sourceId);
    if (!Number.isSafeInteger(id) || !content.trim()) return;
    setPreviewing(true); setPreviewError(""); setPreview(null);
    try {
      const result = await previewStockCsv({ fonteId: id, content, filename: filename.trim() || undefined, delimiter: "comma" });
      const importItem: StockImportPreview = result.item.importacao ?? (result.item as unknown as StockImportPreview);
      setPreview({ accepted: importItem.acceptedCount, rejected: importItem.rejectedCount, status: importItem.status });
    } catch (error) { setPreviewError(error instanceof Error ? error.message : "Não foi possível gerar a prévia segura."); }
    finally { setPreviewing(false); }
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
        {csvSources.length === 0 ? <EmptyState state="unavailable" title="Nenhuma fonte CSV ativa" description="Crie e valide uma fonte CSV antes de importar." /> : <div className="space-y-3 p-4">
          <Select label="Fonte CSV" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Selecione uma fonte</option>{csvSources.map((source) => <option key={source.id} value={source.id}>{source.nome || `Fonte ${source.id}`}</option>)}</Select>
          <Input label="Nome seguro do arquivo" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="estoque.csv" />
          <Textarea label="Conteúdo CSV" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole o CSV para gerar uma prévia" />
          {previewError && <p role="alert" className="text-xs text-[var(--danger)]">{previewError}</p>}
          {preview && <div role="status" className="rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]">Prévia {preview.status || "gerada"}: <strong className="text-[var(--success)]">{preview.accepted ?? 0} aceitas</strong> · <strong className="text-[var(--danger)]">{preview.rejected ?? 0} rejeitadas</strong></div>}
          <Button className="w-full" disabled={!sourceId || !content.trim()} loading={previewing} onClick={() => void previewImport()} variant="primary">Gerar prévia segura</Button>
        </div>}
      </Surface>
    </div>
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
