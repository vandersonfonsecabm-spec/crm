"use strict";

const crypto = require("node:crypto");
const {
  MODES,
  STATES,
  normalizeMode,
  modeAllowsExecution,
  buildModePolicy,
  buildSanitizedContext,
  validateToolRequests,
  validateCommercialDraft,
  makeIdempotencyKey,
  validateApproval,
  policyError,
} = require("./policy");
const { UnconfiguredCommerceAIConnection } = require("./connection");

const MAX_TURNS = 6;

function createAICommerceOrchestrator({
  connection = new UnconfiguredCommerceAIConnection(),
  toolRegistry,
  offerService,
  audit,
  prisma,
  featureGate,
  settingsResolver,
  now = () => new Date(),
} = {}) {
  if (!toolRegistry || typeof toolRegistry.execute !== "function") throw new Error("AI_COMMERCE_TOOL_REGISTRY_REQUIRED");
  const runs = new Map();
  const drafts = new Map();

  async function run(input = {}) {
    const empresaId = positiveId(input.empresaId);
    const conversationId = positiveId(input.conversationId);
    if (!empresaId || !conversationId) throw policyError("AI_CONTEXT_INVALID", "Tenant e conversa sao obrigatorios.", 401);
    const featureEnabled = await resolveFeature({ empresaId, input, featureGate });
    const settings = await resolveSettings({ empresaId, input, settingsResolver });
    const configuredMode = normalizeMode(settings.mode || MODES.OFF);
    const mode = normalizeMode(input.mode || configuredMode);
    if (modeRank(mode) > modeRank(configuredMode)) throw policyError("AI_MODE_ESCALATION", "Modo solicitado excede a politica do tenant.", 403);
    const mockEnabled = input.mockEnabled === true || settings.mockEnabled === true;
    const tenantAllowed = input.tenantAllowed !== false;
    const modePolicy = buildModePolicy({ mode, enabled: input.enabled !== false && settings.enabled !== false, featureEnabled, mockEnabled, tenantAllowed });
    if (!modeAllowsExecution(mode) || !modePolicy.enabled) {
      return freezeResult({ state: STATES.IDLE, mode: MODES.OFF, status: "OFF", noExecution: true, empresaId, conversationId });
    }
    const messageId = input.messageId || input.latestMessageId;
    const idempotencyKey = input.idempotencyKey || makeIdempotencyKey({ empresaId, conversationId, messageId, messageRevision: input.messageRevision, policyRevision: settings.revision || input.policyRevision || "1" });
    const existing = await getExistingRun({ prisma, idempotencyKey, runs });
    if (existing) return freezeResult({ ...existing, idempotentReplay: true });
    const runId = String(input.runId || crypto.randomUUID()).slice(0, 128);
    const context = buildSanitizedContext({
      empresaId,
      conversationId,
      channel: input.channel,
      customer: input.customer,
      conversationState: input.conversationState,
      messages: input.messages || (input.latestMessage ? [{ id: messageId, direction: "INBOUND", text: input.latestMessage }] : []),
      productsOffered: input.productsOffered,
      interests: input.interests,
      opportunity: input.opportunity,
      sellerAssignment: input.sellerAssignment,
      policyVersion: settings.policyVersion,
      channelCapabilities: input.channelCapabilities,
    });
    const baseContext = {
      empresaId,
      conversationId,
      actorUsuarioId: positiveId(input.actorUsuarioId),
      runId,
      correlationId: String(input.correlationId || `ai-${runId}`).slice(0, 128),
      mode,
      idempotencyKey,
      approvedActions: input.approvedActions || {},
    };
    await auditCall(audit, "recordRunStarted", { ...baseContext, status: "STARTED", state: STATES.DISCOVERY });
    let state = STATES.DISCOVERY;
    let decision;
    let toolResults = {};
    let turn = 0;
    try {
      decision = await connection.generateCommercialDecision({
        ...baseContext,
        conversationContext: context,
        latestMessage: input.latestMessage,
        toolResults,
        catalogContext: input.catalogContext,
        offerIds: input.offerIds,
      });
      await auditCall(audit, "recordDecision", { ...baseContext, decision, state });
      for (turn = 0; turn < MAX_TURNS; turn += 1) {
        const requests = validateToolRequests(decision?.requestedTools, toolRegistry);
        if (requests.length === 0) break;
        state = stateForDecision(decision);
        for (const request of requests) {
          try {
            const result = await toolRegistry.execute(request.name, request.input, { ...baseContext, mode, approvedActions: input.approvedActions || {} });
            if (!Array.isArray(toolResults[request.name])) toolResults[request.name] = [];
            if (Array.isArray(result)) toolResults[request.name].push(...result.slice(0, 20));
            else toolResults[request.name].push(result);
          } catch (error) {
            if (error?.code === "AI_TOOL_HUMAN_APPROVAL_REQUIRED") {
              state = STATES.AWAITING_APPROVAL;
              break;
            }
            throw error;
          }
        }
        if (state === STATES.AWAITING_APPROVAL) break;
        decision = await connection.generateCommercialDecision({ ...baseContext, conversationContext: context, latestMessage: input.latestMessage, toolResults, catalogContext: input.catalogContext, offerIds: input.offerIds });
        await auditCall(audit, "recordTurn", { ...baseContext, turn: turn + 1, state, decision, toolResults });
      }
      if (turn >= MAX_TURNS) throw policyError("AI_TOOL_LOOP_LIMIT", "Loop de ferramentas excedeu o limite.", 422);
      const allOffers = await materializeOffers({ toolResults, explicitOffers: input.offers, offerService, context: baseContext, customerId: input.customerId });
      let draft = buildDraft(decision, allOffers, { empresaId, conversationId, conversationRevision: input.conversationRevision, mode, now });
      draft = await persistDraft({ prisma, draft, baseContext, decision, actorUsuarioId: input.actorUsuarioId, now });
      const result = freezeResult({
        schemaVersion: "AICommerceRun.v1",
        runId,
        idempotencyKey,
        empresaId,
        conversationId,
        conversationRevision: String(input.conversationRevision ?? ""),
        correlationId: baseContext.correlationId,
        mode,
        state: stateForResult({ state, decision, draft }),
        status: "COMPLETED",
        decision,
        toolResults,
        draft,
        requiresHumanApproval: mode === MODES.HUMAN_APPROVAL || Boolean(draft),
        autoSend: false,
        outbound: 0,
        createdAt: now().toISOString(),
      });
      runs.set(idempotencyKey, result);
      if (draft?.draftId) drafts.set(draft.draftId, { ...result, revision: 1 });
      await auditCall(audit, "recordDraft", { ...baseContext, draft, state: result.state });
      await auditCall(audit, "recordRunCompleted", { ...baseContext, status: result.status, state: result.state, draftId: draft?.draftId });
      return result;
    } catch (error) {
      const failed = freezeResult({ schemaVersion: "AICommerceRun.v1", runId, idempotencyKey, empresaId, conversationId, mode, state: STATES.ERROR, status: "FAILED", errorCode: String(error?.code || "AI_COMMERCE_RUN_FAILED"), requiresHumanApproval: false, autoSend: false, outbound: 0 });
      runs.set(idempotencyKey, failed);
      await auditCall(audit, "recordRunFailed", { ...baseContext, status: failed.status, state: failed.state, errorCode: failed.errorCode });
      throw Object.assign(error, { runId, idempotencyKey });
    }
  }

  async function approve(input = {}) {
    const draftId = String(input.draftId || "");
    const stored = drafts.get(draftId) || await loadPersistedDraft({ prisma, draftId, empresaId: input.empresaId });
    if (!stored) throw policyError("AI_DRAFT_NOT_FOUND", "Rascunho comercial nao encontrado.", 404);
    if (!drafts.has(draftId)) drafts.set(draftId, stored);
    const approval = validateApproval({ ...input, mode: stored.mode, empresaId: stored.empresaId, conversationId: stored.conversationId, draftRevision: input.draftRevision || stored.revision });
    if (stored.empresaId !== approval.empresaId || stored.conversationId !== approval.conversationId) throw policyError("AI_DRAFT_CONTEXT_MISMATCH", "Rascunho fora do tenant ou conversa.", 403);
    if (String(input.conversationRevision || "") !== String(stored.conversationRevision || input.conversationRevision || "")) throw policyError("AI_DRAFT_CONVERSATION_CHANGED", "A conversa mudou antes da aprovacao.", 409);
    const actionTool = actionToTool(approval.action);
    let effect = { action: approval.action, status: "APPROVED", autoSend: false, outbound: 0 };
    if (actionTool && actionTool !== "insertComposer") {
      effect.result = await toolRegistry.execute(actionTool, actionInput(actionTool, stored.draft, input), {
        empresaId: approval.empresaId,
        conversationId: approval.conversationId,
        actorUsuarioId: approval.actorUsuarioId,
        runId: stored.runId,
        correlationId: stored.correlationId,
        mode: MODES.HUMAN_APPROVAL,
        approvedActions: { [actionTool]: true },
        idempotencyKey: approval.idempotencyKey,
      });
    }
    stored.revision += 1;
    stored.approvedAction = approval.action;
    await updatePersistedDraft({ prisma, draftId, empresaId: approval.empresaId, revision: stored.revision - 1, actorUsuarioId: approval.actorUsuarioId, status: "APPROVED" });
    await auditCall(audit, "recordPolicyDecision", { empresaId: approval.empresaId, conversationId: approval.conversationId, runId: stored.runId, action: approval.action, actorUsuarioId: approval.actorUsuarioId, status: "APPROVED" });
    return freezeResult({ ...effect, draftId, revision: stored.revision, draft: stored.draft });
  }

  return Object.freeze({ run, approve, getRun: (idempotencyKey) => runs.get(String(idempotencyKey)) || null, getDraft: (draftId) => drafts.get(String(draftId)) || null, reset: () => { runs.clear(); drafts.clear(); toolRegistry.reset?.(); } });
}

