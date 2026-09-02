"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertCredentialPath,
  defaultCredentialsPath,
  hardenCredentialDirectory,
  hardenCredentialFile,
} = require("./qa-prod-bootstrap.cjs");
const { createQaPrismaClient } = require("./qa-runtime-prisma.cjs");
const {
  QA_PLATFORM_OPERATOR,
  QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
  QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION,
  inspectStagingPlatformOperator,
  provisionStagingPlatformOperator,
  revokeStagingPlatformOperator,
} = require("../src/security/qa-platform-operator.cjs");

let activeCredentialBundle = null;
let shutdownRequested = false;

function generatedRunId() {
  return "qa-platform-" + new Date().toISOString().replace(/[-:.TZ]/g, "") + "-" + crypto.randomBytes(4).toString("hex");
}

function assertOperatorCredentialPath(filePath, { allowExisting = false } = {}) {
  const resolved = assertCredentialPath(filePath, { allowExisting });
  const directoryName = path.basename(path.dirname(resolved)).toLowerCase();
  if (!directoryName.startsWith("qa-platform-")) throw new Error("QA_PLATFORM_CREDENTIAL_PATH_INVALID");
  return resolved;
}

function writeOperatorCredentialBundle(filePath, { runId, password } = {}) {
  if (!/^qa-[a-z0-9][a-z0-9-]{7,119}$/.test(String(runId || ""))) throw new Error("QA_PLATFORM_CREDENTIAL_RUN_ID_INVALID");
  if (typeof password !== "string" || password.length < 32 || /[\r\n]/.test(password)) throw new Error("QA_PLATFORM_CREDENTIAL_INVALID");
  const resolved = assertOperatorCredentialPath(filePath || defaultCredentialsPath(runId));
  const directoryPath = path.dirname(resolved);
  if (!fs.existsSync(directoryPath)) fs.mkdirSync(directoryPath, { recursive: false, mode: 0o700 });
  hardenCredentialDirectory(directoryPath);
  const manifestPath = path.join(directoryPath, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ runId, target: "staging", credentialsFileName: "credentials.json", status: "PENDING" }) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  hardenCredentialFile(manifestPath);
  fs.writeFileSync(resolved, JSON.stringify({ runId, target: "staging", operator: { email: QA_PLATFORM_OPERATOR.email, papel: QA_PLATFORM_OPERATOR.role, password } }, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  hardenCredentialFile(resolved);
  fs.writeFileSync(manifestPath, JSON.stringify({ runId, target: "staging", credentialsFileName: "credentials.json", status: "READY" }) + "\n", { encoding: "utf8", flag: "w", mode: 0o600 });
  hardenCredentialFile(manifestPath);
  return { filePath: resolved, manifestPath, directoryPath };
}

function cleanupOperatorCredentialBundle(bundle) {
  if (!bundle) return true;
  let ok = true;
  for (const filePath of [bundle.filePath, bundle.manifestPath]) {
    if (!filePath) continue;
    try { fs.rmSync(filePath, { force: true }); } catch { ok = false; }
    if (fs.existsSync(filePath)) ok = false;
  }
  if (bundle.directoryPath && fs.existsSync(bundle.directoryPath)) {
    try { fs.rmdirSync(bundle.directoryPath); } catch { ok = false; }
    if (fs.existsSync(bundle.directoryPath)) ok = false;
  }
  if (!ok) throw new Error("QA_PLATFORM_CREDENTIAL_CLEANUP_FAILED");
  return true;
}

function assertNotShutdown() {
  if (shutdownRequested) throw new Error("QA_PLATFORM_OPERATOR_INTERRUPTED");
}

function parseArgs(argv) {
  const options = { mode: "status", confirmation: "", expectedReleaseHead: "", runId: "", attestationFile: "", credentialsFile: "" };
  for (const value of argv) {
    if (value === "--status") options.mode = "status";
    else if (value === "--apply") options.mode = "apply";
    else if (value === "--revoke") options.mode = "revoke";
    else if (value.startsWith("--confirm=")) options.confirmation = value.slice("--confirm=".length);
    else if (value.startsWith("--expected-release=")) options.expectedReleaseHead = value.slice("--expected-release=".length);
    else if (value.startsWith("--run-id=")) options.runId = value.slice("--run-id=".length);
    else if (value.startsWith("--attestation-file=")) options.attestationFile = value.slice("--attestation-file=".length);
    else if (value.startsWith("--credentials-file=")) options.credentialsFile = value.slice("--credentials-file=".length);
    else throw new Error("QA_PLATFORM_OPERATOR_ARGUMENT_INVALID");
  }
  options.runId = options.runId || generatedRunId();
  if (options.mode === "apply" && options.confirmation !== QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION) throw new Error("QA_PLATFORM_OPERATOR_CONFIRMATION_REQUIRED");
  if (options.mode === "revoke" && options.confirmation !== QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION) throw new Error("QA_PLATFORM_OPERATOR_CONFIRMATION_REQUIRED");
  return options;
}

function runtimeEnv(options) {
  const env = { ...process.env, QA_PROD_TARGET_ENV: "staging", QA_PROD_RUN_ID: options.runId };
  if (options.attestationFile) env.QA_PROD_CONTROL_PLANE_ATTESTATION_FILE = require("node:path").resolve(options.attestationFile);
  return env;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = runtimeEnv(options);
  const prismaRuntime = createQaPrismaClient({ env });
  const prisma = prismaRuntime.prisma;
  try {
    if (options.mode === "status") {
      const result = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, requireAttestation: true });
      console.log(JSON.stringify({ ...result, runId: options.runId, credentialsInOutput: 0 }, null, 2));
      process.exitCode = result.status === "INVALID" ? 2 : 0;
      return;
    }
    let result;
    if (options.mode === "apply") {
      assertNotShutdown();
      const password = crypto.randomBytes(32).toString("base64url");
      const passwordHash = await bcrypt.hash(password, 12);
      activeCredentialBundle = writeOperatorCredentialBundle(options.credentialsFile || defaultCredentialsPath(options.runId), { runId: options.runId, password });
      assertNotShutdown();
      result = await provisionStagingPlatformOperator({ prisma, env, passwordHash, confirmation: options.confirmation, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, allowTestAttestation: false });
      const credentialsFile = activeCredentialBundle.filePath;
      activeCredentialBundle = null;
      console.log(JSON.stringify({ ...result, runId: options.runId, credentialsFile, credentialsFileCreated: true, credentialsInOutput: 0 }, null, 2));
      return;
    }
    const bundlePath = options.credentialsFile || defaultCredentialsPath(options.runId);
    if (fs.existsSync(bundlePath) || fs.existsSync(path.join(path.dirname(bundlePath), "manifest.json"))) {
      activeCredentialBundle = { filePath: bundlePath, manifestPath: path.join(path.dirname(bundlePath), "manifest.json"), directoryPath: path.dirname(bundlePath) };
    }
    result = await revokeStagingPlatformOperator({ prisma, env, confirmation: options.confirmation, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, allowTestAttestation: false });
    if (fs.existsSync(bundlePath) || fs.existsSync(path.join(path.dirname(bundlePath), "manifest.json"))) {
      cleanupOperatorCredentialBundle({ filePath: bundlePath, manifestPath: path.join(path.dirname(bundlePath), "manifest.json"), directoryPath: path.dirname(bundlePath) });
    }
    activeCredentialBundle = null;
    console.log(JSON.stringify({ ...result, runId: options.runId, credentialsFileRemoved: true, credentialsInOutput: 0 }, null, 2));
  } finally {
    if (activeCredentialBundle) {
      cleanupOperatorCredentialBundle(activeCredentialBundle);
      activeCredentialBundle = null;
    }
    await prismaRuntime.cleanup();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "failed", code: error.code || "QA_PLATFORM_OPERATOR_FAILED", message: String(error.message || "operator failed").slice(0, 200), credentialsInOutput: 0 }));
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shutdownRequested = true;
      try { if (activeCredentialBundle) cleanupOperatorCredentialBundle(activeCredentialBundle); } catch { process.exitCode = 1; }
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  }
}

module.exports = { assertOperatorCredentialPath, cleanupOperatorCredentialBundle, parseArgs, runtimeEnv, writeOperatorCredentialBundle };
