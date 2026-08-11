import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DashboardHeader from "../../src/components/dashboard/DashboardHeader";
import DashboardSidebar from "../../src/components/dashboard/DashboardSidebar";
import DashboardTopbar from "../../src/components/dashboard/DashboardTopbar";
import { CommunicationChannelBadge } from "../../src/components/leads-communication/CommunicationChannelBadge";
import { ConversationSlaBadge, ConversationStatusBadge } from "../../src/components/leads-communication/communicationPresentation";
import { CommunicationDrawer } from "../../src/components/leads-communication/CommunicationOverlay";
import {
  ConversationListItem,
  InboxContextContent,
  InboxQueueToolbar,
  MessageTimeline,
} from "../../src/components/leads-communication/DashboardInboxPanel";
import { Button, IconButton, Surface, Textarea } from "../../src/components/ui";
import { emptyClient } from "../../src/data/clientDefaults";
import "../../src/index.css";
import type { CommunicationConversation, CommunicationMessage } from "../../src/services/crmApi";
import type { ActivePage } from "../../src/types/dashboard";
import { MoreHorizontal, PanelRightOpen, Send } from "lucide-react";

const noOp = () => undefined;
const navigate = (page: ActivePage) => { void page; };
const setQuickActions = (value: boolean | ((current: boolean) => boolean)) => { void value; };
const drawerScenario = new URLSearchParams(window.location.search).get("drawer") === "1";

const channel = { id: 28, nome: "WhatsApp comercial", tipo: "WHATSAPP_META", status: "ATIVO", modoTeste: true };

const messages: CommunicationMessage[] = [
  [1, "ENTRADA", "Olá, preciso revisar o pedido desta semana.", "2026-08-08T13:05:00.000Z"],
  [2, "SAIDA", "Vamos confirmar os itens disponíveis para você.", "2026-08-08T13:12:00.000Z"],
  [3, "ENTRADA", "Também preciso ajustar a data de entrega.", "2026-08-08T13:18:00.000Z"],
  [4, "SAIDA", "Anotei o ajuste e retorno ainda hoje.", "2026-08-08T13:27:00.000Z"],
  [5, "ENTRADA", "Perfeito. A equipe estará disponível depois das 14h.", "2026-08-09T12:03:00.000Z"],
  [6, "SAIDA", "Obrigada. Vou validar a janela com a operação.", "2026-08-09T12:15:00.000Z"],
  [7, "ENTRADA", "Fico no aguardo da confirmação.", "2026-08-09T12:22:00.000Z"],
  [8, "SAIDA", "Confirmação em andamento; registro interno salvo.", "2026-08-09T12:34:00.000Z"],
  [9, "ENTRADA", "Certo, obrigada pela atualização.", "2026-08-09T12:41:00.000Z"],
  [10, "SAIDA", "Retorno previsto ainda hoje, dentro do acompanhamento.", "2026-08-09T12:48:00.000Z"],
].map(([id, direcao, texto, createdAt]) => ({
  id: Number(id),
  conversaCanalId: 810,
  autorUsuarioId: direcao === "SAIDA" ? 41 : null,
  autor: direcao === "SAIDA" ? { id: 41, nome: "Operadora local" } : null,
  direcao: direcao as CommunicationMessage["direcao"],
  tipo: "TEXTO",
  texto: String(texto),
  status: "REGISTRADA",
  statusEntrega: direcao === "SAIDA" ? "REGISTRADA" : null,
  simulada: direcao === "SAIDA",
  createdAt: String(createdAt),
  updatedAt: String(createdAt),
}));

