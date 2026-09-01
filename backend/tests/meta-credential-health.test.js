const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.INTEGRATION_ENCRYPTION_KEY = "meta-credential-health-test-key-with-more-than-32-bytes";

const { encryptCredentialsWithContext } = require("../src/integrations/crypto");
const { isUsableMetaCredential } = require("../src/integrations/metaCredentialHealth");

const baseRow = {
  empresaId: 7,
  canalIntegracaoId: 11,
  provider: "META_WHATSAPP",
  reference: "health-reference",
  revision: 1,
};

function encryptedRow(credentials, overrides = {}) {
  const row = { ...baseRow, ...overrides };
  return {
    ...row,
    ciphertext: encryptCredentialsWithContext(credentials, row),
  };
}

test("Meta credential health requires decryptable non-expired access token", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isUsableMetaCredential(encryptedRow({ accessToken: "synthetic-token", expiresAt: "2026-01-01T01:00:00.000Z" }), { now }), true);
  assert.equal(isUsableMetaCredential(encryptedRow({ accessToken: "synthetic-token", expiresAt: "2025-12-31T23:59:59.000Z" }), { now }), false);
  assert.equal(isUsableMetaCredential({ ...baseRow, ciphertext: "ciphertext-synthetic" }, { now }), false);
  assert.equal(isUsableMetaCredential(encryptedRow({ expiresAt: "2026-01-01T01:00:00.000Z" }), { now }), false);
});

test("Meta credential health rejects ciphertext bound to a different context", () => {
  const row = encryptedRow({ accessToken: "synthetic-token" });
  assert.equal(isUsableMetaCredential({ ...row, canalIntegracaoId: 12 }, { now: new Date() }), false);
  assert.equal(isUsableMetaCredential({ ...row, provider: "META_INSTAGRAM" }, { now: new Date() }), false);
});
