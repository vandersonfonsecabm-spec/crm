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

test("navegação canônica disponibiliza Visão Geral sem mover o Painel Comercial", async () => {
  const [navigation, sidebar, commandSearch] = await Promise.all([
    source("src/navigation/dashboardNavigation.ts"),
    source("src/components/dashboard/DashboardSidebar.tsx"),
    source("src/components/dashboard/DashboardCommandSearch.tsx"),
  ]);

  assert.match(navigation, /page: "dashboard", pathname: "\/visao-geral", label: "Visão Geral", showInSidebar: true/);
  assert.match(navigation, /page: "comercial", pathname: "\/central-comercial", label: "Painel Comercial", showInSidebar: true/);
  assert.match(navigation, /pages: \["dashboard", "comercial", "inbox", "leads", "clientes", "kanban", "agenda"\]/);
  assert.match(navigation, /const legacyDashboardPathnames = new Set\(\["\/"\]\)/);
  assert.doesNotMatch(navigation, /dashboardPageAliases|dashboard:\s*"comercial"/);
  assert.match(navigation, /page: "comercial" as const/);
  assert.match(sidebar, /<span>\{route\.label\}<\/span>/);
  assert.match(sidebar, /const mobilePages: ActivePage\[\] = \["comercial", "clientes", leadsCommunicationEnabled \? "inbox" : "kanban", "agenda"\]/);
  assert.match(sidebar, /aria-haspopup="menu"/);
  assert.match(sidebar, /<span>Mais<\/span>/);
  assert.doesNotMatch(sidebar, /const mobilePages: ActivePage\[\] = \[[^\]]*"dashboard"/);
  assert.match(commandSearch, /label: "Visão Geral"/);
  assert.match(commandSearch, /label: "Painel Comercial"/);
  assert.match(commandSearch, /onSetActivePage\("dashboard"\)/);
  assert.match(commandSearch, /onSetActivePage\("comercial"\)/);
});

test("canonicalização da raiz preserva retorno Bling, search/hash e estabiliza sem loop", async () => {
  const { resolveDashboardLocation } = await navigationModule();

  const connected = resolveDashboardLocation({
    pathname: "/",
    search: "?bling=conectado",
    hash: "#oauth-return",
  });
  assert.deepEqual(
    {
      pathname: connected.pathname,
      search: connected.search,
      hash: connected.hash,
      needsReplace: connected.needsReplace,
    },
    {
      pathname: "/central-comercial",
      search: "?bling=conectado",
      hash: "#oauth-return",
      needsReplace: true,
    },
  );

  const rejected = resolveDashboardLocation({
    pathname: "/",
    search: "?bling=erro&motivo=state",
    hash: "#oauth-return",
  });
  assert.deepEqual(
    {
      pathname: rejected.pathname,
      search: rejected.search,
      hash: rejected.hash,
      needsReplace: rejected.needsReplace,
    },
    {
      pathname: "/central-comercial",
      search: "?bling=erro&motivo=state",
      hash: "#oauth-return",
      needsReplace: true,
    },
  );

  const settled = resolveDashboardLocation(connected);
  assert.equal(settled.needsReplace, false);
  assert.equal(settled.pathname, "/central-comercial");
  assert.equal(settled.search, "?bling=conectado");
  assert.equal(settled.hash, "#oauth-return");

  const plainRoot = resolveDashboardLocation({ pathname: "/", search: "", hash: "" });
  assert.deepEqual(
    {
      pathname: plainRoot.pathname,
      search: plainRoot.search,
      hash: plainRoot.hash,
    },
    { pathname: "/central-comercial", search: "", hash: "" },
  );

  const overview = resolveDashboardLocation({ pathname: "/visao-geral", search: "?origem=sidebar", hash: "#carteira" });
  assert.deepEqual(
    {
      page: overview.page,
      pathname: overview.pathname,
      search: overview.search,
      hash: overview.hash,
      isKnown: overview.isKnown,
    },
    {
      page: "dashboard",
      pathname: "/visao-geral",
      search: "?origem=sidebar",
      hash: "#carteira",
      isKnown: true,
    },
  );

  const unknown = resolveDashboardLocation({ pathname: "/rota-ausente", search: "?origem=legado", hash: "#retorno" });
  assert.deepEqual(
    {
      page: unknown.page,
      pathname: unknown.pathname,
      search: unknown.search,
      hash: unknown.hash,
      isKnown: unknown.isKnown,
    },
    {
      page: "comercial",
      pathname: "/central-comercial",
      search: "?origem=legado",
      hash: "#retorno",
      isKnown: false,
    },
  );

  const dashboard = await source("src/pages/Dashboard.tsx");
  assert.match(
    dashboard,
    /if \(!resolvedNavigation\.isKnown \|\| resolvedNavigation\.needsReplace\) \{\s*navigate\(\{\s*pathname: resolvedNavigation\.pathname,\s*search: resolvedNavigation\.search,\s*hash: resolvedNavigation\.hash,\s*\}, \{ replace: true \}\);/,
  );
  assert.doesNotMatch(dashboard, /getDashboardPath\("dashboard"\)/);
  assert.equal((dashboard.match(/const blingStatus = url\.searchParams\.get\("bling"\);/g) ?? []).length, 1);
});
