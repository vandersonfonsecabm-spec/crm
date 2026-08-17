const { createWhatsappSimulationService } = require("./simulationService");

function mountWhatsappSimulationRoutes({ app, prisma, authenticate, requireRole }) {
  const service = createWhatsappSimulationService({ prisma });
  const adminOnly = [authenticate, requireRole("ADMIN"), simulationEnvironmentOnly];

  app.post("/whatsapp/simular-mensagem", ...adminOnly, async (req, res) => {
    try {
      const result = await service.simulateMessage({
        empresaId: req.auth.empresaId,
        usuarioId: req.auth.usuarioId,
        body: req.body,
      });
      return res.status(result.duplicada ? 200 : 201).json(result);
    } catch (error) {
      return handleError(res, error);
    }
  });
}

function simulationEnvironmentOnly(req, res, next) {
  const environment = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const enabled = environment === "test"
    || (environment === "development" && process.env.WHATSAPP_META_SIMULATOR_ENABLED === "true");
  if (!enabled) return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
  return next();
}

function handleError(res, error) {
  const status = error && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("Falha na simulacao de WhatsApp.", sanitizeError(error));
  return res.status(status).json({
    erro: status >= 500 ? "Nao foi possivel simular a mensagem." : error && error.message ? error.message : "Nao foi possivel simular a mensagem.",
    codigo: status >= 500 ? "WHATSAPP_SIMULATION_ERROR" : error && error.codigo ? error.codigo : "WHATSAPP_SIMULATION_ERROR",
  });
}

function sanitizeError(error) {
  if (!error) return null;
  return { name: error.name, code: error.code };
}

module.exports = { mountWhatsappSimulationRoutes, _private: { handleError, simulationEnvironmentOnly } };
