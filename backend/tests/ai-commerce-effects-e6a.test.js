const assert = require("node:assert/strict");
const test = require("node:test");
const { createAICommerceEffects } = require("../src/ai-commerce/effects");

function createModel() {
  const rows = new Map();
  return {
    rows,
    findFirst: async ({ where }) => [...rows.values()].find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null,
    create: async ({ data }) => {
      const row = { id: `${data.idempotencyKey}-row`, revision: 1, createdAt: new Date(), ...data };
      rows.set(row.id, row);
      return row;
    },
  };
}

test("efeitos comerciais exigem oferta da conversa e são idempotentes", async () => {
  const interest = createModel();
  const opportunity = createModel();
  const handoff = createModel();
  const offerService = {
    get: async (input) => {
      assert.equal(input.internal, true);
      if (input.offerId === "expired-offer") return { offerId: input.offerId, valid: false, status: "EXPIRED", conversationId: 10 };
      return { offerId: input.offerId, valid: true, status: "ACTIVE", conversationId: 10, catalogProductId: 7 };
    },
  };
  const effects = createAICommerceEffects({
    prisma: {
      usuario: { findFirst: async () => ({ id: 3, papel: "VENDEDOR" }) },
      aICommerceProductInterest: interest,
      aICommerceOpportunityDraft: opportunity,
      aICommerceHandoff: handoff,
    },
    offerService,
    clock: () => new Date("2026-08-24T12:00:00Z"),
  });

  const context = { empresaId: 1, conversationId: 10, actorUsuarioId: 3, idempotencyKey: "interest-001", correlationId: "corr-001" };
  const first = await effects.registerProductInterest({ offerId: "offer-1", desiredQuantity: 2 }, context);
  const replay = await effects.registerProductInterest({ offerId: "offer-1", desiredQuantity: 2 }, context);
  assert.equal(first.id, replay.id);
  assert.equal(interest.rows.size, 1);

  await assert.rejects(
    () => effects.registerProductInterest({ offerId: "offer-1" }, { ...context, conversationId: 11, idempotencyKey: "interest-002" }),
    { code: "AI_OFFER_CONTEXT_MISMATCH" },
  );
  await assert.rejects(
    () => effects.registerProductInterest({ offerId: "expired-offer" }, { ...context, idempotencyKey: "interest-003" }),
    { code: "AI_OFFER_EXPIRED" },
  );

  const draft = await effects.createOpportunityDraft({ offerIds: ["offer-1"], summary: "Cliente quer uma roçadeira" }, { ...context, idempotencyKey: "opportunity-001" });
  assert.equal(draft.status, "DRAFT");
  const handoffResult = await effects.handoffToSalesperson({ offerId: "offer-1", opportunityDraftId: draft.id, reason: "Cliente pediu vendedor" }, { ...context, runId: "run-001", idempotencyKey: "handoff-001" });
  assert.equal(handoffResult.queueKey, "COMMERCIAL_INBOX");
  assert.equal(handoff.rows.size, 1);
});
