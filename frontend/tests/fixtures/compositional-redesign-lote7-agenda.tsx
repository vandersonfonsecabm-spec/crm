import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import {
  AgendaFilterDisclosure,
  AgendaNextCommitment,
  AgendaTemporalList,
  AgendaToolbarFrame,
  AgendaWeekView,
  type AgendaTemporalGroup,
} from "../../src/components/dashboard/DashboardAgendaPanel";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { Input, Select } from "../../src/components/ui";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { ApiAcompanhamento } from "../../src/services/crmApi";
import type { ActivePage } from "../../src/types/dashboard";

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };
const permissions = { editar: true, concluir: true, cancelar: true, reabrir: true, verEquipe: true };

const overdue: ApiAcompanhamento = {
  id: 701,
  clienteId: 801,
  cliente: { id: 801, nome: "Fazenda Horizonte", empresa: "Conta local sintética" },
  titulo: "Confirmar retorno da visita técnica",
  descricao: "Retomar a confirmação da janela de atendimento com a equipe da fazenda.",
  dataHora: "2026-08-08T09:00:00.000Z",
  prioridade: "ALTA",
  status: "PENDENTE",
  tipo: "RETORNO",
  responsavel: "Operadora local",
  responsavelId: 41,
  responsavelUsuario: { id: 41, nome: "Operadora local" },
  negocioId: 901,
  negocio: { id: 901, titulo: "Safra de inverno", etapa: "PROPOSTA" },
  revisao: 4,
  atrasado: true,
  permissoes: permissions,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-09T08:30:00.000Z",
};

const today: ApiAcompanhamento = {
  id: 702,
  clienteId: 802,
  cliente: { id: 802, nome: "Cooperativa Aurora", empresa: "Conta local sintética" },
  titulo: "Reunião de alinhamento comercial",
  descricao: "Revisar condições comerciais confirmadas para a próxima entrega.",
  dataHora: "2026-08-09T14:00:00.000Z",
  prioridade: "MEDIA",
  status: "PENDENTE",
  tipo: "REUNIAO",
  responsavel: "Analista local",
  responsavelId: 42,
  responsavelUsuario: { id: 42, nome: "Analista local" },
  conversaCanalId: 54,
  conversaCanal: { id: 54, status: "EM_ATENDIMENTO" },
  revisao: 2,
  atrasado: false,
  permissoes: permissions,
  createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-09T08:30:00.000Z",
};

const upcoming: ApiAcompanhamento = {
  id: 703,
  clienteId: 803,
  cliente: { id: 803, nome: "Grupo Campo Alto", empresa: "Conta local sintética" },
  titulo: "Enviar revisão da proposta",
  descricao: "Compartilhar a revisão solicitada antes da próxima rodada de decisão.",
  dataHora: "2026-08-12T10:30:00.000Z",
  prioridade: "MEDIA",
  status: "EM_ANDAMENTO",
  tipo: "TAREFA",
  responsavel: "Operadora local",
  responsavelId: 41,
  responsavelUsuario: { id: 41, nome: "Operadora local" },
  negocioId: 903,
  negocio: { id: 903, titulo: "Ampliação de fornecimento", etapa: "PROPOSTA" },
  propostaComercialId: 85,
  propostaComercial: { id: 85, codigo: "PC-085", titulo: "Revisão de fornecimento", status: "ENVIADA", negocioId: 903 },
  revisao: 1,
  atrasado: false,
  permissoes: permissions,
  createdAt: "2026-08-06T12:00:00.000Z",
  updatedAt: "2026-08-09T08:30:00.000Z",
};

const completed: ApiAcompanhamento = {
  ...today,
  id: 704,
  titulo: "Visita concluída",
  dataHora: "2026-08-07T16:00:00.000Z",
  status: "CONCLUIDO",
  tipo: "VISITA",
  concluidoEm: "2026-08-07T17:00:00.000Z",
  revisao: 3,
};

const cancelled: ApiAcompanhamento = {
  ...upcoming,
  id: 705,
  titulo: "Ligação cancelada",
  dataHora: "2026-08-08T11:00:00.000Z",
  status: "CANCELADO",
  tipo: "LIGACAO",
  canceladoEm: "2026-08-08T10:00:00.000Z",
  revisao: 5,
};

