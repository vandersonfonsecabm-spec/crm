"use strict";

const { parseJson, requireTenantId, requirePositiveId } = require("./common");

function createAICommerceEffects({ prisma, offerService, clock = () => new Date(), retentionDays = 30 } = {}) {
  if (!prisma) throw new Error("AI_COMMERCE_EFFECTS_PRISMA_REQUIRED");
  const retentionMs = Math.min(90, Math.max(7, Number(retentionDays) || 30)) * 24 * 60 * 60 * 1000;

  async function validateActor(empresaId, actorUsuarioId) {
    const actorId = requirePositiveId(actorUsuarioId, "AI_APPROVAL_ACTOR_REQUIRED");
    const actor = await prisma.usuario?.findFirst?.({ where: { id: actorId, empresaId, ativo: true }, select: { id: true, papel: true } });
    if (!actor || !["ADMIN", "GERENTE", "VENDEDOR"].includes(String(actor.papel))) throw effectError("AI_APPROVAL_ACTOR_INVALID", "Ator comercial invalido.", 403);
    return actor;
  }

  async function validateCustomer(empresaId, customerId) {
    const id = positiveOptional(customerId);
    if (!id) return null;
    const customer = await prisma.cliente?.findFirst?.({ where: { id, empresaId }, select: { id: true } });
    if (!customer) throw effectError("AI_CUSTOMER_TENANT_MISMATCH", "Cliente comercial invalido para a empresa.", 403);
    return customer.id;
  }

  async function validateScopedParent(model, id, empresaId, conversationId, code) {
    const value = boundedText(id);
    if (!value) return null;
    const row = await model?.findFirst?.({ where: { id: value, empresaId } });
    if (!row || (row.conversationId !== undefined && Number(row.conversationId) !== Number(conversationId))) {
      throw effectError(code, "Registro comercial fora da conversa autorizada.", 403);
    }
    return value;
  }

  async function validOffer({ empresaId, offerId, conversationId }) {
    if (!offerService?.get) throw effectError("AI_OFFER_SERVICE_UNAVAILABLE", "Oferta comercial indisponivel.", 503);
    const offer = await offerService.get({ empresaId, offerId, revalidate: true, now: clock(), internal: true });
    if (!offer?.valid || offer.status !== "ACTIVE") throw effectError("AI_OFFER_EXPIRED", "A oferta comercial expirou ou mudou.", 409);
    if (Number(offer.conversationId) !== Number(conversationId)) throw effectError("AI_OFFER_CONTEXT_MISMATCH", "Oferta fora da conversa autorizada.", 403);
    return offer;
  }

  async function registerProductInterest(input = {}, context = {}) {
    const empresaId = requireTenantId(context.empresaId);
    const conversationId = requirePositiveId(context.conversationId, "AI_CONVERSATION_REQUIRED");
    const actor = await validateActor(empresaId, context.actorUsuarioId);
    const offer = await validOffer({ empresaId, offerId: input.offerId, conversationId });
    const customerId = await validateCustomer(empresaId, input.customerId);
    const idempotencyKey = boundedKey(context.idempotencyKey, "AI_INTEREST_IDEMPOTENCY_REQUIRED");
    const model = prisma.aICommerceProductInterest || prisma.aiCommerceProductInterest;
    if (!model?.findFirst || !model?.create) throw effectError("AI_INTEREST_UNAVAILABLE", "Registro de interesse indisponivel.", 503);
    const existing = await model.findFirst({ where: { empresaId, idempotencyKey } });
    if (existing) {
      if (existing.offerId !== offer.offerId || existing.conversationId !== conversationId) throw effectError("AI_INTEREST_IDEMPOTENCY_CONFLICT", "Chave de interesse reutilizada com dados diferentes.", 409);
      return publicEffect(existing, "interest");
    }
    const now = clock();
    const row = await model.create({ data: {
      empresaId,
      conversationId,
      customerId,
      offerId: offer.offerId,
      catalogProductId: offer.catalogProductId,
      desiredQuantity: input.desiredQuantity ?? null,
      preferencesJson: JSON.stringify(sanitizeObject(input.preferences)),
      status: "REGISTERED",
      source: "HUMAN_APPROVED",
      idempotencyKey,
      actorUsuarioId: actor.id,
      correlationId: boundedText(context.correlationId),
      eventJson: JSON.stringify({ schemaVersion: "ProductInterestRegistered.v1", offerId: offer.offerId }),
      retentionUntil: new Date(now.getTime() + retentionMs),
    } });
    return publicEffect(row, "interest");
  }

  async function createOpportunityDraft(input = {}, context = {}) {
    const empresaId = requireTenantId(context.empresaId);
    const conversationId = requirePositiveId(context.conversationId, "AI_CONVERSATION_REQUIRED");
    const actor = await validateActor(empresaId, context.actorUsuarioId);
    const offerIds = Array.isArray(input.offerIds) ? input.offerIds.slice(0, 3) : [];
    if (!offerIds.length) throw effectError("AI_OFFER_REQUIRED", "Oportunidade exige uma oferta valida.", 422);
    const offers = [];
    for (const offerId of offerIds) offers.push(await validOffer({ empresaId, offerId, conversationId }));
    const customerId = await validateCustomer(empresaId, input.customerId);
    const idempotencyKey = boundedKey(context.idempotencyKey, "AI_DRAFT_IDEMPOTENCY_REQUIRED");
    const model = prisma.aICommerceOpportunityDraft || prisma.aiCommerceOpportunityDraft;
    if (!model?.findFirst || !model?.create) throw effectError("AI_DRAFT_UNAVAILABLE", "Rascunho de oportunidade indisponivel.", 503);
    const existing = await model.findFirst({ where: { empresaId, idempotencyKey } });
    if (existing) return publicEffect(existing, "opportunityDraft");
    const now = clock();
    const row = await model.create({ data: {
      empresaId,
      conversationId,
      customerId,
      primaryOfferId: offers[0].offerId,
      catalogProductId: offers[0].catalogProductId,
      offerIdsJson: JSON.stringify(offers.map((offer) => offer.offerId)),
      summarySanitized: boundedText(input.summary) || "Interesse comercial a confirmar pelo vendedor.",
      status: "DRAFT",
      idempotencyKey,
      actorUsuarioId: actor.id,
      correlationId: boundedText(context.correlationId),
      eventJson: JSON.stringify({ schemaVersion: "SalesOpportunityDraftCreated.v1", offerIds: offers.map((offer) => offer.offerId) }),
      retentionUntil: new Date(now.getTime() + retentionMs),
    } });
    return publicEffect(row, "opportunityDraft");
  }

  async function handoffToSalesperson(input = {}, context = {}) {
    const empresaId = requireTenantId(context.empresaId);
    const conversationId = requirePositiveId(context.conversationId, "AI_CONVERSATION_REQUIRED");
    const actor = await validateActor(empresaId, context.actorUsuarioId);
    const idempotencyKey = boundedKey(context.idempotencyKey, "AI_HANDOFF_IDEMPOTENCY_REQUIRED");
    if (input.offerId) await validOffer({ empresaId, offerId: input.offerId, conversationId });
    const draftModel = prisma.aICommerceDraft || prisma.aiCommerceDraft;
    const opportunityModel = prisma.aICommerceOpportunityDraft || prisma.aiCommerceOpportunityDraft;
    const draftId = await validateScopedParent(draftModel, input.draftId, empresaId, conversationId, "AI_DRAFT_CONTEXT_MISMATCH");
    const opportunityDraftId = await validateScopedParent(opportunityModel, input.opportunityDraftId, empresaId, conversationId, "AI_OPPORTUNITY_CONTEXT_MISMATCH");
    const model = prisma.aICommerceHandoff || prisma.aiCommerceHandoff;
    if (!model?.findFirst || !model?.create) throw effectError("AI_HANDOFF_UNAVAILABLE", "Handoff comercial indisponivel.", 503);
    const existing = await model.findFirst({ where: { empresaId, idempotencyKey } });
    if (existing) return publicEffect(existing, "handoff");
    const now = clock();
    const row = await model.create({ data: {
      empresaId,
      runId: boundedText(context.runId),
      conversationId,
      // The normal AI draft and the isolated opportunity draft are distinct
      // tenant-scoped parents. Never place an opportunity id in draftId: the
      // composite FK would reject it (and a forged caller could cross-bind).
      draftId,
      opportunityDraftId,
      offerId: boundedText(input.offerId),
      reason: boundedText(input.reason) || "HUMAN_SELLER_REQUIRED",
      summarySanitized: boundedText(input.summary),
      queueKey: "COMMERCIAL_INBOX",
      status: "REQUESTED",
      idempotencyKey,
      actorUsuarioId: actor.id,
      correlationId: boundedText(context.correlationId),
      eventJson: JSON.stringify({ schemaVersion: "AIHandoffRequested.v1", queueKey: "COMMERCIAL_INBOX" }),
      retentionUntil: new Date(now.getTime() + retentionMs),
    } });
    return publicEffect(row, "handoff");
  }

  return Object.freeze({ registerProductInterest, createOpportunityDraft, handoffToSalesperson });
}

function publicEffect(row, kind) {
  return {
    kind,
    id: row.id,
    empresaId: row.empresaId,
    conversationId: row.conversationId,
    status: row.status,
    revision: row.revision || 1,
    createdAt: row.createdAt,
    offerId: row.offerId || row.primaryOfferId || null,
    queueKey: row.queueKey || null,
    customerSafe: true,
  };
}

function sanitizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [String(key).slice(0, 80), typeof item === "string" ? item.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 240) : item]));
}
function boundedText(value) { const text = String(value || "").trim(); return text ? text.slice(0, 500) : null; }
function boundedKey(value, code) { const text = String(value || "").trim(); if (!/^[A-Za-z0-9:_-]{8,200}$/.test(text)) throw effectError(code, "Idempotencia obrigatoria.", 422); return text; }
function positiveOptional(value) { if (value === null || value === undefined || value === "") return null; return requirePositiveId(value, "AI_CUSTOMER_ID_INVALID"); }
function effectError(code, message, status) { const error = new Error(message); error.code = code; error.status = status; return error; }

module.exports = { createAICommerceEffects };
