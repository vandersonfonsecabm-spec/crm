"use strict";

const crypto = require("node:crypto");

const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const QA_RUN_ID = /^qa-[a-z0-9][a-z0-9-]{7,119}$/;
const QA_ATTESTATION_VERSION = "qa-prod-control-plane-attestation.v1";
const QA_DATABASE_URL_SHA256_ENV = "QA_PROD_DATABASE_URL_SHA256";
const QA_CANONICAL_FEATURE = "NEGOCIOS_KANBAN";
const QA_DATABASE_LOCK_KEY = "qa-prod-bootstrap-v1-lock";
const QA_HARNESS_SOURCE_FILES = Object.freeze([
  "src/security/qa-provisioning.cjs",
  "src/security/qa-platform-operator.cjs",
  "scripts/qa-prod-bootstrap.cjs",
  "scripts/qa-prod-status.cjs",
  "scripts/qa-prod-revoke.cjs",
  "scripts/qa-staging-platform-operator.cjs",
  "src/user-security.js",
]);

const QA_PRODUCTION_TARGET = Object.freeze({
  projectId: "ddfbf66c-e274-47b1-9493-286232d2f426",
  environmentId: "e18f76b1-e38f-468e-91fe-1eff6db9a5f8",
  apiServiceId: "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92",
  workerServiceId: "4eef3b96-e33f-42ea-9fb8-86c17b077ab8",
  databaseServiceId: "e9d8a6b8-507b-45fb-92a8-3ab016f865a2",
  baseProductionReleaseHead: "2da896aac84dd683e844b266331716e9600e6357",
});
const QA_STAGING_TARGET = Object.freeze({
  projectId: "ddfbf66c-e274-47b1-9493-286232d2f426",
  environmentId: "d6b6f137-cffd-4647-a102-3619fc54133a",
  apiServiceId: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
  workerServiceId: "25dab463-52c0-4425-825e-c7dcf6a65332",
  databaseServiceId: "f3a2862b-2371-4ab3-b4db-1e91680ee3b7",
});

const APPLY_CONFIRMATION = "QA-PROD-CANONICAL-V1-APPLY";
const REVOKE_CONFIRMATION = "QA-PROD-CANONICAL-V1-REVOKE";
const EMERGENCY_REVOKE_CONFIRMATION = "QA-PROD-CANONICAL-V1-EMERGENCY-REVOKE";
const QA_TENANTS = Object.freeze([
  Object.freeze({
    key: "A",
    slug: "qa-prod-canonical-a",
    name: "[QA PROD] Empresa A",
    users: Object.freeze([
      Object.freeze({ key: "admin", name: "QA PROD A Admin", email: "qa-prod-a-admin@example.invalid", role: "ADMIN" }),
      Object.freeze({ key: "manager", name: "QA PROD A Gerente", email: "qa-prod-a-manager@example.invalid", role: "GERENTE" }),
      Object.freeze({ key: "seller", name: "QA PROD A Vendedor", email: "qa-prod-a-seller@example.invalid", role: "VENDEDOR" }),
    ]),
  }),
  Object.freeze({
    key: "B",
    slug: "qa-prod-canonical-b",
    name: "[QA PROD] Empresa B",
    users: Object.freeze([
      Object.freeze({ key: "admin", name: "QA PROD B Admin", email: "qa-prod-b-admin@example.invalid", role: "ADMIN" }),
      Object.freeze({ key: "seller", name: "QA PROD B Vendedor", email: "qa-prod-b-seller@example.invalid", role: "VENDEDOR" }),
    ]),
  }),
]);

const EXTERNAL_FEATURE_KEYS = Object.freeze([
  "LEADS_COMMUNICATION",
  "SITE_LEAD_CAPTURE",
  "AUTOMATIONS",
  "WHATSAPP_INTEGRATION",
  "WHATSAPP_INBOUND",
  "WHATSAPP_OUTBOUND",
  "INSTAGRAM_INTEGRATION",
  "INSTAGRAM_INBOUND",
  "MESSENGER_INTEGRATION",
  "MESSENGER_INBOUND",
  "EMAIL_INTEGRATION",
  "EMAIL_INBOUND",
  "AI_COMMERCE",
]);

class QaProvisioningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "QaProvisioningError";
    this.code = code;
    this.details = details;
  }
}

function expectedUserMap() {
  return new Map(QA_TENANTS.flatMap((tenant) => tenant.users.map((user) => [
    user.email,
    { ...user, tenantKey: tenant.key, slug: tenant.slug },
  ])));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizeDatabaseUrl(value) {
  return String(value || "").trim();
}

function databaseNameFromUrl(value) {
  try {
    const name = decodeURIComponent(new URL(String(value)).pathname.replace(/^\/+/, "")).trim().toLowerCase();
    return name || null;
  } catch {
    return null;
  }
}

function parseAttestationValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new QaProvisioningError("QA_PROD_ATTESTATION_INVALID", "Atestado operacional nao e JSON valido.");
  }
}

function canonicalAttestationPayload(attestation) {
  return JSON.stringify(Object.fromEntries(Object.keys(attestation).filter((key) => key !== "signature").sort().map((key) => [key, attestation[key]])));
}

function computeQaHarnessSourceManifest() {
  const fs = require("node:fs");
  const path = require("node:path");
  const hash = crypto.createHash("sha256");
  const root = path.resolve(__dirname, "../..");
  for (const relativePath of QA_HARNESS_SOURCE_FILES) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) throw new QaProvisioningError("QA_PROD_HARNESS_SOURCE_MISSING", "Arquivo causal do harness QA ausente.", { file: relativePath });
    hash.update(`${relativePath}\0`, "utf8");
    hash.update(fs.readFileSync(absolutePath));
  }
  return hash.digest("hex");
}

function computeLocalGitIdentity() {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const root = path.resolve(__dirname, "../..");
  const result = spawnSync("git", ["rev-parse", "HEAD", "HEAD^{tree}"], { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
  if (result.error || result.status !== 0) return null;
  const lines = String(result.stdout || "").trim().split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean);
  if (lines.length !== 2 || !HEX_40.test(lines[0]) || !HEX_40.test(lines[1])) return null;
  return { releaseHead: lines[0], gitTree: lines[1], source: "git" };
}

function readBuildIdentityManifest(env, hmacKey) {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "../..");
  const filePath = path.resolve(String(env.QA_HARNESS_BUILD_MANIFEST_FILE || path.join(root, "qa-harness-build-manifest.json")));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_MANIFEST_REQUIRED", "Runtime sem Git exige manifesto de build versionado/atestado.");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_MANIFEST_INVALID", "Manifesto de build do harness nao e JSON valido."); }
  if (manifest.version !== "qa-prod-build-manifest.v1" || !HEX_40.test(String(manifest.releaseHead || "").trim().toLowerCase()) || !HEX_40.test(String(manifest.gitTree || "").trim().toLowerCase()) || !HEX_64.test(String(manifest.sourceManifestSha256 || "").trim().toLowerCase()) || !/^[a-f0-9]{64}$/i.test(String(manifest.signature || ""))) throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_MANIFEST_INVALID", "Manifesto de build do harness possui identidade invalida.");
  const expectedSignature = crypto.createHmac("sha256", hmacKey).update(canonicalAttestationPayload({ releaseHead: manifest.releaseHead, gitTree: manifest.gitTree, sourceManifestSha256: manifest.sourceManifestSha256, version: manifest.version }), "utf8").digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(String(manifest.signature).toLowerCase()), Buffer.from(expectedSignature))) throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_SIGNATURE_INVALID", "Assinatura do manifesto de build nao confere.");
  return { releaseHead: String(manifest.releaseHead).trim().toLowerCase(), gitTree: String(manifest.gitTree).trim().toLowerCase(), sourceManifestSha256: String(manifest.sourceManifestSha256).trim().toLowerCase(), source: "build-manifest" };
}

function readControlPlaneAttestation(env = process.env, options = {}) {
  if (options.attestation) return parseAttestationValue(options.attestation);
  const inline = String(env.QA_PROD_CONTROL_PLANE_ATTESTATION || "").trim();
  if (inline) return parseAttestationValue(inline);
  const filePath = String(env.QA_PROD_CONTROL_PLANE_ATTESTATION_FILE || "").trim();
  if (!filePath) return null;
  const fs = require("node:fs");
  const path = require("node:path");
  const repositoryRoot = path.resolve(__dirname, "../..");
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.toLowerCase().startsWith(repositoryRoot.toLowerCase() + path.sep)) throw new QaProvisioningError("QA_PROD_ATTESTATION_REPOSITORY_PATH", "Atestado operacional nao pode ser lido do repositorio.");
  try {
    return parseAttestationValue(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new QaProvisioningError("QA_PROD_ATTESTATION_UNREADABLE", "Atestado operacional nao pode ser lido.", { cause: String(error?.code || "READ_FAILED") });
  }
}

