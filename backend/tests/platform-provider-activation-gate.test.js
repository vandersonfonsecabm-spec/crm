const assert = require("node:assert/strict");
const test = require("node:test");

const { mountPlatformRoutes, _private } = require("../src/platform/routes");

test("platform provider mutations fail closed while activation is paused", () => {
  const routes = [];
  const app = {
    get(path, ...handlers) { routes.push({ method: "GET", path, handlers }); },
    post(path, ...handlers) { routes.push({ method: "POST", path, handlers }); },
    put(path, ...handlers) { routes.push({ method: "PUT", path, handlers }); },
    patch(path, ...handlers) { routes.push({ method: "PATCH", path, handlers }); },
  };
  const env = {
    NODE_ENV: "staging",
    EXTERNAL_PROVIDER_ACTIVATION_ENABLED: "false",
    CRM_DATABASE_PROVIDER: "sqlite",
  };

  mountPlatformRoutes({ app, prisma: {}, authenticate: () => {}, env });

  const providerMutations = [
    ["PUT", "/platform/tenants/:tenantId/integrations/whatsapp/inbound"],
    ["PUT", "/platform/tenants/:tenantId/integrations/instagram/inbound"],
    ["PUT", "/platform/tenants/:tenantId/integrations/messenger/inbound"],
    ["PUT", "/platform/tenants/:tenantId/integrations/email/inbound"],
    ["POST", "/platform/tenants/:tenantId/integrations/whatsapp/inbound/activate"],
    ["POST", "/platform/tenants/:tenantId/integrations/whatsapp/inbound/reactivate"],
    ["POST", "/platform/tenants/:tenantId/integrations/instagram/inbound/activate"],
    ["POST", "/platform/tenants/:tenantId/integrations/instagram/inbound/reactivate"],
    ["POST", "/platform/tenants/:tenantId/integrations/messenger/inbound/activate"],
    ["POST", "/platform/tenants/:tenantId/integrations/messenger/inbound/reactivate"],
    ["POST", "/platform/tenants/:tenantId/integrations/email/inbound/activate"],
    ["POST", "/platform/tenants/:tenantId/integrations/email/inbound/reactivate"],
  ];
  for (const [method, path] of providerMutations) {
    const route = routes.find((entry) => entry.method === method && entry.path === path);
    assert.ok(route, `rota ausente: ${method} ${path}`);
    assert.equal(route.handlers.some((handler) => handler.name === "providerActivationGuard"), true, `gate ausente: ${method} ${path}`);
  }

  for (const provider of ["whatsapp", "instagram", "messenger", "email"]) {
    const pause = routes.find((entry) => entry.method === "POST" && entry.path === `/platform/tenants/:tenantId/integrations/${provider}/inbound/pause`);
    assert.ok(pause, `rota pause ausente: ${provider}`);
    assert.equal(pause.handlers.some((handler) => handler.name === "providerActivationGuard"), false, `pause deve continuar seguro: ${provider}`);
  }

  const guard = _private.createProviderActivationGuard({ env });
  let nextCalled = false;
  let statusCode;
  let body;
  const response = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  guard({}, response, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 503);
  assert.deepEqual(body, {
    erro: "A ativação externa está pausada nesta fase.",
    codigo: "PROVIDER_ACTIVATION_PAUSED",
  });

  env.EXTERNAL_PROVIDER_ACTIVATION_ENABLED = "true";
  guard({}, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
