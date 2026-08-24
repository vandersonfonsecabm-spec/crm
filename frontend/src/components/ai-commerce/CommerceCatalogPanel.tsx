import { Archive, ChevronRight, PackageSearch, RefreshCw, ShieldCheck, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiHttpError } from "../../services/crmApi";
import { fetchAICommerceCatalog, fetchAICommerceCatalogProduct, previewAICommerceOffer, searchAICommerceCatalog } from "../../services/aiCommerceApi";
import type { AICommerceAvailabilityStatus, AICommerceCatalogProduct, AICommerceProductOffer, AICommerceVisibility } from "../../services/aiCommerceApi";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, SectionHeader, Select, Surface } from "../ui";
import ProductOfferCard from "./ProductOfferCard";

type CommerceCatalogPanelProps = {
  onOpenProduct?: (id: number) => void;
  onBack?: () => void;
  productId?: number;
  enabled?: boolean;
};

const visibilityOptions: Array<{ value: "" | AICommerceVisibility; label: string }> = [
  { value: "", label: "Todas as visibilidades" },
  { value: "PUBLISHED", label: "Publicados" },
  { value: "HIDDEN", label: "Ocultos" },
  { value: "ARCHIVED", label: "Arquivados" },
];

/**
 * Intent: catalog manager verifies what is safe to sell, then opens one product;
 * hierarchy: search/visibility gate → list → offer evidence;
 * palette: slate surfaces with amber only on the primary “preview” action;
 * depth: borders and quiet surface shifts keep this a workbench, not a storefront;
 * spacing: existing 4px rhythm, compact controls, generous air around the focal row.
 */
