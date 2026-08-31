"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
  QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION,
  inspectStagingPlatformOperator,
  provisionStagingPlatformOperator,
  revokeStagingPlatformOperator,
} = require("../src/security/qa-platform-operator.cjs");

function generatedRunId() {
  return "qa-platform-" + new Date().toISOString().replace(/[-:.TZ]/g, "") + "-" + crypto.randomBytes(4).toString("hex");
}

function parseArgs(argv) {
  const options = { mode: "status", confirmation: "", expectedReleaseHead: "", runId: "", attestationFile: "" };
  for (const value of argv) {
    if (value === "--status") options.mode = "status";
    else if (value === "--apply") options.mode = "apply";
    else if (value === "--revoke") options.mode = "revoke";
    else if (value.startsWith("--confirm=")) options.confirmation = value.slice("--confirm=".length);
    else if (value.startsWith("--expected-release=")) options.expectedReleaseHead = value.slice("--expected-release=".length);
    else if (value.startsWith("--run-id=")) options.runId = value.slice("--run-id=".length);
    else if (value.startsWith("--attestation-file=")) options.attestationFile = value.slice("--attestation-file=".length);
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
  const prisma = new PrismaClient();
  try {
    if (options.mode === "status") {
      const result = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, requireAttestation: true });
      console.log(JSON.stringify({ ...result, runId: options.runId, credentialsInOutput: 0 }, null, 2));
      process.exitCode = result.status === "INVALID" ? 2 : 0;
      return;
    }
    const passwordHash = options.mode === "apply" ? await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12) : null;
    const result = options.mode === "apply"
      ? await provisionStagingPlatformOperator({ prisma, env, passwordHash, confirmation: options.confirmation, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, allowTestAttestation: false })
      : await revokeStagingPlatformOperator({ prisma, env, confirmation: options.confirmation, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, runId: options.runId, allowTestAttestation: false });
    console.log(JSON.stringify({ ...result, runId: options.runId, credentialsInOutput: 0 }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "failed", code: error.code || "QA_PLATFORM_OPERATOR_FAILED", message: String(error.message || "operator failed").slice(0, 200), credentialsInOutput: 0 }));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runtimeEnv };