function assertOperationalAttestation({ env, target, expectedReleaseHead, attestation, requireHarnessParity = false, requirePrewriteSafety = false, runId }) {
  if (!attestation || typeof attestation !== "object") {
    throw new QaProvisioningError("QA_PROD_ATTESTATION_REQUIRED", "Apply QA exige atestado externo do control-plane e do banco.");
  }
  const required = [
    "version", "attestationType", "issuedBy", "signature", "controlPlaneEvidenceRef", "attestedAt", "runId", "environment", "projectId", "environmentId", "apiServiceId",
    "workerServiceId", "databaseServiceId", "releaseHead", "baseProductionReleaseHead",
    "databaseUrlSha256", "databaseIdentityServiceId", "databaseIdentityDatabaseName",
    "sourceManifestSha256", "harnessReleaseHead", "harnessGitTree", "apiStatus", "workerStatus", "databaseStatus",
  ];
  if (requirePrewriteSafety && target === QA_PRODUCTION_TARGET) required.push("prewriteBackupSha256", "prewriteBackupRunId", "prewriteBackupTargetDatabaseServiceId", "prewriteRestoreVerified", "prewriteRestoreEvidenceRef");
  const missing = required.filter((key) => attestation[key] === undefined || attestation[key] === null || String(attestation[key]).trim() === "");
  if (missing.length) throw new QaProvisioningError("QA_PROD_ATTESTATION_INCOMPLETE", "Atestado operacional incompleto.", { missing });
  if (attestation.version !== QA_ATTESTATION_VERSION) throw new QaProvisioningError("QA_PROD_ATTESTATION_VERSION_INVALID", "Versao do atestado operacional nao permitida.");
  if (attestation.attestationType !== "RAILWAY_CONTROL_PLANE_AND_DATABASE_READONLY" || String(attestation.issuedBy).trim().toLowerCase() === "qa-prod-bootstrap") throw new QaProvisioningError("QA_PROD_ATTESTATION_ISSUER_INVALID", "Atestado deve vir de um verificador externo ao bootstrap.");
  if (String(attestation.signature).trim().length < 32 || String(attestation.controlPlaneEvidenceRef).trim().length < 8) throw new QaProvisioningError("QA_PROD_ATTESTATION_PROOF_INVALID", "Atestado externo nao possui prova ou referencia suficiente.");
  const attestedAt = Date.parse(String(attestation.attestedAt));
  if (Number.isNaN(attestedAt)) throw new QaProvisioningError("QA_PROD_ATTESTATION_TIMESTAMP_INVALID", "Timestamp do atestado externo invalido.");
  if (Date.now() - attestedAt > 15 * 60 * 1000 || attestedAt - Date.now() > 5 * 60 * 1000) throw new QaProvisioningError("QA_PROD_ATTESTATION_STALE", "Atestado externo esta fora da janela operacional.");
  if ((env.QA_PROD_RUN_ID || runId) && String(env.QA_PROD_RUN_ID || runId).trim() !== String(attestation.runId).trim()) throw new QaProvisioningError("QA_PROD_ATTESTATION_RUN_MISMATCH", "Atestado externo pertence a outro run.");
  const hmacKey = String(env.QA_PROD_ATTESTATION_HMAC_KEY || "");
  if (hmacKey.length < 32) throw new QaProvisioningError("QA_PROD_ATTESTATION_SIGNATURE_KEY_REQUIRED", "Chave de verificacao do atestado externo ausente.");
  const expectedSignature = crypto.createHmac("sha256", hmacKey).update(canonicalAttestationPayload(attestation), "utf8").digest("hex");
  const receivedSignature = String(attestation.signature).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(receivedSignature) || !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) throw new QaProvisioningError("QA_PROD_ATTESTATION_SIGNATURE_INVALID", "Assinatura do atestado externo nao confere.");
  if (!QA_RUN_ID.test(String(attestation.runId))) throw new QaProvisioningError("QA_PROD_ATTESTATION_RUN_INVALID", "Run ID do atestado invalido.");
  if (attestation.environment !== (target === QA_STAGING_TARGET ? "staging" : "production")) throw new QaProvisioningError("QA_PROD_ATTESTATION_ENVIRONMENT_MISMATCH", "Ambiente do atestado diverge do alvo.");
  const comparisons = {
    projectId: target.projectId,
    environmentId: target.environmentId,
    apiServiceId: target.apiServiceId,
    databaseServiceId: target.databaseServiceId,
    releaseHead: expectedReleaseHead,
    baseProductionReleaseHead: target === QA_PRODUCTION_TARGET ? target.baseProductionReleaseHead : String(env.QA_PROD_BASE_PRODUCTION_RELEASE_HEAD || target.baseProductionReleaseHead).trim().toLowerCase(),
    databaseIdentityServiceId: target.databaseServiceId,
  };
  const mismatches = Object.entries(comparisons).filter(([key, value]) => String(attestation[key]).trim().toLowerCase() !== String(value).trim().toLowerCase()).map(([key]) => key);
  if (target.workerServiceId && String(attestation.workerServiceId).trim() !== target.workerServiceId) mismatches.push("workerServiceId");
  if (env.QA_PROD_WORKER_SERVICE_ID && String(attestation.workerServiceId).trim() !== String(env.QA_PROD_WORKER_SERVICE_ID).trim()) mismatches.push("workerServiceIdObserved");
  if (mismatches.length) throw new QaProvisioningError("QA_PROD_ATTESTATION_TARGET_MISMATCH", "Atestado externo nao coincide com o alvo allowlisted.", { mismatches });
  for (const key of ["databaseUrlSha256", "sourceManifestSha256"]) {
    if (!HEX_64.test(String(attestation[key]).trim().toLowerCase())) throw new QaProvisioningError("QA_PROD_ATTESTATION_HASH_INVALID", "Hash do atestado operacional invalido.", { key });
  }
  if (!HEX_40.test(String(attestation.harnessReleaseHead).trim().toLowerCase()) || !HEX_40.test(String(attestation.harnessGitTree).trim().toLowerCase())) {
    throw new QaProvisioningError("QA_PROD_ATTESTATION_SOURCE_INVALID", "Fonte do harness QA nao possui identidade Git valida.");
  }
  if (!["SUCCESS", "RUNNING", "HEALTHY"].includes(String(attestation.apiStatus).toUpperCase())
    || !["SUCCESS", "RUNNING", "HEALTHY"].includes(String(attestation.workerStatus).toUpperCase())
    || !["SUCCESS", "RUNNING", "HEALTHY"].includes(String(attestation.databaseStatus).toUpperCase())) {
    throw new QaProvisioningError("QA_PROD_ATTESTATION_RUNTIME_UNHEALTHY", "Atestado indica runtime ou banco nao saudavel.");
  }
  const effectiveUrl = normalizeDatabaseUrl(env.DATABASE_URL || env.POSTGRES_DATABASE_URL);
  const effectiveUrlHash = sha256(effectiveUrl);
  if (String(attestation.databaseUrlSha256).toLowerCase() !== effectiveUrlHash) throw new QaProvisioningError("QA_PROD_DATABASE_URL_ATTESTATION_MISMATCH", "URL efetiva do Prisma nao coincide com o atestado do banco.");
  const effectiveDatabaseName = databaseNameFromUrl(effectiveUrl);
  if (!effectiveDatabaseName || String(attestation.databaseIdentityDatabaseName).trim().toLowerCase() !== effectiveDatabaseName) throw new QaProvisioningError("QA_PROD_DATABASE_NAME_ATTESTATION_MISMATCH", "Nome logico do banco nao coincide com a URL efetiva do Prisma.");
  const configuredHash = String(env[QA_DATABASE_URL_SHA256_ENV] || "").trim().toLowerCase();
  if (configuredHash && configuredHash !== effectiveUrlHash) throw new QaProvisioningError("QA_PROD_DATABASE_URL_HASH_MISMATCH", "Hash configurado da URL efetiva diverge.");
  if (requireHarnessParity) {
    const harnessRelease = String(env.QA_HARNESS_RELEASE_HEAD || "").trim().toLowerCase();
    const harnessTree = String(env.QA_HARNESS_GIT_TREE || "").trim().toLowerCase();
    const harnessManifest = String(env.QA_HARNESS_SOURCE_MANIFEST_SHA256 || "").trim().toLowerCase();
    if (!HEX_40.test(harnessRelease) || !HEX_40.test(harnessTree) || !HEX_64.test(harnessManifest)) {
      throw new QaProvisioningError("QA_PROD_HARNESS_SOURCE_PARITY_REQUIRED", "Apply exige SHA, tree e manifesto do harness QA.");
    }
    if (harnessRelease !== String(attestation.harnessReleaseHead).trim().toLowerCase()
      || harnessTree !== String(attestation.harnessGitTree).trim().toLowerCase()
      || harnessManifest !== String(attestation.sourceManifestSha256).trim().toLowerCase()) {
      throw new QaProvisioningError("QA_PROD_HARNESS_SOURCE_PARITY_MISMATCH", "Fonte do harness QA diverge do atestado externo.");
    }
    const localGit = computeLocalGitIdentity();
    if (localGit) {
      if (localGit.releaseHead !== harnessRelease || localGit.gitTree !== harnessTree) throw new QaProvisioningError("QA_PROD_HARNESS_GIT_IDENTITY_MISMATCH", "HEAD/tree local divergem do atestado externo.");
    } else {
      const buildIdentity = readBuildIdentityManifest(env, hmacKey);
      if (buildIdentity.releaseHead !== harnessRelease || buildIdentity.gitTree !== harnessTree) throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_IDENTITY_MISMATCH", "Manifesto de build diverge do atestado externo.");
      if (buildIdentity.sourceManifestSha256 !== String(attestation.sourceManifestSha256).trim().toLowerCase()) throw new QaProvisioningError("QA_PROD_HARNESS_BUILD_MANIFEST_MISMATCH", "Manifesto de build diverge do atestado externo.");
    }
    const computedManifest = computeQaHarnessSourceManifest();
    if (computedManifest !== harnessManifest || computedManifest !== String(attestation.sourceManifestSha256).trim().toLowerCase()) {
      throw new QaProvisioningError("QA_PROD_HARNESS_SOURCE_MANIFEST_MISMATCH", "Manifesto calculado do harness QA diverge do atestado.");
    }
  }
  if (requirePrewriteSafety && target === QA_PRODUCTION_TARGET) {
    if (!HEX_64.test(String(attestation.prewriteBackupSha256).trim().toLowerCase())
      || String(attestation.prewriteBackupTargetDatabaseServiceId).trim() !== target.databaseServiceId
      || String(attestation.prewriteRestoreVerified).trim().toLowerCase() !== "true"
      || String(attestation.prewriteBackupRunId).trim() !== String(attestation.runId).trim()
      || String(attestation.prewriteRestoreEvidenceRef).trim().length < 8) {
      throw new QaProvisioningError("QA_PROD_PREWRITE_ATTESTATION_INVALID", "Atestado externo nao comprova backup/restore do mesmo run.");
    }
  }
  return { ...attestation, databaseUrlSha256: effectiveUrlHash };
}

