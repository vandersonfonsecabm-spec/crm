import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootConfig = path.resolve(frontendDir, "..", "vercel.mjs");
const frontendConfig = path.resolve(frontendDir, "vercel.mjs");
const productionProject = "prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq";
const stagingProject = "prj_AJE06pNRGunJoguCNWee0RgZV6t8";
const productionApi = "https://api-production-875f9.up.railway.app/$1";
const stagingApi = "https://ga3-bundle-api-ga3-bundle-staging.up.railway.app/$1";

function loadConfig(configPath, { projectId, productionUrl, vercelUrl } = {}) {
  const moduleUrl = pathToFileURL(configPath).href;
  const script = `import(${JSON.stringify(moduleUrl)}).then((module) => { const config = module.default ?? module.config; process.stdout.write(JSON.stringify(config.routes.slice(0, 3))); })`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      ...process.env,
      VERCEL: "1",
      CRM_VERCEL_PROJECT_ID: projectId ?? "",
      VERCEL_PROJECT_ID: projectId ?? "",
      VERCEL_PROJECT_PRODUCTION_URL: productionUrl ?? "",
      VERCEL_URL: vercelUrl ?? "",
    },
    encoding: "utf8",
  });
}

for (const configPath of [rootConfig, frontendConfig]) {
  test(`Vercel seleciona upstream por projeto (${path.basename(path.dirname(configPath))})`, async () => {
    const production = loadConfig(configPath, { projectId: productionProject });
    const staging = loadConfig(configPath, { projectId: stagingProject });
    assert.equal(production.status, 0, production.stderr);
    assert.equal(staging.status, 0, staging.stderr);
    const productionRoutes = JSON.parse(production.stdout);
    const stagingRoutes = JSON.parse(staging.stdout);
    assert.equal(productionRoutes.find((route) => route.src === "^/api/(.*)$")?.dest, productionApi);
    assert.equal(stagingRoutes.find((route) => route.src === "^/api/(.*)$")?.dest, stagingApi);
    assert.notEqual(productionRoutes.find((route) => route.src === "^/api/(.*)$")?.dest, stagingRoutes.find((route) => route.src === "^/api/(.*)$")?.dest);
    const configText = await readFile(configPath, "utf8");
    assert.match(configText, /Strict-Transport-Security/);
    assert.match(configText, /connect-src 'self';/);
  });

  test(`Vercel falha fechado para projeto desconhecido (${path.basename(path.dirname(configPath))})`, () => {
    const unknown = loadConfig(configPath, { projectId: "prj_unknown", productionUrl: "unknown.example" });
    assert.notEqual(unknown.status, 0);
    assert.match(`${unknown.stdout}\n${unknown.stderr}`, /Unsupported Vercel project/);
  });

  test(`Vercel usa host conhecido somente como fallback de identidade (${path.basename(path.dirname(configPath))})`, () => {
    const staging = loadConfig(configPath, { productionUrl: "crm-ga3-bundle-staging.vercel.app" });
    assert.equal(staging.status, 0, staging.stderr);
    assert.equal(JSON.parse(staging.stdout).find((route) => route.src === "^/api/(.*)$")?.dest, stagingApi);
  });
}
