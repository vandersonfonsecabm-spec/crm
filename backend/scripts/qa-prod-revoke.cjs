"use strict";

const fs = require("node:fs");
const { assertCredentialPath } = require("./qa-prod-bootstrap.cjs");
const { createQaPrismaClient } = require("./qa-runtime-prisma.cjs");
const {
  EMERGENCY_REVOKE_CONFIRMATION,
  QA_TENANTS,
  REVOKE_CONFIRMATION,
  acquireQaDatabaseLease,
  assertPrewriteSafety,
  assertTarget,
  releaseQaDatabaseLease,
  revokeSyntheticQa,
} = require("../src/security/qa-provisioning.cjs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

let shutdownRequested = false;
let activeCredentialBundles = [];

function parseArgs(argv) {
  const options = { confirmation: "", expectedReleaseHead: "", target: "", credentialsFile: "", runId: "", operatorUserId: "", attestationFile: "", emergency: false };
  for (const value of argv) {
    if (value === "--emergency") options.emergency = true;
    else if (value.startsWith("--confirm=")) options.confirmation = value.slice("--confirm=".length);
    else if (value.startsWith("--expected-release=")) options.expectedReleaseHead = value.slice("--expected-release=".length);
    else if (value.startsWith("--target=")) options.target = value.slice("--target=".length);
    else if (value.startsWith("--credentials-file=")) options.credentialsFile = value.slice("--credentials-file=".length);
    else if (value.startsWith("--run-id=")) options.runId = value.slice("--run-id=".length);
    else if (value.startsWith("--operator-user-id=")) options.operatorUserId = value.slice("--operator-user-id=".length);
    else if (value.startsWith("--attestation-file=")) options.attestationFile = value.slice("--attestation-file=".length);
    else throw new Error("QA_PROD_ARGUMENT_INVALID");
  }
  const expectedConfirmation = options.emergency ? EMERGENCY_REVOKE_CONFIRMATION : REVOKE_CONFIRMATION;
  if (options.confirmation !== expectedConfirmation) throw new Error("QA_PROD_REVOKE_CONFIRMATION_REQUIRED");
  if (options.target && options.target !== "production" && options.target !== "staging") throw new Error("QA_PROD_TARGET_INVALID");
  if (!options.target) throw new Error("QA_PROD_TARGET_EXPLICIT_REQUIRED");
  options.runId = options.runId || "qa-revoke-" + crypto.randomBytes(8).toString("hex");
  if (!/^qa-[a-z0-9][a-z0-9-]{7,119}$/.test(options.runId)) throw new Error("QA_PROD_RUN_ID_INVALID");
  if (!options.emergency && !options.credentialsFile) throw new Error("QA_CREDENTIAL_FILE_REQUIRED");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = runtimeEnv(options);
  const expectedReleaseHead = options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD;
  const targetInfo = assertTarget(env, { expectedReleaseHead, target: options.target, runId: options.runId, requireExplicitTarget: true, requireOperationalAttestation: true, requireHarnessParity: true, requirePrewriteSafety: options.target === "production" });
  assertPrewriteSafety({ env, target: targetInfo.target, runId: options.runId, attestation: targetInfo.attestation });
  const lock = acquireLock();
  let prismaRuntime = null;
  let prisma = null;
  let databaseLease = null;
  try {
    prismaRuntime = createQaPrismaClient({ env, allowProduction: options.target === "production" });
    prisma = prismaRuntime.prisma;
    databaseLease = await acquireQaDatabaseLease(prisma, { runId: options.runId });
    const targetBundles = listCredentialBundles(options.target);
    // Register every validated target bundle before any revoke work.  If a
    // signal interrupts validation, the finally block still has ownership of
    // the temporary files and can remove them without printing their values.
    activeCredentialBundles = targetBundles.slice();
    const credentialBundle = options.credentialsFile
      ? validateCredentialBundle(options.credentialsFile, options.runId, options.target)
      : options.emergency ? targetBundles.find((bundle) => bundle.runId === options.runId) || null : null;
    if (!options.emergency && !targetBundles.some((bundle) => credentialBundle && bundle.filePath === credentialBundle.filePath)) throw new Error("QA_CREDENTIAL_BUNDLE_NOT_FOUND");
    const result = await revokeSyntheticQa({ prisma, env, confirmation: options.confirmation, expectedReleaseHead, target: options.target, operatorUsuarioId: options.operatorUserId, runId: options.runId, emergency: options.emergency });
    const bundlesAfterRevoke = listCredentialBundles(options.target);
    activeCredentialBundles = bundlesAfterRevoke;
    for (const bundle of bundlesAfterRevoke) removeCredentialBundle(bundle);
    activeCredentialBundles = [];
    const credentialsBundleAbsent = listCredentialBundles(options.target).length === 0;
    if (!credentialsBundleAbsent) throw new Error("QA_CREDENTIAL_BUNDLE_REMAINS");
    if (shutdownRequested) throw new Error("QA_PROD_REVOKE_INTERRUPTED");
    console.log(JSON.stringify({ ...result, credentialsFileRemoved: bundlesAfterRevoke.length > 0, credentialsBundleAbsent, credentialsBundlesRemoved: bundlesAfterRevoke.length, credentialsInOutput: 0 }, null, 2));
  } finally {
    // Signal handlers only set shutdownRequested; cleanup stays in this
    // finally block so the lease and every validated bundle are released even
    // when SIGINT/SIGTERM arrives during the revoke transaction.
    if (shutdownRequested) process.exitCode = process.exitCode || 1;
    for (const bundle of activeCredentialBundles) {
      try { removeCredentialBundle(bundle); } catch { process.exitCode = 1; }
    }
    activeCredentialBundles = [];
    if (databaseLease && prisma) {
      try {
        if (!await releaseQaDatabaseLease(prisma, { runId: options.runId, ownerToken: databaseLease.ownerToken })) process.exitCode = 1;
      } catch { process.exitCode = 1; }
      databaseLease = null;
    }
    if (prismaRuntime) await prismaRuntime.cleanup();
    if (!releaseLock(lock)) process.exitCode = 1;
  }
}

function runtimeEnv(options) {
  const env = { ...process.env, QA_PROD_TARGET_ENV: options.target, QA_PROD_RUN_ID: options.runId };
  if (options.operatorUserId) env.QA_PROD_OPERATOR_USER_ID = options.operatorUserId;
  if (options.attestationFile) {
    // An explicit file is an operator-selected override.  Do not let a
    // stale inline value win merely because it is still present in the
    // service environment.
    env.QA_PROD_CONTROL_PLANE_ATTESTATION_FILE = path.resolve(options.attestationFile);
    delete env.QA_PROD_CONTROL_PLANE_ATTESTATION;
  }
  return env;
}

function validateCredentialBundle(fileName, runId, expectedTarget = "") {
  const filePath = assertCredentialPath(fileName, { allowExisting: true });
  const manifestPath = path.join(path.dirname(filePath), "manifest.json");
  const fileStat = fs.existsSync(filePath) ? fs.lstatSync(filePath) : null;
  const manifestStat = fs.existsSync(manifestPath) ? fs.lstatSync(manifestPath) : null;
  if (!fileStat || !manifestStat) throw new Error("QA_CREDENTIAL_BUNDLE_MISSING");
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("QA_CREDENTIAL_BUNDLE_INVALID");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.runId !== runId || manifest.target !== expectedTarget || manifest.credentialsFileName !== "credentials.json" || !["PENDING", "READY"].includes(manifest.status)) throw new Error("QA_CREDENTIAL_BUNDLE_MISMATCH");
    const credentials = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (credentials.runId !== runId || credentials.target !== expectedTarget || !Array.isArray(credentials.tenants)) throw new Error("QA_CREDENTIAL_BUNDLE_MISMATCH");
    const expectedTenants = QA_TENANTS.map((tenant) => ({ key: tenant.key, slug: tenant.slug, users: tenant.users.map((user) => ({ email: user.email, papel: user.role })) }));
    const observedTenants = credentials.tenants.map((tenant) => ({ key: tenant.key, slug: tenant.slug, users: (tenant.users || []).map((user) => ({ email: user.email, papel: user.papel })) }));
    if (JSON.stringify(observedTenants) !== JSON.stringify(expectedTenants)) throw new Error("QA_CREDENTIAL_BUNDLE_MISMATCH");
    for (const tenant of credentials.tenants) for (const user of tenant.users) {
      if (typeof user.password !== "string" || user.password.length < 32 || user.password.includes("\n") || user.password.includes("\r")) throw new Error("QA_CREDENTIAL_BUNDLE_INVALID");
    }
  } catch (error) {
    if (/QA_CREDENTIAL_BUNDLE_(?:MISMATCH|INVALID)/.test(String(error.message || ""))) throw error;
    throw new Error("QA_CREDENTIAL_MANIFEST_INVALID");
  }
  return { filePath, manifestPath, runId, target: expectedTarget };
}