function assertPrewriteSafety({ env, target, runId, attestation, allowTestAttestation = false }) {
  if (allowTestAttestation) return;
  if (target !== QA_PRODUCTION_TARGET) return;
  const required = {
    backupSha256: env.QA_PROD_PREWRITE_BACKUP_SHA256,
    backupRunId: env.QA_PROD_PREWRITE_BACKUP_RUN_ID,
    backupTargetDatabaseServiceId: env.QA_PROD_PREWRITE_BACKUP_TARGET_DB_SERVICE_ID,
    restoreVerified: env.QA_PROD_PREWRITE_RESTORE_VERIFIED,
  };
  if (!HEX_64.test(String(required.backupSha256 || "").trim().toLowerCase())
    || String(required.backupRunId || "").trim() !== String(runId || "").trim()
    || String(required.backupTargetDatabaseServiceId || "").trim() !== target.databaseServiceId
    || String(required.restoreVerified || "").trim().toLowerCase() !== "true") {
    throw new QaProvisioningError("QA_PROD_PREWRITE_SAFETY_REQUIRED", "Apply de producao exige backup novo, hash, restore drill e run ID vinculados.");
  }
  if (!attestation || String(attestation.prewriteBackupSha256).trim().toLowerCase() !== String(required.backupSha256).trim().toLowerCase()
    || String(attestation.prewriteBackupRunId).trim() !== String(required.backupRunId).trim()
    || String(attestation.prewriteBackupTargetDatabaseServiceId).trim() !== target.databaseServiceId
    || String(attestation.prewriteRestoreVerified).trim().toLowerCase() !== "true") {
    throw new QaProvisioningError("QA_PROD_PREWRITE_ATTESTATION_INVALID", "Backup/restore nao esta vinculado ao atestado externo e ao run.");
  }
}

function assertTarget(env = process.env, options = {}) {
  const requestedTarget = options.target;
  const target = requestedTarget === "staging"
    ? QA_STAGING_TARGET
    : requestedTarget === "production"
      ? QA_PRODUCTION_TARGET
      : requestedTarget === undefined || requestedTarget === null
        ? (String(env.QA_PROD_TARGET_ENV || "").trim().toLowerCase() === "staging" ? QA_STAGING_TARGET : QA_PRODUCTION_TARGET)
        : requestedTarget === QA_PRODUCTION_TARGET || requestedTarget === QA_STAGING_TARGET
          ? requestedTarget
          : null;
  if (!target || typeof target !== "object" || !target.projectId || !target.environmentId || !target.apiServiceId || !target.databaseServiceId) {
    throw new QaProvisioningError("QA_PROD_TARGET_INVALID", "Alvo QA nao pertence a allowlist conhecida.");
  }
  const expectedReleaseHead = String(
    options.expectedReleaseHead
      || env.QA_PROD_EXPECTED_RELEASE_HEAD
      || "",
  ).trim().toLowerCase();
  const expected = {
    nodeEnv: target === QA_STAGING_TARGET ? "production" : "production",
    provider: "postgresql",
    projectId: target.projectId,
    environmentId: target.environmentId,
    apiServiceId: target.apiServiceId,
    workerServiceId: target.workerServiceId || null,
    databaseServiceId: target.databaseServiceId,
    releaseHead: expectedReleaseHead,
  };
  const actual = {
    nodeEnv: String(env.NODE_ENV || "").trim().toLowerCase(),
    provider: String(env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase(),
    projectId: String(env.RAILWAY_PROJECT_ID || "").trim(),
    environmentId: String(env.RAILWAY_ENVIRONMENT_ID || "").trim(),
    apiServiceId: String(env.RAILWAY_SERVICE_ID || "").trim(),
    workerServiceId: String(env.QA_PROD_WORKER_SERVICE_ID || "").trim(),
    databaseServiceId: String(env.QA_PROD_DB_SERVICE_ID || "").trim(),
    releaseHead: String(env.QA_PROD_RELEASE_HEAD || "").trim().toLowerCase(),
  };
  const mismatches = Object.keys(expected).filter((key) => expected[key] !== null && actual[key] !== expected[key]);
  if (!expected.releaseHead || !HEX_40.test(expected.releaseHead)) mismatches.push("expectedReleaseHead");
  if (!actual.releaseHead || !HEX_40.test(actual.releaseHead)) mismatches.push("actualReleaseHead");
  if (target.workerServiceId && !actual.workerServiceId) mismatches.push("workerServiceId");
  if (mismatches.length) {
    throw new QaProvisioningError("QA_PROD_TARGET_MISMATCH", "Alvo QA de producao nao coincide com a allowlist.", { mismatches });
  }
  const databaseUrl = normalizeDatabaseUrl(env.DATABASE_URL || env.POSTGRES_DATABASE_URL);
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new QaProvisioningError("QA_PROD_POSTGRES_REQUIRED", "Bootstrap QA exige URL PostgreSQL explicita.");
  }
  if (env.DATABASE_URL && env.POSTGRES_DATABASE_URL && normalizeDatabaseUrl(env.DATABASE_URL) !== normalizeDatabaseUrl(env.POSTGRES_DATABASE_URL)) {
    throw new QaProvisioningError("QA_PROD_DATABASE_URL_DIVERGENCE", "DATABASE_URL e POSTGRES_DATABASE_URL divergem; nao e seguro escolher uma silenciosamente.");
  }
  if (options.requireExplicitTarget && !String(env.QA_PROD_TARGET_ENV || "").trim()) {
    throw new QaProvisioningError("QA_PROD_TARGET_EXPLICIT_REQUIRED", "O alvo deve ser declarado explicitamente.");
  }
  const declaredTarget = String(env.QA_PROD_TARGET_ENV || "").trim().toLowerCase();
  const expectedTargetName = target === QA_STAGING_TARGET ? "staging" : "production";
  if (declaredTarget && declaredTarget !== expectedTargetName) throw new QaProvisioningError("QA_PROD_TARGET_MISMATCH", "Alvo declarado diverge da allowlist selecionada.");
  const attestation = options.requireOperationalAttestation
    ? assertOperationalAttestation({ env, target, expectedReleaseHead, attestation: readControlPlaneAttestation(env, options), requireHarnessParity: options.requireHarnessParity === true, requirePrewriteSafety: options.requirePrewriteSafety === true, runId: options.runId })
    : null;
  const baseRelease = String(env.QA_PROD_BASE_PRODUCTION_RELEASE_HEAD || target.baseProductionReleaseHead || "").trim().toLowerCase();
  if (target === QA_PRODUCTION_TARGET && options.requireOperationalAttestation && !String(env.QA_PROD_BASE_PRODUCTION_RELEASE_HEAD || "").trim()) {
    throw new QaProvisioningError("QA_PROD_BASE_RELEASE_EXPLICIT_REQUIRED", "O apply de producao exige o SHA-base explicitamente atestado.");
  }
  if (target === QA_PRODUCTION_TARGET && baseRelease !== target.baseProductionReleaseHead) {
    throw new QaProvisioningError("QA_PROD_BASE_RELEASE_MISMATCH", "Release base de producao nao coincide com a allowlist.");
  }
  if (String(env.PLATFORM_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).some((email) => expectedUserMap().has(email))) {
    throw new QaProvisioningError("QA_PROD_EMAIL_PLATFORM_COLLISION", "E-mail QA reservado nao pode ser operador global da plataforma.");
  }
  return { expected, actual, target, attestation, databaseUrlSha256: sha256(databaseUrl) };
}

