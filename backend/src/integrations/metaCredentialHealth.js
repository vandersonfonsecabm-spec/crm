const { decryptCredentials, decryptCredentialsWithContext } = require("./crypto");

/**
 * A row being active is not enough to advertise a Meta channel as connected.
 * The ciphertext must decrypt with the current/previous configured key, the
 * decrypted payload must contain an access token, and an optional expiry must
 * still be in the future.  This helper deliberately returns only a boolean so
 * credential material never reaches status responses or logs.
 */
function isUsableMetaCredential(row, { now = new Date() } = {}) {
  if (!row || typeof row.ciphertext !== "string" || !row.ciphertext.trim()) return false;
  if (!Number.isSafeInteger(row.empresaId) || row.empresaId < 1) return false;
  if (!Number.isSafeInteger(row.canalIntegracaoId) || row.canalIntegracaoId < 1) return false;
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) return false;
  if (typeof row.provider !== "string" || !row.provider.trim()) return false;
  if (typeof row.reference !== "string" || !row.reference.trim()) return false;

  try {
    const credentials = decryptCredentialsWithContext(row.ciphertext, {
      empresaId: row.empresaId,
      canalIntegracaoId: row.canalIntegracaoId,
      provider: row.provider,
      reference: row.reference,
      revision: row.revision,
    });
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return false;
    if (typeof credentials.accessToken !== "string" || !credentials.accessToken.trim()) return false;

    if (credentials.expiresAt !== undefined && credentials.expiresAt !== null) {
      const expiresAt = new Date(credentials.expiresAt);
      const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
      if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(currentTime) || expiresAt.getTime() <= currentTime) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isUsableEncryptedCredentials(payload, { now = new Date() } = {}) {
  if (typeof payload !== "string" || !payload.trim()) return false;
  try {
    const credentials = decryptCredentials(payload);
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return false;
    if (credentials.expiresAt !== undefined && credentials.expiresAt !== null) {
      const expiresAt = new Date(credentials.expiresAt);
      const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
      if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(currentTime) || expiresAt.getTime() <= currentTime) return false;
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = { isUsableEncryptedCredentials, isUsableMetaCredential };
