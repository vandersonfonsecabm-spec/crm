import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyArchitecture, verifyStartupComposition } from "./verify-architecture.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startupPath = path.join(repositoryRoot, "backend", "scripts", "start-production.cjs");
const startupSource = fs.readFileSync(startupPath, "utf8");

test("aprova a composicao operacional versionada", () => {
  assert.deepEqual(verifyArchitecture(), []);
  assert.deepEqual(verifyStartupComposition(startupSource), []);
});

test("reprova quando a migration e removida do encadeamento", () => {
  const withoutMigration = startupSource.replace(
    "await (options.runMigration || runPrismaMigration)(runtime, { spawnImpl });",
    "await Promise.resolve();",
  );
  const failures = verifyArchitecture({
    overrides: { "backend/scripts/start-production.cjs": withoutMigration },
  });
  assert.ok(failures.some((failure) => failure.includes("migrate deploy")));
});

test("reprova quando a validacao de runtime deixa de preceder a API", () => {
  const withoutRuntimeValidation = startupSource.replace(
    "[VALIDATE_RUNTIME_PATH]",
    "[SERVER_PATH]",
  );
  const failures = verifyStartupComposition(withoutRuntimeValidation);
  assert.ok(failures.some((failure) => failure.includes("validar o runtime")));
});
