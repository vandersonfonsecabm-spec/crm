const { authContext } = require("../leads-communication/policy");
const { requiredInteger } = require("../leads-communication/validation");
const { createTenantFeatureMiddleware, FEATURE_KEYS, isGlobalFeatureEnabled } = require("../tenant-features/service");
const { createCommercialProposalService } = require("./service");

function mountCommercialProposalRoutes({ app, prisma, authenticate }) {
  const service = createCommercialProposalService({ prisma });
  const globalGate = (req, res, next) => {
    if (!isGlobalFeatureEnabled(FEATURE_KEYS.NEGOCIOS_KANBAN)) return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
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

  app.get("/propostas", ...guarded, route(async (req, res, context, api) => res.json(await api.listProposals(context, req.query))));
  app.get("/propostas/:id", ...guarded, route(async (req, res, context, api) => res.json(await api.getProposal(context, pathId(req)))));
  app.post("/negocios/:id/propostas", ...guarded, route(async (req, res, context, api) => res.status(201).json(await api.createDraft(context, pathId(req), req.body))));
  app.patch("/propostas/:id/rascunho", ...guarded, route(async (req, res, context, api) => res.json(await api.updateDraft(context, pathId(req), req.body))));
  app.post("/propostas/:id/status", ...guarded, route(async (req, res, context, api) => res.json(await api.changeStatus(context, pathId(req), req.body))));
  app.post("/propostas/:id/duplicar-versao", ...guarded, route(async (req, res, context, api) => res.status(201).json(await api.duplicateVersion(context, pathId(req), req.body || {}))));
  app.get("/propostas/:id/historico", ...guarded, route(async (req, res, context, api) => res.json(await api.getHistory(context, pathId(req)))));
  app.get("/propostas/:id/pdf", ...guarded, route(async (req, res, context, api) => {
    const pdf = await api.getPdf(context, pathId(req));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
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

module.exports = { mountCommercialProposalRoutes };
