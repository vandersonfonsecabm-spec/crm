"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  APPLY_CONFIRMATION,
  QA_TENANTS,
  acquireQaDatabaseLease,
  assertPrewriteSafety,
  assertTarget,
  generateTemporaryCredentials,
  inspectQaState,
  provisionSyntheticQa,
  releaseQaDatabaseLease,
} = require("../src/security/qa-provisioning.cjs");
const { createQaPrismaClient } = require("./qa-runtime-prisma.cjs");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
let activeLock = null;
let activeCredentialsFile = null;
let activeCredentialDir = null;
let activeCredentialManifest = null;
let shutdownRequested = false;

function generatedRunId() {
  return "qa-" + new Date().toISOString().replace(/[-:.TZ]/g, "") + "-" + crypto.randomBytes(4).toString("hex");
}

function parseArgs(argv) {
  const options = { mode: null, confirmation: "", expectedReleaseHead: "", credentialsFile: "", target: "", runId: "", operatorUserId: "", attestationFile: "" };
  for (const value of argv) {
    if (value === "--dry-run") options.mode = "dry-run";
    else if (value === "--apply") options.mode = "apply";
    else if (value.startsWith("--confirm=")) options.confirmation = value.slice("--confirm=".length);
    else if (value.startsWith("--expected-release=")) options.expectedReleaseHead = value.slice("--expected-release=".length);
    else if (value.startsWith("--credentials-file=")) options.credentialsFile = value.slice("--credentials-file=".length);
    else if (value.startsWith("--target=")) options.target = value.slice("--target=".length);
    else if (value.startsWith("--run-id=")) options.runId = value.slice("--run-id=".length);
    else if (value.startsWith("--operator-user-id=")) options.operatorUserId = value.slice("--operator-user-id=".length);
    else if (value.startsWith("--attestation-file=")) options.attestationFile = value.slice("--attestation-file=".length);
    else throw new Error("QA_PROD_ARGUMENT_INVALID");
  }
  if (!options.mode || (options.mode === "apply" && options.confirmation !== APPLY_CONFIRMATION)) throw new Error("QA_PROD_APPLY_CONFIRMATION_REQUIRED");
  if (options.target && options.target !== "production" && options.target !== "staging") throw new Error("QA_PROD_TARGET_INVALID");
  if (!options.target) throw new Error("QA_PROD_TARGET_EXPLICIT_REQUIRED");
  if (!options.runId) throw new Error("QA_PROD_RUN_ID_REQUIRED");
  if (!/^qa-[a-z0-9][a-z0-9-]{7,119}$/.test(options.runId)) throw new Error("QA_PROD_RUN_ID_INVALID");
  return options;
}

function runtimeEnv(options) {
  const env = { ...process.env };
  if (options.target) env.QA_PROD_TARGET_ENV = options.target;
  env.QA_PROD_RUN_ID = options.runId;
  if (options.operatorUserId) env.QA_PROD_OPERATOR_USER_ID = options.operatorUserId;
  if (options.attestationFile) {
    env.QA_PROD_CONTROL_PLANE_ATTESTATION_FILE = path.resolve(options.attestationFile);
    delete env.QA_PROD_CONTROL_PLANE_ATTESTATION;
  }
  return env;
}

function defaultCredentialsPath(runId) {
  return path.join(os.tmpdir(), runId + "-credentials", "credentials.json");
}

function assertCredentialPath(filePath, { allowExisting = false } = {}) {
  const resolved = path.resolve(filePath);
  const tempRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(tempRoot + path.sep)) throw new Error("QA_CREDENTIAL_FILE_MUST_BE_IN_TEMP");
  if (resolved.toLowerCase().startsWith(REPOSITORY_ROOT.toLowerCase() + path.sep)) throw new Error("QA_CREDENTIAL_FILE_MUST_BE_OUTSIDE_REPOSITORY");
  if (path.dirname(path.dirname(resolved)) !== tempRoot) throw new Error("QA_CREDENTIAL_FILE_MUST_BE_DIRECT_TEMP_CHILD");
  const directoryName = path.basename(path.dirname(resolved)).toLowerCase();
  if (!directoryName.startsWith("qa-") || path.basename(resolved).toLowerCase() !== "credentials.json") throw new Error("QA_CREDENTIAL_FILE_NAME_INVALID");
  assertNoTempPathReparsePoint(path.dirname(resolved));
  if (fs.existsSync(resolved)) {
    const fileStat = fs.lstatSync(resolved);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("QA_CREDENTIAL_FILE_INVALID");
    if (!allowExisting) throw new Error("QA_CREDENTIAL_FILE_EXISTS");
  }
  return resolved;
}

function assertNoTempPathReparsePoint(directoryPath) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedDirectory = path.resolve(directoryPath);
  if (resolvedDirectory !== tempRoot && !resolvedDirectory.startsWith(tempRoot + path.sep)) throw new Error("QA_CREDENTIAL_PATH_OUTSIDE_TEMP");
  const relativeParts = path.relative(tempRoot, resolvedDirectory).split(path.sep).filter(Boolean);
  let current = tempRoot;
  for (const part of relativeParts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("QA_CREDENTIAL_PATH_REPARSE_POINT");
    const real = fs.realpathSync(current);
    const realRoot = fs.realpathSync(tempRoot);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error("QA_CREDENTIAL_PATH_REPARSE_POINT");
  }
}

