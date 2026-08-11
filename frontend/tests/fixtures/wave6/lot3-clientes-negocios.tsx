import { Bell, BriefcaseBusiness, Plus, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardClientsTable from "../../../src/components/dashboard/DashboardClientsTable";
import DashboardSidebar from "../../../src/components/dashboard/DashboardSidebar";
import { emptyClient } from "../../../src/data/clientDefaults";
import { BusinessCard } from "../../../src/components/negocios/DashboardNegociosKanbanPanel";
import "../../../src/index.css";
import type { CommunicationBusiness } from "../../../src/services/crmApi";
import type { ActivePage, Client, Status } from "../../../src/types/dashboard";
import { SectionHeader, Surface } from "../../../src/components/ui";

const stageLabels = {
  NOVO: "Novo",
  CONTATO: "Contato",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
} as const;

const clients: Client[] = [
  { ...emptyClient, id: 701, name: "Cooperativa Horizonte", company: "Conta local sintética", city: "Uberaba", state: "MG", phone: "34999990001", email: "horizonte@example.test", status: "Proposta", favorite: true, hot: true, nextFollowUp: "2026-08-08T15:00:00.000Z", tags: ["Grãos", "Prioridade"] },
  { ...emptyClient, id: 702, name: "Fazenda Aurora", company: "Conta local sintética", city: "Rio Verde", state: "GO", phone: "64999990002", email: "aurora@example.test", status: "Contato", nextFollowUp: "2026-08-09T14:00:00.000Z", tags: ["Irrigação"] },
  { ...emptyClient, id: 703, name: "Grupo Campo Alto", company: "Conta local sintética", city: "Sorriso", state: "MT", phone: "66999990003", email: "campoalto@example.test", status: "Novo", nextFollowUp: "2026-08-11T09:00:00.000Z", tags: [] },
];

const businesses: CommunicationBusiness[] = [
  business({ etapa: "NOVO", id: 801, titulo: "Expansão de armazenagem", valor: 85000 }),
  business({ etapa: "CONTATO", id: 802, negocioParado: true, motivoParado: "SEM_PROXIMA_ACAO", titulo: "Plano de irrigação", valor: 46000 }),
  business({ etapa: "PROPOSTA", id: 803, nextActionOverdue: true, titulo: "Renovação de insumos", valor: 124000 }),
  business({ etapa: "FECHADO", id: 804, titulo: "Máquinas de plantio", valor: 210000 }),
  business({ etapa: "PERDIDO", id: 805, titulo: "Projeto de safra", valor: 39000 }),
];

function business({
  etapa,
  id,
  negocioParado = false,
  motivoParado = null,
  nextActionOverdue = false,
  titulo,
  valor,
}: {
  etapa: keyof typeof stageLabels;
  id: number;
  negocioParado?: boolean;
  motivoParado?: "SEM_PROXIMA_ACAO" | "PROXIMA_ACAO_ATRASADA" | null;
  nextActionOverdue?: boolean;
  titulo: string;
  valor: number;
}): CommunicationBusiness {
  return {
    id,
    clienteId: id + 1000,
    cliente: { id: id + 1000, nome: `Cliente local ${id}`, empresa: "Conta local sintética" },
    leadId: null,
    lead: null,
    responsavelId: null,
    responsavel: null,
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo,
    observacao: null,
    etapa,
    valor,
    negocioParado,
    motivoParado,
    proximaAcao: nextActionOverdue ? {
      id: id + 2000,
      titulo: "Retornar proposta em aberto",
      dataHora: "2026-08-08T16:00:00.000Z",
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
      responsavelUsuario: null,
      atrasada: true,
    } : null,
    tempoEtapa: {
      entrouEm: "2026-08-01T09:00:00.000Z",
      ultimaMovimentacaoEm: "2026-08-04T09:00:00.000Z",
      atualSegundos: negocioParado ? 691200 : 172800,
      acumuladoSegundos: negocioParado ? 1036800 : 345600,
      estimado: false,
    },
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-09T09:00:00.000Z",
    permissoes: { movimentar: false },
  };
}

export function ShellFixture() {
  const [activePage, setActivePage] = useState<ActivePage>("clientes");
  const [selectedId, setSelectedId] = useState(701);

  return (
    <div className="crm-workspace min-h-screen" data-qa-mode="fixture-only" data-wave6-lot="3">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar activePage={activePage} authSession={null} setActivePage={setActivePage} />
        <main className="crm-main min-w-0">
          <header className="topbar-shell sticky top-0 z-40 flex h-14 items-center border-b px-5 lg:px-7">
            <div className="topbar-content mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
              <div className="min-w-0 lg:w-[220px]"><p className="hidden text-[11px] font-medium text-slate-500 lg:block">Área de trabalho</p></div>
              <div aria-label="Busca global, visualização estática" className="command-search hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 md:flex md:max-w-xl">
                <Search aria-hidden="true" size={13} />
                <span className="text-xs">Buscar cliente, empresa ou página...</span>
              </div>
              <div className="flex min-w-0 items-center justify-end gap-1.5 lg:w-[220px]">
                <button aria-label="Ações rápidas" className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md" type="button"><Plus aria-hidden="true" size={16} /></button>
                <button aria-label="Notificações" className="topbar-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md" type="button"><Bell aria-hidden="true" size={16} /></button>
                <button aria-label="Menu do usuário" className="topbar-user-button flex h-9 items-center gap-2 rounded-md px-1.5 pr-2" type="button"><span className="user-avatar flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold">QA</span><span className="hidden max-w-[116px] truncate text-[11px] font-medium xl:block">Operador local</span><UserRound aria-hidden="true" size={13} /></button>
              </div>
            </div>
          </header>

          <div className="crm-content min-h-0 flex-1 overflow-y-auto">
            {activePage === "kanban" ? <BusinessBoardFixture /> : (
              <section aria-label="Clientes preenchido, selecionado e em risco" data-qa-scenario="clientes-filled-selected-risk">
                <DashboardClientsTable
                  filteredClientsCount={clients.length}
                  getRisk={(client) => client.id === 701 ? "Alto" : "Baixo"}
                  initials={(name) => name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                  onNextPage={() => undefined}
                  onPreviousPage={() => undefined}
                  onRequestWhatsapp={() => undefined}
                  onSelectClient={setSelectedId}
                  onToggleFavorite={() => undefined}
                  onToggleHot={() => undefined}
                  page={1}
                  paginatedClients={clients}
                  selectedId={selectedId}
                  statusClass={statusClass}
                  totalPages={1}
                />
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function BusinessBoardFixture() {
  return (
    <section aria-label="Negócios preenchido, perdido e parado" className="negocios-workspace space-y-3" data-qa-scenario="negocios-filled-lost-stalled-reflow">
      <Surface className="negocios-command-surface overflow-hidden">
        <SectionHeader actions={<span className="negocios-live-count">5 Negócios</span>} description="Oportunidades confirmadas para inspeção visual local." icon={<BriefcaseBusiness aria-hidden="true" size={16} />} title="Pipeline de Negócios" />
        <dl aria-label="Resumo do pipeline" className="negocios-summary">
          <div data-summary-tone="neutral"><dt>Total</dt><dd>5</dd><p>Carteira confirmada</p></div>
          <div data-summary-tone="neutral"><dt>Em andamento</dt><dd>3</dd><p>Novo, Contato e Proposta</p></div>
          <div data-summary-tone="success"><dt>Fechados</dt><dd>1</dd><p>Etapa concluída</p></div>
          <div data-summary-tone="danger"><dt>Perdidos</dt><dd>1</dd><p>Etapa encerrada</p></div>
        </dl>
      </Surface>
      <div className="negocios-board-scroll overflow-x-auto pb-1" data-negocios-board-scroll>
        <div className="negocios-board grid grid-cols-5 gap-2.5">
          {(Object.keys(stageLabels) as Array<keyof typeof stageLabels>).map((stage) => {
            const items = businesses.filter((item) => item.etapa === stage);
            return (
              <section aria-labelledby={`fixture-stage-${stage}`} className="negocios-stage" data-stage={stage} key={stage}>
                <header className="negocios-stage-header">
                  <div><h3 id={`fixture-stage-${stage}`}>{stageLabels[stage]}</h3><p>{items.length === 1 ? "1 negócio" : `${items.length} negócios`}</p></div>
                  <span aria-hidden="true" className="negocios-stage-count">{items.length}</span>
                </header>
                <div className="negocios-stage-list space-y-2">
                  {items.map((item) => <BusinessCard business={item} key={item.id} onOpen={() => undefined} />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function statusClass(status: Status) {
  if (status === "Proposta") return "border-[var(--warning-border)] bg-[var(--warning-subtle)] text-[var(--warning)]";
  if (status === "Fechado") return "border-[var(--success-border)] bg-[var(--success-subtle)] text-[var(--success)]";
  return "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]";
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><ShellFixture /></MemoryRouter>);
