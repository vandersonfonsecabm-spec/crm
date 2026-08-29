const { authContext } = require("../leads-communication/policy");
const { requiredInteger } = require("../leads-communication/validation");
const { createTenantFeatureMiddleware, FEATURE_KEYS, isGlobalFeatureEnabled } = require("../tenant-features/service");
const { createCanonicalSaleService } = require("./service");

function mountCanonicalSaleRoutes({ app, prisma, authenticate }) {
  const service = createCanonicalSaleService({ prisma });
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

  app.get("/negocios/:id/contrato-venda", ...guarded, route(async (req, res, context, api) => res.json(await api.getCommercialState(context, pathId(req)))));
  app.get("/negocios/:id/vendas", ...guarded, route(async (req, res, context, api) => res.json(await api.listSales(context, pathId(req)))));
  app.get("/vendas", ...guarded, route(async (req, res, context, api) => res.json(await api.listCanonicalSales(context, req.query))));
  app.put("/negocios/:id/proposta-principal", ...guarded, route(async (req, res, context, api) => res.json(await api.setPrimaryProposal(context, pathId(req), req.body))));
  app.post("/propostas/:id/aceitar", ...guarded, route(async (req, res, context, api) => res.json(await api.acceptProposal(context, pathId(req), req.body))));
  app.post("/negocios/:id/proposta-vencedora/substituir", ...guarded, route(async (req, res, context, api) => res.json(await api.replaceWinningProposal(context, pathId(req), req.body))));
  app.post("/negocios/:id/proposta-vencedora/reconciliar", ...guarded, route(async (req, res, context, api) => res.json(await api.reconcileLegacyWinner(context, pathId(req), req.body))));
  app.post("/negocios/:id/proposta-vencedora/remover", ...guarded, route(async (req, res, context, api) => res.json(await api.removeWinningProposal(context, pathId(req), req.body))));
  app.post("/negocios/:id/fechar-ganho", ...guarded, route(async (req, res, context, api) => res.json(await api.closeDealAsWon(context, pathId(req), req.body))));
  app.post("/negocios/:id/marcar-perdido", ...guarded, route(async (req, res, context, api) => res.json(await api.markDealAsLost(context, pathId(req), req.body))));
  app.post("/negocios/:id/reabrir", ...guarded, route(async (req, res, context, api) => res.json(await api.reopenDeal(context, pathId(req), req.body))));

  return service;
}

function pathId(req) {
  return requiredInteger(req.params.id, "id");
}

function handleError(res, error) {
  if (res.headersSent) return;
  if (["P2002", "P2028", "P2034"].includes(error?.code) || /database is locked/i.test(String(error?.message || ""))) {
    res.status(409).json({ erro: "Outra operacao comercial foi concluida primeiro.", codigo: "CANONICAL_SALE_CONFLICT" });
    return;
  }
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({
    erro: status >= 500 ? "Erro interno do servidor." : error.message,
    codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "REQUEST_ERROR",
    ...(status < 500 && error.details ? { detalhes: error.details } : {}),
  });
}

module.exports = { mountCanonicalSaleRoutes };
