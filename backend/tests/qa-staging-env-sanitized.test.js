"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSanitizedReport } = require("../scripts/qa-staging-env-sanitized.cjs");

test("sanitized staging environment report never serializes raw secrets", () => {
  const env = {
    RAILWAY_ENVIRONMENT: "staging",
    DATABASE_URL: "postgresql://user:secret-db-password@host/db",
    POSTGRES_DATABASE_URL: "postgresql://user:secret-db-password@host/db",
    JWT_SECRET: "jwt-secret-never-output",
    INTEGRATION_ENCRYPTION_KEY: "integration-key-never-output",
    INTEGRATION_ENCRYPTION_KEY_PREVIOUS: "previous-key-never-output",
    STORE1_SOAK_PROBE_TOKEN: "probe-token-never-output",
    PLATFORM_ADMIN_EMAILS: "qa-platform-operator-staging@example.invalid",
  };
  const report = buildSanitizedReport(env);
  const serialized = JSON.stringify(report);
  assert.equal(report.rawEnvDump, "FORBIDDEN");
  assert.equal(report.credentialsInOutput, 0);
  assert.equal(report.runtimeEnvironment, "staging");
  assert.equal(report.platformAdminAllowlist.count, 1);
  assert.equal(serialized.includes("secret-db-password"), false);
  assert.equal(serialized.includes("jwt-secret-never-output"), false);
  assert.equal(serialized.includes("integration-key-never-output"), false);
  assert.equal(serialized.includes("previous-key-never-output"), false);
  assert.equal(serialized.includes("probe-token-never-output"), false);
});

test("allowlist report exposes only count and fingerprint", () => {
  const report = buildSanitizedReport({ PLATFORM_ADMIN_EMAILS: "qa-platform-operator-staging@example.invalid" });
  assert.deepEqual(report.platformAdminAllowlist, {
    present: true,
    count: 1,
    sha256: "ad74f8571bc0a0cde4e06413195cc4d4d5235fb62a4efc2fd1576dc1a891dc96",
  });
});
