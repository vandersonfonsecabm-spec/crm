import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("H7.1 expoe operacoes da plataforma somente para operador derivado da sessao", async () => {
  const [api, navigation, sidebar, dashboard] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/navigation/dashboardNavigation.ts"),
    source("src/components/dashboard/DashboardSidebar.tsx"),
    source("src/pages/Dashboard.tsx"),
  ]);

  assert.match(api, /isPlatformOperator\?: boolean/);
  assert.match(api, /PLATFORM_OPERATOR_KEY/);
  assert.match(api, /data\.isPlatformOperator === true/);
  assert.match(navigation, /requiresPlatformOperator\?: boolean/);
  assert.match(navigation, /page: "platformTenants"/);
  assert.match(navigation, /requiresPlatformOperator: true/);
  assert.match(sidebar, /isPlatformOperator/);
  assert.match(sidebar, /route\.requiresPlatformOperator/);
  assert.match(dashboard, /requestedActivePage === "platformTenants"[\s\S]*!isPlatformOperator/);
  assert.match(dashboard, /DashboardPlatformTenantsPanel/);
});

test("H7.1 usa endpoints internos fechados para tenants e capability AUTOMATIONS", async () => {
  const api = await source("src/services/crmApi.ts");

  for (const endpoint of [
    "/platform/tenants",
    "POST\", \"/platform/tenants",
    "/capabilities/automations",
    "/capabilities/automations/audit",
  ]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));

  assert.match(api, /email\?: string/);
  assert.match(api, /PlatformTenantCreatePayload/);
  assert.match(api, /companyName: string/);
  assert.match(api, /adminPassword: string/);
  assert.match(api, /enabled: boolean/);
  assert.match(api, /reason\?: string/);
  assert.doesNotMatch(api, /PLATFORM_ADMIN_EMAILS/);
});

test("H7.1 entrega painel discreto sem dados comerciais, JSON cru ou acao em massa", async () => {
  const panel = await source("src/components/dashboard/DashboardPlatformTenantsPanel.tsx");

  for (const label of [
    "Tenants da plataforma",
    "Criar tenant",
    "Criar tenant interno",
    "Senha inicial",
    "Buscar por nome ou slug",
    "Capability AUTOMATIONS",
    "Histórico de Automações",
    "Ativar",
    "Desativar",
    "Motivo opcional",
  ]) assert.match(panel, new RegExp(label));

  assert.match(panel, /window\.confirm/);
  assert.match(panel, /setCreateForm\(emptyCreateForm\)/);
  assert.match(panel, /adminPassword: ""/);
  assert.match(panel, /Nenhuma regra será criada ou executada/);
  assert.match(panel, /Regras e histórico serão preservados/);
  assert.doesNotMatch(panel, /<pre|JSON\.stringify|allowlist|PLATFORM_ADMIN_EMAILS|ativar para todos|selecionar todos/i);
  assert.doesNotMatch(panel, /Lead|Cliente|Negócio|Mensagem|WhatsApp|Facebook|Graph API/i);
});
