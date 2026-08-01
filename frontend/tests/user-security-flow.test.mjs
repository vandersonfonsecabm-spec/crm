import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("fluxos públicos e autenticados de segurança permanecem separados", async () => {
  const [api, app, login, publicFlow, panel] = await Promise.all([
    source("src/services/crmApi.ts"),
    source("src/App.tsx"),
    source("src/pages/Login.tsx"),
    source("src/pages/PublicSecurityFlow.tsx"),
    source("src/components/dashboard/DashboardUserSecurityPanel.tsx"),
  ]);

  assert.match(api, /export async function refreshAuthSession/);
  assert.match(api, /export async function requestPasswordRecovery/);
  assert.match(api, /export async function resetPasswordWithToken/);
  assert.match(api, /export async function acceptUserInvite/);
  assert.match(api, /requestApiPublicPost/);
  assert.match(app, /publicPath === "\/redefinir-senha"/);
  assert.match(app, /publicPath === "\/aceitar-convite"/);
  assert.match(login, /Esqueci minha senha/);
  assert.match(publicFlow, /window\.history\.replaceState/);
  assert.match(panel, /fetchSecurityAudit/);
  assert.match(panel, /Nenhuma senha temporária é criada pelo administrador/);
  assert.match(panel, /Sair de todos os dispositivos/);
  assert.match(panel, /confirmSecurityAction/);
  assert.doesNotMatch(`${api}\n${publicFlow}\n${panel}`, /console\.log\([^\n]*(?:token|senha|secret)/i);
});