function listCredentialBundles(expectedTarget) {
  const matches = [];
  for (const entry of fs.readdirSync(path.resolve(os.tmpdir()), { withFileTypes: true })) {
    if (entry.name.toLowerCase().startsWith("qa-") && entry.isSymbolicLink()) throw new Error("QA_CREDENTIAL_PATH_REPARSE_POINT");
    // Bundles do operador de plataforma possuem contrato próprio e são
    // removidos pelo qa-staging-platform-operator.cjs; nunca tratá-los como
    // bundles de credenciais dos tenants QA.
    if (entry.name.toLowerCase().startsWith("qa-platform-")) continue;
    if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith("qa-")) continue;
    const candidate = path.join(os.tmpdir(), entry.name, "credentials.json");
    const manifestPath = path.join(os.tmpdir(), entry.name, "manifest.json");
    if (!fs.existsSync(candidate) && !fs.existsSync(manifestPath)) continue;
    if (!fs.existsSync(candidate) || !fs.existsSync(manifestPath)) throw new Error("QA_CREDENTIAL_BUNDLE_ORPHANED");
    assertCredentialPath(candidate, { allowExisting: true });
    const manifestStat = fs.lstatSync(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("QA_CREDENTIAL_BUNDLE_INVALID");
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (!["production", "staging"].includes(manifest.target)) throw new Error("QA_CREDENTIAL_BUNDLE_INVALID");
      const validated = validateCredentialBundle(candidate, manifest.runId, manifest.target);
      if (manifest.target === expectedTarget) matches.push(validated);
    } catch (error) {
      if (/QA_CREDENTIAL_/.test(String(error.message || ""))) throw error;
      throw new Error("QA_CREDENTIAL_BUNDLE_MANIFEST_INVALID");
    }
  }
  return matches;
}

