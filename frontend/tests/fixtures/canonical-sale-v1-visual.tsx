import { createRoot } from "react-dom/client";
import { BusinessCard, BusinessDrawer, NegociosKanbanBoard } from "../../src/components/negocios/DashboardNegociosKanbanPanel";
import { ErrorState, LoadingState, Surface } from "../../src/components/ui";
import { setAuthToken } from "../../src/services/crmApi";
import type { AuthSession, CanonicalSale, CommercialProposal, CommunicationBusiness } from "../../src/services/crmApi";
import "../../src/index.css";

type Scenario = "board" | "empty" | "error" | "loading" | "manual" | "proposal" | "superseded" | "won-manual" | "won-proposal" | "legacy" | "lost";

const now = "2026-08-29T12:00:00.000Z";
const scenario = (new URLSearchParams(window.location.search).get("scenario") || "board") as Scenario;
const principal = { id: 4101, codigo: "PROP-2026-04101", titulo: "Condição comercial principal", status: "ACEITA" as const, totalCentavos: 920050, moeda: "BRL" as const, revisao: 4 };

const authSession: AuthSession = {
  token: "fixture-token",
  usuario: { id: 71, empresaId: 31, nome: "Marina Operações", email: "marina@example.test", papel: "ADMIN", ativo: true },
  empresa: { id: 31, nome: "Cooperativa Aurora", slug: "fixture-aurora", ativo: true },
  papel: "ADMIN",
  capabilities: { leadsCommunication: true, siteLeadCapture: false, negociosKanban: true, automations: false, aiCommerce: false },
};

setAuthToken(authSession.token);

function activeSale(source: "ACCEPTED_PROPOSAL" | "MANUAL_CLOSE", negocioId: number, clienteId: number): CanonicalSale {
  const proposalSale = source === "ACCEPTED_PROPOSAL";
  return {
    id: proposalSale ? 8101 : 8102,
    negocioId,
    clienteId,
    origem: source,
    status: "ACTIVE",
    propostaVencedoraId: proposalSale ? principal.id : null,
    moeda: "BRL",
    subtotalCentavos: proposalSale ? 950000 : 415000,
    descontoCentavos: proposalSale ? 29950 : 0,
    totalCentavos: proposalSale ? 920050 : 415000,
    propostaRevisao: proposalSale ? 4 : null,
    etapaAbertaAnterior: "PROPOSTA",
    revisao: 1,
    fechadoEm: now,
    invalidadoEm: null,
    motivoInvalidacao: null,
    createdAt: now,
    updatedAt: now,
    itens: proposalSale ? [{ id: 1, propostaItemId: 701, descricao: "Pulverizador 600 L", productNameSnapshot: "Pulverizador 600 L", skuSnapshot: "PULV-600", unitSnapshot: "UN", quantidade: "1", valorUnitarioCentavos: 950000, descontoCentavos: 29950, subtotalCentavos: 950000, totalCentavos: 920050, moeda: "BRL", ordem: 0 }] : [],
    fechadoPor: { id: 71, nome: "Marina Operações" },
    invalidadoPor: null,
    propostaVencedora: proposalSale ? { id: principal.id, codigo: principal.codigo, titulo: principal.titulo, status: "ACEITA" } : null,
  };
}

function business(id: number, stage: CommunicationBusiness["etapa"], options: { value?: number | null; sale?: CanonicalSale | null; winner?: boolean; legacy?: boolean } = {}): CommunicationBusiness {
  const sale = options.sale ?? null;
  const winner = options.winner === true;
  const open = ["NOVO", "CONTATO", "PROPOSTA"].includes(stage);
  return {
    id,
    clienteId: 400 + id,
    cliente: { id: 400 + id, nome: `Fazenda Horizonte ${id}`, empresa: "Grupo Horizonte" },
    leadId: null,
    lead: null,
    responsavelId: 71,
    responsavel: { id: 71, nome: "Marina Operações", papel: "ADMIN" },
    convertidoPorId: null,
    convertidoPor: null,
    statusLeadAnterior: null,
    titulo: stage === "FECHADO" ? `Renovação concluída ${id}` : stage === "PERDIDO" ? `Projeto adiado ${id}` : `Renovação de equipamentos ${id}`,
    observacao: options.legacy ? "Fechamento legado aguardando reconciliação." : "Fixture sintética, local e sem outbound.",
    etapa: stage,
    valor: options.value === undefined ? 875000 : options.value,
    etapaEntrouEm: now,
    ultimaMovimentacaoEm: now,
    proximaAcao: open ? { id: 91, titulo: "Revisar condições com o cliente", dataHora: "2026-08-30T14:00:00.000Z", prioridade: "ALTA", status: "PENDENTE", tipo: "REUNIAO", responsavelUsuario: { id: 71, nome: "Marina Operações" }, atrasada: false } : null,
    tempoEtapa: { entrouEm: now, ultimaMovimentacaoEm: now, atualSegundos: 86400, acumuladoSegundos: 259200, estimado: false },
    negocioParado: false,
    motivoParado: null,
    integridadeComercial: options.legacy ? "LEGACY_WON_UNRECONCILED" : "OK",
    contratoComercial: {
      revisao: sale ? 5 : winner ? 3 : 1,
      propostaPrincipalId: winner ? principal.id : null,
      propostaVencedoraId: winner ? principal.id : null,
      vendaAtivaId: sale?.id ?? null,
      propostaPrincipal: winner ? principal : null,
      propostaVencedora: winner ? principal : null,
      vendaAtiva: sale,
    },
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: now,
    permissoes: { movimentar: open, fechar: open, marcarPerdido: open, reabrir: stage === "FECHADO" || stage === "PERDIDO" },
  };
}