const selectedConversation: CommunicationConversation = {
  id: 810,
  canalIntegracaoId: channel.id,
  contatoCanalId: 811,
  leadId: 812,
  responsavelId: 41,
  status: "EM_ATENDIMENTO",
  emailSubject: null,
  primeiraMensagemEm: "2026-08-08T13:05:00.000Z",
  ultimaMensagemEm: "2026-08-09T12:48:00.000Z",
  primeiraRespostaHumanaEm: "2026-08-08T13:12:00.000Z",
  aguardandoDesde: null,
  encerradaEm: null,
  reabertaEm: null,
  createdAt: "2026-08-08T13:05:00.000Z",
  updatedAt: "2026-08-09T12:48:00.000Z",
  canalIntegracao: channel,
  contatoCanal: {
    id: 811,
    nome: "Conta local de referência",
    clienteId: 813,
    cliente: {
      id: 813,
      nome: "Fazenda Horizonte",
      telefone: "Contato local",
      email: "contato.local@example.test",
      empresa: "Conta sintética de QA",
    },
  },
  lead: {
    id: 812,
    clienteId: 813,
    status: "QUALIFICADO",
    interesse: "Revisão de pedido e entrega",
    origem: "Formulário do site",
    campanha: "Safra local",
    paginaOrigem: "/contato",
    responsavel: { id: 41, nome: "Operadora local" },
  },
  responsavel: { id: 41, nome: "Operadora local", ativo: true },
  responsavelPrincipal: { id: 41, nome: "Operadora local" },
  reservaResposta: null,
  ultimaMensagem: messages.at(-1) ?? null,
  podeResponderDiretamente: true,
  tipoCanal: "WHATSAPP_META",
  naoLidas: 2,
  sla: {
    status: "ATENCAO",
    label: "Atenção — prazo em andamento",
    level: 2,
    elapsedMinutes: 42,
    startedAt: "2026-08-09T12:05:00.000Z",
  },
};

const waitingConversation: CommunicationConversation = {
  ...selectedConversation,
  id: 814,
  contatoCanalId: 815,
  status: "AGUARDANDO_CLIENTE",
  ultimaMensagemEm: "2026-08-09T11:30:00.000Z",
  ultimaMensagem: { ...messages[8], id: 19, conversaCanalId: 814 },
  naoLidas: 0,
  reservaResposta: { usuarioId: 52, nome: "Analista local", expiraEm: "2026-08-09T13:10:00.000Z" },
  sla: null,
};

