const crypto = require("node:crypto");

function createMessengerMetaSimulator({
  endpoint,
  identity,
  appSecret = crypto.randomBytes(32).toString("hex"),
} = {}) {
  assertSafeRuntime(endpoint);
  validateIdentity(identity);

  function forIdentity(nextIdentity) {
    return createMessengerMetaSimulator({ endpoint, identity: nextIdentity, appSecret });
  }

  function configureEnvironment(target) {
    target.MESSENGER_INTEGRATION_ENABLED = "true";
    target.MESSENGER_INBOUND_ENABLED = "true";
    target.MESSENGER_APP_SECRET = appSecret;
    target.MESSENGER_WEBHOOK_VERIFY_TOKEN = "test-only-messenger-verify-token";
  }

  function text({ id, body = "Mensagem sintetica Messenger", timestamp = 1784390400000 } = {}) {
    return envelope({
      senderId: identity.psid,
      timestamp,
      message: { mid: id || `messenger-text-${Date.now()}`, text: body },
    });
  }

  function media({ id, timestamp = 1784390401000 } = {}) {
    return envelope({
      senderId: identity.psid,
      timestamp,
      message: {
        mid: id || `messenger-media-${Date.now()}`,
        text: "Legenda de midia nao processada sem suporte ao anexo",
        attachments: [{ type: "image", payload: { url: "https://example.invalid/not-fetched" } }],
      },
    });
  }

  function unknown({ id, timestamp = 1784390402000 } = {}) {
    return envelope({
      senderId: identity.psid,
      timestamp,
      message: { mid: id || `messenger-unknown-${Date.now()}`, unsupported: true },
    });
  }

  function status({ timestamp = 1784390403000 } = {}) {
    return envelope({
      senderId: identity.psid,
      timestamp,
      read: { watermark: timestamp },
    });
  }

  function echo({ id, timestamp = 1784390404000, withAttachment = false } = {}) {
    return {
      object: "page",
      entry: [{
        id: identity.messengerPageId,
        time: timestamp,
        messaging: [{
          sender: { id: identity.messengerPageId },
          recipient: { id: identity.psid },
          timestamp,
          message: {
            mid: id || `messenger-echo-${Date.now()}`,
            text: "Echo sintetico ignorado",
            is_echo: true,
            ...(withAttachment ? {
              attachments: [{
                type: "image",
                payload: { url: "https://example.invalid/not-fetched" },
              }],
            } : {}),
          },
        }],
      }],
    };
  }

  function envelope(event) {
    return {
      object: "page",
      entry: [{
        id: identity.messengerPageId,
        time: event.timestamp,
        messaging: [{
          sender: { id: event.senderId },
          recipient: { id: identity.messengerPageId },
          timestamp: event.timestamp,
          ...(event.message ? { message: event.message } : {}),
          ...(event.read ? { read: event.read } : {}),
        }],
      }],
    };
  }

  async function send(payload, { validSignature = true } = {}) {
    const raw = Buffer.from(JSON.stringify(payload), "utf8");
    return sendRaw(raw, { validSignature });
  }

  async function sendRaw(raw, { validSignature = true } = {}) {
    const signatureSecret = validSignature ? appSecret : `${appSecret}-invalid`;
    const signature = crypto.createHmac("sha256", signatureSecret).update(raw).digest("hex");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body: raw,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }

  return {
    configureEnvironment,
    echo,
    forIdentity,
    identity: { ...identity },
    media,
    send,
    sendRaw,
    status,
    text,
    unknown,
  };
}

function assertSafeRuntime(endpoint) {
  const developmentEnabled = process.env.NODE_ENV === "development"
    && process.env.MESSENGER_META_SIMULATOR_ENABLED === "true";
  if (process.env.NODE_ENV !== "test" && !developmentEnabled) {
    throw new Error("Simulador Messenger disponivel somente em test/dev explicito.");
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Endpoint local do simulador Messenger invalido.");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Simulador Messenger exige endpoint HTTP local.");
  }
}

function validateIdentity(identity) {
  for (const field of ["messengerPageId", "psid"]) {
    if (typeof identity?.[field] !== "string" || !identity[field]) {
      throw new Error("Identidade sintetica Messenger invalida.");
    }
  }
}

module.exports = {
  createMessengerMetaSimulator,
};
