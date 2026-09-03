"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canonicalClientStatus,
  clientStatusFilter,
  mergeClientStatusRows,
} = require("../src/shared/client-status");

test("cliente status canonico unifica Lead com Novo sem alterar etapas reais", () => {
  assert.equal(canonicalClientStatus("Lead"), "Novo");
  assert.equal(canonicalClientStatus("Novo"), "Novo");
  assert.equal(canonicalClientStatus("Proposta"), "Proposta");
  assert.deepEqual(clientStatusFilter("Novo"), { in: ["Lead", "Novo"] });
  assert.deepEqual(clientStatusFilter("Lead"), { in: ["Lead", "Novo"] });
  assert.equal(clientStatusFilter("Contato"), "Contato");
});

test("dashboard agrega contagens e valores de Lead em Novo", () => {
  const rows = mergeClientStatusRows([
    { status: "Lead", _count: { _all: 2, valor: 2 }, _sum: { valor: 100 } },
    { status: "Novo", _count: { _all: 1, valor: 1 }, _sum: { valor: 50 } },
    { status: "Contato", _count: { _all: 1, valor: 1 }, _sum: { valor: 25 } },
  ]);
  assert.deepEqual(rows, [
    { status: "Novo", total: 3, informed: 3, sum: 150 },
    { status: "Contato", total: 1, informed: 1, sum: 25 },
  ]);
});
