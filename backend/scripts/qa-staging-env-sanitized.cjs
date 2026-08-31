"use strict";

const crypto = require("node:crypto");

const SENSITIVE_VARIABLES = Object.freeze([
  ["DATABASE_URL", "ROTATE_NOW"],
  ["POSTGRES_DATABASE_URL", "ROTATE_NOW"],
  ["JWT_SECRET", "ROTATE_NOW"],
  ["INTEGRATION_ENCRYPTION_KEY", "ROTATE_NOW"],
  ["INTEGRATION_ENCRYPTION_KEY_PREVIOUS", "ROTATE_NOW"],
  ["STORE1_SOAK_PROBE_TOKEN", "ROTATE_NOW"],
  ["PGPASSWORD", "ROTATE_NOW"],
  ["POSTGRES_PASSWORD", "ROTATE_NOW"],
  ["DATABASE_PUBLIC_URL", "ROTATE_NOW"],
  ["PLATFORM_ADMIN_EMAILS", "NON_SECRET"],
]);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function buildSanitizedReport(env = process.env) {
  const variables = SENSITIVE_VARIABLES.map(([name, classification]) => {
    const value = String(env[name] || "");
    return {
      name,
      classification,
      present: value.length > 0,
      sha256: value ? sha256(value) : null,
    };
  });
  const allowlist = variables.find((item) => item.name === "PLATFORM_ADMIN_EMAILS");
  const allowlistValues = String(env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return {
    rawEnvDump: "FORBIDDEN",
    runtimeEnvironment: String(env.RAILWAY_ENVIRONMENT || env.NODE_ENV || "").trim().toLowerCase() || null,
    platformAdminAllowlist: {
      present: allowlist.present,
      count: allowlistValues.length,
      sha256: allowlist.sha256,
    },
    variables: variables.filter((item) => item.name !== "PLATFORM_ADMIN_EMAILS"),
    credentialsInOutput: 0,
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(buildSanitizedReport(), null, 2));
  } catch {
    console.error(JSON.stringify({ status: "failed", code: "SANITIZED_ENV_REPORT_FAILED", credentialsInOutput: 0 }));
    process.exitCode = 1;
  }
}

module.exports = { SENSITIVE_VARIABLES, buildSanitizedReport, sha256 };
