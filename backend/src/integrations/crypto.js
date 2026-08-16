const crypto = require("node:crypto");

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function parseEncryptionKey(value, { required = false } = {}) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    if (required) {
      throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes obrigatoria.");
    }
    return null;
  }

  const base64 = Buffer.from(normalized, "base64");
  // Keep the exact legacy decoder semantics. Node accepts padded, unpadded,
  // base64url-compatible and non-canonical base64 input here; changing that
  // behavior could make existing ciphertext unreadable during rotation.
  if (base64.length === 32) {
    return base64;
  }

  const hex = Buffer.from(normalized, "hex");
  if (hex.length === 32) {
    return hex;
  }

  if (normalized.length >= 32) {
    return crypto.createHash("sha256").update(normalized).digest();
  }

  throw integrationCryptoError("ENCRYPTION_KEY_INVALID", "Chave de criptografia de integracoes invalida.");
}

function getEncryptionKeys({ requireCurrent = false } = {}) {
  const current = parseEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY, { required: requireCurrent });
  const previousValue = String(process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS || "").trim();
  const previous = previousValue ? parseEncryptionKey(previousValue) : null;

  if (previous && !current) {
    throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "A chave atual e obrigatoria quando existe uma chave anterior.");
  }
  if (current && previous && crypto.timingSafeEqual(current, previous)) {
    throw integrationCryptoError("ENCRYPTION_KEY_ROTATION_INVALID", "As chaves atual e anterior devem ser diferentes.");
  }
  return { current, previous };
}

function getEncryptionKey() {
  return getEncryptionKeys({ requireCurrent: false }).current;
}

function requireEncryptionKey() {
  const key = getEncryptionKeys({ requireCurrent: true }).current;
  if (!key) {
    throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes obrigatoria.");
  }
  return key;
}

function encryptCredentials(credentials) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const key = requireEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: FORMAT_VERSION,
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decryptCredentials(payload, options = {}) {
  return decryptPayload(payload, { detailed: options?.detailed === true, allowPrevious: options?.allowPrevious !== false });
}

function encryptCredentialsWithContext(credentials, context) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const key = requireEncryptionKey();
  const aad = contextAssociatedData(context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
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

function decryptCredentialsWithContext(payload, context, options = {}) {
  const aad = contextAssociatedData(context);
  return decryptPayload(payload, {
    aad,
    detailed: options?.detailed === true,
    allowPrevious: options?.allowPrevious !== false,
  });
}

function decryptCredentialsDetailed(payload, options = {}) {
  return decryptCredentials(payload, { ...options, detailed: true });
}

function decryptCredentialsWithContextDetailed(payload, context, options = {}) {
  return decryptCredentialsWithContext(payload, context, { ...options, detailed: true });
}

function decryptPayload(payload, { aad = null, detailed = false, allowPrevious = true } = {}) {
  if (payload === null || payload === undefined) return null;

  const parsed = parsePayload(payload);
  if (aad !== null && parsed.aad !== aad) {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_CONTEXT_INVALID", "Contexto de credenciais invalido.");
  }

  const { current, previous } = getEncryptionKeys({ requireCurrent: true });
  const primary = decryptWithKey(parsed, current, aad);
  if (primary.ok) return detailed ? { credentials: primary.credentials, keySource: "current" } : primary.credentials;
  if (!allowPrevious || !previous || !primary.authenticationFailure) {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_DECRYPTION_FAILED", "Credenciais de integracao nao puderam ser lidas com seguranca.");
  }

  const fallback = decryptWithKey(parsed, previous, aad);
  if (!fallback.ok) {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_DECRYPTION_FAILED", "Credenciais de integracao nao puderam ser lidas com seguranca.");
  }
  return detailed ? { credentials: fallback.credentials, keySource: "previous" } : fallback.credentials;
}

function parsePayload(payload) {
  let parsed;
  try {
    parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_INVALID", "Formato de credenciais invalido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== FORMAT_VERSION || parsed.alg !== ALGORITHM || typeof parsed.iv !== "string" || typeof parsed.tag !== "string" || typeof parsed.data !== "string") {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_INVALID", "Formato de credenciais invalido.");
  }
  return parsed;
}

function decryptWithKey(parsed, key, aad) {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, "base64"));
    if (aad !== null) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
    return { ok: true, credentials: JSON.parse(decrypted.toString("utf8")) };
  } catch (error) {
    return { ok: false, authenticationFailure: isAuthenticationFailure(error) };
  }
}

function isAuthenticationFailure(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "ERR_OSSL_BAD_DECRYPT" || message.includes("authenticate") || message.includes("bad decrypt") || message.includes("unable to authenticate");
}

function contextAssociatedData(context) {
  const empresaId = Number(context?.empresaId);
  const canalIntegracaoId = Number(context?.canalIntegracaoId);
  const revision = Number(context?.revision);
  const provider = String(context?.provider || "").trim();
  const reference = String(context?.reference || "").trim();
  if (!Number.isSafeInteger(empresaId) || empresaId < 1 || !Number.isSafeInteger(canalIntegracaoId) || canalIntegracaoId < 1 || !Number.isSafeInteger(revision) || revision < 1 || !provider || !reference) {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_CONTEXT_INVALID", "Contexto de credenciais invalido.");
  }
  return ["meta-credential", FORMAT_VERSION, empresaId, canalIntegracaoId, provider, reference, revision].join("|");
}

function hasEncryptedCredentials(value) {
  return Boolean(value);
}

function assertIntegrationEncryptionReady({ prisma } = {}) {
  if (process.env.NODE_ENV !== "production") return;

  const keys = getEncryptionKeys({ requireCurrent: false });
  if (keys.current) return;
  if (!prisma) {
    throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes obrigatoria em producao.");
  }

  return Promise.all([
    prisma.integracao.count({
      where: {
        ativo: true,
        status: "ATIVA",
        credenciaisCriptografadas: {
          not: null,
        },
      },
    }),
    prisma.metaCredential.count({ where: { status: "ATIVA" } }),
  ]).then(([activeIntegrations, activeMetaCredentials]) => {
    if (activeIntegrations > 0 || activeMetaCredentials > 0) {
      throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes obrigatoria em producao.");
    }
  });
}

function sanitizeCredentials(credentials) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const sanitized = {};
  for (const key of Object.keys(credentials)) {
    sanitized[key] = "***";
  }
  return sanitized;
}

function integrationCryptoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  encryptCredentials,
  encryptCredentialsWithContext,
  decryptCredentials,
  decryptCredentialsWithContext,
  decryptCredentialsDetailed,
  decryptCredentialsWithContextDetailed,
  hasEncryptedCredentials,
  assertIntegrationEncryptionReady,
  sanitizeCredentials,
};