function removeCredentialBundle(bundle) {
  let ok = true;
  try { fs.rmSync(bundle.filePath, { force: true }); } catch { ok = false; }
  try { fs.rmSync(bundle.manifestPath, { force: true }); } catch { ok = false; }
  const dir = path.dirname(bundle.filePath);
  try { fs.rmdirSync(dir); } catch { ok = false; }
  if (fs.existsSync(bundle.filePath) || fs.existsSync(bundle.manifestPath) || fs.existsSync(dir)) ok = false;
  if (!ok) throw new Error("QA_CREDENTIAL_BUNDLE_CLEANUP_FAILED");
}

function acquireLock() {
  const lockPath = path.join(os.tmpdir(), "qa-prod-bootstrap.lock");
  if (fs.existsSync(lockPath)) {
    let stale = false;
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      const age = Date.now() - Date.parse(String(current.startedAt || ""));
      let alive = false;
      try { process.kill(current.pid, 0); alive = true; } catch {}
      stale = !alive && age > 2 * 60 * 60 * 1000;
    } catch {}
    if (stale) {
      try { fs.rmSync(lockPath, { force: true }); } catch {}
    }
  }
  try {
    const handle = fs.openSync(lockPath, "wx");
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n", { encoding: "utf8" });
    return { lockPath, handle };
  } catch {
    throw new Error("QA_PROD_BOOTSTRAP_ALREADY_RUNNING");
  }
}

function releaseLock(lock) {
  let ok = true;
  try { fs.closeSync(lock.handle); } catch { ok = false; }
  try { fs.rmSync(lock.lockPath, { force: true }); } catch { ok = false; }
  return ok && !fs.existsSync(lock.lockPath);
}

if (require.main === module) {
  const handleSignal = (signal) => {
    shutdownRequested = true;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    // Do not call process.exit here.  Let main unwind through its finally
    // block, which owns the database lease and credential-bundle cleanup.
  };
  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
  main().catch((error) => {
    console.error(JSON.stringify({ status: "failed", code: error.code || "QA_PROD_REVOKE_FAILED", message: String(error.message || "revoke failed").slice(0, 200), credentialsInOutput: 0 }));
    process.exitCode = 1;
  });
}

module.exports = { listCredentialBundles, parseArgs, removeCredentialBundle, runtimeEnv, validateCredentialBundle };
