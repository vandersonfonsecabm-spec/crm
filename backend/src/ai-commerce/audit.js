"use strict";

const { sanitizeData } = require("./policy");

const AUDIT_SCHEMA_VERSION = "AICommerceAudit.v1";

function createAICommerceAudit({ prisma, logger = console, now = () => new Date() } = {}) {
  async function persist(kind, payload) {
    const safe = sanitizeAuditPayload(payload);
    const modelNames = modelCandidates(kind);
    for (const modelName of modelNames) {
      const model = prisma?.[modelName];
      if (!model || typeof model.create !== "function") continue;
      try {
        const data = normalizeModelData(kind, safe);
        if (kind === "run" && typeof model.findFirst === "function" && typeof model.update === "function") {
          const existing = await model.findFirst({ where: { empresaId: safe.empresaId, idempotencyKey: String(safe.idempotencyKey || "") } });
          if (existing) {
            const mutable = { ...data };
            delete mutable.id;
            delete mutable.empresaId;
            delete mutable.idempotencyKey;
            delete mutable.createdAt;
            return model.update({ where: { id: existing.id }, data: { ...mutable, revision: { increment: 1 }, updatedAt: data.occurredAt, completedAt: ["COMPLETED", "FAILED"].includes(data.status) ? data.occurredAt : undefined } });
          }
        }
        if (kind === "draft" && safe.draft?.draftId && typeof model.findFirst === "function" && typeof model.update === "function") {
          const existing = await model.findFirst({ where: { id: String(safe.draft.draftId), empresaId: safe.empresaId } });
          if (existing) return model.update({ where: { id: existing.id }, data: { eventJson: data.eventJson, updatedAt: data.updatedAt } });
        }
        return await model.create({ data });
      } catch (error) {
        logger.warn?.("ai_commerce_audit_persist_failed", { kind, model: modelName, code: String(error?.code || "AUDIT_WRITE_FAILED") });
        throw auditError("AI_AUDIT_PERSIST_FAILED", "Nao foi possivel registrar a auditoria comercial.", 503);
      }
    }
    // A fundacao pode ser ensaiada antes da migration. Nunca imprimir payload.
    logger.info?.("ai_commerce_audit_event", { kind, empresaId: safe.empresaId || null, runId: safe.runId || null, status: safe.status || null });
    return safe;
  }

  return Object.freeze({
    version: AUDIT_SCHEMA_VERSION,
    recordRunStarted: (payload) => persist("run", { ...payload, status: "STARTED", occurredAt: now() }),
    recordRunCompleted: (payload) => persist("run", { ...payload, status: "COMPLETED", occurredAt: now() }),
    recordRunFailed: (payload) => persist("run", { ...payload, status: "FAILED", occurredAt: now() }),
    recordTurn: (payload) => persist("turn", { ...payload, occurredAt: now() }),
    recordToolInvocation: (payload) => persist("tool", { ...payload, occurredAt: now() }),
    recordDecision: (payload) => persist("decision", { ...payload, occurredAt: now() }),
    recordDraft: (payload) => persist("draft", { ...payload, occurredAt: now() }),
    recordPolicyDecision: (payload) => persist("policy", { ...payload, occurredAt: now() }),
    recordHandoff: (payload) => persist("handoff", { ...payload, occurredAt: now() }),
    sanitize: sanitizeAuditPayload,
  });
}

function modelCandidates(kind) {
  return {
    run: ["aICommerceRun", "aiCommerceRun"],
    turn: ["aICommerceTurn", "aiCommerceTurn"],
    tool: ["aICommerceToolInvocation", "aiCommerceToolInvocation"],
    decision: ["aICommerceDecision", "aiCommerceDecision"],
    draft: ["aICommerceDraft", "aiCommerceDraft"],
    policy: ["aICommercePolicyDecision", "aiCommercePolicyDecision"],
    handoff: ["aICommerceHandoff", "aiCommerceHandoff"],
  }[kind] || [];
}

