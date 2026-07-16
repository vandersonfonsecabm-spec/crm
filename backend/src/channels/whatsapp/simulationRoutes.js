const { createWhatsappSimulationService } = require("./simulationService");

function mountWhatsappSimulationRoutes({ app, prisma, authenticate, requireRole }) {
  const service = createWhatsappSimulationService({ prisma });
  const adminOnly = [authenticate, requireRole("ADMIN")];

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

function handleError(res, error) {
  const status = error && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("Falha na simulacao de WhatsApp.", sanitizeError(error));
  return res.status(status).json({
    erro: error && error.message ? error.message : "Nao foi possivel simular a mensagem.",
    codigo: error && error.codigo ? error.codigo : "WHATSAPP_SIMULATION_ERROR",
  });
}

function sanitizeError(error) {
  if (!error) return null;
  return { name: error.name, message: error.message, code: error.code };
}

module.exports = { mountWhatsappSimulationRoutes };
