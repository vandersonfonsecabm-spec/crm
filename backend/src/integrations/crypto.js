const crypto = require("node:crypto");

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const value = String(process.env.INTEGRATION_ENCRYPTION_KEY || "").trim();

  if (!value) {
    return null;
  }

  const base64 = Buffer.from(value, "base64");
  if (base64.length === 32) {
    return base64;
  }

  const hex = Buffer.from(value, "hex");
  if (hex.length === 32) {
    return hex;
  }

  if (value.length >= 32) {
    return crypto.createHash("sha256").update(value).digest();
  }

  throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes invalida.");
}

function requireEncryptionKey() {
  const key = getEncryptionKey();
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

function decryptCredentials(payload) {
  if (!payload) return null;

  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed.version !== FORMAT_VERSION || parsed.alg !== ALGORITHM) {
    throw integrationCryptoError("INTEGRATION_CREDENTIALS_INVALID", "Formato de credenciais invalido.");
  }

  const key = requireEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function hasEncryptedCredentials(value) {
  return Boolean(value);
}

function assertIntegrationEncryptionReady({ prisma } = {}) {
  if (process.env.NODE_ENV !== "production") return;

  if (getEncryptionKey()) return;
  if (!prisma) {
    throw integrationCryptoError("ENCRYPTION_KEY_REQUIRED", "Chave de criptografia de integracoes obrigatoria em producao.");
  }

  return prisma.integracao.count({
    where: {
      ativo: true,
      status: "ATIVA",
      credenciaisCriptografadas: {
        not: null,
      },
    },
  }).then((activeIntegrations) => {
    if (activeIntegrations > 0) {
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
  decryptCredentials,
  hasEncryptedCredentials,
  assertIntegrationEncryptionReady,
  sanitizeCredentials,
};