function normalizeModelData(kind, payload) {
  // Model adapters may map this envelope to their exact Prisma fields. The
  // generic fields intentionally avoid prompts, provider secrets and raw PII.
  const parsedOccurredAt = payload.occurredAt instanceof Date ? payload.occurredAt : new Date(payload.occurredAt || Date.now());
  const occurredAt = Number.isNaN(parsedOccurredAt.getTime()) ? new Date() : parsedOccurredAt;
  const retentionUntil = payload.retentionUntil ? new Date(payload.retentionUntil) : new Date(occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const base = {
    ...(payload.empresaId ? { empresaId: payload.empresaId } : {}),
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    ...(payload.runId ? { runId: String(payload.runId).slice(0, 128) } : {}),
    ...(payload.turnId ? { turnId: String(payload.turnId).slice(0, 128) } : {}),
    status: String(payload.status || "RECORDED").slice(0, 40),
    correlationId: String(payload.correlationId || "").slice(0, 128) || null,
    eventJson: safeJson(payload, 64000),
    retentionUntil: Number.isNaN(retentionUntil.getTime()) ? new Date(occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000) : retentionUntil,
  };
  if (kind === "run") return {
    ...base,
    // Child audit rows reference the durable AICommerceRun primary key. The
    // orchestrator deliberately uses the opaque runId as that key so SQLite,
    // PostgreSQL and the tenant relation gate share one invariant.
    id: String(payload.runId || `audit-${occurredAt.getTime()}`).slice(0, 128),
    idempotencyKey: String(payload.idempotencyKey || `audit:${payload.runId || occurredAt.getTime()}`).slice(0, 200),
    mode: String(payload.mode || "OFF").slice(0, 40),
    state: String(payload.state || "IDLE").slice(0, 40),
    policyVersion: String(payload.policyVersion || "ai-commerce-policy.v1").slice(0, 100),
    messageRevision: payload.messageRevision === undefined ? null : String(payload.messageRevision).slice(0, 80),
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  if (kind === "turn") return {
    ...base,
    turnNumber: Number.isSafeInteger(payload.turn) ? payload.turn : 0,
    state: String(payload.state || "DISCOVERY").slice(0, 40),
    decisionJson: safeJson(payload.decision || {}, 24000),
    toolResultsJson: safeJson(payload.toolResults || {}, 32000),
    latencyMs: Number.isFinite(payload.durationMs) ? Math.max(0, Math.round(payload.durationMs)) : null,
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    occurredAt,
  };
  if (kind === "tool") {
    // The closed tool registry sends tenant/run metadata inside `context`.
    // Promote only those server-created fields to the tenant-scoped audit row;
    // never trust tool input for tenant or actor identity.
    const context = payload.context && typeof payload.context === "object" ? payload.context : {};
    return {
    ...base,
    empresaId: payload.empresaId || context.empresaId,
    conversationId: payload.conversationId || context.conversationId,
    runId: payload.runId || context.runId ? String(payload.runId || context.runId).slice(0, 128) : undefined,
    correlationId: payload.correlationId || context.correlationId ? String(payload.correlationId || context.correlationId).slice(0, 128) : null,
    name: String(payload.name || "unknown").slice(0, 100),
    classification: String(payload.classification || "READ").slice(0, 40),
    idempotencyKey: payload.idempotencyKey || context.idempotencyKey ? String(payload.idempotencyKey || context.idempotencyKey).slice(0, 200) : null,
    inputJsonSanitized: safeJson(payload.input || {}, 24000),
    outputJsonSanitized: payload.output === undefined ? null : safeJson(payload.output, 32000),
    errorCode: payload.errorCode ? String(payload.errorCode).slice(0, 100) : null,
    latencyMs: Number.isFinite(payload.durationMs) ? Math.max(0, Math.round(payload.durationMs)) : null,
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    occurredAt,
    };
  }
  if (kind === "decision") {
    // AICommerceDecision has no generic `status` column. Keep status in the
    // event envelope for audit readability, but never send it to Prisma.
    const { status: _status, ...decisionBase } = base;
    return {
    ...decisionBase,
    intent: payload.decision?.intent ? String(payload.decision.intent).slice(0, 100) : null,
    confidence: payload.decision?.confidence ? String(payload.decision.confidence).slice(0, 40) : null,
    nextAction: payload.decision?.nextAction ? String(payload.decision.nextAction).slice(0, 100) : null,
    missingInformationJson: safeJson(payload.decision?.missingInformation || [], 8000),
    requestedToolsJson: safeJson(payload.decision?.requestedTools || [], 16000),
    draftResponse: payload.decision?.draftResponse ? String(payload.decision.draftResponse).slice(0, 2000) : null,
    offerIdsJson: safeJson(payload.decision?.offerIds || [], 4000),
    handoffReason: payload.decision?.handoffReason ? String(payload.decision.handoffReason).slice(0, 500) : null,
    safetyFlagsJson: safeJson(payload.decision?.safetyFlags || [], 4000),
    policyFlagsJson: safeJson(payload.decision?.policyFlags || [], 4000),
    decisionJson: safeJson(payload.decision || {}, 24000),
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    occurredAt,
    };
  }
  if (kind === "draft") {
    const draft = payload.draft || {};
    return {
      ...base,
      runId: String(payload.runId || draft.runId || "").slice(0, 128),
      conversationId: payload.conversationId || draft.conversationId,
      textSanitized: String(draft.text || "").slice(0, 2000),
      offersJson: safeJson(draft.productOffers || [], 32000),
      questionsJson: safeJson(draft.questions || [], 8000),
      actionsJson: safeJson(draft.actions || [], 8000),
      warningsJson: safeJson(draft.warnings || [], 8000),
      requiresHumanApproval: draft.requiresHumanApproval !== false,
      conversationRevision: draft.conversationRevision ? String(draft.conversationRevision).slice(0, 80) : null,
      revision: Number.isSafeInteger(draft.revision) ? draft.revision : 1,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : new Date(occurredAt.getTime() + 15 * 60 * 1000),
      actorUsuarioId: payload.actorUsuarioId || null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }
  if (kind === "policy") return {
    ...base,
    action: String(payload.action || "UNSPECIFIED").slice(0, 100),
    reasonCode: payload.reasonCode ? String(payload.reasonCode).slice(0, 120) : null,
    detailsJson: safeJson(payload.details || {}, 16000),
    draftId: payload.draftId || null,
    actorUsuarioId: payload.actorUsuarioId || null,
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    occurredAt,
  };
  if (kind === "handoff") return {
    ...base,
    reason: String(payload.reason || "Handoff solicitado.").slice(0, 500),
    summarySanitized: payload.summary ? String(payload.summary).slice(0, 1500) : null,
    draftId: payload.draftId || null,
    offerId: payload.offerId || null,
    queueKey: payload.queueKey || null,
    idempotencyKey: payload.idempotencyKey || null,
    actorUsuarioId: payload.actorUsuarioId || null,
    revision: Number.isSafeInteger(payload.revision) ? payload.revision : 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  return base;
}

function safeJson(value, maxBytes) {
  let serialized;
  try { serialized = JSON.stringify(value); } catch { return JSON.stringify({ truncated: true, reason: "SERIALIZATION_FAILED" }); }
  if (Buffer.byteLength(serialized, "utf8") <= maxBytes) return serialized;
  return JSON.stringify({ truncated: true, reason: "AUDIT_PAYLOAD_LIMIT", maxBytes });
}

function sanitizeAuditPayload(payload = {}) {
  const source = payload && typeof payload === "object"
    ? {
      ...payload,
      ...(payload.occurredAt instanceof Date ? { occurredAt: payload.occurredAt.toISOString() } : {}),
      ...(payload.retentionUntil instanceof Date ? { retentionUntil: payload.retentionUntil.toISOString() } : {}),
    }
    : payload;
  const safe = sanitizeData(source);
  if (!safe || typeof safe !== "object") return {};
  const forbidden = ["prompt", "rawPrompt", "systemPrompt", "chainOfThought", "chain_of_thought", "reasoning", "secret", "token", "cookie", "authorization", "credential", "password", "databaseUrl", "apiKey", "api_key", "privateKey", "private_key", "accessKey", "access_key"];
  for (const key of Object.keys(safe)) if (forbidden.some((fragment) => key.toLowerCase().includes(fragment.toLowerCase()))) safe[key] = "[redacted]";
  return redactSensitiveAuditData(safe);
}

function redactSensitiveAuditData(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitiveAuditData(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    String(key).slice(0, 120),
    /api.?key|private.?key|access.?key|password|token|secret|cookie|authorization|credential|database|dsn|chain.?of.?thought|prompt/i.test(key)
      ? "[redacted]"
      : redactSensitiveAuditData(item, depth + 1),
  ]));
}

function auditError(code, message, status) { const error = new Error(message); error.name = "AICommerceAuditError"; error.code = code; error.status = status; return error; }

module.exports = { AUDIT_SCHEMA_VERSION, createAICommerceAudit, sanitizeAuditPayload };
