import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, HandCoins, PackageCheck, ShieldAlert } from "lucide-react";
import { Badge, Button, Surface } from "../ui";
import { isOfferExpired, isSafeCommerceUrl } from "../../services/aiCommerceApi";
import type { AICommerceProductOffer } from "../../services/aiCommerceApi";

type ProductOfferCardProps = {
  offer: AICommerceProductOffer;
  onInterest?: (offer: AICommerceProductOffer) => void;
  onPreview?: (offer: AICommerceProductOffer) => void;
  busy?: boolean;
  compact?: boolean;
};

const availabilityTone: Record<AICommerceProductOffer["availabilityStatus"], { label: string; variant: "success" | "warning" | "danger" | "neutral" | "primary" }> = {
  AVAILABLE: { label: "Disponível", variant: "success" },
  LOW_AVAILABILITY: { label: "Disponibilidade baixa", variant: "warning" },
  OUT_OF_STOCK: { label: "Sem estoque", variant: "danger" },
  NEEDS_CONFIRMATION: { label: "Confirmar com vendedor", variant: "warning" },
  NOT_SELLABLE: { label: "Não vendável", variant: "danger" },
  DATA_STALE: { label: "Dados desatualizados", variant: "warning" },
  UNKNOWN: { label: "Disponibilidade desconhecida", variant: "neutral" },
};

/**
 * Intent: atendente valida uma oferta verdadeira antes de qualquer ação humana;
 * feel: uma etiqueta de prateleira operacional, não um card de marketing.
 * Hierarchy: título e estado de disponibilidade vencem; preço e links são evidência secundária.
 * Palette/depth: tokens do CRM, borda discreta e uma única ação âmbar (primary).
 * Typography/spacing: escala densa existente, grid de 4px e números tabulares.
 */
export default function ProductOfferCard({ busy = false, compact = false, offer, onInterest, onPreview }: ProductOfferCardProps) {
  const expired = isOfferExpired(offer);
  const tone = availabilityTone[offer.availabilityStatus] ?? availabilityTone.UNKNOWN;
  const blocked = expired || offer.availabilityStatus === "NOT_SELLABLE" || offer.availabilityStatus === "OUT_OF_STOCK";
  const requiresConfirmation = offer.manualConfirmationRequired || offer.availabilityStatus === "NEEDS_CONFIRMATION" || offer.availabilityStatus === "DATA_STALE" || offer.availabilityStatus === "UNKNOWN";
  const productUrl = isSafeCommerceUrl(offer.productUrl) ? offer.productUrl : undefined;
  const purchaseUrl = isSafeCommerceUrl(offer.purchaseUrl) ? offer.purchaseUrl : undefined;
  const price = formatPrice(offer.price, offer.currency, offer.priceStatus);

  return (
    <Surface aria-label={`Oferta de ${offer.title}`} className={`overflow-hidden ${expired ? "opacity-80" : ""}`} data-testid="ai-commerce-product-offer">
      <div className="flex min-w-0 gap-3 p-3">
        {offer.imageUrl && isSafeCommerceUrl(offer.imageUrl) ? (
          <img alt="" className="h-16 w-16 shrink-0 rounded-[5px] border border-[var(--border-default)] object-cover" loading="lazy" src={offer.imageUrl} />
        ) : (
          <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-muted)]"><PackageCheck size={19} /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">{offer.title}</h3>
              {offer.shortDescription && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">{offer.shortDescription}</p>}
            </div>
            <Badge variant={expired ? "danger" : tone.variant}>{expired ? "Oferta expirada" : tone.label}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[.08em] text-[var(--text-muted)]">Preço validado</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text-primary)]">{price}</p>
            </div>
            <div className="text-right text-[10px] text-[var(--text-muted)]">
              <p>{freshnessLabel(offer.sourceFreshness)}</p>
              {offer.expiresAt && <p className="mt-0.5 inline-flex items-center gap-1"><Clock3 size={11} />até {formatDateTime(offer.expiresAt)}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5">
        {requiresConfirmation && !expired && <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[var(--warning)]"><ShieldAlert className="mt-0.5 shrink-0" size={12} />{offer.availabilityLabel || "Confirme a disponibilidade com um vendedor antes de prometer ao cliente."}</p>}
        {expired && <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[var(--danger)]"><AlertTriangle className="mt-0.5 shrink-0" size={12} />Esta oferta não pode ser usada como informação atual. Gere uma nova oferta.</p>}
        {!requiresConfirmation && !expired && <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[var(--success)]"><CheckCircle2 className="mt-0.5 shrink-0" size={12} />{offer.availabilityLabel || "Disponibilidade baseada no estoque canônico."}</p>}
        {!compact && <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {productUrl && <a className="inline-flex min-h-8 items-center gap-1.5 rounded-[5px] border border-[var(--control-border)] px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" href={productUrl} rel="noreferrer" target="_blank"><ExternalLink size={12} />Ver produto</a>}
          {purchaseUrl && !blocked && <a className="inline-flex min-h-8 items-center gap-1.5 rounded-[5px] border border-[var(--control-border)] px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" href={purchaseUrl} rel="noreferrer" target="_blank"><ExternalLink size={12} />Link de compra</a>}
          {onPreview && <Button disabled={busy || expired} onClick={() => onPreview(offer)} size="sm" variant="secondary">Revalidar oferta</Button>}
          {onInterest && <Button disabled={busy || blocked} leftIcon={<HandCoins size={12} />} onClick={() => onInterest(offer)} size="sm" variant="primary">Tenho interesse</Button>}
        </div>}
      </div>
    </Surface>
  );
}

function formatPrice(value: AICommerceProductOffer["price"], currency: string | null | undefined, status: AICommerceProductOffer["priceStatus"]) {
  if (status === "ON_REQUEST" || status === "MISSING" || value === null || value === undefined || value === "") return "Preço sob consulta";
  if (status === "STALE") return "Preço requer confirmação";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "Preço sob consulta";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency || "BRL"}`;
  }
}

function freshnessLabel(value: AICommerceProductOffer["sourceFreshness"]) {
  if (value === "FRESH") return "Fonte atualizada";
  if (value === "STALE") return "Fonte desatualizada";
  return "Freshness desconhecida";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "indisponível";
}
