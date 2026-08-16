const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const { after, beforeEach, test } = require("node:test");
const {
  decryptCredentialsDetailed,
  decryptCredentialsWithContextDetailed,
  encryptCredentials,
  encryptCredentialsWithContext,
} = require("../src/integrations/crypto");
const { runRotation } = require("../scripts/reencrypt-integration-credentials.cjs");
const { parseArgs, validateApplyArgs } = require("../scripts/reencrypt-integration-credentials.cjs");

const originalCurrent = process.env.INTEGRATION_ENCRYPTION_KEY;
const originalPrevious = process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
const context = {
  empresaId: 7,
  canalIntegracaoId: 11,
  provider: "META_INSTAGRAM",
  reference: "ref-rotation-test",
  revision: 3,
};

beforeEach(() => {
  delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  process.env.INTEGRATION_ENCRYPTION_KEY = "rotation-current-key-with-more-than-32-bytes";
});

after(() => {
  if (originalCurrent === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = originalCurrent;
  if (originalPrevious === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  else process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
});

test("current key round-trips generic and context-bound credentials", () => {
  const payload = { accessToken: "synthetic-current-token", expiresAt: "2030-01-01T00:00:00.000Z" };
  const encrypted = encryptCredentials(payload);
  assert.deepEqual(decryptCredentialsDetailed(encrypted), { credentials: payload, keySource: "current" });

  const contextual = encryptCredentialsWithContext(payload, context);
  assert.deepEqual(decryptCredentialsWithContextDetailed(contextual, context), { credentials: payload, keySource: "current" });
});

test("legacy-compatible unpadded base64 keys remain readable", () => {
  const legacyBase64 = nodeCrypto.randomBytes(32).toString("base64").replace(/=+$/g, "");
  process.env.INTEGRATION_ENCRYPTION_KEY = legacyBase64;
  const encrypted = encryptCredentials({ accessToken: "base64-compatible" });
  assert.equal(decryptCredentialsDetailed(encrypted).keySource, "current");

  process.env.INTEGRATION_ENCRYPTION_KEY = nodeCrypto.randomBytes(32).toString("base64url");
  const urlSafe = encryptCredentials({ accessToken: "base64url-compatible" });
  assert.equal(decryptCredentialsDetailed(urlSafe).keySource, "current");
});

test("previous key is decrypt-only and new encryption always uses current", () => {
  const legacyKey = "rotation-previous-key-with-more-than-32-bytes";
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = legacyKey;
  assert.throws(() => encryptCredentials({ accessToken: "legacy" }), (error) => error.code === "ENCRYPTION_KEY_REQUIRED");

  process.env.INTEGRATION_ENCRYPTION_KEY = legacyKey;
  delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  const legacy = encryptCredentials({ accessToken: "legacy-token" });
  const legacyContext = encryptCredentialsWithContext({ accessToken: "legacy-token" }, context);

  process.env.INTEGRATION_ENCRYPTION_KEY = "rotation-current-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = legacyKey;
  assert.equal(decryptCredentialsDetailed(legacy).keySource, "previous");
  assert.equal(decryptCredentialsWithContextDetailed(legacyContext, context).keySource, "previous");

  const rotated = encryptCredentials({ accessToken: "current-token" });
  delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  assert.equal(decryptCredentialsDetailed(rotated, { allowPrevious: false }).keySource, "current");
  assert.throws(() => decryptCredentialsDetailed(legacy, { allowPrevious: false }), (error) => error.code === "INTEGRATION_CREDENTIALS_DECRYPTION_FAILED");
});

test("AAD mismatch, malformed payload and corrupt previous key fail closed", () => {
  const legacyKey = "rotation-previous-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY = legacyKey;
  const legacy = encryptCredentialsWithContext({ accessToken: "legacy-token" }, context);

  process.env.INTEGRATION_ENCRYPTION_KEY = "rotation-current-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = "rotation-previous-key-with-more-than-32-bytes";
  assert.throws(() => decryptCredentialsWithContextDetailed(legacy, { ...context, revision: 4 }), (error) => error.code === "INTEGRATION_CREDENTIALS_CONTEXT_INVALID");

  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = "corrupt-previous-key";
  assert.throws(() => decryptCredentialsDetailed("not-json"), (error) => error.code === "INTEGRATION_CREDENTIALS_INVALID");
  assert.throws(() => decryptCredentialsDetailed(legacy), (error) => error.code === "ENCRYPTION_KEY_INVALID");
});

test("current and previous keys cannot be identical or used without current", () => {
  const payload = encryptCredentials({ accessToken: "valid-payload" });
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = process.env.INTEGRATION_ENCRYPTION_KEY;
  assert.throws(() => encryptCredentials({ accessToken: "same-key" }), (error) => error.code === "ENCRYPTION_KEY_ROTATION_INVALID");

  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = "rotation-previous-key-with-more-than-32-bytes";
  assert.throws(() => decryptCredentialsDetailed(payload), (error) => error.code === "ENCRYPTION_KEY_REQUIRED");
});

test("reencryption dry-run/apply is bounded, idempotent and verifies current-only", async () => {
  const legacyKey = "rotation-previous-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY = legacyKey;
  const legacyIntegration = encryptCredentials({ accessToken: "integration-legacy" });
  const legacyMeta = encryptCredentialsWithContext({ accessToken: "meta-legacy" }, context);
  process.env.INTEGRATION_ENCRYPTION_KEY = "rotation-current-key-with-more-than-32-bytes";
  const currentIntegration = encryptCredentials({ accessToken: "integration-current" });
  delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;

  const fake = createFakePrisma({
    integrations: [
      { id: 1, empresaId: 7, credenciaisCriptografadas: legacyIntegration, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: 2, empresaId: 7, credenciaisCriptografadas: currentIntegration, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ],
    metaCredentials: [{
      id: 3,
      empresaId: context.empresaId,
      canalIntegracaoId: context.canalIntegracaoId,
      provider: context.provider,
      reference: context.reference,
      ciphertext: legacyMeta,
      revision: context.revision,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }],
  });

  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = legacyKey;
  const dryRun = await runRotation({ prisma: fake, apply: false });
  assert.deepEqual({
    integrationRows: dryRun.integrationRows,
    metaRows: dryRun.metaRows,
    integrationsUsingPrevious: dryRun.integrationsUsingPrevious,
    metaUsingPrevious: dryRun.metaUsingPrevious,
    integrationRowsUpdated: dryRun.integrationRowsUpdated,
    metaRowsUpdated: dryRun.metaRowsUpdated,
  }, { integrationRows: 2, metaRows: 1, integrationsUsingPrevious: 1, metaUsingPrevious: 1, integrationRowsUpdated: 1, metaRowsUpdated: 1 });

  const applied = await runRotation({ prisma: fake, apply: true, target: "test-only", expectedDatabase: "fake", expectedIntegrations: 2, expectedMeta: 1, requireRailwayService: false });
  assert.equal(applied.currentOnlyVerified, true);
  assert.equal(applied.auditRows, 1);
  assert.equal(fake.audits.length, 1);
  assert.equal(JSON.stringify(applied).includes("integration-legacy"), false);
  assert.equal(JSON.stringify(applied).includes("meta-legacy"), false);

  delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  const second = await runRotation({ prisma: fake, apply: true, target: "test-only", expectedDatabase: "fake", expectedIntegrations: 2, expectedMeta: 1, requireRailwayService: false });
  assert.equal(second.integrationsUsingPrevious, 0);
  assert.equal(second.metaUsingPrevious, 0);
  assert.equal(second.integrationRowsUpdated, 0);
  assert.equal(second.metaRowsUpdated, 0);
});

test("reencryption aborts on CAS/audit failure and CLI requires a bound target", async () => {
  const legacyKey = "rotation-previous-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY = legacyKey;
  const legacy = encryptCredentials({ accessToken: "rollback-token" });
  process.env.INTEGRATION_ENCRYPTION_KEY = "rotation-current-key-with-more-than-32-bytes";
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = legacyKey;

  const failingCas = createFakePrisma({
    integrations: [{ id: 9, empresaId: 7, credenciaisCriptografadas: legacy, updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
    metaCredentials: [],
  });
  failingCas.failNextIntegrationUpdate = true;
  await assert.rejects(() => runRotation({ prisma: failingCas, apply: true, target: "test-only", expectedDatabase: "fake", expectedIntegrations: 1, expectedMeta: 0, requireRailwayService: false }));
  assert.equal(failingCas._state.integrations[0].credenciaisCriptografadas, legacy);
  assert.equal(failingCas.audits.length, 0);

  const failingAudit = createFakePrisma({
    integrations: [{ id: 10, empresaId: 7, credenciaisCriptografadas: legacy, updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
    metaCredentials: [],
  });
  failingAudit.failAudit = true;
  await assert.rejects(() => runRotation({ prisma: failingAudit, apply: true, target: "test-only", expectedDatabase: "fake", expectedIntegrations: 1, expectedMeta: 0, requireRailwayService: false }));
  assert.equal(failingAudit._state.integrations[0].credenciaisCriptografadas, legacy);
  assert.equal(failingAudit.audits.length, 0);

  const failingVerify = createFakePrisma({
    integrations: [{ id: 12, empresaId: 7, credenciaisCriptografadas: legacy, updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
    metaCredentials: [],
  });
  failingVerify.corruptAfterIntegrationUpdate = true;
  await assert.rejects(() => runRotation({ prisma: failingVerify, apply: true, target: "test-only", expectedDatabase: "fake", expectedIntegrations: 1, expectedMeta: 0, requireRailwayService: false }));
  assert.equal(failingVerify._state.integrations[0].credenciaisCriptografadas, legacy);
  assert.equal(failingVerify.audits.length, 0);

  assert.throws(() => validateApplyArgs(parseArgs(["--apply", "--target", "unsafe-label", "--confirm-target", "unsafe-label", "--database", "railway", "--service-id", "bad", "--expected-integrations", "1", "--expected-meta", "0"])), (error) => error.code === "TARGET_CONFIRMATION_REQUIRED");
  assert.doesNotThrow(() => validateApplyArgs(parseArgs(["--apply", "--target", "official-postgres", "--confirm-target", "official-postgres", "--database", "railway", "--service-id", "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92", "--system-id", "123456789", "--expected-integrations", "1", "--expected-meta", "0"])));

  const emptyCiphertext = createFakePrisma({
    integrations: [],
    metaCredentials: [{ id: 11, empresaId: 7, canalIntegracaoId: 11, provider: context.provider, reference: context.reference, ciphertext: "", revision: context.revision, updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
  });
  await assert.rejects(() => runRotation({ prisma: emptyCiphertext, apply: false }), (error) => error.code === "INTEGRATION_CREDENTIALS_INVALID");
  await assert.rejects(() => runRotation({ prisma: emptyCiphertext, apply: true, target: "test-only", expectedDatabase: "railway", expectedIntegrations: 1, expectedMeta: 1 }), (error) => error.code === "TARGET_NOT_ALLOWED");
});

function createFakePrisma({ integrations, metaCredentials }) {
  const state = {
    integrations: integrations.map((row) => ({ ...row })),
    metaCredentials: metaCredentials.map((row) => ({ ...row })),
  };
  const audits = [];
  const db = {
    integracao: {
      findMany: async () => state.integrations.filter((row) => row.credenciaisCriptografadas !== null).map((row) => ({ ...row })),
      updateMany: async ({ where, data }) => {
        if (db.failNextIntegrationUpdate) { db.failNextIntegrationUpdate = false; return { count: 0 }; }
        const row = state.integrations.find((candidate) => candidate.id === where.id && candidate.empresaId === where.empresaId && candidate.credenciaisCriptografadas === where.credenciaisCriptografadas && candidate.updatedAt.getTime() === where.updatedAt.getTime());
        if (!row) return { count: 0 };
        row.credenciaisCriptografadas = db.corruptAfterIntegrationUpdate ? "corrupted" : data.credenciaisCriptografadas;
        return { count: 1 };
      },
    },
    metaCredential: {
      findMany: async () => state.metaCredentials.map((row) => ({ ...row })),
      updateMany: async ({ where, data }) => {
        if (db.failNextMetaUpdate) { db.failNextMetaUpdate = false; return { count: 0 }; }
        const row = state.metaCredentials.find((candidate) => candidate.id === where.id && candidate.empresaId === where.empresaId && candidate.canalIntegracaoId === where.canalIntegracaoId && candidate.provider === where.provider && candidate.reference === where.reference && candidate.revision === where.revision && candidate.ciphertext === where.ciphertext && candidate.updatedAt.getTime() === where.updatedAt.getTime());
        if (!row) return { count: 0 };
        row.ciphertext = db.corruptAfterMetaUpdate ? "corrupted" : data.ciphertext;
        return { count: 1 };
      },
    },
    auditoriaSeguranca: { create: async ({ data }) => { if (db.failAudit) throw new Error("audit failure"); audits.push({ ...data }); return data; } },
    $transaction: async (callback) => {
      const before = {
        integrations: state.integrations.map((row) => ({ ...row })),
        metaCredentials: state.metaCredentials.map((row) => ({ ...row })),
        audits: audits.map((row) => ({ ...row })),
      };
      try {
        return await callback(db);
      } catch (error) {
        state.integrations.splice(0, state.integrations.length, ...before.integrations);
        state.metaCredentials.splice(0, state.metaCredentials.length, ...before.metaCredentials);
        audits.splice(0, audits.length, ...before.audits);
        throw error;
      }
    },
  };
  db.audits = audits;
  db._state = state;
  return db;
}
