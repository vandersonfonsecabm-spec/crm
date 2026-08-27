"use strict";

const crypto = require("node:crypto");

const APPROVAL_TOKEN_VERSION = "ai-approval.v1";
const DEFAULT_APPROVAL_TOKEN_TTL_MS = 15 * 60 * 1000;

function createApprovalTokenService({
  secret,
  clock = () => new Date(),
  ttlMs = DEFAULT_APPROVAL_TOKEN_TTL_MS,
} = {}) {
  const signingSecret = normalizeSecret(secret);
  const lifetime = Math.min(30 * 60 * 1000, Math.max(60 * 1000, Number(ttlMs) || DEFAULT_APPROVAL_TOKEN_TTL_MS));

  function issue(input = {}) {
    const claims = normalizeClaims(input);
    const now = clockDate(clock);
    const payload = {
      v: APPROVAL_TOKEN_VERSION,
      ...claims,
      iat: now.getTime(),
      exp: now.getTime() + lifetime,
      nonce: crypto.randomBytes(12).toString("base64url"),
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${sign(encoded, signingSecret)}`;
  }

  function verify(token, expected = {}) {
    const raw = String(token || "").trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw) || raw.length > 1200) {
      throw approvalError("AI_APPROVAL_TOKEN_INVALID", "Token de aprovacao invalido.", 403);
    }
    const [encoded, signature] = raw.split(".");
    const calculated = sign(encoded, signingSecret);
    if (!safeEqual(signature, calculated)) throw approvalError("AI_APPROVAL_TOKEN_INVALID", "Token de aprovacao invalido.", 403);

    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw approvalError("AI_APPROVAL_TOKEN_INVALID", "Token de aprovacao invalido.", 403);
    }
    if (!payload || payload.v !== APPROVAL_TOKEN_VERSION) throw approvalError("AI_APPROVAL_TOKEN_INVALID", "Token de aprovacao invalido.", 403);
    const now = clockDate(clock).getTime();
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= now) throw approvalError("AI_APPROVAL_TOKEN_EXPIRED", "Token de aprovacao expirado.", 409);
    if (!Number.isSafeInteger(payload.iat) || payload.iat > now + 30_000) throw approvalError("AI_APPROVAL_TOKEN_INVALID", "Token de aprovacao invalido.", 403);

    const actual = normalizeClaims(payload);
    const required = normalizeClaims(expected);
    for (const key of ["draftId", "empresaId", "conversationId", "revision", "actorUsuarioId"]) {
      if (actual[key] !== required[key]) throw approvalError("AI_APPROVAL_TOKEN_CONTEXT_MISMATCH", "Token de aprovacao nao pertence a este contexto.", 403);
    }
    return Object.freeze({ ...actual, issuedAt: new Date(payload.iat).toISOString(), expiresAt: new Date(payload.exp).toISOString() });
  }

  return Object.freeze({ issue, verify, version: APPROVAL_TOKEN_VERSION, ttlMs: lifetime });
}

function normalizeSecret(value) {
  const secret = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "utf8");
  if (secret.length === 0) throw new Error("AI_APPROVAL_SIGNING_SECRET_REQUIRED");
  return crypto.createHash("sha256").update("crm-ai-approval-token-v1\0").update(secret).digest();
}

function normalizeClaims(input = {}) {
  const draftId = String(input.draftId || "").trim();
  const empresaId = positiveId(input.empresaId);
  const conversationId = positiveId(input.conversationId);
  const revision = positiveId(input.revision);
  const actorUsuarioId = positiveId(input.actorUsuarioId);
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(draftId) || !empresaId || !conversationId || !revision || !actorUsuarioId) {
    throw approvalError("AI_APPROVAL_TOKEN_CONTEXT_INVALID", "Contexto do token de aprovacao invalido.", 422);
  }
  return { draftId, empresaId, conversationId, revision, actorUsuarioId };
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clockDate(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("AI_APPROVAL_CLOCK_INVALID");
  return date;
}

function positiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function approvalError(code, message, status) {
  const error = new Error(message);
  error.name = "AICommerceApprovalTokenError";
  error.code = code;
  error.status = status;
  return error;
}

module.exports = {
  APPROVAL_TOKEN_VERSION,
  DEFAULT_APPROVAL_TOKEN_TTL_MS,
  createApprovalTokenService,
};
