const assert = require("node:assert/strict");
const { test } = require("node:test");
const { commercialProductWhere } = require("../src/integrations/commercialCatalogService");

test("filtro de local e disponibilidade usa o mesmo registro de estoque", () => {
  const where = commercialProductWhere(7, { local: "Loja A", somenteDisponiveis: true });
  assert.equal(where.empresaId, 7);
  assert.equal(where.ativo, true);
  assert.deepEqual(where.estoques, {
    some: {
      OR: [{ localNome: { contains: "Loja A" } }, { localExternalId: { contains: "Loja A" } }],
      disponivel: { gt: 0 },
    },
  });
});
