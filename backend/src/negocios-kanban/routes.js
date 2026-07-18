const { authContext } = require("../leads-communication/policy");
const { requiredInteger } = require("../leads-communication/validation");
const { createTenantFeatureMiddleware, FEATURE_KEYS, isGlobalFeatureEnabled } = require("../tenant-features/service");
const { createNegociosKanbanServices } = require("./services");

function mountNegociosKanbanRoutes({ app, prisma, authenticate }) {
  const service = createNegociosKanbanServices({ prisma });
  const globalGate = (req, res, next) => {
    if (!isGlobalFeatureEnabled(FEATURE_KEYS.NEGOCIOS_KANBAN)) {
      return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
    }
    return next();
  };
  const tenantGate = createTenantFeatureMiddleware({ prisma, featureKey: FEATURE_KEYS.NEGOCIOS_KANBAN });
  const guarded = [globalGate, authenticate, tenantGate];
  const route = (handler) => async (req, res) => {
    try {
      await handler(req, res, authContext(req), service);
    } catch (error) {
      handleError(res, error);
    }
  };

  app.get("/negocios", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listBusinesses(context, req.query));
  }));
  app.get("/negocios/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.getBusiness(context, pathId(req)));
  }));
  app.patch("/negocios/:id/etapa", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.updateBusinessStage(context, pathId(req), req.body));
  }));

  return service;
}

function pathId(req) {
  return requiredInteger(req.params.id, "id");
}

function handleError(res, error) {
  if (res.headersSent) return;
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({
    erro: status >= 500 ? "Erro interno do servidor." : error.message,
    codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "REQUEST_ERROR",
    ...(status < 500 && error.details ? { detalhes: error.details } : {}),
  });
}

module.exports = { mountNegociosKanbanRoutes };
