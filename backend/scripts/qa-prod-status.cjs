"use strict";

const { PrismaClient } = require("@prisma/client");
const { inspectQaState } = require("../src/security/qa-provisioning.cjs");

function parseArgs(argv) {
  const options = { expectedReleaseHead: "", target: "", attestationFile: "" };
  for (const value of argv) {
    if (value.startsWith("--expected-release=")) options.expectedReleaseHead = value.slice("--expected-release=".length);
    else if (value.startsWith("--target=")) options.target = value.slice("--target=".length);
    else if (value.startsWith("--attestation-file=")) options.attestationFile = value.slice("--attestation-file=".length);
    else throw new Error("QA_PROD_ARGUMENT_INVALID");
  }
  if (options.target && options.target !== "production" && options.target !== "staging") throw new Error("QA_PROD_TARGET_INVALID");
  if (!options.target) throw new Error("QA_PROD_TARGET_EXPLICIT_REQUIRED");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = { ...process.env, QA_PROD_TARGET_ENV: options.target };
  if (options.attestationFile) env.QA_PROD_CONTROL_PLANE_ATTESTATION_FILE = require("node:path").resolve(options.attestationFile);
  const prisma = new PrismaClient();
  try {
    const result = await inspectQaState({ prisma, env, expectedReleaseHead: options.expectedReleaseHead || env.QA_PROD_EXPECTED_RELEASE_HEAD, target: options.target, requireOperationalAttestation: true, requireHarnessParity: true });
    console.log(JSON.stringify({ ...result, credentialsInOutput: 0 }, null, 2));
    if (!["ABSENT_SAFE", "READY", "REVOKED"].includes(result.status)) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "failed", code: error.code || "QA_PROD_STATUS_FAILED", message: String(error.message || "status failed").slice(0, 200), credentialsInOutput: 0 }));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
