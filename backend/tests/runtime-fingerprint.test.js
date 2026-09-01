const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SOURCE_MANIFEST_VERSION, buildRuntimeFingerprint, databaseVerified, isStagingTarget, outboundDisabled, probeAuthorized, sourceManifestSha256 } = require("../src/runtime-fingerprint");

test("fingerprint usa IDs Railway, banco e flags reais e falha fechado", async () => {
  const base = {
    RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
    RAILWAY_ENVIRONMENT_ID: "d6b6f137-cffd-4647-a102-3619fc54133a",
    RAILWAY_SERVICE_ID: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
    POSTGRES_DATABASE_URL: "postgresql://user:pass@postgres--e25.railway.internal:5432/db",
    STORE1_SOAK_PROBE_TOKEN: "x".repeat(32),
  };
  const prisma = { metaCredential: { count: async () => 0 }, integracao: { count: async () => 0 }, canalIntegracao: { count: async () => 0 } };
  const ok = await buildRuntimeFingerprint({ env: base, prisma });
  assert.equal(ok.targetVerified, true);
  assert.equal(ok.databaseVerified, true);
  assert.equal(ok.trackedProviderConnections, false);
  assert.deepEqual(ok.providerConnectionScope, ["WHATSAPP", "INSTAGRAM", "MESSENGER", "BLING", "EMAIL", "GENERIC"]);
  assert.equal(ok.providerConnectionEvidence.AI.connected, null);
  assert.equal(ok.providerConnectionEvidence.AI.tracked, false);
  assert.equal(ok.providerConnectionEvidence.GENERIC.connected, false);
  assert.equal(ok.externalProviderActivationEnabled, false);
  assert.equal(ok.outboundEnabled, false);
  assert.equal(ok.sourceManifestVersion, SOURCE_MANIFEST_VERSION);
  assert.match(ok.sourceManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal((await buildRuntimeFingerprint({ env: { ...base, RAILWAY_ENVIRONMENT_ID: "production" }, prisma })).targetVerified, false);
  assert.equal(isStagingTarget({ ...base, RAILWAY_ENVIRONMENT_ID: "production" }), false);
  assert.equal(probeAuthorized(base, "x".repeat(32)), true);
  assert.equal(probeAuthorized(base, "wrong"), false);
  assert.equal(databaseVerified({ POSTGRES_DATABASE_URL: "postgresql://x:y@production-db.railway.internal/db" }), false);
  assert.equal(outboundDisabled({ META_EXTERNAL_NETWORK_ENABLED: "true" }), false);
  assert.equal(outboundDisabled({ BLING_EXTERNAL_NETWORK_ENABLED: "true" }), false);
  assert.equal((await buildRuntimeFingerprint({ env: base, prisma: { metaCredential: { count: async () => 1 }, integracao: { count: async () => 0 }, canalIntegracao: { count: async () => 0 } } })).trackedProviderConnections, true);
  const evidence = await buildRuntimeFingerprint({
    env: base,
    prisma: {
      metaCredential: { count: async ({ where }) => where.provider === "META_INSTAGRAM" ? 1 : 0 },
      integracao: { count: async () => 0 },
      canalIntegracao: { count: async () => 0 },
    },
  });
  assert.deepEqual(evidence.providerConnectionEvidence.WHATSAPP, { tracked: true, connected: false, source: "ACTIVE_CREDENTIAL_OR_CHANNEL" });
  assert.deepEqual(evidence.providerConnectionEvidence.INSTAGRAM, { tracked: true, connected: true, source: "ACTIVE_CREDENTIAL_OR_CHANNEL" });
  assert.deepEqual(evidence.providerConnectionEvidence.EMAIL, { tracked: true, connected: null, source: "NO_EMAIL_PROVIDER_CREDENTIAL_REGISTRY" });
  assert.deepEqual(evidence.providerConnectionEvidence.GENERIC, { tracked: true, connected: false, source: "ACTIVE_CREDENTIAL_OR_CHANNEL" });
  assert.equal(evidence.providerConnectionEvidence.AI.connected, null);
  assert.equal(sourceManifestSha256(), sourceManifestSha256());
});

test("manifesto runtime versionado normaliza LF, CRLF e CR sem mudar o hash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-runtime-manifest-"));
  const lfRoot = path.join(root, "lf");
  const crlfRoot = path.join(root, "crlf");
  const crRoot = path.join(root, "cr");
  try {
    for (const target of [lfRoot, crlfRoot, crRoot]) {
      fs.mkdirSync(path.join(target, "src"), { recursive: true });
      fs.mkdirSync(path.join(target, "prisma", "migrations", "one"), { recursive: true });
    }
    const files = [
      ["src/example.js", "module.exports = { safe: true };\n"],
      ["package.json", "{\n  \"name\": \"runtime-manifest-fixture\"\n}\n"],
      ["prisma/migrations/one/migration.sql", "BEGIN;\nSELECT 1;\nCOMMIT;\n"],
      ["prisma/migration_lock.toml", "provider = \"sqlite\"\n"],
    ];
    for (const [relative, content] of files) {
      fs.writeFileSync(path.join(lfRoot, relative), content, "utf8");
      fs.writeFileSync(path.join(crlfRoot, relative), content.replace(/\n/g, "\r\n"), "utf8");
      fs.writeFileSync(path.join(crRoot, relative), content.replace(/\n/g, "\r"), "utf8");
    }
    assert.equal(sourceManifestSha256(lfRoot), sourceManifestSha256(crlfRoot));
    assert.equal(sourceManifestSha256(lfRoot), sourceManifestSha256(crRoot));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprint ignora credenciais ativas indecifráveis ou expiradas", async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = "runtime-fingerprint-test-key-with-more-than-32-bytes";
  const { encryptCredentialsWithContext, encryptCredentials } = require("../src/integrations/crypto");
  const valid = {
    empresaId: 3,
    canalIntegracaoId: 4,
    provider: "META_INSTAGRAM",
    reference: "runtime-valid-reference",
    revision: 1,
  };
  const fingerprint = await buildRuntimeFingerprint({
    env: {
      RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
      RAILWAY_ENVIRONMENT_ID: "d6b6f137-cffd-4647-a102-3619fc54133a",
      RAILWAY_SERVICE_ID: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
      POSTGRES_DATABASE_URL: "postgresql://user:pass@postgres--e25.railway.internal:5432/db",
      EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false",
    },
    prisma: {
      metaCredential: {
        findMany: async ({ where }) => where.provider === "META_INSTAGRAM"
          ? [
            { ...valid, ciphertext: encryptCredentialsWithContext({ accessToken: "synthetic-valid" }, valid) },
            { ...valid, reference: "runtime-expired-reference", ciphertext: encryptCredentialsWithContext({ accessToken: "synthetic-expired", expiresAt: "2020-01-01T00:00:00.000Z" }, { ...valid, reference: "runtime-expired-reference" }) },
            { ...valid, reference: "runtime-invalid-reference", ciphertext: "ciphertext-invalid" },
          ]
          : [],
      },
      integracao: {
        findMany: async ({ where }) => where.tipo === "BLING"
          ? [{ credenciaisCriptografadas: encryptCredentials({ accessToken: "synthetic-bling" }) }, { credenciaisCriptografadas: "ciphertext-invalid" }]
          : [],
      },
    },
  });
  assert.equal(fingerprint.providerConnectionEvidence.INSTAGRAM.connected, true);
  assert.equal(fingerprint.providerConnectionEvidence.BLING.connected, true);
  assert.equal(fingerprint.providerConnectionEvidence.EMAIL.connected, null);
});