function buildDraft(decision, offers, { empresaId, conversationId, conversationRevision = "", mode, now }) {
  if (!decision || !decision.draftResponse) return null;
  const draft = {
    draftId: `draft-${crypto.randomUUID()}`,
    empresaId,
    conversationId,
    conversationRevision: String(conversationRevision ?? ""),
    text: decision.draftResponse,
    productOffers: offers,
    questions: decision.missingInformation || [],
    actions: [],
    warnings: decision.safetyFlags || [],
    handoff: decision.nextAction === "HANDOFF" ? { reason: decision.handoffReason } : null,
    requiresHumanApproval: true,
    provenanceRefs: offers.map((offer) => String(offer.offerId || offer.id || "")).filter(Boolean),
    expiresAt: new Date(now().getTime() + 15 * 60 * 1000).toISOString(),
  };
  return validateCommercialDraft(draft, { empresaId, conversationId, offers });
}

function collectOffers(toolResults, explicit) {
  const values = [];
  for (const value of Object.values(toolResults || {})) {
    for (const item of Array.isArray(value) ? value : [value]) if (item?.offerId || item?.id && item?.availabilityStatus) values.push(item);
  }
  if (Array.isArray(explicit)) values.push(...explicit);
  return values.slice(0, 3);
}

async function materializeOffers({ toolResults, explicitOffers, offerService, context, customerId }) {
  const offers = collectOffers(toolResults, explicitOffers);
  if (!offerService?.create) return offers;
  const availabilityRows = Array.isArray(toolResults?.getSellableAvailability) ? toolResults.getSellableAvailability : [];
  for (const row of availabilityRows.slice(0, 3)) {
    if (!row || row.offerId || row.status === "NOT_SELLABLE" || row.availabilityStatus === "NOT_SELLABLE") continue;
    const catalogProductId = row.catalogProductId;
    if (!catalogProductId) continue;
    try {
      const offer = await offerService.create({
        empresaId: context.empresaId,
        catalogProductId,
        conversationId: context.conversationId,
        customerId: positiveId(customerId),
        correlationId: context.correlationId,
      });
      if (offer) offers.push(offer);
    } catch (error) {
      // A stale/invalid offer is a policy signal, not a reason to invent a
      // product or price. The draft remains grounded without that offer.
      await auditCall(null, "recordPolicyDecision", { context, status: "OFFER_MATERIALIZATION_BLOCKED", errorCode: String(error?.code || "OFFER_FAILED") });
    }
  }
  return offers.slice(0, 3);
}

