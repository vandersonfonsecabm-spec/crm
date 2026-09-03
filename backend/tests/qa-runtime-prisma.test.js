"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createQaPrismaClient } = require("../scripts/qa-runtime-prisma.cjs");

test("QA runtime mantém PostgreSQL de produção bloqueado sem opt-in explícito", () => {
  assert.throws(
    () => createQaPrismaClient({ env: { CRM_DATABASE_PROVIDER: "postgresql", QA_PROD_TARGET_ENV: "production", DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:5432/qa" } }),
    (error) => error.message === "QA_POSTGRES_STAGING_ONLY",
  );
});

test("QA runtime permite produção somente após o chamador atestar o alvo", async () => {
  const runtime = createQaPrismaClient({
    env: {
      CRM_DATABASE_PROVIDER: "postgresql",
      QA_PROD_TARGET_ENV: "production",
      DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:5432/qa",
    },
    allowProduction: true,
  });
  try {
    assert.equal(runtime.provider, "postgresql");
    assert.equal(typeof runtime.prisma?.empresa?.findUnique, "function");
  } finally {
    await runtime.cleanup();
  }
});