export function CompositionalLote8InboxFixture() {
  const [search, setSearch] = useState("");
  const [contextDrawerOpen, setContextDrawerOpen] = useState(drawerScenario);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="crm-workspace min-h-screen" data-compositional-lote="8" data-context-mode={drawerScenario ? "drawer" : "inline"} data-fixture-readonly="true">
      <div className="crm-shell-layout flex min-h-screen">
        <DashboardSidebar
          activePage="inbox"
          authSession={null}
          canManageIntegrations={false}
          canManageUsers={false}
          isPlatformOperator={false}
          leadsCommunicationEnabled
          setActivePage={navigate}
        />

        <div className="crm-main min-w-0">
          <DashboardTopbar
            authSession={null}
            canManageIntegrations={false}
            emptyClient={emptyClient}
            exportCsv={noOp}
            leadsCommunicationEnabled
            onLogout={noOp}
            onOpenProfile={noOp}
            readOnly
            setActivePage={navigate}
            setCreating={noOp}
            setSelectedId={noOp}
            setShowQuickActions={setQuickActions}
            showQuickActions={false}
          />

          <main className="crm-content flex min-h-0 flex-1 overflow-y-auto" aria-label="Referência local da Caixa de entrada">
            <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-7">
              <DashboardHeader
                actions={[]}
                activePage="inbox"
                backendCaption="Fixture local read-only"
                compact
                onCreateClient={noOp}
                pageTitle="Caixa de entrada"
                showBackendCaption={false}
                showCreateClient={false}
              />

              <section className="inbox-page space-y-3" aria-label="Caixa de entrada local preenchida">
                <InboxQueueToolbar
                  activeFilterCount={0}
                  filtersTriggerRef={filtersTriggerRef}
                  onOpenFilters={noOp}
                  onRefresh={noOp}
                  onSearchChange={setSearch}
                  refreshing={false}
                  search={search}
                  total={2}
                />

                <Surface className="inbox-workspace has-context grid min-h-[520px] overflow-hidden">
                  <section className="inbox-conversation-list flex min-h-0 flex-col border-r border-[var(--border-default)]" aria-label="Lista de conversas">
                    <div className="inbox-list-scroll min-h-0 flex-1 overflow-y-auto">
                      <ConversationListItem active currentUserId={41} item={selectedConversation} onClick={noOp} />
                      <ConversationListItem active={false} currentUserId={41} item={waitingConversation} onClick={noOp} />
                    </div>
                  </section>

                  <section aria-label="Conversa selecionada" className="inbox-conversation flex min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]">
                    <header className="inbox-conversation-header shrink-0 border-b border-[var(--border-default)] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[11px] font-semibold">FH</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">Fazenda Horizonte</h2><CommunicationChannelBadge channel={selectedConversation.canalIntegracao} /><ConversationStatusBadge status={selectedConversation.status} /><ConversationSlaBadge sla={selectedConversation.sla} /></div>
                            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">Responsável: Operadora local · Última atividade: agora</p>
                          </div>
                        </div>
                        <div className="inbox-conversation-actions flex flex-wrap items-center justify-end gap-1">
                          <IconButton aria-label="Abrir contexto do Cliente, Lead e histórico" onClick={noOp}><PanelRightOpen size={15} /></IconButton>
                          <details className="inbox-actions-menu relative">
                            <summary aria-label="Mais ações da conversa" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-transparent text-[var(--text-secondary)]"><MoreHorizontal aria-hidden="true" size={16} /></summary>
                            <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-md"><button disabled type="button">Transferir</button><button disabled type="button">Aguardar cliente</button><button disabled type="button">Marcar pendente</button><button disabled type="button">Devolver à fila</button><button disabled type="button">Encerrar conversa</button></div>
                          </details>
                        </div>
                      </div>
                    </header>

                    <div className="inbox-notice inbox-notice-success">Você está preparando uma resposta simulada. Isso não altera o responsável principal.</div>
                    <div className="relative min-h-0 flex-1">
                      <div className="inbox-message-viewport h-full overflow-y-auto bg-[var(--bg-muted)] px-4 py-3"><MessageTimeline currentUserId={41} messages={messages} /><div className="mt-5 border-t border-[var(--border-default)] pt-3"><p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Notas internas</p><article className="inbox-note rounded-md border px-3 py-2 text-xs"><p className="text-[var(--text-primary)]">Confirmar o retorno operacional antes de concluir o atendimento.</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">Operadora local · agora</p></article></div></div>
                    </div>

                    <footer className="inbox-composer shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                      <div className="mb-2 flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-1" role="group" aria-label="Modo do compositor"><button aria-pressed className="rounded bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--primary)]" type="button">Resposta simulada</button><button aria-pressed={false} className="rounded px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]" type="button">Nota interna</button></div>
                      <Textarea aria-label="Resposta simulada" helperText="Simulação interna: nenhuma mensagem será enviada ao cliente." readOnly value="Retorno operacional em conferência." />
                      <div className="mt-2 flex justify-end"><Button leftIcon={<Send size={13} />} onClick={noOp} size="sm">Registrar simulação</Button></div>
                    </footer>
                  </section>

                  {!drawerScenario && <aside aria-label="Contexto comercial" className="inbox-context-pane" id="inbox-conversation-context"><InboxContextContent conversation={selectedConversation} history={[]} onOpenBusiness={noOp} showCommercialPanel={false} /></aside>}
                </Surface>
              </section>
            </div>
          </main>
        </div>
      </div>

      <CommunicationDrawer description="Dados e histórico da conversa selecionada." onClose={() => setContextDrawerOpen(false)} open={contextDrawerOpen} title="Contexto do atendimento">
        <InboxContextContent conversation={selectedConversation} history={[]} onOpenBusiness={noOp} showCommercialPanel={false} />
      </CommunicationDrawer>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<MemoryRouter><CompositionalLote8InboxFixture /></MemoryRouter>);
