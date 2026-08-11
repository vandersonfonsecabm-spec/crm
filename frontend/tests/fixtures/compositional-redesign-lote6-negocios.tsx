import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { NegociosKanbanBoard, NegociosKanbanToolbar } from "../../src/components/negocios/DashboardNegociosKanbanPanel";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { CommunicationBusiness } from "../../src/services/crmApi";
import type { ActivePage } from "../../src/types/dashboard";

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };

const businesses: CommunicationBusiness[] = [
  {
    id: 901,
    clienteId: 801,
    cliente: { id: 801, nome: "Cooperativa Horizonte", empresa: "Conta local sintética" },
    leadId: null,
    lead: null,
    responsavelId: 41,
    responsavel: { id: 41, nome: "Operadora local" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Revisar condições de safra",
    observacao: null,
    etapa: "NOVO",
    valor: 86000,
    proximaAcao: null,
    tempoEtapa: { entrouEm: "2026-08-02T12:00:00.000Z", ultimaMovimentacaoEm: null, atualSegundos: 604800, acumuladoSegundos: 604800, estimado: false },
    negocioParado: true,
    motivoParado: "SEM_PROXIMA_ACAO",
    createdAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: false },
  },
  {
    id: 902,
    clienteId: 802,
    cliente: { id: 802, nome: "Fazenda Aurora", empresa: "Conta local sintética" },
    leadId: null,
    lead: null,
    responsavelId: 42,
    responsavel: { id: 42, nome: "Analista local" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Confirmar visita técnica",
    observacao: null,
    etapa: "CONTATO",
    valor: 124000,
    proximaAcao: {
      id: 601,
      titulo: "Retornar sobre a janela de plantio e disponibilidade da equipe técnica",
      dataHora: "2026-08-08T14:00:00.000Z",
      prioridade: "ALTA",
      status: "PENDENTE",
      tipo: "RETORNO",
      responsavelUsuario: { id: 42, nome: "Analista local" },
      atrasada: true,
    },
    tempoEtapa: { entrouEm: "2026-08-05T12:00:00.000Z", ultimaMovimentacaoEm: null, atualSegundos: 345600, acumuladoSegundos: 345600, estimado: false },
    negocioParado: true,
    motivoParado: "PROXIMA_ACAO_ATRASADA",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: false },
  },
  {
    id: 903,
    clienteId: 803,
    cliente: { id: 803, nome: "Grupo Campo Alto", empresa: "Conta local sintética" },
    leadId: null,
    lead: null,
    responsavelId: 41,
    responsavel: { id: 41, nome: "Operadora local" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Fornecimento anual confirmado",
    observacao: null,
    etapa: "FECHADO",
    valor: 248000,
    proximaAcao: null,
    tempoEtapa: { entrouEm: "2026-08-07T12:00:00.000Z", ultimaMovimentacaoEm: "2026-08-07T12:00:00.000Z", atualSegundos: 172800, acumuladoSegundos: 172800, estimado: false },
    negocioParado: false,
    motivoParado: null,
    createdAt: "2026-07-21T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: false },
  },
  {
    id: 904,
    clienteId: 804,
    cliente: { id: 804, nome: "Sítio Mineral", empresa: "Conta local sintética" },
    leadId: null,
    lead: null,
    responsavelId: null,
    responsavel: null,
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: "Negociação encerrada pelo cliente",
    observacao: null,
    etapa: "PERDIDO",
    valor: 36000,
    proximaAcao: null,
    tempoEtapa: { entrouEm: "2026-08-06T12:00:00.000Z", ultimaMovimentacaoEm: "2026-08-06T12:00:00.000Z", atualSegundos: 259200, acumuladoSegundos: 259200, estimado: true },
    negocioParado: false,
    motivoParado: null,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    permissoes: { movimentar: false },
  },
];

export function CompositionalLote6NegociosFixture() {
  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="6" data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="kanban"
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

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local de Negócios">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-7">
              <DashboardHeader
                actions={[]}
                activePage="kanban"
                backendCaption="4 negócios na página local"
                compact
                onCreateClient={noOp}
                pageTitle="Negócios"
                showBackendCaption={false}
                showCreateClient={false}
              />

              <section className="negocios-workspace mt-3 space-y-3" aria-label="Kanban local de Negócios">
                <NegociosKanbanToolbar
                  onClear={noOp}
                  onOperationalFilterChange={noOp}
                  onQueryChange={noOp}
                  onStageFilterChange={noOp}
                  operationalFilter=""
                  query=""
                  refreshing={false}
                  stageFilter=""
                  total={businesses.length}
                />
                <NegociosKanbanBoard
                  businesses={businesses}
                  dragOverStage={null}
                  onDragOverStageChange={noOp}
                  onMoveBusiness={noOp}
                  onOpenBusiness={noOp}
                />
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
createRoot(rootElement).render(<MemoryRouter><CompositionalLote6NegociosFixture /></MemoryRouter>);
