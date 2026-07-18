const crypto = require("node:crypto");
const express = require("express");

const WHATSAPP_WEBHOOK_PATH = "/webhooks/whatsapp";
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_MODE_LENGTH = 32;
const MAX_TOKEN_LENGTH = 256;
const MAX_CHALLENGE_LENGTH = 256;
const ALLOWED_QUERY_FIELDS = new Set(["hub.mode", "hub.verify_token", "hub.challenge"]);

function mountWhatsAppWebhookRoutes({ app, env = process.env, processWebhook = processorNotReady }) {
  app.get(WHATSAPP_WEBHOOK_PATH, (req, res) => handleVerification(req, res, env));
  app.post(
    WHATSAPP_WEBHOOK_PATH,
    (req, res, next) => inboundGate(req, res, next, env),
    requireJsonContentType,
    express.raw({ type: () => true, limit: MAX_WEBHOOK_BODY_BYTES, inflate: false }),
    (req, res) => handleWebhook(req, res, env, processWebhook),
  );
  app.use(WHATSAPP_WEBHOOK_PATH, whatsappWebhookErrorHandler);
}

function handleVerification(req, res, env) {
  const configuredToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!isEnabled(env.WHATSAPP_INTEGRATION_ENABLED) || !hasConfiguredSecret(configuredToken)) {
    return res.sendStatus(404);
  }

  const query = readVerificationQuery(req.query);
  if (!query) return sendError(res, 400, "WEBHOOK_VERIFICATION_INVALID");
  if (query.mode !== "subscribe") return sendError(res, 403, "WEBHOOK_VERIFICATION_REJECTED");
  if (!safeSecretEqual(query.verifyToken, configuredToken)) {
    return sendError(res, 403, "WEBHOOK_VERIFICATION_REJECTED");
  }

  return res.status(200).type("text/plain").send(query.challenge);
}

function inboundGate(req, res, next, env) {
  if (
    !isEnabled(env.WHATSAPP_INTEGRATION_ENABLED)
    || !isEnabled(env.WHATSAPP_INBOUND_ENABLED)
    || !hasConfiguredSecret(env.WHATSAPP_APP_SECRET)
  ) {
    return res.sendStatus(404);
  }
  return next();
}

function requireJsonContentType(req, res, next) {
  const contentType = readSingleHeader(req, "content-type");
  const contentEncoding = readSingleHeader(req, "content-encoding");
  if (
    !contentType
    || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:"?utf-8"?))?\s*$/i.test(contentType.trim())
    || (contentEncoding && contentEncoding.toLowerCase() !== "identity")
  ) {
    return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  return next();
}

async function handleWebhook(req, res, env, processWebhook) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return sendError(res, 400, "WEBHOOK_PAYLOAD_INVALID");
  }

  const signature = readSingleHeader(req, "x-hub-signature-256");
  if (!isValidHmacSignature(req.body, signature, env.WHATSAPP_APP_SECRET)) {
    return sendError(res, 401, "WEBHOOK_SIGNATURE_INVALID");
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return sendError(res, 400, "WEBHOOK_PAYLOAD_INVALID");
  }

  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || payload.object !== "whatsapp_business_account"
    || !Array.isArray(payload.entry)
  ) {
    return sendError(res, 400, "WEBHOOK_PAYLOAD_INVALID");
  }

  try {
    const result = await processWebhook(payload, { env });
    return res.status(200).json(result);
  } catch (error) {
    if (isSafeProcessorError(error)) return sendError(res, error.status, error.code);
    return sendError(res, 503, "WEBHOOK_STORAGE_UNAVAILABLE");
  }
}

async function processorNotReady() {
  const error = new Error("WEBHOOK_PROCESSOR_NOT_READY");
  error.status = 503;
  error.code = "WEBHOOK_PROCESSOR_NOT_READY";
  throw error;
}

function isSafeProcessorError(error) {
  return Number.isInteger(error?.status)
    && error.status >= 400
    && error.status <= 599
    && typeof error.code === "string"
    && /^WEBHOOK_[A-Z0-9_]+$/.test(error.code);
}

function readVerificationQuery(query) {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;
  const fields = Object.keys(query);
  if (fields.length !== ALLOWED_QUERY_FIELDS.size || fields.some((field) => !ALLOWED_QUERY_FIELDS.has(field))) {
    return null;
  }

  const mode = readScalar(query["hub.mode"], MAX_MODE_LENGTH);
  const verifyToken = readScalar(query["hub.verify_token"], MAX_TOKEN_LENGTH);
  const challenge = readScalar(query["hub.challenge"], MAX_CHALLENGE_LENGTH);
  return mode && verifyToken && challenge ? { mode, verifyToken, challenge } : null;
}

function readScalar(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function safeSecretEqual(received, expected) {
  const receivedDigest = crypto.createHash("sha256").update(String(received), "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(String(expected), "utf8").digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function isValidHmacSignature(rawBody, signatureHeader, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !hasConfiguredSecret(appSecret)) return false;
  const receivedDigest = parseSignatureHeader(signatureHeader);
  if (!receivedDigest) return false;
  const expectedDigest = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function parseSignatureHeader(value) {
  if (typeof value !== "string") return null;
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(value);
  return match ? Buffer.from(match[1], "hex") : null;
}

function readSingleHeader(req, name) {
  const values = [];
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === name) values.push(rawHeaders[index + 1]);
  }
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  return values[0];
}

function whatsappWebhookErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return sendError(res, 413, "WEBHOOK_PAYLOAD_TOO_LARGE");
  if (error?.type === "encoding.unsupported") return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  return sendError(res, 500, "WEBHOOK_INTERNAL_ERROR");
}

function sendError(res, status, codigo) {
  return res.status(status).json({ erro: "Requisicao nao aceita.", codigo });
}

function hasConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isEnabled(value) {
  return value === "true";
}

module.exports = {
  MAX_WEBHOOK_BODY_BYTES,
  WHATSAPP_WEBHOOK_PATH,
  isValidHmacSignature,
  mountWhatsAppWebhookRoutes,
  parseSignatureHeader,
  readSingleHeader,
  readVerificationQuery,
  safeSecretEqual,
};
