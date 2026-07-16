import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("D1 protege a configuracao administrativa por feature flag", () => {
  const flags = read("src/config/featureFlags.ts");
  const dashboard = read("src/pages/Dashboard.tsx");
  assert.match(flags, /VITE_SITE_LEAD_CAPTURE_ENABLED === "true"/);
  assert.match(flags, /isLeadsCommunicationEnabled\(\)/);
  assert.match(dashboard, /siteLeadCaptureEnabled && <DashboardSiteLeadIntegrationPanel/);
});

test("D1 distingue Site de canal com resposta direta", () => {
  const inbox = read("src/components/leads-communication/DashboardInboxPanel.tsx");
  const api = read("src/services/crmApi.ts");
  assert.match(inbox, /Formulário do Site não possui resposta direta/);
  assert.match(inbox, /conversation\?\.podeResponderDiretamente !== false/);
  assert.match(api, /podeResponderDiretamente: boolean/);
  assert.match(api, /rotateSiteFormPublicId/);
});

test("D1 nao adiciona canal externo ou backfill", () => {
  const panel = read("src/components/dashboard/DashboardSiteLeadIntegrationPanel.tsx");
  assert.match(panel, /crypto\.randomUUID\(\)/);
  assert.match(panel, /origensPermitidas/);
  assert.doesNotMatch(panel, /WhatsApp API|graph\.facebook|OAuth|backfill/i);
});
