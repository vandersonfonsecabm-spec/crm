import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

async function navigationModule() {
  return import(new URL("../src/navigation/dashboardNavigation.ts", import.meta.url).href);
}

test("Automações só aparece no menu e na busca quando flag e capability estão habilitadas", async () => {
  const [flags, navigation, sidebar, topbar, search] = await Promise.all([
    source("src/config/featureFlags.ts"),
    source("src/navigation/dashboardNavigation.ts"),
    source("src/components/dashboard/DashboardSidebar.tsx"),
    source("src/components/dashboard/DashboardTopbar.tsx"),
    source("src/components/dashboard/DashboardCommandSearch.tsx"),
  ]);

  assert.match(flags, /automations:\s*isAutomationsEnabled\(\)\s*&&\s*capabilities\?\.automations\s*===\s*true/);
  assert.match(navigation, /requiresAutomationsAccess:\s*true/);
  assert.match(navigation, /pages:\s*\["estoque", "automacoes"\]/);
  assert.match(sidebar, /!route\.requiresAutomationsAccess\s*\|\|\s*automationsEnabled/);
  assert.match(topbar, /automationsEnabled:\s*boolean/);
  assert.match(topbar, /automationsEnabled=\{automationsEnabled\}/);
  assert.match(search, /automationsEnabled\s*\?\s*\[\{ key: "page-automacoes"/s);
  assert.match(search, /\[automationsEnabled, [^\]]*onSetActivePage/);
});

test("rota direta de Automações é conhecida, mas o Dashboard bloqueia acesso sem o gate", async () => {
  const [{ resolveDashboardLocation }, dashboard] = await Promise.all([
    navigationModule(),
    source("src/pages/Dashboard.tsx"),
  ]);

  const route = resolveDashboardLocation({ pathname: "/automacoes", search: "", hash: "" });
  assert.equal(route.page, "automacoes");
  assert.equal(route.pathname, "/automacoes");
  assert.equal(route.isKnown, true);

  assert.match(dashboard, /automations:\s*automationsEnabled/);
  assert.match(dashboard, /requestedActivePage === "automacoes" && !automationsEnabled/);
  assert.match(dashboard, /page === "automacoes" && !automationsEnabled/);
  assert.match(dashboard, /activePage === "automacoes" && \(/);
});
