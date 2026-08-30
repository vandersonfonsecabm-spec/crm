import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_SALES_CSV_FILENAME,
  CANONICAL_SALES_CSV_MIME_TYPE,
  buildCanonicalSalesCsv,
  downloadCanonicalSalesCsv,
  fetchAllCanonicalSales,
  toCsvCell,
} from "../src/utils/canonicalSalesCsv.js";

function sale(overrides = {}) {
  return {
    id: 1,
    negocioId: 10,
    clienteId: 20,
    moeda: "BRL",
    totalCentavos: 0,
    origem: "MANUAL_CLOSE",
    status: "ACTIVE",
    fechadoEm: "2026-08-30T12:34:56.000Z",
    propostaVencedora: null,
    revisao: 1,
    ...overrides,
  };
}

test("exportação busca todas as páginas e gera CSV com BRL, centavos, null e proteção de fórmula", async () => {
  const calls = [];
  const pages = [
    [sale()],
    [sale({ id: 2, negocioId: 11, clienteId: 21, totalCentavos: 920050, origem: "ACCEPTED_PROPOSAL", propostaVencedora: { codigo: "=SOMA(1,2)" } })],
    [sale({ id: 3, negocioId: 12, clienteId: 22, totalCentavos: 1050, propostaVencedora: { codigo: "PROP-\"A\"" } })],
  ];
  const fetchPage = async ({ page, limit }) => {
    calls.push({ page, limit });
    return {
      data: pages[page - 1],
      pagination: { page, limit, total: 3, totalPages: 3 },
    };
  };

  const sales = await fetchAllCanonicalSales(fetchPage, { pageSize: 2 });
  assert.deepEqual(calls, [
    { page: 1, limit: 2 },
    { page: 2, limit: 2 },
    { page: 3, limit: 2 },
  ]);
  assert.deepEqual(sales.map((item) => item.id), [1, 2, 3]);

  const csv = buildCanonicalSalesCsv(sales);
  const lines = csv.split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '"Venda","Negócio","Cliente","Moeda","Valor (BRL)","Centavos","Origem","Status","Fechado em","Proposta","Revisão"');
  assert.match(lines[1], /"0,00","0"/u);
  assert.match(lines[1], /,"","1"$/u);
  assert.match(lines[2], /"9200,50","920050"/u);
  assert.match(lines[2], /"'=SOMA\(1,2\)"/u);
  assert.match(lines[3], /"10,50","1050"/u);
  assert.match(lines[3], /"PROP-""A"""/u);
  assert.equal(toCsvCell(null), '""');
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    assert.equal(toCsvCell(`${prefix}risco`), `"'${prefix}risco"`);
  }
});

test("download cria Blob, aciona o link e só agenda revoke depois do clique", () => {
  const events = [];
  const scheduled = [];
  const blobs = [];
  const link = {
    href: "",
    download: "",
    style: {},
    click() { events.push("click"); },
    remove() { events.push("remove"); },
  };
  const documentRef = {
    body: { appendChild(node) { assert.equal(node, link); events.push("append"); } },
    createElement(tag) { assert.equal(tag, "a"); events.push("create-link"); return link; },
  };
  const urlApi = {
    createObjectURL(blob) { blobs.push(blob); events.push("create-url"); return "blob:canonical-sale"; },
    revokeObjectURL(url) { events.push(`revoke:${url}`); },
  };
  class BlobDouble {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }
  const scheduleCleanup = (callback, delayMs) => {
    events.push("schedule-revoke");
    scheduled.push({ callback, delayMs });
  };

  const result = downloadCanonicalSalesCsv("conteúdo", {
    documentRef,
    urlApi,
    BlobCtor: BlobDouble,
    scheduleCleanup,
  });

  assert.deepEqual(result, { filename: CANONICAL_SALES_CSV_FILENAME, url: "blob:canonical-sale" });
  assert.equal(link.href, "blob:canonical-sale");
  assert.equal(link.download, "vendas-canonicas.csv");
  assert.equal(link.style.display, "none");
  assert.equal(blobs[0].parts[0], "conteúdo");
  assert.equal(blobs[0].type, CANONICAL_SALES_CSV_MIME_TYPE);
  assert.deepEqual(events, ["create-url", "create-link", "append", "click", "remove", "schedule-revoke"]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 1_000);
  assert.doesNotMatch(events.join("|"), /revoke:/u);

  scheduled[0].callback();
  assert.equal(events.at(-1), "revoke:blob:canonical-sale");
});
