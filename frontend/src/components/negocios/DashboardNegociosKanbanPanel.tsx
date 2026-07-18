import { BriefcaseBusiness, GripVertical, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchNegocioKanban,
  fetchNegociosKanban,
  updateNegocioKanbanStage,
} from "../../services/crmApi";
import type {
  AuthSession,
  BusinessStage,
  CommunicationBusiness,
  NegociosKanbanResponse,
} from "../../services/crmApi";
import { Button, EmptyState, ErrorState, Input, LoadingState, Pagination, Select, Surface } from "../ui";

const stages: BusinessStage[] = ["NOVO", "CONTATO", "PROPOSTA", "FECHADO", "PERDIDO"];
const stageLabels: Record<BusinessStage, string> = {
  NOVO: "Novo",
  CONTATO: "Contato",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

type Props = {
  authSession: AuthSession | null;
  onToast: (message: string) => void;
};

export default function DashboardNegociosKanbanPanel({ authSession, onToast }: Props) {
  const [businesses, setBusinesses] = useState<CommunicationBusiness[]>([]);
  const [summary, setSummary] = useState<NegociosKanbanResponse["resumo"] | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<BusinessStage | "">("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dragOverStage, setDragOverStage] = useState<BusinessStage | null>(null);
  const [selected, setSelected] = useState<CommunicationBusiness | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestSequence = useRef(0);
  const stageUpdates = useRef(new Set<number>());
  const detailTrigger = useRef<HTMLElement | null>(null);

  const load = useCallback(async (background = false) => {
    const sequence = ++requestSequence.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetchNegociosKanban({
        page,
        limit: 100,
        ...(stageFilter ? { etapa: stageFilter } : {}),
        ...(search ? { q: search } : {}),
      });
      if (sequence !== requestSequence.current) return;
      setBusinesses(response.data);
      setSummary(response.resumo);
      setPagination({ total: response.pagination.total, totalPages: response.pagination.totalPages });
    } catch {
      if (sequence === requestSequence.current) setError("Não foi possível carregar os Negócios.");
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [page, search, stageFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(query.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        window.setTimeout(() => detailTrigger.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  const metrics = useMemo(() => ({
    total: summary?.total ?? 0,
    active: (summary?.porEtapa.NOVO ?? 0) + (summary?.porEtapa.CONTATO ?? 0) + (summary?.porEtapa.PROPOSTA ?? 0),
    closed: summary?.fechados ?? 0,
    lost: summary?.perdidos ?? 0,
  }), [summary]);

  async function openBusiness(business: CommunicationBusiness, trigger: HTMLElement) {
    detailTrigger.current = trigger;
    setSelected(business);
    setDetailLoading(true);
    try {
      setSelected(await fetchNegocioKanban(business.id));
    } catch {
      onToast("Não foi possível carregar todos os detalhes.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveBusiness(id: number, nextStage: BusinessStage) {
    const current = businesses.find((business) => business.id === id);
    if (!current || !current.permissoes?.movimentar || current.etapa === nextStage || stageUpdates.current.has(id)) return;
    stageUpdates.current.add(id);
    const snapshot = businesses;
    setBusinesses((items) => items.map((business) => business.id === id ? { ...business, etapa: nextStage } : business));
    try {
      const updated = await updateNegocioKanbanStage(id, nextStage, current.etapa);
      setBusinesses((items) => items.map((business) => business.id === id ? updated : business));
      onToast(`Negócio movido para ${stageLabels[nextStage]}.`);
      await load(true);
    } catch {
      setBusinesses(snapshot);
      onToast("Não foi possível mover o Negócio. A etapa anterior foi restaurada.");
    } finally {
      stageUpdates.current.delete(id);
      setDragOverStage(null);
    }
  }

  if (loading) return <LoadingState label="Carregando Kanban de Negócios" rows={5} />;
  if (error) return <ErrorState description="Tente novamente sem alterar os filtros." onRetry={() => void load()} title={error} />;

  return (
    <section className="space-y-3" aria-label="Kanban de Negócios">
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Pipeline de Negócios</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Oportunidades confirmadas, sem projeções de Clientes ou Leads.</p>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]" aria-live="polite">{refreshing ? "Atualizando…" : `${pagination.total} Negócio(s)`}</span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--border-default)] sm:grid-cols-4">
          {[
            ["Total", metrics.total],
            ["Em andamento", metrics.active],
            ["Fechados", metrics.closed],
            ["Perdidos", metrics.lost],
          ].map(([label, value]) => (
            <div className="bg-[var(--bg-surface)] px-4 py-2.5" key={label}>
              <p className="text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] p-3">
          <Input aria-label="Buscar Negócios" containerClassName="min-w-[220px] flex-1" onChange={(event) => setQuery(event.target.value)} placeholder="Título ou Cliente" value={query} />
          <Select aria-label="Filtrar por etapa" containerClassName="w-48" onChange={(event) => { setStageFilter(event.target.value as BusinessStage | ""); setPage(1); }} value={stageFilter}>
            <option value="">Todas as etapas</option>
            {stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
          </Select>
          <Button disabled={!query && !stageFilter} onClick={() => { setQuery(""); setSearch(""); setStageFilter(""); setPage(1); }} size="sm" variant="secondary">Limpar</Button>
        </div>
      </Surface>

      {businesses.length === 0 ? (
        <Surface><EmptyState description="Somente Negócios confirmados aparecem neste Kanban." icon={<BriefcaseBusiness size={18} />} title="Nenhum Negócio encontrado" /></Surface>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[1120px] grid-cols-5 gap-2.5">
            {stages.map((stage) => {
              const stageBusinesses = businesses.filter((business) => business.etapa === stage);
              return (
                <div
                  aria-label={`Etapa ${stageLabels[stage]}`}
                  className={`min-h-[390px] rounded-lg border p-2.5 ${dragOverStage === stage ? "border-[var(--primary)] bg-[var(--surface-subtle)]" : "border-[var(--border-default)] bg-[var(--bg-surface)]"}`}
                  key={stage}
                  onDragLeave={() => setDragOverStage(null)}
                  onDragOver={(event) => { event.preventDefault(); setDragOverStage(stage); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = Number(event.dataTransfer.getData("negocioId"));
                    if (id) void moveBusiness(id, stage);
                  }}
                  role="group"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--border-default)] pb-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{stageLabels[stage]}</p>
                    <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{stageBusinesses.length}</span>
                  </div>
                  <div className="space-y-2">
                    {stageBusinesses.length === 0 && <p className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">Etapa vazia</p>}
                    {stageBusinesses.map((business) => (
                      <BusinessCard business={business} key={business.id} onOpen={openBusiness} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Surface>
        <Pagination disabled={refreshing} itemLabel="Negócios" onPageChange={setPage} page={page} total={pagination.total} totalPages={pagination.totalPages} visibleCount={businesses.length} />
      </Surface>

      {selected && <BusinessDrawer authSession={authSession} business={selected} loading={detailLoading} onClose={() => { setSelected(null); window.setTimeout(() => detailTrigger.current?.focus(), 0); }} />}
    </section>
  );
}

function BusinessCard({ business, onOpen }: { business: CommunicationBusiness; onOpen: (business: CommunicationBusiness, trigger: HTMLElement) => void }) {
  const canMove = business.permissoes?.movimentar === true;
  return (
    <div
      aria-label={`Abrir Negócio ${business.titulo || business.id}`}
      className={`rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 shadow-sm transition hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      draggable={canMove}
      onClick={(event) => void onOpen(business, event.currentTarget)}
      onDragStart={(event) => { event.dataTransfer.setData("negocioId", String(business.id)); event.dataTransfer.effectAllowed = "move"; }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void onOpen(business, event.currentTarget); } }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{business.titulo || `Negócio #${business.id}`}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{business.cliente?.nome || "Cliente não informado"}</p>
        </div>
        {canMove && <GripVertical aria-hidden="true" className="shrink-0 text-[var(--icon-muted)]" size={14} />}
      </div>
      <div className="mt-2 border-t border-[var(--border-default)] pt-2 text-[11px] text-[var(--text-secondary)]">
        <p className="truncate">{business.responsavel?.nome || "Sem responsável"}</p>
        <p className="mt-1 truncate text-[var(--text-muted)]">{business.lead?.origem || "Origem não informada"}</p>
        <p className="mt-1 tabular-nums text-[var(--text-muted)]">{business.valor === null ? "Valor não informado" : `Valor cadastrado: ${business.valor.toLocaleString("pt-BR")}`}</p>
      </div>
    </div>
  );
}

function BusinessDrawer({ authSession, business, loading, onClose }: { authSession: AuthSession | null; business: CommunicationBusiness; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside aria-label="Detalhes do Negócio" aria-modal="true" className="flex h-full w-full max-w-[460px] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl" role="dialog">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Negócio #{business.id}</p>
            <h2 className="mt-1 truncate text-base font-semibold text-[var(--text-primary)]">{business.titulo || "Sem título"}</h2>
          </div>
          <Button aria-label="Fechar detalhes" onClick={onClose} size="sm" variant="ghost"><X size={16} /></Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <LoadingState label="Carregando detalhes" rows={2} />}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Detail label="Etapa" value={stageLabels[business.etapa]} />
            <Detail label="Responsável" value={business.responsavel?.nome || "Sem responsável"} />
            <Detail label="Cliente" value={business.cliente?.nome || "Não informado"} />
            <Detail label="Empresa" value={business.cliente?.empresa || "Não informada"} />
            <Detail label="Lead" value={business.lead ? `#${business.lead.id} · ${business.lead.status}` : "Sem Lead de origem"} />
            <Detail label="Origem" value={business.lead?.origem || "Não informada"} />
            <Detail label="Valor" value={business.valor === null ? "Não informado" : business.valor.toLocaleString("pt-BR")} />
            <Detail label="Criado em" value={new Date(business.createdAt).toLocaleString("pt-BR")} />
          </dl>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Observação</h3>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">{business.observacao || "Nenhuma observação registrada."}</p>
          </section>
          <section className="mt-5 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">Conversas relacionadas</h3>
            {business.lead?.conversas?.length ? (
              <div className="mt-2 space-y-2">
                {business.lead.conversas.map((conversation) => (
                  <div className="rounded-md border border-[var(--border-default)] px-3 py-2 text-[11px]" key={conversation.id}>
                    <p className="font-medium text-[var(--text-primary)]">{conversation.canalIntegracao.nome}</p>
                    <p className="mt-0.5 text-[var(--text-muted)]">{conversation.status} · {new Date(conversation.updatedAt).toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-[11px] text-[var(--text-muted)]">Nenhuma conversa vinculada.</p>}
          </section>
          <div className="mt-5 flex items-center gap-2 border-t border-[var(--border-default)] pt-4 text-[11px] text-[var(--text-muted)]">
            <UserRound size={13} /> Sessão: {authSession?.usuario.nome || "Usuário autenticado"}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-medium text-[var(--text-muted)]">{label}</dt><dd className="mt-1 break-words font-medium text-[var(--text-primary)]">{value}</dd></div>;
}