async function persistDraft({ prisma, draft, baseContext, decision, actorUsuarioId, now }) {
  if (!draft) return null;
  const model = prisma?.aICommerceDraft || prisma?.aiCommerceDraft;
  if (!model?.create) return draft;
  const created = await model.create({ data: {
    empresaId: baseContext.empresaId,
    runId: baseContext.runId,
    conversationId: baseContext.conversationId,
    status: "PENDING_APPROVAL",
    textSanitized: draft.text,
    offersJson: JSON.stringify(draft.productOffers || []),
    questionsJson: JSON.stringify(draft.questions || []),
    actionsJson: JSON.stringify(draft.actions || []),
    warningsJson: JSON.stringify(draft.warnings || []),
    requiresHumanApproval: true,
    conversationRevision: draft.conversationRevision || null,
    revision: 1,
    expiresAt: new Date(draft.expiresAt),
    actorUsuarioId: positiveId(actorUsuarioId),
    correlationId: baseContext.correlationId,
    eventJson: JSON.stringify({ decision, provenanceRefs: draft.provenanceRefs || [] }),
    retentionUntil: new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000),
  } });
  return Object.freeze({ ...draft, draftId: String(created.id), revision: Number(created.revision) || 1 });
}

async function loadPersistedDraft({ prisma, draftId, empresaId }) {
  const model = prisma?.aICommerceDraft || prisma?.aiCommerceDraft;
  if (!model?.findFirst || !positiveId(empresaId)) return null;
  const row = await model.findFirst({ where: { id: String(draftId), empresaId: positiveId(empresaId) } });
  if (!row || String(row.status || "").toUpperCase() !== "PENDING_APPROVAL") return null;
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return null;
  const runModel = prisma?.aICommerceRun || prisma?.aiCommerceRun;
  const runRow = runModel?.findFirst ? await runModel.findFirst({ where: { empresaId: positiveId(empresaId), runId: row.runId }, select: { mode: true, correlationId: true } }) : null;
  return {
    runId: row.runId,
    empresaId: row.empresaId,
    conversationId: row.conversationId,
    conversationRevision: row.conversationRevision || "",
    mode: normalizeMode(runRow?.mode || MODES.HUMAN_APPROVAL),
    correlationId: row.correlationId || runRow?.correlationId || null,
    revision: Number(row.revision) || 1,
    draft: {
      draftId: String(row.id),
      empresaId: row.empresaId,
      conversationId: row.conversationId,
      conversationRevision: row.conversationRevision || "",
      revision: Number(row.revision) || 1,
      text: String(row.textSanitized || ""),
      productOffers: parseJsonArray(row.offersJson),
      questions: parseJsonArray(row.questionsJson),
      actions: parseJsonArray(row.actionsJson),
      warnings: parseJsonArray(row.warningsJson),
      requiresHumanApproval: true,
      expiresAt: row.expiresAt,
    },
  };
}

