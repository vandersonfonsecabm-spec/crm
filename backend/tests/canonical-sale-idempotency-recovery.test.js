const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createCanonicalSaleService,
  saleFingerprint,
} = require("../src/canonical-sales/service");

for (const transactionCode of ["P2002", "P2028", "P2034"]) {
  test(`recovery ${transactionCode} rejeita replay de venda invalidada`, async () => {
    const empresaId = 23;
    const negocioId = 37;
    const input = {
      origem: "MANUAL_CLOSE",
      idempotencyKey: `recovery-${transactionCode.toLowerCase()}`,
      contratoRevisao: 4,
      valorFinalCentavos: 12500,
    };
    const transactionError = Object.assign(new Error("falha transacional sintetica"), {
      code: transactionCode,
    });
    const invalidatedSale = {
      empresaId,
      negocioId,
      origem: input.origem,
      propostaVencedoraId: null,
      requestFingerprint: saleFingerprint({
        negocioId,
        origem: input.origem,
        contratoRevisao: input.contratoRevisao,
        manualValue: input.valorFinalCentavos,
        winningProposalId: null,
      }),
      status: "INVALIDATED",
    };
    let transactionCalls = 0;
    let fallbackReads = 0;
    const prisma = {
      $transaction: async () => {
        transactionCalls += 1;
        throw transactionError;
      },
      vendaCanonica: {
        findFirst: async ({ where }) => {
          fallbackReads += 1;
          assert.deepEqual(where, { empresaId, idempotencyKey: input.idempotencyKey });
          return invalidatedSale;
        },
      },
    };
    const service = createCanonicalSaleService({ prisma });

    await assert.rejects(
      service.closeDealAsWon({ empresaId, usuarioId: 7, papel: "ADMIN" }, negocioId, input),
      (error) => error?.status === 409 && error?.codigo === "IDEMPOTENCY_KEY_REPLAY_INVALIDATED",
    );
    assert.equal(transactionCalls, 1);
    assert.equal(fallbackReads, 1);
  });
}
