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
  return {
    ...(payload.empresaId ? { empresaId: payload.empresaId } : {}),
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    ...(payload.runId ? { runId: String(payload.runId).slice(0, 128) } : {}),
    ...(payload.turnId ? { turnId: String(payload.turnId).slice(0, 128) } : {}),
    status: String(payload.status || "RECORDED").slice(0, 40),
    schemaVersion: AUDIT_SCHEMA_VERSION,
    correlationId: String(payload.correlationId || "").slice(0, 128) || null,
    eventJson: JSON.stringify(payload),
    occurredAt: payload.occurredAt instanceof Date ? payload.occurredAt : new Date(payload.occurredAt || Date.now()),
  };
}

function sanitizeAuditPayload(payload = {}) {
  const safe = sanitizeData(payload);
  if (!safe || typeof safe !== "object") return {};
  const forbidden = ["prompt", "rawPrompt", "systemPrompt", "chainOfThought", "chain_of_thought", "reasoning", "secret", "token", "cookie", "authorization", "credential", "password", "databaseUrl"];
  for (const key of Object.keys(safe)) if (forbidden.some((fragment) => key.toLowerCase().includes(fragment.toLowerCase()))) safe[key] = "[redacted]";
  if (safe.input) safe.input = sanitizeData(safe.input);
  if (safe.output) safe.output = sanitizeData(safe.output);
  if (safe.context) safe.context = sanitizeData(safe.context);
  return safe;
}

function auditError(code, message, status) { const error = new Error(message); error.name = "AICommerceAuditError"; error.code = code; error.status = status; return error; }

module.exports = { AUDIT_SCHEMA_VERSION, createAICommerceAudit, sanitizeAuditPayload };
