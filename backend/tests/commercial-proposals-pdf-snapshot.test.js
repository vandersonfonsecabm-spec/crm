const assert = require("node:assert/strict");
const test = require("node:test");

const {
  generateProposalPdf,
  proposalLines,
} = require("../src/commercial-proposals/pdf");

function proposalWithItem(item) {
  return {
    empresa: { nome: "Empresa QA" },
    cliente: { nome: "Cliente QA" },
    negocio: { titulo: "Negocio QA" },
    codigo: "PROP-2026-00001",
    versao: 1,
    status: "PRONTA",
    validade: "2026-12-31T00:00:00.000Z",
    titulo: "Proposta QA",
    itens: [item],
    subtotalCentavos: 10000,
    descontoGeralCentavos: 0,
    totalCentavos: 10000,
  };
}

test("legacy proposal item keeps the historical PDF line shape", () => {
  const lines = proposalLines(proposalWithItem({
    descricao: "Servico legado",
    quantidade: "1",
    valorUnitarioCentavos: 10000,
    descontoCentavos: 0,
    totalCentavos: 10000,
  }));

  assert.ok(lines.includes("1. Servico legado"));
  assert.ok(lines.includes("   1 x R$ 100,00 | desconto R$ 0,00 | total R$ 100,00"));
  assert.equal(lines.some((line) => line.includes("SKU") || line.includes("Preco ")), false);
});

test("catalog proposal item renders persisted snapshots, never a live catalog name", () => {
  const lines = proposalLines(proposalWithItem({
    itemType: "CATALOG_ITEM",
    descricao: "Nome atual do catalogo (nao usar)",
    productNameSnapshot: "Nome vendido na proposta",
    skuSnapshot: "SKU-SNAPSHOT-1",
    unitSnapshot: "UN",
    currencySnapshot: "BRL",
    priceStatusSnapshot: "AVAILABLE",
    offerExpiresAt: "2026-09-30T00:00:00.000Z",
    catalogRevision: 7,
    stockMaterialVersion: 11,
    quantidade: "2",
    valorUnitarioCentavos: 5000,
    descontoCentavos: 0,
    totalCentavos: 10000,
  }));

  assert.ok(lines.includes("1. Nome vendido na proposta"));
  assert.equal(lines.some((line) => line.includes("Nome atual do catalogo")), false);
  assert.ok(lines.some((line) => line.includes("SKU SKU-SNAPSHOT-1") && line.includes("Unidade UN")));
  assert.ok(lines.some((line) => line.includes("Preco AVAILABLE") && line.includes("Oferta valida ate 30/09/2026")));
  assert.ok(lines.some((line) => line.includes("Revisao comercial 7")));
  assert.ok(lines.includes("   2 x R$ 50,00 | desconto R$ 0,00 | total R$ 100,00"));
});

test("snapshot PDF remains a valid PDF and does not expose internal stock version", () => {
  const pdf = generateProposalPdf(proposalWithItem({
    itemType: "CATALOG_ITEM",
    descricao: "Fallback",
    productNameSnapshot: "Produto \"QA\"",
    currencySnapshot: "USD",
    catalogRevision: 4,
    stockMaterialVersion: 999,
    quantidade: "1",
    valorUnitarioCentavos: 1234,
    descontoCentavos: 0,
    totalCentavos: 1234,
  }));
  const text = pdf.toString("latin1");
  assert.equal(text.slice(0, 8), "%PDF-1.4");
  assert.match(text, /Produto "QA"/);
  assert.match(text, /R\$ 12,34/);
  assert.doesNotMatch(text, /999/);
});