function assertApplyConfirmation(value) {
  if (String(value || "") !== APPLY_CONFIRMATION) {
    throw new QaProvisioningError("QA_PROD_APPLY_CONFIRMATION_REQUIRED", "Confirmacao explicita do apply ausente.");
  }
}

function assertRevokeConfirmation(value, emergency = false) {
  const expected = emergency ? EMERGENCY_REVOKE_CONFIRMATION : REVOKE_CONFIRMATION;
  if (String(value || "") !== expected) {
    throw new QaProvisioningError("QA_PROD_REVOKE_CONFIRMATION_REQUIRED", "Confirmacao explicita do revoke ausente.");
  }
}

function assertCredentials(passwordHashes = {}) {
  const expected = expectedUserMap();
  const received = Object.keys(passwordHashes).sort();
  const required = [...expected.keys()].sort();
  if (JSON.stringify(received) !== JSON.stringify(required)) {
    throw new QaProvisioningError("QA_PROD_CREDENTIAL_HASH_SET_INVALID", "Conjunto de hashes QA divergente.");
  }
  for (const email of required) {
    const hash = String(passwordHashes[email] || "");
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
      throw new QaProvisioningError("QA_PROD_CREDENTIAL_HASH_INVALID", "Hash de credencial QA invalido.");
    }
  }
}

async function safeCount(client, modelName, where = {}) {
  const model = client[modelName];
  return typeof model?.count === "function" ? model.count({ where }) : 0;
}

async function strictCount(client, modelName, where = {}) {
  const model = client[modelName];
  if (typeof model?.count !== "function") throw new QaProvisioningError("QA_PROD_SCHEMA_MODEL_MISSING", "Modelo obrigatório do harness QA não está disponível.", { model: modelName });
  return model.count({ where });
}

async function safeUpdateMany(client, modelName, where, data) {
  const model = client[modelName];
  return typeof model?.updateMany === "function" ? model.updateMany({ where, data }) : { count: 0 };
}

async function strictUpdateMany(client, modelName, where, data) {
  const model = client[modelName];
  if (typeof model?.updateMany !== "function") throw new QaProvisioningError("QA_PROD_SCHEMA_MODEL_MISSING", "Modelo obrigatório do cleanup QA não está disponível.", { model: modelName });
  return model.updateMany({ where, data });
}

async function strictDeleteMany(client, modelName, where) {
  const model = client[modelName];
  if (typeof model?.deleteMany !== "function") throw new QaProvisioningError("QA_PROD_SCHEMA_MODEL_MISSING", "Modelo obrigatório do cleanup QA não está disponível.", { model: modelName });
  return model.deleteMany({ where });
}

