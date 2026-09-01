const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_IDS = Object.freeze({
  project: "ddfbf66c-e274-47b1-9493-286232d2f426",
  environment: "d6b6f137-cffd-4647-a102-3619fc54133a",
  apiService: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
});
const SOURCE_MANIFEST_VERSION = "backend-runtime-v3-lf";
const TEXT_MANIFEST_EXTENSIONS = new Set([".cjs", ".js", ".json", ".mjs", ".prisma", ".sql", ".toml", ".ts", ".tsx"]);
const TRACKED_PROVIDER_KEYS = Object.freeze(["WHATSAPP", "INSTAGRAM", "MESSENGER", "BLING", "EMAIL"]);

function sourceManifestSha256(root = path.resolve(__dirname, "..")) {
  const resolvedRoot = path.resolve(root);
  sourceManifestSha256.cache ||= new Map();
  if (sourceManifestSha256.cache.has(resolvedRoot)) return sourceManifestSha256.cache.get(resolvedRoot);
  const files = [];
  for (const relative of ["src", "scripts", "railway.json", "prisma/schema.prisma", "prisma/migrations", "prisma-postgres/migrations", "package.json", "package-lock.json"]) collect(path.join(resolvedRoot, relative), resolvedRoot, files);
  const hash = crypto.createHash("sha256");
  hash.update(SOURCE_MANIFEST_VERSION).update("\0");
  for (const file of files.sort()) hash.update(file).update("\0").update(manifestFileBytes(path.join(resolvedRoot, file))).update("\0");
  const digest = hash.digest("hex");
  sourceManifestSha256.cache.set(resolvedRoot, digest);
  return digest;
}

function manifestFileBytes(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (!TEXT_MANIFEST_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return bytes;
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function isStagingTarget(env) {
  return env.RAILWAY_PROJECT_ID === STAGING_IDS.project && env.RAILWAY_ENVIRONMENT_ID === STAGING_IDS.environment && env.RAILWAY_SERVICE_ID === STAGING_IDS.apiService;
}

function probeAuthorized(env, supplied) {
  const expected = Buffer.from(String(env.STORE1_SOAK_PROBE_TOKEN || ""));
  const actual = Buffer.from(String(supplied || ""));
  return expected.length >= 32 && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function collect(candidate, root, output) {
  if (!fs.existsSync(candidate)) return;
  const stat = fs.statSync(candidate);
  if (stat.isFile()) return output.push(path.relative(root, candidate).replace(/\\/g, "/"));
  for (const name of fs.readdirSync(candidate)) collect(path.join(candidate, name), root, output);
}

function databaseVerified(env) {
  try {
    const parsed = new URL(String(env.POSTGRES_DATABASE_URL || env.DATABASE_URL || ""));
    return parsed.protocol.startsWith("postgres") && parsed.hostname.toLowerCase() === "postgres--e25.railway.internal";
  } catch { return false; }
}

function outboundDisabled(env) {
  return [
    "EXTERNAL_PROVIDER_ACTIVATION_ENABLED",
    "META_EXTERNAL_NETWORK_ENABLED",
    "WHATSAPP_OUTBOUND_ENABLED",
    "BLING_EXTERNAL_NETWORK_ENABLED",
    "SECURITY_EMAIL_DELIVERY_WORKER_ENABLED",
  ]
    .every((key) => String(env[key] || "false").toLowerCase() !== "true");
}

async function buildRuntimeFingerprint({ env = process.env, prisma }) {
  const targetVerified = isStagingTarget(env);
  const [whatsappCredentials, instagramCredentials, messengerCredentials, blingConnections, emailConnections] = prisma ? await Promise.all([
    prisma.metaCredential.count({ where: { provider: "META_WHATSAPP", status: "ATIVA", removedAt: null } }),
    prisma.metaCredential.count({ where: { provider: "META_INSTAGRAM", status: "ATIVA", removedAt: null } }),
    prisma.metaCredential.count({ where: { provider: "META_MESSENGER", status: "ATIVA", removedAt: null } }),
    prisma.integracao.count({ where: { tipo: "BLING", status: "ATIVA", ativo: true, credenciaisCriptografadas: { not: null } } }),
    prisma.canalIntegracao?.count
      ? prisma.canalIntegracao.count({ where: { tipo: "EMAIL", status: "ATIVO", ativo: true, modoTeste: false, emailProviderType: { not: null }, emailProviderAccountIdMasked: { not: null } } })
      : null,
  ]) : [null, null, null, null, null];
  const providerConnectionEvidence = {
    WHATSAPP: providerEvidence(whatsappCredentials),
    INSTAGRAM: providerEvidence(instagramCredentials),
    MESSENGER: providerEvidence(messengerCredentials),
    BLING: providerEvidence(blingConnections),
    EMAIL: providerEvidence(emailConnections),
    // AI has no tenant credential registry in this release.  Deliberately do
    // not claim that a false boolean proves anything about it.
    AI: { tracked: false, connected: null, source: "NO_TENANT_PROVIDER_CREDENTIAL_REGISTRY" },
  };
  const trackedProviderConnections = [whatsappCredentials, instagramCredentials, messengerCredentials, blingConnections, emailConnections]
    .some((count) => Number(count) > 0);
  return {
    environment: targetVerified ? "staging" : "unknown",
    sourceManifestVersion: SOURCE_MANIFEST_VERSION,
    sourceManifestSha256: sourceManifestSha256(),
    targetVerified,
    databaseVerified: databaseVerified(env),
    // Backward-compatible field with an explicit scope below.  It is not a
    // claim about untracked providers such as AI.
    providersConnected: trackedProviderConnections,
    trackedProviderConnections,
    providerConnectionScope: TRACKED_PROVIDER_KEYS,
    providerConnectionEvidence,
    externalProviderActivationEnabled: String(env.EXTERNAL_PROVIDER_ACTIVATION_ENABLED || "false").toLowerCase() === "true",
    outboundEnabled: !outboundDisabled(env),
  };
}

function providerEvidence(count) {
  if (count === null || count === undefined) return { tracked: true, connected: null, source: "UNAVAILABLE" };
  return { tracked: true, connected: Number(count) > 0, source: "ACTIVE_CREDENTIAL_OR_CHANNEL" };
}

module.exports = { SOURCE_MANIFEST_VERSION, STAGING_IDS, TRACKED_PROVIDER_KEYS, buildRuntimeFingerprint, databaseVerified, isStagingTarget, manifestFileBytes, outboundDisabled, probeAuthorized, sourceManifestSha256 };
