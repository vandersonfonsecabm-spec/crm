import { AlertTriangle, CalendarClock, Check, Clock3, History, Route, TimerReset } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiHttpError,
  fetchBusinessStageHistory,
} from "../../services/crmApi";
import type {
  BusinessNextAction,
  BusinessStage,
  BusinessStageHistoryEntry,
  CommunicationBusiness,
} from "../../services/crmApi";
import { Badge, Button, ErrorState, Skeleton } from "../ui";
import { followUpTypeLabel, formatBusinessDuration, formatDateTime } from "./businessStagePresentation";

const stageLabels: Record<BusinessStage, string> = {
  NOVO: "Novo",
  CONTATO: "Contato",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

type Props = {
  business: CommunicationBusiness;
  onOpenAgenda: () => void;
};

export default function BusinessStageTimingPanel({ business, onOpenAgenda }: Props) {
  const [history, setHistory] = useState<BusinessStageHistoryEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const requestSequence = useRef(0);

  const loadHistory = useCallback(async (page: number, append: boolean) => {
    const sequence = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const response = await fetchBusinessStageHistory(business.id, { page, limit: 8 });
      if (sequence !== requestSequence.current) return;
      setHistory((current) => {
        if (!append) return response.data;
        const existing = new Set(current.map((entry) => entry.id));
        return [...current, ...response.data.filter((entry) => !existing.has(entry.id))];
      });
      setPagination({
        page: response.pagination.page,
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
      });
    } catch (requestError) {
      if (sequence !== requestSequence.current) return;
      if (requestError instanceof ApiHttpError && requestError.status === 403) {
        setForbidden(true);
      } else {
        setError("Não foi possível carregar o histórico de etapas.");
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [business.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(1, false), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [loadHistory]);

  const timing = business.tempoEtapa;

  return (
    <section aria-labelledby={`stage-timing-title-${business.id}`} className="negocios-timing-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]" id={`stage-timing-title-${business.id}`}>
            Ritmo do Negócio
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
            Tempo rastreado na etapa e compromisso comercial mais próximo.
          </p>
        </div>
        {business.negocioParado && (
          <Badge className="gap-1.5" title={stalledReasonLabel(business.motivoParado)} variant="warning">
            <AlertTriangle aria-hidden="true" size={11} />
            Negócio parado
          </Badge>
        )}
      </div>

      <dl className="negocios-timing-metrics grid overflow-hidden border border-[var(--border-default)] bg-[var(--border-default)] sm:grid-cols-3">
        <TimingMetric icon={<Route size={14} />} label="Etapa atual" value={stageLabels[business.etapa]} />
        <TimingMetric
          detail={timing?.estimado ? "Tempo estimado" : "Desde a última movimentação"}
          icon={<Clock3 size={14} />}
          label="Nesta etapa"
          value={formatBusinessDuration(timing?.atualSegundos)}
        />
        <TimingMetric
          detail={timing?.estimado ? "Histórico parcial" : "Período rastreado"}
          icon={<TimerReset size={14} />}
          label="Tempo acumulado"
          value={formatBusinessDuration(timing?.acumuladoSegundos)}
        />
      </dl>

      {timing?.estimado && (
        <div className="negocios-estimated-note flex items-start gap-2 px-3 py-2 text-[11px] leading-5">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
          <p>
            Histórico parcial. O tempo atual usa uma referência estimada de {formatDateTime(timing.entrouEm)} até a primeira movimentação rastreada.
          </p>
        </div>
      )}

      <NextAction action={business.proximaAcao ?? null} onOpenAgenda={onOpenAgenda} />

      <div className="border-t border-[var(--border-default)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <History aria-hidden="true" size={14} />
              Histórico de etapas
            </h4>
            {!loading && !error && !forbidden && (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                {pagination.total} movimentação(ões) concluída(s)
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div aria-label="Carregando histórico de etapas" className="mt-3 space-y-2" role="status">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && forbidden && (
          <div className="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-4 text-center text-[11px] text-[var(--text-secondary)]">
            Você não tem permissão para consultar este histórico.
          </div>
        )}

        {!loading && error && (
          <ErrorState
            className="mt-3 py-5"
            description="Os detalhes do Negócio continuam disponíveis."
            onRetry={() => void loadHistory(1, false)}
            title={error}
          />
        )}

        {!loading && !error && !forbidden && (
          <ol className="mt-3 space-y-2" aria-label="Movimentações de etapa">
            {history.length === 0 && (
              <li className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-4 text-[11px] text-[var(--text-muted)]">
                Nenhuma etapa finalizada foi registrada. A etapa atual aparece abaixo.
              </li>
            )}
            {history.map((entry) => (
              <HistoryEntry entry={entry} key={entry.id} />
            ))}
            <li className="negocios-history-current grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 px-3 py-2.5">
              <span className="negocios-history-current-icon mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full">
                <Clock3 aria-hidden="true" size={11} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)]">{stageLabels[business.etapa]} · etapa atual</p>
                  <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{formatBusinessDuration(timing?.atualSegundos)}</span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  Entrada {timing ? formatDateTime(timing.entrouEm) : "não informada"}
                  {timing?.estimado ? " · referência estimada" : " · em andamento"}
                </p>
              </div>
            </li>
          </ol>
        )}

        {!loading && !error && !forbidden && pagination.page < pagination.totalPages && (
          <Button
            className="mt-3 w-full"
            loading={loadingMore}
            onClick={() => void loadHistory(pagination.page + 1, true)}
            size="sm"
            variant="secondary"
          >
            Carregar etapas anteriores
          </Button>
        )}
      </div>
    </section>
  );
}

function TimingMetric({ detail, icon, label, value }: { detail?: string; icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-surface)] px-3 py-2.5">
      <dt className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">{icon}{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text-primary)]">{value}</dd>
      {detail && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{detail}</p>}
    </div>
  );
}

function NextAction({ action, onOpenAgenda }: { action: BusinessNextAction | null; onOpenAgenda: () => void }) {
  if (!action) {
    return (
      <div className="negocios-next-action is-empty flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
            <CalendarClock aria-hidden="true" size={14} />
            Nenhuma próxima ação
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">A Agenda continua sendo a fonte dos acompanhamentos.</p>
        </div>
        <Button onClick={onOpenAgenda} size="sm" variant="secondary">Abrir Agenda</Button>
      </div>
    );
  }

  return (
    <div className={`negocios-next-action flex-col px-3 py-3 ${action.atrasada ? "is-overdue" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--text-muted)]">Próxima ação · {followUpTypeLabel(action.tipo)}</p>
          <p className="mt-1 break-words text-xs font-semibold text-[var(--text-primary)]">{action.titulo}</p>
        </div>
        <Badge className="gap-1.5" variant={action.atrasada ? "danger" : "info"}>
          {action.atrasada ? <AlertTriangle aria-hidden="true" size={11} /> : <Check aria-hidden="true" size={11} />}
          {action.atrasada ? "Atrasada" : "Agendada"}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <CalendarClock aria-hidden="true" size={12} />
          {formatDateTime(action.dataHora)}
        </span>
        <button
          className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          onClick={onOpenAgenda}
          type="button"
        >
          Ver na Agenda
        </button>
      </div>
    </div>
  );
}

function HistoryEntry({ entry }: { entry: BusinessStageHistoryEntry }) {
  return (
    <li className="negocios-history-entry grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 px-3 py-2.5">
      <span className="mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
        <Check aria-hidden="true" size={11} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[var(--text-primary)]">
            {entry.etapaAnterior ? stageLabels[entry.etapaAnterior] : "Etapa anterior"} → {entry.etapaNova ? stageLabels[entry.etapaNova] : "Etapa seguinte"}
          </p>
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{formatBusinessDuration(entry.duracaoEtapaSegundos)}</span>
        </div>
        <p className="mt-1 break-words text-[10px] leading-4 text-[var(--text-muted)]">
          {entry.etapaEntrouEm ? formatDateTime(entry.etapaEntrouEm) : "Entrada não informada"}
          {" – "}
          {entry.etapaSaiuEm ? formatDateTime(entry.etapaSaiuEm) : "Saída não informada"}
          {entry.autor?.nome ? ` · ${entry.autor.nome}` : ""}
          {entry.duracaoEtapaEstimada ? " · tempo estimado" : ""}
        </p>
      </div>
    </li>
  );
}

function stalledReasonLabel(reason: CommunicationBusiness["motivoParado"]) {
  return reason === "PROXIMA_ACAO_ATRASADA"
    ? "A próxima ação está atrasada."
    : "Não existe próxima ação ativa.";
}
