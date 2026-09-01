import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const panel = fs.readFileSync(new URL("src/components/dashboard/DashboardPlatformObservabilityPanel.tsx", root), "utf8");
const api = fs.readFileSync(new URL("src/services/crmApi.ts", root), "utf8");
const dashboard = fs.readFileSync(new URL("src/pages/Dashboard.tsx", root), "utf8");

test("observabilidade técnica é restrita ao operador e só exibe contadores sanitizados", () => {
  assert.match(panel, /fetchPlatformObservabilitySummary/);
  assert.match(panel, /Somente leitura/);
  assert.match(panel, /jobs|execuções|webhooks|outbox|leases|credenciais/i);
  assert.match(panel, /workerHealthLabel|saudável|atrasado/);
  assert.doesNotMatch(panel, /Authorization|token completo|JSON\.stringify/);
  assert.match(api, /\/platform\/observability\/summary/);
  assert.match(dashboard, /activePage === "platformTenants" && isPlatformOperator/);
});
