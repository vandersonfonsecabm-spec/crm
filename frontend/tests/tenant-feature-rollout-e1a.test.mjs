import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("E1A combina flags globais e capabilities do tenant", () => {
  const flags = read("src/config/featureFlags.ts");
  const dashboard = read("src/pages/Dashboard.tsx");
  const api = read("src/services/crmApi.ts");

  assert.match(flags, /VITE_LEADS_COMMUNICATION_ENABLED === "true"/);
  assert.match(flags, /VITE_SITE_LEAD_CAPTURE_ENABLED === "true"/);
  assert.match(flags, /capabilities\?\.leadsCommunication === true/);
  assert.match(flags, /capabilities\?\.siteLeadCapture === true/);
  assert.match(dashboard, /resolveTenantFeatureAccess\(authSession\?\.capabilities\)/);
  assert.match(api, /capabilities\?: TenantCapabilities/);
  assert.match(api, /normalizeCapabilities\(data\.capabilities\)/);
});

test("E1A nao usa localStorage como fonte de capabilities", () => {
  const api = read("src/services/crmApi.ts");
  assert.doesNotMatch(api, /CAPABILIT(?:Y|IES)_KEY/);
  assert.doesNotMatch(api, /localStorage\.(?:getItem|setItem)\([^\n]*capabilit/i);
  assert.match(api, /return session \? \{ \.\.\.session, capabilities: sessionData\.capabilities \} : null/);
});