export default function CommerceCatalogPanel({ onOpenProduct, onBack, productId, enabled = true }: CommerceCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"" | AICommerceVisibility>("PUBLISHED");
  const [availability, setAvailability] = useState<"" | AICommerceAvailabilityStatus>("");
  const [result, setResult] = useState<{ data: AICommerceCatalogProduct[]; page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<AICommerceProductOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);
  const [offerLoadingId, setOfferLoadingId] = useState<number | null>(null);
  const [offerError, setOfferError] = useState("");
  const [detailProduct, setDetailProduct] = useState<AICommerceCatalogProduct | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError("");
      setResult(null);
      setDetailProduct(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (productId) {
        setDetailProduct(await fetchAICommerceCatalogProduct(productId));
        setResult(null);
      } else {
        const fetcher = query.trim() || availability ? searchAICommerceCatalog : fetchAICommerceCatalog;
        const next = await fetcher({ q: query, visibility: visibility || undefined, availability: availability || undefined, page: 1, limit: 20 });
        setDetailProduct(null);
        setResult(next);
      }
    } catch (nextError) {
      setResult(null);
      setError(catalogErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [availability, enabled, productId, query, visibility]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load, requestKey]);

  const publishedCount = useMemo(() => result?.data.filter((item) => item.visibility === "PUBLISHED").length ?? 0, [result]);

  async function previewOffer(product: AICommerceCatalogProduct) {
    setOfferLoadingId(product.id);
    setOfferError("");
    try {
      const response = await previewAICommerceOffer({ catalogProductId: product.id });
      setSelectedOffer(response.offer);
    } catch (nextError) {
      setOfferError(catalogErrorMessage(nextError));
    } finally {
      setOfferLoadingId(null);
    }
  }

  if (!enabled) return <section aria-label="Catálogo comercial" className="space-y-3" data-testid="ai-commerce-catalog-panel"><Surface><div className="p-4"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Fundação comercial OFF</h2><p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">O catálogo comercial permanece publicado em estado somente leitura até que o recurso seja habilitado para este tenant.</p></div></Surface></section>;

  return (
    <section aria-label="Catálogo comercial" className="space-y-3" data-testid="ai-commerce-catalog-panel">
      <Surface>
        <SectionHeader actions={<Button leftIcon={<RefreshCw size={13} />} onClick={() => setRequestKey((value) => value + 1)} size="sm" variant="ghost">Atualizar</Button>} description="Produtos publicados são ligados ao estoque canônico antes de aparecer em uma oferta." icon={<PackageSearch size={16} />} title="Catálogo comercial" status={<Badge variant="primary">{result ? `${publishedCount} publicados` : "leitura segura"}</Badge>} />
        <div className="grid gap-2 border-b border-[var(--border-default)] bg-[var(--bg-muted)] p-3 md:grid-cols-[minmax(0,1fr)_190px_210px]">
          <Input aria-label="Buscar no catálogo comercial" onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Buscar produto, marca ou categoria" value={query} />
          <Select aria-label="Filtrar visibilidade" onChange={(event) => setVisibility(event.target.value as "" | AICommerceVisibility)} value={visibility}><option value="">Todas as visibilidades</option>{visibilityOptions.filter((item) => item.value !== "").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
          <Select aria-label="Filtrar disponibilidade" onChange={(event) => setAvailability(event.target.value as "" | AICommerceAvailabilityStatus)} value={availability}>
            <option value="">Qualquer disponibilidade</option>
            <option value="AVAILABLE">Disponível</option>
            <option value="LOW_AVAILABILITY">Disponibilidade baixa</option>
            <option value="NEEDS_CONFIRMATION">Precisa confirmação</option>
            <option value="OUT_OF_STOCK">Sem estoque</option>
          </Select>
        </div>
      </Surface>

      {loading && <LoadingState label="Carregando catálogo comercial" rows={5} />}
      {!loading && error && <Surface><ErrorState description="O catálogo permanece intacto; tente novamente quando a API estiver disponível." onRetry={() => setRequestKey((value) => value + 1)} state={new ApiHttpError(error, error.toLowerCase().includes("acesso") ? 403 : 500).status === 403 ? "restricted" : "unavailable"} title={error} /></Surface>}
      {!loading && !error && productId && detailProduct && <Surface><div className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[.08em] text-[var(--text-muted)]">Produto comercial</p><h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{detailProduct.title}</h2></div>{onBack && <Button onClick={onBack} size="sm" variant="ghost">Voltar ao catálogo</Button>}</div><p className="text-xs leading-5 text-[var(--text-secondary)]">{detailProduct.longDescription || detailProduct.shortDescription || "Descrição comercial não informada."}</p><div className="grid gap-2 sm:grid-cols-2"><Info label="Visibilidade" value={detailProduct.visibility} /><Info label="Preço" value={formatPrice(detailProduct)} /><Info label="Revisão" value={String(detailProduct.revision)} /><Info label="Estoque canônico" value={detailProduct.stockProductId ? `Produto #${detailProduct.stockProductId}` : "Sem vínculo · confirmação obrigatória"} /></div><div className="flex flex-wrap gap-2"><Button disabled={detailProduct.visibility !== "PUBLISHED"} leftIcon={<ShieldCheck size={12} />} onClick={() => void previewOffer(detailProduct)} size="sm" variant="primary">Prévia segura</Button></div></div></Surface>}
      {!loading && !error && !productId && result && result.data.length === 0 && <Surface><EmptyState description="Produtos ocultos, arquivados ou sem vínculo canônico não aparecem nesta leitura." icon={<PackageSearch size={19} />} state="empty" title="Nenhum produto publicado" /></Surface>}

      {!loading && !error && !productId && result && result.data.length > 0 && (
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[var(--border-default)]">
            {result.data.map((product) => <CatalogRow busy={offerLoadingId === product.id} key={product.id} onOpen={onOpenProduct} onPreview={previewOffer} product={product} />)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-2.5 text-[11px] text-[var(--text-muted)]"><span>{result.total} produto(s) retornado(s) · máximo de 20 candidatos por busca</span><span>Página {result.page} de {Math.max(1, result.totalPages)}</span></div>
        </Surface>
      )}

      {offerError && <div aria-live="assertive" className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-subtle)] px-3 py-2 text-[11px] text-[var(--danger)]">{offerError}</div>}
      {selectedOffer && <section aria-label="Prévia da oferta" className="space-y-2"><div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Prévia de ProductOffer</h2><p className="text-[11px] text-[var(--text-muted)]">Snapshot com validade; a Inbox precisa revalidar antes de qualquer aprovação.</p></div><Button onClick={() => setSelectedOffer(null)} size="sm" variant="ghost">Fechar prévia</Button></div><ProductOfferCard offer={selectedOffer} onPreview={() => void previewOffer({ id: selectedOffer.catalogProductId, title: selectedOffer.title, visibility: "PUBLISHED", revision: selectedOffer.catalogRevision })} /></section>}
    </section>
  );
}

function CatalogRow({ busy, onOpen, onPreview, product }: { busy: boolean; onOpen?: (id: number) => void; onPreview: (product: AICommerceCatalogProduct) => void; product: AICommerceCatalogProduct }) {
  const published = product.visibility === "PUBLISHED";
  return <article className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--bg-muted)]">
    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">{product.visibility === "ARCHIVED" ? <Archive size={15} /> : <Tag size={15} />}</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">{product.title}</h3><Badge variant={published ? "success" : product.visibility === "ARCHIVED" ? "neutral" : "warning"}>{published ? "Publicado" : product.visibility === "ARCHIVED" ? "Arquivado" : "Oculto"}</Badge></div><p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{[product.brand, product.model, product.category].filter(Boolean).join(" · ") || "Atributos comerciais não informados"}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{product.stockProductId ? `Produto canônico #${product.stockProductId}` : "Sem vínculo canônico · confirmação obrigatória"} · revisão {product.revision}</p></div>
    <div className="flex shrink-0 flex-wrap items-center gap-2"><Button disabled={!published || busy} loading={busy} leftIcon={<ShieldCheck size={12} />} onClick={() => onPreview(product)} size="sm" variant="primary">Prévia segura</Button>{onOpen && <Button aria-label={`Abrir ${product.title}`} onClick={() => onOpen(product.id)} rightIcon={<ChevronRight size={12} />} size="sm" variant="ghost">Abrir</Button>}</div>
  </article>;
}

function catalogErrorMessage(error: unknown) {
  if (error instanceof ApiHttpError && error.status === 403) return "Acesso ao catálogo comercial não permitido para este perfil.";
  if (error instanceof ApiHttpError && error.status === 404) return "A fundação comercial ainda não foi publicada neste ambiente.";
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível carregar o catálogo comercial agora.";
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3"><p className="text-[10px] uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{value}</p></div>;
}

function formatPrice(product: AICommerceCatalogProduct) {
  if (product.priceStatus === "ON_REQUEST" || product.commercialPrice === null || product.commercialPrice === undefined) return "Preço sob consulta";
  const number = Number(product.commercialPrice);
  if (!Number.isFinite(number)) return "Preço sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: product.currency || "BRL" }).format(number);
}