async function updatePersistedDraft({ prisma, draftId, empresaId, revision, actorUsuarioId, status }) {
  const model = prisma?.aICommerceDraft || prisma?.aiCommerceDraft;
  if (!model?.updateMany || !positiveId(empresaId)) return;
  const result = await model.updateMany({ where: { id: String(draftId), empresaId: positiveId(empresaId), revision, status: "PENDING_APPROVAL" }, data: { status, approvedAt: status === "APPROVED" ? new Date() : undefined, actorUsuarioId: positiveId(actorUsuarioId), revision: { increment: 1 } } });
  if (result.count !== 1) throw policyError("AI_DRAFT_CONFLICT", "Rascunho alterado por outro aprovador.", 409);
}

function parseJsonArray(value) { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.slice(0, 20) : []; } catch { return []; } }

function stateForDecision(decision) {
  const action = String(decision?.nextAction || "").toUpperCase();
  if (action.includes("CLARIFY")) return STATES.CLARIFYING;
  if (action.includes("SEARCH")) return STATES.SEARCHING;
  if (action.includes("AVAILABILITY") || action.includes("OFFER")) return STATES.OFFER_READY;
  if (action.includes("HANDOFF")) return STATES.HANDOFF;
  return STATES.DISCOVERY;
}

function stateForResult({ state, decision, draft }) {
  if (state === STATES.AWAITING_APPROVAL || draft?.requiresHumanApproval) return STATES.AWAITING_APPROVAL;
  if (decision?.nextAction === "HANDOFF") return STATES.HANDOFF;
  return state;
}

