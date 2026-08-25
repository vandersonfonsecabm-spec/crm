import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dashboard is deferred without changing the authenticated props contract", async () => {
  const app = await readFile(path.join(frontendDir, "src/App.tsx"), "utf8");
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Dashboard"\)\)/);
  assert.match(app, /<DashboardBoundary>/);
  assert.match(app, /<Dashboard initialAuthSession=\{validatedSession\} onLogout=\{sair\} \/>/);
  assert.match(app, /fallback=\{<DashboardLoading \/>\}/);
  assert.doesNotMatch(app, /import Dashboard from "\.\/pages\/Dashboard"/);
});

test("dashboard chunk failures have an accessible recovery state", async () => {
  const app = await readFile(path.join(frontendDir, "src/App.tsx"), "utf8");
  assert.match(app, /getDerivedStateFromError/);
  assert.match(app, /role="alert"/);
  assert.match(app, /window\.location\.reload\(\)/);
  assert.match(app, /role="status"/);
  assert.match(app, /Carregando painel/);
});
