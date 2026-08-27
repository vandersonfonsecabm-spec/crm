const assert = require("node:assert/strict");
const { test } = require("node:test");
const { claimImportForProcessing } = require("../src/integrations/importService");

test("claim de importação é tenant-scoped, condicionado a PRONTO e falha em conflito", async () => {
  const calls = [];
  const prisma = {
    importacaoDados: {
      async updateMany(args) {
        calls.push(args);
        return { count: calls.length === 1 ? 1 : 0 };
      },
    },
  };
  const now = new Date("2026-08-27T12:00:00.000Z");

  assert.equal(await claimImportForProcessing({ prisma, importacaoId: 17, empresaId: 9, now }), true);
  assert.deepEqual(calls[0], {
    where: { id: 17, empresaId: 9, status: "PRONTO" },
    data: { status: "PROCESSANDO", iniciadaEm: now },
  });

  await assert.rejects(
    claimImportForProcessing({ prisma, importacaoId: 17, empresaId: 9, now }),
    (error) => error.status === 409 && error.code === "IMPORT_CONFLICT",
  );
});