function assertNotShutdown() {
  if (shutdownRequested) throw new Error("QA_PROD_BOOTSTRAP_INTERRUPTED");
}

function hardenCredentialDirectory(dirPath) {
  fs.chmodSync(dirPath, 0o700);
  if (process.platform === "win32") {
    const { spawnSync } = require("node:child_process");
    const username = String(process.env.USERNAME || "").trim();
    if (!username) throw new Error("QA_CREDENTIAL_FILE_OWNER_MISSING");
    const result = spawnSync("icacls", [dirPath, "/inheritance:r", "/grant:r", username + ":F"], { stdio: "ignore", windowsHide: true });
    if (result.status !== 0) throw new Error("QA_CREDENTIAL_DIR_ACL_FAILED");
  }
}

function hardenCredentialFile(filePath) {
  fs.chmodSync(filePath, 0o600);
  if (process.platform === "win32") {
    const { spawnSync } = require("node:child_process");
    const username = String(process.env.USERNAME || "").trim();
    if (!username) throw new Error("QA_CREDENTIAL_FILE_OWNER_MISSING");
    const result = spawnSync("icacls", [filePath, "/inheritance:r", "/grant:r", username + ":F"], { stdio: "ignore", windowsHide: true });
    if (result.status !== 0) throw new Error("QA_CREDENTIAL_FILE_ACL_FAILED");
  }
}

