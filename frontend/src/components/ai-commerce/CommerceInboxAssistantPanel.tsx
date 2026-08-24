import { AlertTriangle, ArrowUpRight, Bot, CheckCircle2, Clock3, Handshake, MessageSquareText, RefreshCw, ShieldAlert, Sparkles, UserRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiHttpError } from "../../services/crmApi";
import { approveAICommerceDraft, rejectAICommerceDraft, registerAICommerceInterest, runAICommerceAssistant } from "../../services/aiCommerceApi";
import type { AICommerceAssistantResult, AICommerceProductOffer } from "../../services/aiCommerceApi";
import { Badge, Button, ErrorState, Input, LoadingState, Surface } from "../ui";
import ProductOfferCard from "./ProductOfferCard";

type CommerceInboxAssistantPanelProps = {
  conversationId: number;
  sourceMessageId?: number | null;
  conversationRevision?: number | null;
  onInsertComposer?: (text: string) => void;
};

/**
 * Intent: seller sees grounded evidence beside the existing Inbox composer;
 * hierarchy: one decision/draft first, tool trace and policy evidence second;
 * signature: every recommendation carries a freshness/approval rail back to stock;
 * reject: no purple “AI magic”, no second composer, no one-click send.
 */
export default function CommerceInboxAssistantPanel({ conversationId, conversationRevision = null, onInsertComposer, sourceMessageId = null }: CommerceInboxAssistantPanelProps) {
  const [result, setResult] = useState<AICommerceAssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setResult(null);
    setError("");
    setFeedback("");
  }, [conversationId]);

  const draftStale = Boolean(result?.draft && conversationRevision !== null && result.conversationRevision !== null && result.conversationRevision !== conversationRevision);
  const hasApprovalMode = result?.mode === "HUMAN_APPROVAL" || result?.mode === "SUGGESTION_ONLY";
  const draft = result?.draft ?? null;

  async function runAssistant() {
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      const next = await runAICommerceAssistant({ conversationId, sourceMessageId: sourceMessageId ?? undefined, mode: "SUGGESTION_ONLY" });
      setResult(next);
    } catch (nextError) {
      setError(assistantErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function approve(action: "INSERT_COMPOSER" | "REGISTER_INTEREST" | "CREATE_OPPORTUNITY_DRAFT" | "HANDOFF") {
    if (!draft || draftStale || busyAction) return;
    setBusyAction(action);
    setError("");
    setFeedback("");
    try {
      const next = await approveAICommerceDraft(draft.id, { action, revision: draft.revision, conversationRevision: conversationRevision ?? undefined });
      if (action === "INSERT_COMPOSER") {
        if (next.draft.text && onInsertComposer) onInsertComposer(next.draft.text);
        setFeedback("Rascunho inserido no composer existente. O envio continua sendo uma ação humana separada.");
      } else if (action === "REGISTER_INTEREST") {
        setFeedback("Interesse registrado com aprovação humana.");
      } else if (action === "CREATE_OPPORTUNITY_DRAFT") {
        setFeedback("Oportunidade criada como rascunho; nenhuma venda foi criada.");
      } else {
        setFeedback("Handoff solicitado com o contexto desta conversa.");
      }
      setResult((current) => current ? { ...current, draft: next.draft } : current);
    } catch (nextError) {
      setError(assistantErrorMessage(nextError));
    } finally {
      setBusyAction("");
    }
  }

  async function registerInterest(offer: AICommerceProductOffer) {
    if (!draft || draftStale || busyAction) return;
    setBusyAction(`interest-${offer.offerId}`);
    setError("");
    try {
      await registerAICommerceInterest({ offerId: offer.offerId, conversationId, draftRevision: draft.revision });
      setFeedback(`Interesse em “${offer.title}” registrado para revisão humana.`);
    } catch (nextError) {
      setError(assistantErrorMessage(nextError));
    } finally {
      setBusyAction("");
    }
  }

  async function rejectDraft() {
    if (!draft || draftStale || busyAction) return;
    setBusyAction("reject");
    setError("");
    try {
      await rejectAICommerceDraft(draft.id, { revision: draft.revision, reason: rejectReason.trim() || undefined });
      setResult((current) => current ? { ...current, draft: null } : current);
      setRejectReason("");
      setFeedback("Sugestão rejeitada. Nenhuma mensagem foi enviada.");
    } catch (nextError) {
      setError(assistantErrorMessage(nextError));
    } finally {
      setBusyAction("");
    }
  }

  const modeNote = useMemo(() => {
    if (!result) return "OFF por padrão · mock somente sob allowlist";
    if (result.mode === "SHADOW") return "Shadow: decisão registrada, invisível para o cliente";
    if (result.mode === "SUGGESTION_ONLY") return "Sugestão: draft visível, sem envio";
    if (result.mode === "HUMAN_APPROVAL") return "Aprovação humana: cada efeito é separado";
    return "OFF: nenhuma execução";
  }, [result]);

  return <section aria-label="Assistente comercial da Inbox" className="space-y-3" data-testid="ai-commerce-inbox-assistant">
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3"><div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-[var(--brand-border)] bg-[var(--brand-subtle)] text-[var(--brand)]"><Bot size={17} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Assistente comercial</h2><Badge variant={result?.mode === "SHADOW" ? "neutral" : "primary"}>{result ? result.mode : "OFF"}</Badge></div><p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{modeNote}. Usa somente catálogo e estoque canônicos desta conversa.</p></div></div>
        <Button disabled={loading} leftIcon={<Sparkles size={13} />} loading={loading} onClick={() => void runAssistant()} size="sm" variant="primary">Gerar sugestão segura</Button>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]"><span className="inline-flex items-center gap-1.5"><ShieldAlert size={12} />Não lê banco diretamente</span><span className="inline-flex items-center gap-1.5"><XCircle size={12} />Não envia mensagem</span><span className="inline-flex items-center gap-1.5"><Clock3 size={12} />Oferta tem TTL</span></div>
    </Surface>

    {loading && <LoadingState label="Consultando o mock comercial" rows={4} />}
    {error && <Surface><ErrorState description="A conversa permanece disponível no composer existente." onRetry={() => void runAssistant()} title={error} /></Surface>}
    {!loading && !error && !result && <Surface><div className="flex items-start gap-3 p-4"><MessageSquareText className="mt-0.5 shrink-0 text-[var(--text-muted)]" size={17} /><div><h3 className="text-xs font-semibold text-[var(--text-primary)]">Ainda não há uma sugestão para esta mensagem</h3><p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">Use o botão acima depois de confirmar que a conversa selecionada e a mensagem de origem continuam atuais.</p></div></div></Surface>}

    {!loading && result && <>
      <Surface>
        <div className="grid gap-3 p-4 sm:grid-cols-3"><Info label="Intenção" value={result.intent || "Não identificada"} /><Info label="Confiança" value={formatConfidence(result.confidence)} /><Info label="Conexão" value={result.connectionStatus === "MOCK_AVAILABLE" ? "Mock local" : "Não conectada"} /></div>
        {result.missingInformation.length > 0 && <div className="border-t border-[var(--border-default)] bg-[var(--warning-subtle)] px-4 py-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--warning)]"><AlertTriangle size={12} />Informações necessárias antes de recomendar</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-[11px] text-[var(--text-secondary)]">{result.missingInformation.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </Surface>

      {result.warnings.length > 0 && <div aria-live="polite" className="rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-subtle)] px-3 py-2 text-[11px] text-[var(--warning)]"><strong>Avisos de política:</strong> {result.warnings.join(" · ")}</div>}
      {result.offers.length > 0 && <section aria-label="Ofertas sugeridas" className="space-y-2"><div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Ofertas sugeridas</h2><p className="text-[11px] text-[var(--text-muted)]">Máximo de 3 ofertas · snapshot revalidável</p></div><Badge variant="info">{result.offers.length} oferta(s)</Badge></div><div className="grid gap-3 lg:grid-cols-2">{result.offers.slice(0, 3).map((offer) => <ProductOfferCard busy={busyAction === `interest-${offer.offerId}`} key={offer.offerId} offer={offer} onInterest={(nextOffer) => void registerInterest(nextOffer)} />)}</div></section>}

      {draft && <Surface>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-default)] p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Rascunho para revisão</h2><Badge variant={draftStale ? "danger" : hasApprovalMode ? "warning" : "neutral"}>{draftStale ? "Conversa mudou" : draft.requiresHumanApproval ? "Aprovação obrigatória" : "Somente leitura"}</Badge></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">Revisão {draft.revision} · expira {draft.expiresAt ? formatDateTime(draft.expiresAt) : "sem data informada"}</p></div><UserRound aria-hidden="true" className="text-[var(--text-muted)]" size={15} /></div>
        {draftStale && <div className="flex items-start gap-2 border-b border-[var(--danger-border)] bg-[var(--danger-subtle)] px-4 py-3 text-[11px] text-[var(--danger)]"><AlertTriangle className="mt-0.5 shrink-0" size={13} />A conversa recebeu uma alteração. Gere uma nova sugestão antes de aprovar este rascunho.</div>}
        <div className="space-y-3 p-4"><p className="whitespace-pre-wrap rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs leading-5 text-[var(--text-primary)]">{draft.text || "Nenhum texto sugerido; faça uma pergunta de esclarecimento."}</p>{draft.questions.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">Perguntas sugeridas</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-[11px] text-[var(--text-secondary)]">{draft.questions.slice(0, 4).map((question) => <li key={question}>{question}</li>)}</ul></div>}{draft.handoffReason && <p className="flex items-start gap-1.5 text-[11px] text-[var(--warning)]"><Handshake className="mt-0.5 shrink-0" size={13} />{draft.handoffReason}</p>}
          <Input aria-label="Motivo da rejeição (opcional)" maxLength={240} onChange={(event) => setRejectReason(event.target.value)} placeholder="Motivo da rejeição (opcional)" value={rejectReason} />
          <div className="flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-3"><Button disabled={Boolean(busyAction) || draftStale} leftIcon={<ArrowUpRight size={12} />} loading={busyAction === "INSERT_COMPOSER"} onClick={() => void approve("INSERT_COMPOSER")} size="sm" variant="primary">Inserir no composer</Button><Button disabled={Boolean(busyAction) || draftStale} leftIcon={<CheckCircle2 size={12} />} loading={busyAction === "REGISTER_INTEREST"} onClick={() => void approve("REGISTER_INTEREST")} size="sm" variant="secondary">Aprovar interesse</Button><Button disabled={Boolean(busyAction) || draftStale} loading={busyAction === "CREATE_OPPORTUNITY_DRAFT"} onClick={() => void approve("CREATE_OPPORTUNITY_DRAFT")} size="sm" variant="secondary">Criar oportunidade rascunho</Button><Button disabled={Boolean(busyAction) || draftStale} leftIcon={<Handshake size={12} />} loading={busyAction === "HANDOFF"} onClick={() => void approve("HANDOFF")} size="sm" variant="secondary">Aprovar handoff</Button><Button disabled={Boolean(busyAction) || draftStale} leftIcon={<XCircle size={12} />} loading={busyAction === "reject"} onClick={() => void rejectDraft()} size="sm" variant="ghost">Rejeitar</Button></div>
        </div>
      </Surface>}

      <Surface>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-default)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--text-primary)]">Rastro de ferramentas</h2><Badge variant="neutral">{result.toolTrace.length} chamada(s)</Badge></div><ul className="divide-y divide-[var(--border-default)]">{result.toolTrace.length === 0 ? <li className="px-4 py-3 text-[11px] text-[var(--text-muted)]">Nenhuma ferramenta executada.</li> : result.toolTrace.slice(0, 5).map((trace) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px]" key={`${trace.name}-${trace.version ?? "1"}`}><span className="font-medium text-[var(--text-primary)]">{trace.name}</span><span className="text-[var(--text-muted)]">{trace.classification} · {trace.status}{trace.durationMs ? ` · ${trace.durationMs}ms` : ""}</span>{trace.safeSummary && <span className="basis-full text-[10px] text-[var(--text-secondary)]">{trace.safeSummary}</span>}</li>)}</ul>
      </Surface>
    </>}

    {feedback && <div aria-live="polite" className="rounded-[8px] border border-[var(--success-border)] bg-[var(--success-subtle)] px-3 py-2 text-[11px] text-[var(--success)]">{feedback}</div>}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3"><p className="text-[10px] uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{value}</p></div>;
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Não informado";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "indisponível";
}

function assistantErrorMessage(error: unknown) {
  if (error instanceof ApiHttpError && error.status === 403) return "A fundação de IA Comercial não está habilitada para este tenant/perfil.";
  if (error instanceof ApiHttpError && error.status === 409) return error.message || "A conversa mudou. Gere uma nova sugestão antes de aprovar.";
  if (error instanceof ApiHttpError && error.status === 404) return "A fundação de IA Comercial ainda não foi publicada neste ambiente.";
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível gerar a sugestão comercial agora.";
}
