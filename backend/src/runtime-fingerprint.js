const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_IDS = Object.freeze({
  project: "ddfbf66c-e274-47b1-9493-286232d2f426",
  environment: "d6b6f137-cffd-4647-a102-3619fc54133a",
  apiService: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
});

function sourceManifestSha256(root = path.resolve(__dirname, "..")) {
  if (sourceManifestSha256.cached) return sourceManifestSha256.cached;
  const files = [];
  for (const relative of ["src", "scripts", "railway.json", "prisma/schema.prisma", "prisma/migrations", "prisma-postgres/migrations", "package.json", "package-lock.json"]) collect(path.join(root, relative), root, files);
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) hash.update(file).update("\0").update(fs.readFileSync(path.join(root, file))).update("\0");
  sourceManifestSha256.cached = hash.digest("hex");
  return sourceManifestSha256.cached;
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
  return ["META_EXTERNAL_NETWORK_ENABLED", "WHATSAPP_OUTBOUND_ENABLED", "SECURITY_EMAIL_DELIVERY_WORKER_ENABLED"]
    .every((key) => String(env[key] || "false").toLowerCase() !== "true");
}

async function buildRuntimeFingerprint({ env = process.env, prisma }) {
  const targetVerified = isStagingTarget(env);
  const [metaCredentials, blingConnections] = prisma ? await Promise.all([
    prisma.metaCredential.count({ where: { status: "ATIVA", removedAt: null } }),
    prisma.integracao.count({ where: { tipo: "BLING", status: "ATIVA", ativo: true, credenciaisCriptografadas: { not: null } } }),
  ]) : [null, null];
  return {
    environment: targetVerified ? "staging" : "unknown",
    sourceManifestSha256: sourceManifestSha256(),
    targetVerified,
    databaseVerified: databaseVerified(env),
    providersConnected: metaCredentials === 0 && blingConnections === 0 ? false : true,
    outboundEnabled: !outboundDisabled(env),
  };
}

module.exports = { STAGING_IDS, buildRuntimeFingerprint, databaseVerified, isStagingTarget, outboundDisabled, probeAuthorized, sourceManifestSha256 };
