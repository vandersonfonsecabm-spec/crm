const crypto = require("node:crypto");

const DEFAULT_IDENTITY = Object.freeze({
  wabaId: "test-waba-reserved-f1c2c",
  phoneNumberId: "test-phone-reserved-f1c2c",
  senderId: "15550000001",
});

function createWhatsAppMetaSimulator({
  endpoint,
  identity = DEFAULT_IDENTITY,
  env = process.env,
} = {}) {
  if (env.NODE_ENV !== "test"
    && !(env.NODE_ENV === "development" && env.WHATSAPP_META_SIMULATOR_ENABLED === "true")) {
    throw new Error("Simulador Meta indisponivel neste ambiente.");
  }
  if (typeof endpoint !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/webhooks\/whatsapp$/.test(endpoint)) {
    throw new Error("Simulador Meta exige endpoint local.");
  }
  const normalizedIdentity = validateIdentity(identity);
  const appSecret = crypto.randomBytes(32).toString("hex");

  function configureEnvironment(target = env) {
    target.WHATSAPP_APP_SECRET = appSecret;
    target.WHATSAPP_INTEGRATION_ENABLED = "true";
    target.WHATSAPP_INBOUND_ENABLED = "true";
  }

  async function send(payload, { validSignature = true } = {}) {
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    return sendRaw(rawBody, { validSignature });
  }

  async function sendRaw(rawBody, { validSignature = true } = {}) {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
    const signature = validSignature
      ? sign(body)
      : `sha256=${"0".repeat(64)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-hub-signature-256": signature,
      },
      body,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text && response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text || null,
    };
  }

  function text({ id = syntheticId("text"), body = "Mensagem sintetica F1C-2C", timestamp } = {}) {
    return messageEnvelope({
      id,
      timestamp,
      type: "text",
      text: { body },
    });
  }

  function media({ id = syntheticId("media"), type = "image", timestamp } = {}) {
    return messageEnvelope({
      id,
      timestamp,
      type,
      [type]: { id: "test-media-reserved-f1c2c" },
    });
  }

  function unknown({ id = syntheticId("unknown"), timestamp } = {}) {
    return messageEnvelope({
      id,
      timestamp,
      type: "test_unknown",
      test_unknown: { marker: "reserved-f1c2c" },
    });
  }

  function status({ messageId = syntheticId("status-message"), state = "delivered", timestamp } = {}) {
    return envelope({
      statuses: [{
        id: messageId,
        status: state,
        timestamp: timestamp || currentUnixTimestamp(),
        recipient_id: normalizedIdentity.senderId,
      }],
    });
  }

  function forIdentity(nextIdentity) {
    return createWhatsAppMetaSimulator({ endpoint, identity: nextIdentity, env });
  }

  function messageEnvelope(message) {
    return envelope({
      contacts: [{
        profile: { name: "Contato Sintetico F1C2C" },
        wa_id: normalizedIdentity.senderId,
      }],
      messages: [{
        ...message,
        from: normalizedIdentity.senderId,
        timestamp: message.timestamp || currentUnixTimestamp(),
      }],
    });
  }

  function envelope(value) {
    return {
      object: "whatsapp_business_account",
      entry: [{
        id: normalizedIdentity.wabaId,
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: normalizedIdentity.phoneNumberId },
            ...value,
          },
        }],
      }],
    };
  }

  function sign(rawBody) {
    return `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  }

  return {
    configureEnvironment,
    forIdentity,
    identity: { ...normalizedIdentity },
    media,
    send,
    sendRaw,
    status,
    text,
    unknown,
  };
}

function validateIdentity(identity) {
  const result = {};
  for (const key of ["wabaId", "phoneNumberId", "senderId"]) {
    const value = String(identity?.[key] || "").trim();
    if (!value || value.length > 128 || /[\u0000-\u0020\u007f]/.test(value)) {
      throw new Error("Identidade sintetica invalida.");
    }
    result[key] = value;
  }
  if (!/^\d{8,15}$/.test(result.senderId)) throw new Error("Remetente sintetico invalido.");
  return result;
}

function syntheticId(kind) {
  return `test-${kind}-${crypto.randomUUID()}`;
}

function currentUnixTimestamp() {
  return String(Math.floor(Date.now() / 1000));
}

module.exports = {
  DEFAULT_IDENTITY,
  createWhatsAppMetaSimulator,
};
