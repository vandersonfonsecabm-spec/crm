const { authContext, featureFlagMiddleware } = require("./policy");
const { createLeadsCommunicationServices } = require("./services");
const { requiredInteger } = require("./validation");

function mountLeadsCommunicationRoutes({ app, prisma, authenticate }) {
  const service = createLeadsCommunicationServices({ prisma });
  const guarded = [featureFlagMiddleware, authenticate];
  const route = (handler) => async (req, res) => {
    try {
      await handler(req, res, authContext(req), service);
    } catch (error) {
      handleError(res, error);
    }
  };

  app.get("/leads", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listLeads(context, req.query));
  }));
  app.post("/leads", ...guarded, route(async (req, res, context, api) => {
    res.status(201).json(await api.createLead(context, req.body));
  }));
  app.get("/leads/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.getLead(context, pathId(req)));
  }));
  app.patch("/leads/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.updateLead(context, pathId(req), req.body));
  }));
  app.post("/leads/:id/assumir", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.assumeLead(context, pathId(req)));
  }));
  app.post("/leads/:id/atribuir", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.assignLead(context, pathId(req), req.body));
  }));
  app.get("/leads/:id/historico-atribuicao", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.leadHistory(context, pathId(req)));
  }));

  app.get("/conversas", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listConversations(context, req.query));
  }));
  app.get("/conversas/:id", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.getConversation(context, pathId(req)));
  }));
  app.post("/conversas/:id/assumir", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.assumeConversation(context, pathId(req)));
  }));
  app.post("/conversas/:id/atribuir", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.assignConversation(context, pathId(req), req.body));
  }));
  app.patch("/conversas/:id/estado", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.updateConversationStatus(context, pathId(req), req.body));
  }));
  app.get("/conversas/:id/mensagens", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listMessages(context, pathId(req), req.query));
  }));
  app.post("/conversas/:id/mensagens/simuladas", ...guarded, route(async (req, res, context, api) => {
    res.status(201).json(await api.createSimulatedMessage(context, pathId(req), req.body));
  }));
  app.get("/conversas/:id/notas-internas", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.listNotes(context, pathId(req)));
  }));
  app.post("/conversas/:id/notas-internas", ...guarded, route(async (req, res, context, api) => {
    res.status(201).json(await api.createNote(context, pathId(req), req.body));
  }));
  app.get("/conversas/:id/historico-atribuicao", ...guarded, route(async (req, res, context, api) => {
    res.json(await api.conversationHistory(context, pathId(req)));
  }));

  return service;
}

function pathId(req) {
  return requiredInteger(req.params.id, "id");
}

function handleError(res, error) {
  if (res.headersSent) return;
  if (error?.code === "P2002") {
    res.status(409).json({ erro: "Conflito com registro existente.", codigo: "CONFLICT" });
    return;
  }
  if (isConcurrentPrismaError(error)) {
    res.status(409).json({ erro: "O registro foi alterado por outra operacao.", codigo: "CONCURRENT_UPDATE" });
    return;
  }
  const status = Number.isInteger(error?.status) ? error.status : 500;
  res.status(status).json({
    erro: status >= 500 ? "Erro interno do servidor." : error.message,
    codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "REQUEST_ERROR",
  });
}

function isConcurrentPrismaError(error) {
  return ["P2028", "P2034"].includes(error?.code) || /database is locked/i.test(String(error?.message || ""));
}

module.exports = { mountLeadsCommunicationRoutes };
