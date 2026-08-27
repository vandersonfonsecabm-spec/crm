const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRuntimeFingerprint, databaseVerified, outboundDisabled, sourceManifestSha256 } = require("../src/runtime-fingerprint");

test("fingerprint usa IDs Railway, banco e flags reais e falha fechado", async () => {
  const base = {
    RAILWAY_PROJECT_ID: "ddfbf66c-e274-47b1-9493-286232d2f426",
    RAILWAY_ENVIRONMENT_ID: "d6b6f137-cffd-4647-a102-3619fc54133a",
    RAILWAY_SERVICE_ID: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
    POSTGRES_DATABASE_URL: "postgresql://user:pass@postgres--e25.railway.internal:5432/db",
  };
  const prisma = { metaCredential: { count: async () => 0 }, integracao: { count: async () => 0 } };
  const ok = await buildRuntimeFingerprint({ env: base, prisma });
  assert.equal(ok.targetVerified, true);
  assert.equal(ok.databaseVerified, true);
  assert.equal(ok.providersConnected, false);
  assert.equal(ok.outboundEnabled, false);
  assert.match(ok.sourceManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal((await buildRuntimeFingerprint({ env: { ...base, RAILWAY_ENVIRONMENT_ID: "production" }, prisma })).targetVerified, false);
  assert.equal(databaseVerified({ POSTGRES_DATABASE_URL: "postgresql://x:y@production-db.railway.internal/db" }), false);
  assert.equal(outboundDisabled({ META_EXTERNAL_NETWORK_ENABLED: "true" }), false);
  assert.equal((await buildRuntimeFingerprint({ env: base, prisma: { metaCredential: { count: async () => 1 }, integracao: { count: async () => 0 } } })).providersConnected, true);
  assert.equal(sourceManifestSha256(), sourceManifestSha256());
});