async function acquireQaDatabaseLease(prisma, { runId, ttlMs = 15 * 60 * 1000, ownerToken = crypto.randomUUID() } = {}) {
  if (!QA_RUN_ID.test(String(runId || ""))) throw new QaProvisioningError("QA_PROD_RUN_ID_REQUIRED", "Lease QA exige run ID valido.");
  if (typeof prisma.workerCheckpoint?.findUnique !== "function") throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_UNAVAILABLE", "Lease distribuido QA nao esta disponivel no schema/runtime.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = Date.now();
        const current = await tx.workerCheckpoint.findUnique({ where: { chave: QA_DATABASE_LOCK_KEY }, select: { chave: true, cursorJson: true, revisao: true } });
        let previous = null;
        if (current?.cursorJson) {
          try { previous = JSON.parse(current.cursorJson); } catch { throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_CORRUPT", "Lease QA persistido esta corrompido."); }
        }
        if (previous?.owner && Number(previous.expiresAt || 0) > now && previous.ownerToken !== ownerToken) {
          throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_HELD", "Outra execucao QA ainda possui o lease distribuido.");
        }
        const lease = { owner: runId, ownerToken, acquiredAt: new Date(now).toISOString(), expiresAt: now + ttlMs };
        if (!current) {
          await tx.workerCheckpoint.create({ data: { chave: QA_DATABASE_LOCK_KEY, cursorJson: JSON.stringify(lease), revisao: 1 } });
        } else {
          const changed = await tx.workerCheckpoint.updateMany({ where: { chave: QA_DATABASE_LOCK_KEY, revisao: current.revisao, cursorJson: current.cursorJson }, data: { cursorJson: JSON.stringify(lease), revisao: current.revisao + 1 } });
          if (changed.count !== 1) throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_CONFLICT", "Lease QA perdeu a corrida de CAS.");
        }
        return lease;
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 });
    } catch (error) {
      if (error?.code === "P2002" || error?.code === "P2034" || error?.code === "P2028") {
        if (attempt === 2) throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_CONFLICT", "Lease QA nao convergiu apos tentativas limitadas.");
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new QaProvisioningError("QA_PROD_DATABASE_LOCK_CONFLICT", "Lease QA nao convergiu.");
}

async function releaseQaDatabaseLease(prisma, { runId, ownerToken } = {}) {
  if (!QA_RUN_ID.test(String(runId || "")) || typeof prisma.workerCheckpoint?.findUnique !== "function") return false;
  const current = await prisma.workerCheckpoint.findUnique({ where: { chave: QA_DATABASE_LOCK_KEY }, select: { cursorJson: true, revisao: true } });
  if (!current?.cursorJson) return true;
  let lease;
  try { lease = JSON.parse(current.cursorJson); } catch { return false; }
  if (lease.owner !== runId || !ownerToken || lease.ownerToken !== ownerToken) return false;
  const changed = await prisma.workerCheckpoint.updateMany({ where: { chave: QA_DATABASE_LOCK_KEY, revisao: current.revisao, cursorJson: current.cursorJson }, data: { cursorJson: null, revisao: current.revisao + 1 } });
  return changed.count === 1;
}

async function providerIsolationState(client, empresaId) {
  const [metaCredentials, integrations, channels, metaCredentialResidual, metaCredentialCiphertextResidual, integrationCredentials, channelCredentials, enabledFeatures, aiSettings, notificationSettings, emailOutbox, emailOutboxPayloadResidual, emailOutboxLeaseResidual, pendingWebhookEvents, webhookPayloadResidual, webhookLeaseResidual, oauthStates, mailboxes, activeInvites, activePasswordResets, activeAutomationRules, pendingAutomationRuns, pendingAutomationJobs, automationJobLeaseResidual, activeLeases] = await Promise.all([
    strictCount(client, "metaCredential", { empresaId, status: "ATIVA", removedAt: null }),
    strictCount(client, "integracao", { empresaId, ativo: true }),
    strictCount(client, "canalIntegracao", { empresaId, ativo: true }),
    strictCount(client, "metaCredential", { empresaId, status: { in: ["ATIVA", "ROTACAO_PENDENTE", "ERRO"] }, removedAt: null }),
    strictCount(client, "metaCredential", { empresaId, ciphertext: { not: "" } }),
    strictCount(client, "integracao", { empresaId, credenciaisCriptografadas: { not: null } }),
    strictCount(client, "canalIntegracao", { empresaId, accessTokenRef: { not: null } }),
    strictCount(client, "empresaFuncionalidade", { empresaId, chave: { in: EXTERNAL_FEATURE_KEYS }, habilitada: true }),
    strictCount(client, "aICommerceSettings", { empresaId, enabled: true }),
    strictCount(client, "configuracaoNotificacaoEmpresa", { empresaId, habilitada: true }),
    strictCount(client, "emailDeliveryOutbox", { empresaId, status: { in: ["PENDING", "PROCESSING", "RETRY_WAIT"] } }),
    strictCount(client, "emailDeliveryOutbox", { empresaId, payloadCiphertext: { not: null } }),
    strictCount(client, "emailDeliveryOutbox", { empresaId, OR: [{ leaseOwner: { not: null } }, { leaseToken: { not: null } }, { leaseExpiresAt: { not: null } }] }),
    strictCount(client, "eventoWebhook", { empresaId, statusProcessamento: { in: ["RECEBIDO", "PROCESSANDO"] } }),
    strictCount(client, "eventoWebhook", { empresaId, payloadJson: { not: null } }),
    strictCount(client, "eventoWebhook", { empresaId, OR: [{ leaseOwner: { not: null } }, { leaseExpiresAt: { not: null } }, { nextAttemptAt: { not: null } }] }),
    strictCount(client, "integracaoOAuthState", { empresaId, usedAt: null }),
    strictCount(client, "emailMailboxAddress", { empresaId }),
    strictCount(client, "conviteUsuario", { empresaId, revogadoEm: null, aceitoEm: null }),
    strictCount(client, "tokenRecuperacaoSenha", { empresaId, revogadoEm: null, usadoEm: null }),
    strictCount(client, "automacaoRegra", { empresaId, ativa: true }),
    strictCount(client, "automacaoExecucao", { empresaId, status: { in: ["PENDENTE", "PROCESSANDO"] } }),
    strictCount(client, "automacaoAcaoJob", { empresaId, status: { in: ["PENDENTE", "PROCESSANDO"] } }),
    strictCount(client, "automacaoAcaoJob", { empresaId, OR: [{ leaseOwner: { not: null } }, { leaseExpiresAt: { not: null } }, { nextAttemptAt: { not: null } }] }),
    strictCount(client, "operacaoDistribuidaLease", { empresaId }),
  ]);
  return { metaCredentials, integrations, channels, metaCredentialResidual, metaCredentialCiphertextResidual, integrationCredentials, channelCredentials, enabledFeatures, aiSettings, notificationSettings, emailOutbox, emailOutboxPayloadResidual, emailOutboxLeaseResidual, pendingWebhookEvents, webhookPayloadResidual, webhookLeaseResidual, oauthStates, mailboxes, activeInvites, activePasswordResets, activeAutomationRules, pendingAutomationRuns, pendingAutomationJobs, automationJobLeaseResidual, activeLeases };
}

function providerIsolationSafe(state) {
  return Object.values(state).every((value) => value === 0);
}

function assertExactTenantUsers(users, spec, code = "QA_PROD_TENANT_STATE_INVALID") {
  const expected = new Map(spec.users.map((user) => [user.email, user]));
  const exact = users.length === spec.users.length
    && users.every((user) => {
      const wanted = expected.get(user.email);
      return Boolean(wanted) && user.nome === wanted.name && user.papel === wanted.role;
    });
  if (!exact) throw new QaProvisioningError(code, "Conjunto de identidades QA divergiu durante a transacao.", { slug: spec.slug });
}

async function canonicalFeatureState(client, empresaId) {
  if (typeof client.empresaFuncionalidade?.findFirst !== "function") return null;
  return client.empresaFuncionalidade.findFirst({
    where: { empresaId, chave: QA_CANONICAL_FEATURE },
    select: { id: true, empresaId: true, chave: true, habilitada: true, habilitadoEm: true, habilitadoPorUsuarioId: true },
  });
}

async function tenantDataInventory(client, empresaId) {
  const [clientes, negocios, propostas, vendas, contratos, itensVendas, historicoVendas] = await Promise.all([
    safeCount(client, "cliente", { empresaId }),
    safeCount(client, "negocio", { empresaId }),
    safeCount(client, "propostaComercial", { empresaId }),
    safeCount(client, "vendaCanonica", { empresaId }),
    safeCount(client, "negocioContratoVenda", { empresaId }),
    safeCount(client, "itemVendaCanonica", { empresaId }),
    safeCount(client, "historicoVendaCanonica", { empresaId }),
  ]);
  return { clientes, negocios, propostas, vendas, contratos, itensVendas, historicoVendas };
}

async function sessionLifecycleState(client, empresaId, userIds) {
  const sessions = userIds.length && typeof client.sessaoUsuario?.findMany === "function"
    ? await client.sessaoUsuario.findMany({ where: { empresaId, usuarioId: { in: userIds } }, select: { id: true, revogadoEm: true } })
    : [];
  const sessionIds = sessions.map((session) => session.id);
  const activeSessions = sessions.filter((session) => session.revogadoEm === null).length;
  const activeRefreshTokens = sessionIds.length ? await safeCount(client, "sessaoRefreshToken", { empresaId, sessaoId: { in: sessionIds }, revogadoEm: null }) : 0;
  return { totalSessions: sessions.length, activeSessions, activeRefreshTokens };
}

async function inspectTenant(client, spec) {
  const tenant = await client.empresa.findUnique({ where: { slug: spec.slug }, select: { id: true, nome: true, slug: true, ativo: true } });
  if (!tenant) return { key: spec.key, slug: spec.slug, exists: false, state: "ABSENT_SAFE", users: [], providerIsolation: null, feature: null, dataInventory: null, sessions: null };
  const users = await client.usuario.findMany({ where: { empresaId: tenant.id, email: { not: "sistema@crm.internal" } }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true }, orderBy: { email: "asc" } });
  const expectedByEmail = new Map(spec.users.map((user) => [user.email, user]));
  const unexpectedUsers = users.filter((user) => !expectedByEmail.has(user.email));
  const missingUsers = spec.users.filter((user) => !users.some((candidate) => candidate.email === user.email));
  const mismatchedUsers = users.filter((user) => {
    const expected = expectedByEmail.get(user.email);
    return !expected || user.nome !== expected.name || user.papel !== expected.role;
  });
  const expectedUsersPresent = spec.users.every((expected) => users.some((user) => user.email === expected.email));
  const providerIsolation = await providerIsolationState(client, tenant.id);
  const feature = await canonicalFeatureState(client, tenant.id);
  const sessions = await sessionLifecycleState(client, tenant.id, users.map((user) => user.id));
  const dataInventory = await tenantDataInventory(client, tenant.id);
  const exactUsers = users.length === spec.users.length && expectedUsersPresent && mismatchedUsers.length === 0;
  const ready = tenant.ativo === true && exactUsers && users.every((user) => user.ativo === true) && feature?.habilitada === true && providerIsolationSafe(providerIsolation);
  const revoked = tenant.ativo === false && exactUsers && users.every((user) => user.ativo === false) && feature?.habilitada !== true && providerIsolationSafe(providerIsolation) && sessions.activeSessions === 0 && sessions.activeRefreshTokens === 0 && providerIsolation.activeInvites === 0 && providerIsolation.activePasswordResets === 0 && providerIsolation.emailOutbox === 0 && providerIsolation.pendingAutomationRuns === 0 && providerIsolation.pendingAutomationJobs === 0;
  const invalid = tenant.nome !== spec.name || unexpectedUsers.length > 0 || missingUsers.length > 0 || mismatchedUsers.length > 0 || (!ready && !revoked);
  const state = invalid ? "INVALID" : ready ? "READY" : "REVOKED";
  return {
    key: spec.key,
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.nome,
    active: tenant.ativo,
    exists: true,
    state,
    expectedUsers: spec.users.length,
    users: users.map((user) => ({ ...user, expected: expectedByEmail.has(user.email) && user.nome === expectedByEmail.get(user.email).name && user.papel === expectedByEmail.get(user.email).role })),
    unexpectedUsers: unexpectedUsers.length,
    missingUsers: missingUsers.length,
    mismatchedUsers: mismatchedUsers.length,
    providerIsolation,
    providerIsolationSafe: providerIsolationSafe(providerIsolation),
    feature: feature ? { chave: feature.chave, habilitada: feature.habilitada } : null,
    sessions,
    dataInventory,
  };
}