const fixtures = {
  manual: business(100, "PROPOSTA", { value: null }),
  proposal: business(101, "PROPOSTA", { value: 875000, winner: true }),
  superseded: business(103, "PROPOSTA", { value: 875000, winner: true }),
  "won-proposal": business(106, "FECHADO", { value: 875000, winner: true, sale: activeSale("ACCEPTED_PROPOSAL", 106, 506) }),
  "won-manual": business(107, "FECHADO", { value: 390000, sale: activeSale("MANUAL_CLOSE", 107, 507) }),
  legacy: business(104, "FECHADO", { value: 500000, legacy: true }),
  lost: business(105, "PERDIDO", { value: 720000 }),
} satisfies Record<Exclude<Scenario, "board" | "empty" | "error" | "loading">, CommunicationBusiness>;

const proposalBusinessId = scenario === "won-proposal" ? 106 : scenario === "superseded" ? 103 : 101;
const proposalRows: CommercialProposal[] = [
  proposal(4101, "ACEITA", "Proposta vencedora", 920050, true),
  proposal(4102, "SUBSTITUIDA", "Condição anterior preservada", 875000, false),
  proposal(4103, "ENVIADA", "Alternativa em análise", 905000, false),
];

function proposal(id: number, status: CommercialProposal["status"], title: string, total: number, winner: boolean): CommercialProposal {
  return {
    id,
    codigo: `PROP-2026-${id}`,
    titulo: title,
    descricao: "Snapshot comercial sintético.",
    clienteId: 501,
    cliente: { id: 501, nome: "Fazenda Horizonte 101", empresa: "Grupo Horizonte" },
    negocioId: proposalBusinessId,
    negocio: { id: proposalBusinessId, titulo: "Renovação de equipamentos", etapa: scenario.startsWith("won") ? "FECHADO" : "PROPOSTA", responsavelId: 71 },
    leadId: null,
    lead: null,
    responsavel: { id: 71, nome: "Marina Operações" },
    autor: { id: 71, nome: "Marina Operações" },
    propostaOrigemId: null,
    descontoGeralCentavos: 0,
    subtotalCentavos: total,
    totalCentavos: total,
    moeda: "BRL",
    validade: "2026-09-15T00:00:00.000Z",
    observacoes: "Sem envio externo.",
    condicoesComerciais: "Validade de quinze dias.",
    status,
    versao: 1,
    revisao: status === "SUBSTITUIDA" ? 5 : 4,
    itens: [{ id: id + 1000, itemType: "LEGACY_ITEM", descricao: title, quantidade: "1", valorUnitarioCentavos: total, descontoCentavos: 0, subtotalCentavos: total, totalCentavos: total, ordem: 0 }],
    contratoComercial: { revisao: 3, principal: winner, vencedora: winner, vendaAtivaId: scenario.startsWith("won") ? 8101 : null },
    permissoes: { editar: false, alterarStatus: false, duplicar: !scenario.startsWith("won"), aceitar: status === "ENVIADA" && !scenario.startsWith("won"), definirPrincipal: status === "ENVIADA" && !scenario.startsWith("won"), substituirVencedora: !scenario.startsWith("won"), reconciliarVencedora: false, removerVencedora: winner && !scenario.startsWith("won") },
    createdAt: now,
    updatedAt: now,
  };
}

window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/historico-etapas")) return json({ data: [{ id: 1, etapaAnterior: "CONTATO", etapaNova: "PROPOSTA", etapaEntrouEm: "2026-08-27T12:00:00.000Z", etapaSaiuEm: now, duracaoEtapaSegundos: 86400, duracaoEtapaEstimada: false, autor: { id: 71, nome: "Marina Operações" }, createdAt: now }], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } });
  if (url.includes("/propostas") && (!init?.method || init.method === "GET")) {
    const rows = ["manual", "won-manual", "legacy", "lost"].includes(scenario) ? [] : proposalRows;
    return json({ data: rows, pagination: { page: 1, limit: 100, total: rows.length, totalPages: rows.length ? 1 : 0 } });
  }
  return json({ erro: "Rota não permitida na fixture local." }, 404);
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

export function Fixture() {
  if (scenario === "loading") return <main className="crm-workspace min-h-screen bg-[var(--bg-app)] p-6"><LoadingState label="Carregando contrato comercial" rows={5} /></main>;
  if (scenario === "error") return <main className="crm-workspace min-h-screen bg-[var(--bg-app)] p-6"><ErrorState description="Os dados existentes não foram alterados." onRetry={() => undefined} title="Não foi possível carregar os Negócios." /></main>;
  if (scenario === "empty") return <main className="crm-workspace min-h-screen bg-[var(--bg-app)] p-6"><Surface><NegociosKanbanBoard businesses={[]} dragOverStage={null} onDragOverStageChange={() => undefined} onMoveBusiness={() => undefined} onOpenBusiness={() => undefined} /></Surface></main>;
  if (scenario === "board") {
    const rows = Object.values(fixtures);
    return <main className="crm-workspace min-h-screen bg-[var(--bg-app)] p-5"><section className="mx-auto max-w-[1680px] space-y-3"><header><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Fixture local · sem rede</p><h1 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Venda Canônica V1 · estados comerciais</h1></header><Surface className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{rows.map((item) => <BusinessCard business={item} key={item.id} onOpen={() => undefined} />)}</Surface></section></main>;
  }
  const selected = fixtures[scenario];
  return <main className="crm-workspace min-h-screen bg-[var(--bg-app)]" data-canonical-sale-fixture={scenario}><BusinessDrawer authSession={authSession} business={selected} isMoving={false} loading={false} onCanonicalChanged={async () => undefined} onClose={() => undefined} onMoveBusiness={async () => false} onOpenAgenda={() => undefined} /></main>;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<Fixture />);
