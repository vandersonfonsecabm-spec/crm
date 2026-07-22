const { authContext, domainError } = require("../leads-communication/policy");
const { createCustomer360Service } = require("./service");

function mountCustomer360Routes({ app, prisma, authenticate }) {
  const service = createCustomer360Service({ prisma });
  const route = (handler) => async (req, res) => {
    try {
      rejectTenantInput(req);
      await handler(req, res, authContext(req), service);
    } catch (error) {
      handleError(res, error);
    }
  };

  app.get("/clientes/:id/360", authenticate, route(async (req, res, context, api) => {
    res.json(await api.getOverview(context, pathId(req)));
  }));

  app.get("/clientes/:id/timeline", authenticate, route(async (req, res, context, api) => {
    res.json(await api.getTimeline(context, pathId(req), req.query));
  }));

  app.patch("/clientes/:id/cadastro", authenticate, route(async (req, res, context, api) => {
    res.json(await api.updateRegistration(context, pathId(req), req.body));
  }));

  return service;
}

function pathId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw domainError(422, "CUSTOMER_ID_INVALID", "Cliente invalido.");
  return id;
}

function rejectTenantInput(req) {
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "empresaId") || Object.prototype.hasOwnProperty.call(req.query || {}, "empresaId")) {
    throw domainError(422, "TENANT_INPUT_FORBIDDEN", "empresaId nao pode ser informado pelo cliente.");
  }
}

function handleError(res, error) {
  if (res.headersSent) return;
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({
    erro: status >= 500 ? "Erro interno do servidor." : error.message,
    codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "CUSTOMER_360_REQUEST_ERROR",
    ...(status < 500 && error.details ? { detalhes: error.details } : {}),
  });
}

module.exports = { mountCustomer360Routes };
