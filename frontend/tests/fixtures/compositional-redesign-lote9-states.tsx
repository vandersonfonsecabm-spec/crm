import { Check, Focus } from "lucide-react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Select, StatusBadge, Surface, Textarea } from "../../src/components/ui";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { ActivePage } from "../../src/types/dashboard";

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };

export function CompositionalLote9StatesFixture() {
  return (
    <div
      className="crm-workspace min-h-screen"
      data-compositional-lote="9"
      data-fixture-readonly="true"
      data-reflow-targets="1440,1280,320,200"
    >
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="dashboard"
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

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local de estados operacionais">
            <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-5 lg:px-7">
              <DashboardHeader
                actions={[]}
                activePage="dashboard"
                backendCaption="Fixture local read-only"
                compact
                onCreateClient={noOp}
                pageTitle="Estados operacionais"
                showBackendCaption={false}
                showCreateClient={false}
              />

              <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Matriz visual de estados">
                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Carregando</h2>
                  <LoadingState className="mt-3" label="Carregando registros" rows={3} />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Vazio</h2>
                  <EmptyState description="Ainda não há registros neste recorte." state="empty" title="Nenhum registro para exibir" />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sem resultados</h2>
                  <EmptyState description="Ajuste a busca ou os filtros já aplicados." state="no-results" title="Nenhum resultado encontrado" />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Erro</h2>
                  <ErrorState description="A consulta não pôde ser concluída agora." onRetry={noOp} title="Não foi possível carregar os dados" />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Restrito</h2>
                  <EmptyState description="Sua permissão atual não permite consultar este conteúdo." state="restricted" title="Acesso restrito" />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Indisponível</h2>
                  <EmptyState description="O canal permanece indisponível sem alterar dados locais." state="unavailable" title="Canal indisponível" />
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Desabilitado e inválido</h2>
                  <div className="mt-3 grid min-w-0 gap-3">
                    <Button className="min-h-11" disabled>Salvar indisponível</Button>
                    <Input disabled label="Cliente indisponível" value="Sem permissão de edição" />
                    <Select aria-label="Status indisponível" disabled value="indisponivel"><option value="indisponivel">Indisponível</option></Select>
                    <Textarea error="Informe um motivo válido." label="Observação" value="" onChange={noOp} />
                  </div>
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Selecionado e foco</h2>
                  <div className="command-results mt-3 rounded-[8px] border p-2" role="listbox" aria-label="Exemplo de seleção">
                    <button aria-selected="true" className="command-result is-selected w-full rounded-md px-3 py-2 text-left" role="option" type="button">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">Selecionado</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-secondary)]">Fundo tonal, marcador e texto confirmam o estado.</span>
                    </button>
                  </div>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    <Button autoFocus className="min-h-11" leftIcon={<Focus size={15} />}>Foco visível</Button>
                    <IconButton aria-label="Ação essencial de referência" className="h-11 w-11" variant="secondary"><Check size={16} /></IconButton>
                  </div>
                </Surface>

                <Surface className="min-w-0 p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Estados semânticos</h2>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    <StatusBadge status="sucesso" />
                    <StatusBadge status="alerta" />
                    <StatusBadge status="erro" />
                    <StatusBadge status="informacao" />
                    <Badge variant="neutral">Texto e borda informam indisponibilidade</Badge>
                  </div>
                </Surface>
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
createRoot(rootElement).render(<MemoryRouter><CompositionalLote9StatesFixture /></MemoryRouter>);