function actionToTool(action) { return { registerProductInterest: "registerProductInterest", createOpportunityDraft: "createOpportunityDraft", handoffToSalesperson: "handoffToSalesperson" }[action] || (action === "insertComposer" ? "insertComposer" : null); }
function actionInput(tool, draft, input) {
  if (tool === "registerProductInterest") return { offerId: draft?.productOffers?.[0]?.offerId, desiredQuantity: input.desiredQuantity, preferences: input.preferences };
  if (tool === "createOpportunityDraft") return { offerIds: (draft?.productOffers || []).map((offer) => offer.offerId).filter(Boolean), summary: draft?.text };
  return { reason: draft?.handoff?.reason || "Aprovacao de vendedor solicitada.", summary: draft?.text };
}

async function resolveFeature({ empresaId, input, featureGate }) {
  if (input.featureEnabled !== undefined) return input.featureEnabled === true;
  if (typeof featureGate === "function") return featureGate(empresaId);
  return false;
}

async function resolveSettings({ empresaId, input, settingsResolver }) {
  if (typeof settingsResolver === "function") return (await settingsResolver(empresaId)) || defaultSettings();
  return { ...defaultSettings(), enabled: input.enabled !== false, mode: input.mode || MODES.OFF, mockEnabled: input.mockEnabled === true };
}

function defaultSettings() { return { enabled: false, mode: MODES.OFF, mockEnabled: false, revision: 1, policyVersion: "ai-commerce-policy.v1" }; }
function modeRank(mode) { return ({ [MODES.OFF]: 0, [MODES.SHADOW]: 1, [MODES.SUGGESTION_ONLY]: 2, [MODES.HUMAN_APPROVAL]: 3 })[normalizeMode(mode)] || 0; }

async function getExistingRun({ prisma, idempotencyKey, runs }) {
  const memory = runs.get(idempotencyKey);
  if (memory) return memory;
  const model = prisma?.aICommerceRun || prisma?.aiCommerceRun;
  if (model?.findFirst) {
    const row = await model.findFirst({ where: { idempotencyKey } });
    if (row) return row;
  }
  return null;
}

async function auditCall(audit, method, payload) { if (audit && typeof audit[method] === "function") return audit[method](payload); return undefined; }
function freezeResult(value) { return Object.freeze({ ...value }); }
function positiveId(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }

module.exports = { MAX_TURNS, createAICommerceOrchestrator, buildDraft, collectOffers, materializeOffers, stateForDecision };
