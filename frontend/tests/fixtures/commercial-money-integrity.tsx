import { createRoot } from "react-dom/client";
import { CommercialProposalEditorFixture } from "../../src/components/negocios/CommercialProposalsPanel";
import "../../src/index.css";
import type { CommercialProposal } from "../../src/services/crmApi";

const proposal: CommercialProposal = {
  id: 9401,
  codigo: "PROP-2026-00941",
  titulo: "Proposta de equipamentos para a próxima safra",
  descricao: "Condições comerciais locais para revisão visual.",
  clienteId: 701,
  cliente: { id: 701, nome: "Cooperativa Horizonte", empresa: "Conta local sintética" },
  negocioId: 901,
  negocio: { id: 901, titulo: "Renovação de equipamentos", etapa: "PROPOSTA", responsavelId: 41 },
  leadId: null,
  lead: null,
  responsavel: { id: 41, nome: "Operadora local" },
  autor: { id: 41, nome: "Operadora local" },
  propostaOrigemId: null,
  descontoGeralCentavos: 0,
  subtotalCentavos: 252501,
  totalCentavos: 252501,
  validade: "2026-09-15T00:00:00.000Z",
  observacoes: "Valores fictícios e sem outbound.",
  condicoesComerciais: "Validade de quinze dias.",
  status: "RASCUNHO",
  versao: 1,
  revisao: 3,
  itens: [
    {
      id: 1,
      itemType: "CATALOG_ITEM",
      descricao: "Pulverizador canônico 600 L",
      quantidade: "1.005",
      valorUnitarioCentavos: 250000,
      descontoCentavos: 0,
      subtotalCentavos: 251250,
      totalCentavos: 251250,
      ordem: 0,
      productOfferId: "offer-local-catalog-001",
      catalogProductId: 81,
      stockProductId: 118,
      productNameSnapshot: "Pulverizador canônico 600 L",
      skuSnapshot: "PULV-600",
      unitSnapshot: "UN",
      currencySnapshot: "BRL",
      priceStatusSnapshot: "AVAILABLE",
      offerExpiresAt: "2026-09-15T12:00:00.000Z",
      catalogRevision: 7,
      stockMaterialVersion: 12,
    },
    {
      id: 2,
      itemType: "LEGACY_ITEM",
      descricao: "Instalação assistida",
      quantidade: "1",
      valorUnitarioCentavos: 1500,
      descontoCentavos: 249,
      subtotalCentavos: 1500,
      totalCentavos: 1251,
      ordem: 1,
    },
  ],
  permissoes: { editar: true, alterarStatus: true, duplicar: true },
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z",
};

export function CommercialMoneyIntegrityFixture() {
  return (
    <main className="crm-workspace min-h-screen bg-[var(--bg-app)] px-5 py-8" data-fixture-readonly="true">
      <section className="mx-auto max-w-5xl rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
        <div className="border-b border-[var(--border-default)] pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">Fixture local · sem rede</p>
          <h1 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Integridade de valores da proposta</h1>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Item catalogado preservado, cálculo exato e campos de autoridade do servidor bloqueados.</p>
        </div>
        <CommercialProposalEditorFixture proposal={proposal} />
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root de fixture ausente.");
createRoot(rootElement).render(<CommercialMoneyIntegrityFixture />);
