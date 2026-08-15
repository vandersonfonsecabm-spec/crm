const { authContext } = require("../leads-communication/policy");
const { createNotificationService } = require("./service");

function mountNotificationRoutes({ app, prisma, authenticate }) {
  const service = createNotificationService({ prisma });
  const requireAuth = authenticate || ((req, res, next) => next());
  const route = (handler) => async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      return await handler(req, res, authContext(req));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status >= 500) console.error("Falha na Central de Notificacoes.", { code: error?.codigo || error?.code || "NOTIFICATION_ERROR" });
      return res.status(status).json({
        erro: status >= 500 ? "Nao foi possivel atualizar as notificacoes." : error.message,
        codigo: status >= 500 ? "NOTIFICATION_INTERNAL_ERROR" : error.codigo || "NOTIFICATION_REQUEST_ERROR",
      });
    }
  };

  app.get("/notificacoes/resumo", requireAuth, route(async (req, res, context) => res.json(await service.summary(context))));
  app.get("/notificacoes", requireAuth, route(async (req, res, context) => res.json(await service.list(context, req.query))));
  app.post("/notificacoes/read-all", requireAuth, route(async (req, res, context) => res.json(await service.markAllRead(context, req.body))));
  app.get("/notificacao-configuracao", requireAuth, route(async (req, res, context) => res.json(await service.getSettings(context))));
  app.patch("/notificacao-configuracao", requireAuth, route(async (req, res, context) => res.json(await service.updateSettings(context, req.body))));
  app.get("/notificacao-preferencias", requireAuth, route(async (req, res, context) => res.json(await service.getPreferences(context))));
  app.patch("/notificacao-preferencias", requireAuth, route(async (req, res, context) => res.json(await service.updatePreferences(context, req.body))));
  app.post("/notificacoes/:id/read", requireAuth, route(async (req, res, context) => res.json(await service.markRead(context, req.params.id))));
  app.post("/notificacoes/:id/snooze", requireAuth, route(async (req, res, context) => res.json(await service.snooze(context, req.params.id, req.body))));
  app.post("/notificacoes/:id/unsnooze", requireAuth, route(async (req, res, context) => res.json(await service.unsnooze(context, req.params.id))));
  app.post("/notificacoes/:id/resolve", requireAuth, route(async (req, res, context) => res.json(await service.resolve(context, req.params.id))));

  return service;
}

module.exports = { mountNotificationRoutes };
