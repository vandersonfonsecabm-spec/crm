const { createTenantFeatureMiddleware, FEATURE_KEYS } = require("../tenant-features/service");
const { authContext } = require("../leads-communication/policy");
const { createAutomationService } = require("./service");

function mountAutomationRoutes({ app, prisma, authenticate }) {
  const service = createAutomationService({ prisma });
  const tenantGate = createTenantFeatureMiddleware({ prisma, featureKey: FEATURE_KEYS.AUTOMATIONS });
  const guarded = [authenticate, tenantGate];
  const pilotGuarded = [authenticate, pilotTriggerGate, tenantGate, requirePlatformOperator];
  const route = (handler) => async (req, res) => {
    try {
      await handler(req, res, authContext(req), service);
    } catch (error) {
      handleError(res, error);
    }
  };

  app.get("/automacoes/resumo", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.summary(context));
  }));
  app.get("/automacoes/opcoes", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.options(context));
  }));
  app.get("/automacoes", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listRules(context, req.query));
  }));
  app.post("/automacoes", ...guarded, route(async (req, res, context, api) => {
    res.status(201).json(await api.createRule(context, req.body));
  }));
  app.get("/automacoes/execucoes", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listExecutions(context, req.query));
  }));
  app.get("/automacoes/falhas", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listFailures(context, req.query));
  }));
  app.post("/automacoes/simular", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.simulate(context, req.body));
  }));
  app.post("/automacoes/piloto/eventos", ...pilotGuarded, route(async (req, res, context, api) => {
    res.status(202).json(await api.producePilotEvent(context, req.body));
  }));
  app.get("/automacoes/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.getRule(context, req.params.id));
  }));
  app.patch("/automacoes/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.updateRule(context, req.params.id, req.body));
  }));
  app.post("/automacoes/:id/ativar", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.activateRule(context, req.params.id));
  }));
  app.post("/automacoes/:id/desativar", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.deactivateRule(context, req.params.id));
  }));
  app.post("/automacoes/jobs/:id/reprocessar", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.retryJob(context, Number(req.params.id)));
  }));

  return service;
}

function pilotTriggerGate(req, res, next) {
  if (!pilotTriggerEnabled(process.env)) return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
  return next();
}

function pilotTriggerEnabled(env) {
  const value = String(env.AUTOMATION_PILOT_TRIGGER_ENABLED || "").trim().toLowerCase();
  return value === "true" || value === "1";
}

function requirePlatformOperator(req, res, next) {
  if (req.auth?.isPlatformOperator !== true) return res.status(403).json({ erro: "Acesso negado.", codigo: "PLATFORM_OPERATOR_REQUIRED" });
  return next();
}

function handleError(res, error) {
  if (res.headersSent) return;
  if (error?.code === "P2002") return res.status(409).json({ erro: "Conflito com registro existente.", codigo: "CONFLICT" });
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) {
    const messageLines = String(error?.message || "").split("\n").map((line) => line.trim()).filter(Boolean);
    console.error("Falha em rota de automacoes.", {
      name: String(error?.name || "Error").slice(0, 80),
      code: String(error?.code || error?.codigo || "AUTOMATION_ROUTE_ERROR").slice(0, 80),
      message: (messageLines.find((line) => /Unknown argument|Invalid value|Available options/i.test(line)) || messageLines[0] || "").slice(0, 200),
    });
  }
  return res.status(status).json({
    erro: status >= 500 ? "Erro interno do servidor." : error.message,
    codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "REQUEST_ERROR",
  });
}

module.exports = { mountAutomationRoutes, pilotTriggerEnabled };