async function inspectQaState({ prisma, env = process.env, expectedReleaseHead, target, requireOperationalAttestation = false, requireHarnessParity = false, allowTestAttestation = false, attestation }) {
  const targetInfo = assertTarget(env, { expectedReleaseHead, target, requireOperationalAttestation: requireOperationalAttestation && !allowTestAttestation, requireHarnessParity: requireHarnessParity && !allowTestAttestation, attestation });
  const tenants = [];
  for (const spec of QA_TENANTS) tenants.push(await inspectTenant(prisma, spec));
  const states = tenants.map((tenant) => tenant.state);
  const status = states.includes("INVALID") ? "INVALID" : states.every((state) => state === "ABSENT_SAFE") ? "ABSENT_SAFE" : states.every((state) => state === "READY") ? "READY" : states.every((state) => state === "REVOKED") ? "REVOKED" : "MIXED";
  return { status, mode: "read-only", target: targetInfo.target, tenants, qaTenantCount: tenants.filter((tenant) => tenant.exists !== false).length, credentialsInOutput: 0 };
}

async function preflightExisting(client, spec) {
  const inspection = await inspectTenant(client, spec);
  if (inspection.state === "ABSENT_SAFE") return { tenant: null, users: [], providerIsolation: null, feature: null, state: inspection.state, inspection };
  if (inspection.state === "INVALID") {
    const code = inspection.name !== spec.name ? "QA_PROD_TENANT_IDENTITY_MISMATCH" : inspection.unexpectedUsers ? "QA_PROD_UNEXPECTED_USER" : inspection.missingUsers ? "QA_PROD_USER_SET_INVALID" : inspection.mismatchedUsers ? "QA_PROD_USER_IDENTITY_MISMATCH" : inspection.providerIsolationSafe === false ? "QA_PROD_PROVIDER_STATE_NOT_ISOLATED" : "QA_PROD_TENANT_STATE_INVALID";
    throw new QaProvisioningError(code, "Estado atual do tenant QA nao e seguro para reutilizacao.", { slug: spec.slug, state: inspection.state });
  }
  const tenant = await client.empresa.findUnique({ where: { slug: spec.slug }, select: { id: true, nome: true, slug: true, ativo: true } });
  const users = await client.usuario.findMany({ where: { empresaId: tenant.id, email: { not: "sistema@crm.internal" } }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
  return { tenant, users, providerIsolation: inspection.providerIsolation, feature: inspection.feature, state: inspection.state, inspection };
}

async function resolveAuthorizedOperator(client, { env = process.env, operatorUsuarioId, allowTestAttestation = false }) {
  const id = Number(operatorUsuarioId || env.QA_PROD_OPERATOR_USER_ID);
  if (allowTestAttestation) return Number.isInteger(id) && id > 0 ? id : 999;
  if (!Number.isInteger(id) || id < 1) throw new QaProvisioningError("QA_PROD_OPERATOR_REQUIRED", "Operador autorizado deve ser informado fora do contexto de teste.");
  const operator = await client.usuario.findUnique({ where: { id }, select: { id: true, email: true, ativo: true } });
  const allowed = new Set(String(env.PLATFORM_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!operator || operator.ativo !== true || !allowed.has(String(operator.email || "").trim().toLowerCase())) throw new QaProvisioningError("QA_PROD_OPERATOR_INVALID", "Operador nao e uma identidade de plataforma ativa e allowlisted.");
  if (await safeCount(client, "usuario", { email: String(operator.email).trim().toLowerCase() }) !== 1) throw new QaProvisioningError("QA_PROD_OPERATOR_EMAIL_AMBIGUOUS", "E-mail do operador nao e globalmente unico.");
  return operator.id;
}

async function writeSecurityAudit(tx, { empresaId, actorUsuarioId, targetUsuarioId = null, action, reason, runId }) {
  if (!Number.isInteger(actorUsuarioId) || actorUsuarioId < 1 || !runId) throw new QaProvisioningError("QA_PROD_AUDIT_CONTEXT_REQUIRED", "Auditoria QA exige ator autorizado e run ID.");
  if (typeof tx.auditoriaSeguranca?.create !== "function") throw new QaProvisioningError("QA_PROD_AUDIT_UNAVAILABLE", "Auditoria de seguranca nao esta disponivel no schema/runtime.");
  await tx.auditoriaSeguranca.create({ data: { empresaId, actorUsuarioId, targetUsuarioId, acao: action, resultado: "SUCCESS", motivo: reason, correlationId: runId } });
}

async function writePlatformAudit(tx, { actorUsuarioId, tenantId, tenantName, tenantSlug, adminUserId, action, allowTestAttestation = false }) {
  if (typeof tx.platformTenantAudit?.create !== "function") {
    if (!allowTestAttestation) throw new QaProvisioningError("QA_PROD_PLATFORM_AUDIT_UNAVAILABLE", "Auditoria de plataforma nao esta disponivel no schema/runtime.");
    return;
  }
  await tx.platformTenantAudit.create({ data: { actorUserId: actorUsuarioId, tenantId, action, tenantName, tenantSlug, adminUserId } });
}

async function setCanonicalFeature(tx, { empresaId, enabled, actorUsuarioId, runId, allowTestAttestation = false }) {
  const current = await canonicalFeatureState(tx, empresaId);
  if (current?.habilitada === enabled) return { changed: false, feature: current };
  const now = new Date();
  const data = { empresaId, chave: QA_CANONICAL_FEATURE, habilitada: enabled, habilitadoEm: enabled ? now : null, habilitadoPorUsuarioId: null };
  const feature = current
    ? await tx.empresaFuncionalidade.update({ where: { id: current.id }, data })
    : await tx.empresaFuncionalidade.create({ data });
  if (typeof tx.auditoriaFuncionalidade?.create !== "function") {
    if (!allowTestAttestation) throw new QaProvisioningError("QA_PROD_FEATURE_AUDIT_UNAVAILABLE", "Auditoria da capability canônica indisponivel.");
  } else {
    await tx.auditoriaFuncionalidade.create({ data: { empresaId, funcionalidadeId: feature.id, chave: QA_CANONICAL_FEATURE, valorAnterior: current?.habilitada ?? null, valorNovo: enabled, operadoPor: "qa-prod-bootstrap", usuarioId: actorUsuarioId, motivo: enabled ? "Capability canônica temporária para QA." : "Encerramento do tenant QA." } });
  }
  return { changed: true, feature };
}

async function provisionSyntheticQa({ prisma, env = process.env, passwordHashes, apply = false, confirmation, expectedReleaseHead, target, operatorUsuarioId, runId, allowTestAttestation = false, attestation }) {
  const resolvedRunId = String(runId || env.QA_PROD_RUN_ID || "").trim();
  const requireRuntimeAttestation = !allowTestAttestation;
  const targetInfo = assertTarget(env, { expectedReleaseHead, target, runId: resolvedRunId, requireOperationalAttestation: requireRuntimeAttestation, requireHarnessParity: requireRuntimeAttestation, requirePrewriteSafety: apply && requireRuntimeAttestation, requireExplicitTarget: requireRuntimeAttestation, attestation });
  if (!apply) return inspectQaState({ prisma, env, expectedReleaseHead, target: targetInfo.target, requireOperationalAttestation: requireRuntimeAttestation, requireHarnessParity: requireRuntimeAttestation, allowTestAttestation, attestation });
  assertApplyConfirmation(confirmation);
  if (env.NEGOCIOS_KANBAN_ENABLED !== "true") throw new QaProvisioningError("QA_PROD_CANONICAL_FEATURE_GLOBAL_DISABLED", "Capability global de negócios não está habilitada; não alterar flag global pelo bootstrap.");
  if (!QA_RUN_ID.test(resolvedRunId)) throw new QaProvisioningError("QA_PROD_RUN_ID_REQUIRED", "Apply exige run ID QA estável e auditável.");
  assertPrewriteSafety({ env, target: targetInfo.target, runId: resolvedRunId, attestation: targetInfo.attestation, allowTestAttestation });
  const actorId = await resolveAuthorizedOperator(prisma, { env, operatorUsuarioId, allowTestAttestation });
  const before = await inspectQaState({ prisma, env, expectedReleaseHead, target: targetInfo.target, requireOperationalAttestation: !allowTestAttestation, requireHarnessParity: !allowTestAttestation, allowTestAttestation, attestation });
  if (before.status === "INVALID" || before.status === "MIXED") {
    const invalidTenant = before.tenants.find((tenant) => tenant.state === "INVALID");
    if (!invalidTenant) throw new QaProvisioningError("QA_PROD_STATE_INVALID", "Estado QA atual nao permite apply seguro.", { status: before.status });
    // Deixa o preflight transacional abaixo classificar a causa exata (slug,
    // identidade, provider ou capability) sem perder o rollback integral.
  }
  if (before.status === "READY") return {
    status: "READY",
    mode: "noop",
    target: targetInfo.target,
    tenants: before.tenants.filter((tenant) => tenant.exists !== false).map((tenant) => ({
      key: tenant.key,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, active: tenant.active },
      users: tenant.users.map((user) => ({ id: user.id, empresaId: user.empresaId, email: user.email, papel: user.papel, ativo: user.ativo })),
    })),
    runId: resolvedRunId,
    credentialsInOutput: 0,
  };
  assertCredentials(passwordHashes);

  const result = await prisma.$transaction(async (tx) => {
    const preflight = [];
    for (const spec of QA_TENANTS) preflight.push({ spec, ...(await preflightExisting(tx, spec)) });
    for (const spec of QA_TENANTS.flatMap((tenant) => tenant.users)) {
      const matches = await tx.usuario.findMany({ where: { email: spec.email }, select: { id: true, empresaId: true } });
      const expectedTenant = QA_TENANTS.find((tenant) => tenant.users.some((user) => user.email === spec.email));
      const existingTenant = preflight.find((item) => item.spec.key === expectedTenant.key)?.tenant;
      if (matches.some((user) => !existingTenant || user.empresaId !== existingTenant.id)) throw new QaProvisioningError("QA_PROD_EMAIL_COLLISION", "E-mail QA reservado pertence a tenant inesperado.", { email: spec.email });
    }
    const output = [];
    for (const item of preflight) {
      const tenant = item.tenant || await tx.empresa.create({ data: { nome: item.spec.name, slug: item.spec.slug, ativo: true }, select: { id: true, nome: true, slug: true, ativo: true } });
      if (!tenant.ativo) await tx.empresa.update({ where: { id: tenant.id }, data: { ativo: true } });
      const users = [];
      for (const spec of item.spec.users) {
        const existing = item.users.find((user) => user.email === spec.email);
        let user;
        if (existing) {
          const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: tenant.id, usuarioId: existing.id }, select: { id: true } });
          const sessionIds = sessions.map((session) => session.id);
          if (sessionIds.length) await tx.sessaoRefreshToken.updateMany({ where: { empresaId: tenant.id, sessaoId: { in: sessionIds }, revogadoEm: null }, data: { revogadoEm: new Date() } });
          await tx.sessaoUsuario.updateMany({ where: { empresaId: tenant.id, usuarioId: existing.id, revogadoEm: null }, data: { revogadoEm: new Date(), motivoRevogacao: "QA_BOOTSTRAP_REACTIVATE" } });
          user = await tx.usuario.update({ where: { id: existing.id }, data: { nome: spec.name, papel: spec.role, ativo: true, senhaHash: passwordHashes[spec.email] }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
        } else {
          user = await tx.usuario.create({ data: { empresaId: tenant.id, nome: spec.name, email: spec.email, senhaHash: passwordHashes[spec.email], papel: spec.role, ativo: true }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
        }
        users.push(user);
        await writeSecurityAudit(tx, { empresaId: tenant.id, actorUsuarioId: actorId, targetUsuarioId: user.id, action: "QA_SYNTHETIC_IDENTITY_PROVISIONED", reason: "Bootstrap interno QA-only.", runId: resolvedRunId });
      }
      await setCanonicalFeature(tx, { empresaId: tenant.id, enabled: true, actorUsuarioId: actorId, runId: resolvedRunId, allowTestAttestation });
      const admin = users.find((user) => user.papel === "ADMIN");
      await writePlatformAudit(tx, { actorUsuarioId: actorId, tenantId: tenant.id, tenantName: tenant.nome, tenantSlug: tenant.slug, adminUserId: admin.id, action: item.tenant ? "QA_TENANT_REACTIVATED" : "QA_TENANT_PROVISIONED", allowTestAttestation });
      await writeSecurityAudit(tx, { empresaId: tenant.id, actorUsuarioId: actorId, targetUsuarioId: admin.id, action: "QA_SYNTHETIC_TENANT_PROVISIONED", reason: "Tenant reservado para testes sintéticos.", runId: resolvedRunId });
      output.push({ key: item.spec.key, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.nome, active: true }, users: users.map((user) => ({ id: user.id, empresaId: user.empresaId, email: user.email, papel: user.papel, ativo: user.ativo })) });
    }
    return output;
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
  const after = await inspectQaState({ prisma, env, expectedReleaseHead, target: targetInfo.target, requireOperationalAttestation: !allowTestAttestation, requireHarnessParity: !allowTestAttestation, allowTestAttestation, attestation });
  if (after.status !== "READY") throw new QaProvisioningError("QA_PROD_POST_APPLY_VERIFY_FAILED", "Apply terminou sem estado READY verificavel.", { status: after.status });
  return { status: "READY", mode: "apply", target: targetInfo.target, tenants: result, runId: resolvedRunId, credentialsInOutput: 0 };
}

async function quarantineTenantSessions(prisma, empresaId) {
  const users = typeof prisma.usuario?.findMany === "function" ? await prisma.usuario.findMany({ where: { empresaId, email: { not: "sistema@crm.internal" } }, select: { id: true } }) : [];
  const userIds = users.map((user) => user.id);
  if (!userIds.length) return { sessions: 0, refreshTokens: 0 };
  const sessions = typeof prisma.sessaoUsuario?.findMany === "function" ? await prisma.sessaoUsuario.findMany({ where: { empresaId, usuarioId: { in: userIds } }, select: { id: true, revogadoEm: true } }) : [];
  const sessionIds = sessions.map((session) => session.id);
  const refresh = sessionIds.length ? await strictUpdateMany(prisma, "sessaoRefreshToken", { empresaId, sessaoId: { in: sessionIds }, revogadoEm: null }, { revogadoEm: new Date() }) : { count: 0 };
  const revoked = await strictUpdateMany(prisma, "sessaoUsuario", { empresaId, usuarioId: { in: userIds }, revogadoEm: null }, { revogadoEm: new Date(), motivoRevogacao: "QA_BOOTSTRAP_QUARANTINE" });
  const tenant = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { ativo: true } });
  if (tenant?.ativo === true) await strictUpdateMany(prisma, "empresa", { id: empresaId, ativo: true }, { ativo: false });
  return { sessions: revoked.count, refreshTokens: refresh.count, tenantDeactivated: tenant?.ativo === true };
}

async function revokeSyntheticQa({ prisma, env = process.env, confirmation, expectedReleaseHead, target, operatorUsuarioId, runId, allowTestAttestation = false, attestation, emergency = false }) {
  const resolvedRunId = String(runId || env.QA_PROD_RUN_ID || "").trim();
  const targetInfo = assertTarget(env, { expectedReleaseHead, target, runId: resolvedRunId, requireOperationalAttestation: !allowTestAttestation, requireHarnessParity: !allowTestAttestation, requirePrewriteSafety: !allowTestAttestation, requireExplicitTarget: !allowTestAttestation, attestation });
  assertRevokeConfirmation(confirmation, emergency);
  if (!QA_RUN_ID.test(resolvedRunId)) throw new QaProvisioningError("QA_PROD_RUN_ID_REQUIRED", "Revoke exige run ID QA estavel e auditavel.");
  assertPrewriteSafety({ env, target: targetInfo.target, runId: resolvedRunId, attestation: targetInfo.attestation, allowTestAttestation });
  const actorId = await resolveAuthorizedOperator(prisma, { env, operatorUsuarioId, allowTestAttestation });
  const before = await inspectQaState({ prisma, env, expectedReleaseHead, target: targetInfo.target, requireOperationalAttestation: !allowTestAttestation, requireHarnessParity: !allowTestAttestation, allowTestAttestation, attestation });
  if (before.status === "INVALID" || before.status === "MIXED") {
    const invalidTenant = before.tenants.find((tenant) => tenant.state === "INVALID");
    if (!invalidTenant || invalidTenant.name !== QA_TENANTS.find((spec) => spec.slug === invalidTenant.slug)?.name || invalidTenant.unexpectedUsers > 0 || invalidTenant.missingUsers > 0 || invalidTenant.mismatchedUsers > 0) {
      throw new QaProvisioningError("QA_PROD_STATE_INVALID", "Estado QA atual nao permite revoke seguro.", { status: before.status });
    }
    // Resíduos operacionais/provedor são tratados pela rotina de quarentena e
    // não bloqueiam o revoke; a verificação final continuará fail-closed.
  }
  if (before.status === "REVOKED" || before.status === "ABSENT_SAFE") return { status: before.status, mode: "noop", target: targetInfo.target, tenants: before.tenants, runId: resolvedRunId, credentialsInOutput: 0 };
  const result = await prisma.$transaction(async (tx) => {
    const output = [];
    for (const spec of QA_TENANTS) {
      const tenant = await tx.empresa.findUnique({ where: { slug: spec.slug }, select: { id: true, nome: true, slug: true, ativo: true } });
      if (!tenant) {
        output.push({ key: spec.key, state: "ABSENT_SAFE" });
        continue;
      }
      const inspection = await inspectTenant(tx, spec);
      if (inspection.name !== spec.name || inspection.unexpectedUsers > 0 || inspection.missingUsers > 0 || inspection.mismatchedUsers > 0) {
        throw new QaProvisioningError(inspection.unexpectedUsers ? "QA_PROD_UNEXPECTED_USER" : inspection.missingUsers ? "QA_PROD_USER_SET_INVALID" : "QA_PROD_TENANT_STATE_INVALID", "Tenant QA divergente durante revoke.", { slug: spec.slug });
      }
      // Revalida a identidade diretamente dentro da transação, antes de
      // qualquer efeito de quarentena. Uma remoção concorrente agora aborta o
      // lote inteiro em vez de deixar um revoke parcial.
      const usersBeforeQuarantine = await tx.usuario.findMany({ where: { empresaId: tenant.id, email: { not: "sistema@crm.internal" } }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
      assertExactTenantUsers(usersBeforeQuarantine, spec, "QA_PROD_USER_SET_INVALID");
      await quarantineTenantSessions(tx, tenant.id);
      // Resíduos operacionais conhecidos (convites, outbox, automações ou
      // credenciais) são justamente o que o revoke deve cancelar. Eles não
      // autorizam bloquear a quarentena; a pós-condição REVOKED continuará
      // falhando fechado se algum resíduo permanecer.
      const users = await tx.usuario.findMany({ where: { empresaId: tenant.id, email: { in: spec.users.map((user) => user.email) } }, select: { id: true, empresaId: true, nome: true, email: true, papel: true } });
      assertExactTenantUsers(users, spec, "QA_PROD_USER_SET_INVALID");
      const userIds = users.map((user) => user.id);
      const invites = await strictUpdateMany(tx, "conviteUsuario", { empresaId: tenant.id, revogadoEm: null, aceitoEm: null }, { revogadoEm: new Date() });
      const resets = await strictUpdateMany(tx, "tokenRecuperacaoSenha", { empresaId: tenant.id, revogadoEm: null, usadoEm: null }, { revogadoEm: new Date() });
      const outbox = await strictUpdateMany(tx, "emailDeliveryOutbox", { empresaId: tenant.id }, { status: "CANCELLED", failedAt: new Date(), lastErrorCode: "QA_TENANT_REVOKED", payloadCiphertext: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null });
      const metaCredentials = await strictUpdateMany(tx, "metaCredential", { empresaId: tenant.id }, { status: "REMOVIDA", removedAt: new Date(), ciphertext: "" });
      const integrations = await strictUpdateMany(tx, "integracao", { empresaId: tenant.id }, { ativo: false, status: "INATIVA", credenciaisCriptografadas: null });
      const channels = await strictUpdateMany(tx, "canalIntegracao", { empresaId: tenant.id }, { ativo: false, status: "INATIVO", accessTokenRef: null, credentialStatus: "REVOGADA" });
      const oauthStates = await strictUpdateMany(tx, "integracaoOAuthState", { empresaId: tenant.id, usedAt: null }, { usedAt: new Date() });
      const webhookEvents = await strictUpdateMany(tx, "eventoWebhook", { empresaId: tenant.id }, { statusProcessamento: "IGNORADO_DUPLICADO", erroCodigo: "QA_TENANT_REVOKED", payloadJson: null, nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null });
      const externalFeatures = await strictUpdateMany(tx, "empresaFuncionalidade", { empresaId: tenant.id, chave: { in: EXTERNAL_FEATURE_KEYS }, habilitada: true }, { habilitada: false, habilitadoEm: null, habilitadoPorUsuarioId: null });
      const aiSettings = await strictUpdateMany(tx, "aICommerceSettings", { empresaId: tenant.id, enabled: true }, { enabled: false, mode: "OFF", mockEnabled: false, actorUsuarioId: null, correlationId: resolvedRunId });
      const notificationSettings = await strictUpdateMany(tx, "configuracaoNotificacaoEmpresa", { empresaId: tenant.id, habilitada: true }, { habilitada: false });
      const mailboxes = await strictDeleteMany(tx, "emailMailboxAddress", { empresaId: tenant.id });
      const leases = await strictDeleteMany(tx, "operacaoDistribuidaLease", { empresaId: tenant.id });
      const rules = await strictUpdateMany(tx, "automacaoRegra", { empresaId: tenant.id, ativa: true }, { ativa: false });
      const runs = await strictUpdateMany(tx, "automacaoExecucao", { empresaId: tenant.id, status: { in: ["PENDENTE", "PROCESSANDO"] } }, { status: "CANCELADA", erroCodigo: "QA_TENANT_REVOKED" });
      const jobs = await strictUpdateMany(tx, "automacaoAcaoJob", { empresaId: tenant.id }, { status: "CANCELADO", erroCodigo: "QA_TENANT_REVOKED", nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null, resultadoJson: null });
      const feature = await setCanonicalFeature(tx, { empresaId: tenant.id, enabled: false, actorUsuarioId: actorId, runId: resolvedRunId, allowTestAttestation });
      if (userIds.length) await tx.usuario.updateMany({ where: { empresaId: tenant.id, id: { in: userIds }, ativo: true }, data: { ativo: false } });
      await tx.empresa.update({ where: { id: tenant.id }, data: { ativo: false } });
      await writeSecurityAudit(tx, { empresaId: tenant.id, actorUsuarioId: actorId, action: "QA_SYNTHETIC_ACCESS_REVOKED", reason: "Revogacao/quarentena do tenant QA.", runId: resolvedRunId });
      await writePlatformAudit(tx, { actorUsuarioId: actorId, tenantId: tenant.id, tenantName: tenant.nome, tenantSlug: tenant.slug, adminUserId: userIds.find((id) => users.find((user) => user.id === id && user.papel === "ADMIN")) || userIds[0], action: "QA_TENANT_REVOKED", allowTestAttestation });
      output.push({ key: spec.key, tenantId: tenant.id, usersDeactivated: userIds.length, invitesRevoked: invites.count, passwordResetsRevoked: resets.count, emailOutboxCancelled: outbox.count, metaCredentialsRevoked: metaCredentials.count, integrationsDisabled: integrations.count, channelsDisabled: channels.count, oauthStatesClosed: oauthStates.count, webhookEventsQuarantined: webhookEvents.count, externalFeaturesDisabled: externalFeatures.count, aiSettingsDisabled: aiSettings.count, notificationSettingsDisabled: notificationSettings.count, emailMailboxesRemoved: mailboxes.count, leasesRemoved: leases.count, automationRulesDisabled: rules.count, automationRunsCancelled: runs.count, automationJobsCancelled: jobs.count, canonicalFeatureDisabled: feature.changed, tenantActive: false, retainedData: inspection.dataInventory });
    }
    return output;
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
  const after = await inspectQaState({ prisma, env, expectedReleaseHead, target: targetInfo.target, requireOperationalAttestation: !allowTestAttestation, requireHarnessParity: !allowTestAttestation, allowTestAttestation, attestation });
  if (after.status !== "REVOKED" && after.status !== "ABSENT_SAFE") throw new QaProvisioningError("QA_PROD_POST_REVOKE_VERIFY_FAILED", "Revoke terminou sem estado REVOKED verificavel.", { status: after.status });
  return { status: after.status, mode: "revoke", target: targetInfo.target, tenants: result, runId: resolvedRunId, credentialsInOutput: 0 };
}

function generateTemporaryCredentials() {
  return QA_TENANTS.flatMap((tenant) => tenant.users.map((user) => {
    const password = crypto.randomBytes(32).toString("base64url");
    return { tenantKey: tenant.key, role: user.role, email: user.email, password };
  }));
}

module.exports = {
  APPLY_CONFIRMATION,
  EMERGENCY_REVOKE_CONFIRMATION,
  REVOKE_CONFIRMATION,
  QA_PRODUCTION_TARGET,
  QA_STAGING_TARGET,
  QA_TENANTS,
  QaProvisioningError,
  assertApplyConfirmation,
  assertCredentials,
  assertRevokeConfirmation,
  assertTarget,
  acquireQaDatabaseLease,
  canonicalAttestationPayload,
  computeQaHarnessSourceManifest,
  computeLocalGitIdentity,
  expectedUserMap,
  generateTemporaryCredentials,
  inspectQaState,
  provisionSyntheticQa,
  providerIsolationSafe,
  providerIsolationState,
  releaseQaDatabaseLease,
  assertPrewriteSafety,
  revokeSyntheticQa,
};