function writeCredentialManifest(dirPath, data) {
  const manifestPath = path.join(dirPath, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  hardenCredentialFile(manifestPath);
  return manifestPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = runtimeEnv(options);
  const expectedReleaseHead = options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD;
  const targetInfo = assertTarget(env, { expectedReleaseHead, runId: options.runId, requireExplicitTarget: true, requireOperationalAttestation: true, requireHarnessParity: true, requirePrewriteSafety: options.mode === "apply" && options.target === "production" });
  if (options.mode === "apply") assertPrewriteSafety({ env, target: targetInfo.target, runId: options.runId, attestation: targetInfo.attestation });
  const lock = acquireLock();
  activeLock = lock;
  let prismaRuntime = null;
  let prisma = null;
  let databaseLease = null;
  let credentialsFile = null;
  const runId = options.runId;
  try {
    prismaRuntime = createQaPrismaClient({ env, allowProduction: options.target === "production" });
    prisma = prismaRuntime.prisma;
    if (options.mode === "dry-run") {
      const result = await provisionSyntheticQa({ prisma, env, apply: false, expectedReleaseHead, target: options.target });
      console.log(JSON.stringify({ ...result, runId, credentialsInOutput: 0 }, null, 2));
      return;
    }
    // O lease distribuído deve proteger também a leitura inicial. Sem isso,
    // duas execuções poderiam observar READY simultaneamente e uma delas
    // seguir adiante com efeitos auxiliares fora da seção crítica.
    assertNotShutdown();
    databaseLease = await acquireQaDatabaseLease(prisma, { runId });
    const before = await inspectQaState({ prisma, env, expectedReleaseHead, target: options.target, requireOperationalAttestation: true, requireHarnessParity: true });
    if (before.status === "INVALID" || before.status === "MIXED") throw new Error("QA_PROD_STATE_INVALID");
    if (before.status === "READY") {
      console.log(JSON.stringify({ status: "READY", mode: "noop", runId, tenants: before.tenants, credentialsInOutput: 0, credentialsFileCreated: false }, null, 2));
      return;
    }
    const credentials = generateTemporaryCredentials();
    const passwordHashes = Object.fromEntries(await Promise.all(credentials.map(async (item) => [item.email, await bcrypt.hash(item.password, 12)])));
    credentialsFile = assertCredentialPath(options.credentialsFile || defaultCredentialsPath(runId));
    const credentialDir = path.dirname(credentialsFile);
    assertNoTempPathReparsePoint(credentialDir);
    if (!fs.existsSync(credentialDir)) fs.mkdirSync(credentialDir, { recursive: false, mode: 0o700 });
    assertNoTempPathReparsePoint(credentialDir);
    hardenCredentialDirectory(credentialDir);
    activeCredentialDir = credentialDir;
    activeCredentialManifest = writeCredentialManifest(credentialDir, { runId, target: options.target, createdAt: new Date().toISOString(), credentialsFileName: path.basename(credentialsFile), status: "PENDING" });
    activeCredentialsFile = credentialsFile;
    const credentialFileData = {
      runId,
      createdAt: new Date().toISOString(),
      target: env.QA_PROD_TARGET_ENV || "production",
      tenants: QA_TENANTS.map((tenant) => ({
        key: tenant.key,
        slug: tenant.slug,
        users: tenant.users.map((user) => ({ email: user.email, papel: user.role, password: credentials.find((item) => item.email === user.email).password })),
      })),
    };
    fs.writeFileSync(credentialsFile, JSON.stringify(credentialFileData, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    hardenCredentialFile(credentialsFile);
    assertNotShutdown();
    const result = await provisionSyntheticQa({ prisma, env, passwordHashes, apply: true, confirmation: options.confirmation, expectedReleaseHead, target: options.target, operatorUsuarioId: options.operatorUserId, runId });
    if (result.mode === "noop") {
      // Uma corrida resolvida dentro do serviço não deve deixar um bundle de
      // senhas recém-gerado sem utilidade para o operador.
      cleanupCredentialBundle(credentialsFile, activeCredentialDir);
      console.log(JSON.stringify({ ...result, runId, credentialsFileManaged: false, credentialsFileCreated: false, credentialsInOutput: 0 }, null, 2));
      return;
    }
    fs.writeFileSync(activeCredentialManifest, JSON.stringify({ runId, target: options.target, createdAt: new Date().toISOString(), credentialsFileName: path.basename(credentialsFile), status: "READY" }, null, 2) + "\n", { encoding: "utf8", flag: "w", mode: 0o600 });
    hardenCredentialFile(activeCredentialManifest);
    console.log(JSON.stringify({ ...result, runId, credentialsFileManaged: true, credentialsFileCreated: true, credentialsInOutput: 0 }, null, 2));
  } catch (error) {
    cleanupCredentialBundle(credentialsFile, activeCredentialDir);
    throw error;
  } finally {
    if (databaseLease && prisma) {
      try {
        if (!await releaseQaDatabaseLease(prisma, { runId, ownerToken: databaseLease.ownerToken })) process.exitCode = 1;
      } catch { process.exitCode = 1; }
      databaseLease = null;
    }
    if (prismaRuntime) await prismaRuntime.cleanup();
    if (!releaseLock(lock)) process.exitCode = 1;
    activeLock = null;
  }
}

function acquireLock() {
  const lockPath = path.join(os.tmpdir(), "qa-prod-bootstrap.lock");
  let handle;
  if (fs.existsSync(lockPath)) {
    let stale = false;
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      const age = Date.now() - Date.parse(String(current.startedAt || ""));
      if (Number.isInteger(current.pid) && current.pid > 0) {
        try { process.kill(current.pid, 0); } catch { stale = age > 2 * 60 * 60 * 1000; }
      } else if (age > 2 * 60 * 60 * 1000) {
        stale = true;
      }
    } catch {}
    if (stale) {
      try { fs.rmSync(lockPath, { force: true }); } catch {}
    }
  }
  try {
    handle = fs.openSync(lockPath, "wx");
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n", { encoding: "utf8" });
    return { lockPath, handle };
  } catch {
    try { if (handle !== undefined) fs.closeSync(handle); } catch {}
    throw new Error("QA_PROD_BOOTSTRAP_ALREADY_RUNNING");
  }
}

function cleanupCredentialBundle(filePath, dirPath, manifestPath = activeCredentialManifest) {
  let ok = true;
  if (filePath) {
    try { fs.rmSync(filePath, { force: true }); } catch { ok = false; }
    if (fs.existsSync(filePath)) ok = false;
  }
  if (manifestPath) {
    try { fs.rmSync(manifestPath, { force: true }); } catch { ok = false; }
    if (fs.existsSync(manifestPath)) ok = false;
  }
  if (dirPath && fs.existsSync(dirPath)) {
    try { fs.rmdirSync(dirPath); } catch { ok = false; }
    if (fs.existsSync(dirPath)) ok = false;
  }
  activeCredentialsFile = null;
  activeCredentialDir = null;
  activeCredentialManifest = null;
  if (!ok) throw new Error("QA_CREDENTIAL_BUNDLE_CLEANUP_FAILED");
  return true;
}

function releaseLock(lock) {
  let ok = true;
  try { fs.closeSync(lock.handle); } catch { ok = false; }
  try { fs.rmSync(lock.lockPath, { force: true }); } catch { ok = false; }
  return ok && !fs.existsSync(lock.lockPath);
}

if (require.main === module) {
  main().catch((error) => {
    cleanupCredentialBundle(activeCredentialsFile, activeCredentialDir);
    if (activeLock) {
      releaseLock(activeLock);
      activeLock = null;
    }
    console.error(JSON.stringify({ status: "failed", code: error.code || "QA_PROD_BOOTSTRAP_FAILED", message: String(error.message || "bootstrap failed").slice(0, 200), credentialsInOutput: 0 }));
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      // O bundle secreto pode ser removido imediatamente. O lock fica retido
      // até o finally de main, para que uma transação em andamento não tenha
      // uma segunda execução concorrente. O próximo status/revoke encontra o
      // estado do banco sem deixar plaintext pendente.
      shutdownRequested = true;
      try { cleanupCredentialBundle(activeCredentialsFile, activeCredentialDir); } catch { process.exitCode = 1; }
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  }
}

module.exports = { assertCredentialPath, defaultCredentialsPath, hardenCredentialDirectory, hardenCredentialFile, parseArgs, runtimeEnv };
