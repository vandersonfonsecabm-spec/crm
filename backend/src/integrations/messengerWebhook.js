const express = require("express");
const {
  isValidHmacSignature,
  readSingleHeader,
  readVerificationQuery,
  safeSecretEqual,
} = require("./whatsappWebhook");

const MESSENGER_WEBHOOK_PATH = "/webhooks/messenger";
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

function mountMessengerWebhookRoutes({ app, env = process.env, processWebhook = processorNotReady }) {
  app.get(MESSENGER_WEBHOOK_PATH, (req, res) => handleVerification(req, res, env));
  app.post(
    MESSENGER_WEBHOOK_PATH,
    (req, res, next) => inboundGate(req, res, next, env),
    requireJsonContentType,
    express.raw({ type: () => true, limit: MAX_WEBHOOK_BODY_BYTES, inflate: false }),
    (req, res) => handleWebhook(req, res, env, processWebhook),
  );
  app.use(MESSENGER_WEBHOOK_PATH, messengerWebhookErrorHandler);
}

function handleVerification(req, res, env) {
  const configuredToken = env.MESSENGER_WEBHOOK_VERIFY_TOKEN;
  if (!isEnabled(env.MESSENGER_INTEGRATION_ENABLED) || !hasConfiguredSecret(configuredToken)) {
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
    !isEnabled(env.MESSENGER_INTEGRATION_ENABLED)
    || !isEnabled(env.MESSENGER_INBOUND_ENABLED)
    || !hasConfiguredSecret(env.MESSENGER_APP_SECRET)
  ) {
    return res.sendStatus(404);
  }
  return next();
}

function requireJsonContentType(req, res, next) {
  const contentType = readSingleHeader(req, "content-type");
  if (
    !contentType
    || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:"?utf-8"?))?\s*$/i.test(contentType.trim())
    || !hasSupportedContentEncoding(req)
  ) {
    return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  return next();
}

function hasSupportedContentEncoding(req) {
  const values = readRawHeaderValues(req, "content-encoding");
  return values.length === 0
    || (values.length === 1 && values[0].trim().toLowerCase() === "identity");
}

function readRawHeaderValues(req, name) {
  const values = [];
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === name && typeof rawHeaders[index + 1] === "string") {
      values.push(rawHeaders[index + 1]);
    }
  }
  return values;
}

async function handleWebhook(req, res, env, processWebhook) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return sendError(res, 400, "WEBHOOK_PAYLOAD_INVALID");
  }

  const signature = readSingleHeader(req, "x-hub-signature-256");
  if (!isValidHmacSignature(req.body, signature, env.MESSENGER_APP_SECRET)) {
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
    || payload.object !== "page"
    || !Array.isArray(payload.entry)
  ) {
    return sendError(res, 400, "WEBHOOK_PAYLOAD_INVALID");
  }

  try {
    await processWebhook(payload, { env });
    return res.status(200).json({ accepted: true });
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

function messengerWebhookErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return sendError(res, 413, "WEBHOOK_PAYLOAD_TOO_LARGE");
  if (error?.type === "encoding.unsupported") return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  return sendError(res, 500, "WEBHOOK_INTERNAL_ERROR");
}

function sendError(res, status, codigo) {
  return res.status(status).json({ erro: "Requisicao nao aceita.", codigo });
}

function hasConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length >= 8;
}

function isEnabled(value) {
  return value === "true";
}

module.exports = {
  MESSENGER_WEBHOOK_PATH,
  MAX_WEBHOOK_BODY_BYTES,
  mountMessengerWebhookRoutes,
};
