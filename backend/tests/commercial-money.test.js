const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Prisma } = require("@prisma/client");
const {
  MAX_PRISMA_INT,
  decimalToCentsRoundHalfUp,
  normalizeMoneyDecimal,
  parseNonNegativePrismaInt,
} = require("../src/shared/commercial-money");
const { calculateTotals, proposalMoneyIntegrityFindings } = require("../src/commercial-proposals/service");
const { _private: importPrivate } = require("../src/integrations/importService");

test("parser monetario e estrito e respeita o INTEGER do PostgreSQL", () => {
  assert.equal(parseNonNegativePrismaInt(0), 0);
  assert.equal(parseNonNegativePrismaInt("00125"), 125);
  assert.equal(parseNonNegativePrismaInt(MAX_PRISMA_INT), MAX_PRISMA_INT);
  for (const value of [null, undefined, "", " ", true, false, [], [1], {}, -1, 1.5, "1e3", MAX_PRISMA_INT + 1]) {
    assert.equal(parseNonNegativePrismaInt(value), null, String(value));
  }
});

test("Decimal monetario usa ROUND_HALF_UP sem passar por ponto flutuante", () => {
  assert.equal(decimalToCentsRoundHalfUp("10.004"), 1000);
  assert.equal(decimalToCentsRoundHalfUp("10.005"), 1001);
  assert.equal(decimalToCentsRoundHalfUp("0.005"), 1);
  assert.equal(decimalToCentsRoundHalfUp("21474836.474"), MAX_PRISMA_INT);
  assert.equal(decimalToCentsRoundHalfUp("21474836.475"), null);
  assert.equal(normalizeMoneyDecimal("00010.0050"), "10.0050");
  for (const value of [" ", true, [], [1], {}, "1e3", "-1", "10,50"]) {
    assert.equal(decimalToCentsRoundHalfUp(value), null, String(value));
  }
});

test("totais usam milessimos inteiros e bloqueiam overflow do banco", () => {
  const exact = calculateTotals([{
    quantidade: new Prisma.Decimal("1.005"),
    valorUnitarioCentavos: 100,
    descontoCentavos: 0,
  }], 0);
  assert.equal(exact.itens[0].subtotalCentavos, 101);
  assert.equal(exact.totalCentavos, 101);

  assert.throws(
    () => calculateTotals([{ quantidade: new Prisma.Decimal("2"), valorUnitarioCentavos: MAX_PRISMA_INT, descontoCentavos: 0 }], 0),
    (error) => error?.status === 422,
  );
});

test("importacao monetaria preserva modos e bloqueia overflow", () => {
  assert.equal(importPrivate.parseMoneyToCents("2147483647", "CENTAVOS"), MAX_PRISMA_INT);
  assert.equal(importPrivate.parseMoneyToCents("21.474.836,47", "REAIS_VIRGULA"), MAX_PRISMA_INT);
  assert.equal(importPrivate.parseMoneyToCents("1.234,56", "REAIS_VIRGULA"), 123456);
  assert.equal(importPrivate.parseMoneyToCents("1,234.56", "REAIS_PONTO"), 123456);
  assert.throws(() => importPrivate.parseMoneyToCents("2147483648", "CENTAVOS"), (error) => error.code === "INVALID_PRICE");
  assert.throws(() => importPrivate.parseMoneyToCents("21.474.836,48", "REAIS_VIRGULA"), (error) => error.code === "INVALID_PRICE");
  for (const value of ["1.2", "12.34", "1.23.456", "1.234,567"]) {
    assert.throws(() => importPrivate.parseMoneyToCents(value, "REAIS_VIRGULA"), (error) => error.code === "INVALID_PRICE", value);
  }
  for (const value of ["1,2", "12,34", "1,23,456", "1,234.567"]) {
    assert.throws(() => importPrivate.parseMoneyToCents(value, "REAIS_PONTO"), (error) => error.code === "INVALID_PRICE", value);
  }
});

test("verificador persistido detecta formula adulterada sem confiar no total salvo", () => {
  const proposal = {
    descontoGeralCentavos: 50,
    subtotalCentavos: 151,
    totalCentavos: 101,
    itens: [{
      quantidade: new Prisma.Decimal("1.005"),
      valorUnitarioCentavos: 100,
      descontoCentavos: 0,
      subtotalCentavos: 101,
      totalCentavos: 101,
    }, {
      quantidade: new Prisma.Decimal("1"),
      valorUnitarioCentavos: 50,
      descontoCentavos: 0,
      subtotalCentavos: 50,
      totalCentavos: 50,
    }],
  };
  assert.deepEqual(proposalMoneyIntegrityFindings(proposal), []);
  proposal.itens[0].subtotalCentavos = 100;
  proposal.totalCentavos = 100;
  assert.deepEqual(proposalMoneyIntegrityFindings(proposal), ["ITEM_1_SUBTOTAL_MISMATCH", "PROPOSAL_TOTAL_MISMATCH"]);
});