const groups: AgendaTemporalGroup[] = [
  { key: "overdue", label: "Atrasados", items: [overdue] },
  { key: "today", label: "Hoje", items: [today] },
  { key: "upcoming", label: "A seguir", items: [upcoming] },
  { key: "completed", label: "Concluídos", items: [completed] },
  { key: "cancelled", label: "Cancelados", items: [cancelled] },
];

export function CompositionalLote7AgendaFixture() {
  const [viewMode, setViewMode] = useState<"list" | "week">("list");
  const [weekStart, setWeekStart] = useState(() => new Date("2026-08-03T12:00:00.000Z"));

  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="7" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="agenda"
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled={false}
          setActivePage={navigate}
        />

        <div className="crm-main min-w-0">
          <DashboardTopbar
            authSession={null}
            canManageIntegrations={false}
            emptyClient={emptyClient}
            exportCsv={noOp}
            leadsCommunicationEnabled={false}
            onLogout={noOp}
            onOpenProfile={noOp}
            readOnly
            setActivePage={navigate}
            setCreating={noOp}
            setSelectedId={noOp}
            setShowQuickActions={setQuickActions}
            showQuickActions={false}
          />

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local da Agenda">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-7">
              <DashboardHeader
                actions={[]}
                activePage="agenda"
                backendCaption="Fixture local read-only"
                compact
                onCreateClient={noOp}
                pageTitle="Agenda"
                primaryAction={{ label: "Novo acompanhamento", onClick: noOp }}
                showBackendCaption={false}
                showCreateClient={false}
              />

              <section className="agenda-page space-y-3" aria-label="Agenda local preenchida">
                <AgendaToolbarFrame
                  filters={(
                    <AgendaFilterDisclosure hasFilters={false} onClear={noOp}>
                      <Select aria-label="Filtrar por status" onChange={noOp} value="Todos"><option>Todos</option></Select>
                      <Select aria-label="Filtrar por prioridade" onChange={noOp} value="Todas"><option>Todas prioridades</option></Select>
                      <Select aria-label="Filtrar por tipo" onChange={noOp} value="Todos"><option>Todos os tipos</option></Select>
                      <Select aria-label="Filtrar por cliente" onChange={noOp} value="Todos"><option>Todos os clientes</option></Select>
                      <Select aria-label="Filtrar por responsável" onChange={noOp} value="Todos"><option>Todos os responsáveis</option></Select>
                    </AgendaFilterDisclosure>
                  )}
                  onMovePeriod={(offset) => setWeekStart((current) => new Date(current.getTime() + offset * 7 * 24 * 60 * 60 * 1000))}
                  onToday={() => setWeekStart(new Date("2026-08-03T12:00:00.000Z"))}
                  onViewModeChange={setViewMode}
                  periodLabel="03 ago. - 09 ago. 2026"
                  viewMode={viewMode}
                >
                  <Input aria-label="Buscar cliente ou título" containerClassName="agenda-toolbar-search" placeholder="Buscar cliente ou título" readOnly value="" />
                  <Select aria-label="Minha agenda" className="agenda-toolbar-view" onChange={noOp} value="MINHA">
                    <option value="MINHA">Minha agenda</option>
                  </Select>
                </AgendaToolbarFrame>

                <AgendaNextCommitment disabled={false} item={today} onComplete={noOp} onOpen={noOp} />

                <div className="agenda-workspace min-w-0">
                  <div className="agenda-list-surface min-w-0 overflow-hidden rounded-lg border bg-[var(--bg-surface)]">
                    {viewMode === "list" ? (
                      <AgendaTemporalList
                        disabled={false}
                        groups={groups}
                        onAction={noOp}
                        onEdit={noOp}
                        onHistory={noOp}
                        onReschedule={noOp}
                        onSelectClient={noOp}
                      />
                    ) : (
                      <AgendaWeekView
                        disabled={false}
                        items={[overdue, today, upcoming, completed, cancelled]}
                        onAction={noOp}
                        onEdit={noOp}
                        onHistory={noOp}
                        onReschedule={noOp}
                        onSelectClient={noOp}
                        weekStart={weekStart}
                      />
                    )}
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote7AgendaFixture /></MemoryRouter>);
