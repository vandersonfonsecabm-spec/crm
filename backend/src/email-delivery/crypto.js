"use strict";

const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";

function sealDeliveryToken(token, context, { env = process.env } = {}) {
  const plaintext = String(token || "");
  if (!plaintext) throw deliveryCryptoError("EMAIL_DELIVERY_TOKEN_REQUIRED");
  const key = currentKey(env, true);
  const aad = associatedData(context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: FORMAT_VERSION,
    alg: ALGORITHM,
    aad,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function openDeliveryToken(payload, context, { env = process.env } = {}) {
  const parsed = parsePayload(payload);
  const aad = associatedData(context);
  if (parsed.aad !== aad) throw deliveryCryptoError("EMAIL_DELIVERY_CONTEXT_INVALID");
  const keys = [currentKey(env, true), previousKey(env)].filter(Boolean);
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, "base64"));
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(parsed.data, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Rotation fallback is deliberately silent. No token/ciphertext reaches logs.
    }
  }
  throw deliveryCryptoError("EMAIL_DELIVERY_DECRYPTION_FAILED");
}

function assertDeliveryEncryptionReady(env = process.env) {
  currentKey(env, true);
  previousKey(env);
  return true;
}

function currentKey(env, required) {
  return parseKey(env.SECURITY_EMAIL_DELIVERY_ENCRYPTION_KEY, required);
}

function previousKey(env) {
  const raw = String(env.SECURITY_EMAIL_DELIVERY_ENCRYPTION_KEY_PREVIOUS || "").trim();
  return raw ? parseKey(raw, true) : null;
}

function parseKey(value, required = false) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    if (required) throw deliveryCryptoError("EMAIL_DELIVERY_ENCRYPTION_KEY_REQUIRED");
    return null;
  }
  const base64 = Buffer.from(normalized, "base64");
  if (base64.length === 32) return base64;
  const hex = Buffer.from(normalized, "hex");
  if (hex.length === 32) return hex;
  if (normalized.length >= 32) return crypto.createHash("sha256").update(normalized).digest();
  throw deliveryCryptoError("EMAIL_DELIVERY_ENCRYPTION_KEY_INVALID");
}

function associatedData(context) {
  const empresaId = Number(context?.empresaId);
  const deliveryId = String(context?.deliveryId || "").trim();
  const kind = String(context?.kind || "").trim();
  const targetId = String(context?.targetId || "").trim();
  const targetVersion = Number(context?.targetVersion);
  if (!Number.isSafeInteger(empresaId) || empresaId < 1 || !deliveryId || !kind || !targetId || !Number.isSafeInteger(targetVersion) || targetVersion < 1) {
    throw deliveryCryptoError("EMAIL_DELIVERY_CONTEXT_INVALID");
  }
  return ["security-email-delivery", FORMAT_VERSION, empresaId, deliveryId, kind, targetId, targetVersion].join("|");
}

function parsePayload(payload) {
  let parsed;
  try {
    parsed = JSON.parse(String(payload || ""));
  } catch {
    throw deliveryCryptoError("EMAIL_DELIVERY_PAYLOAD_INVALID");
  }
  if (!parsed || parsed.version !== FORMAT_VERSION || parsed.alg !== ALGORITHM || typeof parsed.aad !== "string" || typeof parsed.iv !== "string" || typeof parsed.tag !== "string" || typeof parsed.data !== "string") {
    throw deliveryCryptoError("EMAIL_DELIVERY_PAYLOAD_INVALID");
  }
  return parsed;
}

function deliveryCryptoError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  assertDeliveryEncryptionReady,
  openDeliveryToken,
  sealDeliveryToken,
};
