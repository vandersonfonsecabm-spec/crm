const { createChannelService } = require("./channelService");

function mountChannelRoutes({ app, prisma, authenticate, requireRole }) {
  const service = createChannelService({ prisma });
  const adminOnly = [authenticate, requireRole("ADMIN")];

  app.get("/canais", ...adminOnly, async (req, res) => {
    try {
      const data = await service.listChannels({ empresaId: req.auth.empresaId });
      return res.json({ data: data.map(serializeChannel) });
    } catch (error) {
      return handleError(res, error, "Nao foi possivel listar os canais.", "CHANNEL_LIST_ERROR");
    }
  });

  app.get("/canais/:id", ...adminOnly, async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ erro: "ID de canal invalido.", codigo: "VALIDATION_ERROR" });
    try {
      const channel = await service.getChannel({ empresaId: req.auth.empresaId, id });
      return res.json(serializeChannel(channel));
    } catch (error) {
      return handleError(res, error, "Nao foi possivel consultar o canal.", "CHANNEL_GET_ERROR");
    }
  });

  app.get("/canais/:id/status", ...adminOnly, async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ erro: "ID de canal invalido.", codigo: "VALIDATION_ERROR" });
    try {
      const status = await service.getChannelStatus({ empresaId: req.auth.empresaId, id });
      return res.json(status);
    } catch (error) {
      return handleError(res, error, "Nao foi possivel consultar o status do canal.", "CHANNEL_STATUS_ERROR");
    }
  });

  app.post("/canais/whatsapp/teste", ...adminOnly, async (req, res) => {
    try {
      const channel = await service.createTestChannel({ empresaId: req.auth.empresaId });
      return res.status(201).json(serializeChannel(channel));
    } catch (error) {
      return handleError(res, error, "Nao foi possivel criar o canal de teste.", "CHANNEL_TEST_CREATE_ERROR");
    }
  });

  app.patch("/canais/:id", ...adminOnly, async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ erro: "ID de canal invalido.", codigo: "VALIDATION_ERROR" });
    try {
      const channel = await service.updateChannel({ empresaId: req.auth.empresaId, id, body: req.body });
      return res.json(serializeChannel(channel));
    } catch (error) {
      return handleError(res, error, "Nao foi possivel atualizar o canal.", "CHANNEL_UPDATE_ERROR");
    }
  });
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    nome: channel.nome,
    tipo: channel.tipo,
    status: channel.status,
    modoTeste: channel.modoTeste,
    ativo: channel.ativo,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function handleError(res, error, fallback, code) {
  const status = error && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(fallback, sanitizeError(error));
  return res.status(status).json({
    erro: error && error.message ? error.message : fallback,
    codigo: error && error.codigo ? error.codigo : code,
  });
}

function sanitizeError(error) {
  if (!error) return null;
  return { name: error.name, message: error.message, code: error.code };
}

module.exports = { mountChannelRoutes, serializeChannel };
