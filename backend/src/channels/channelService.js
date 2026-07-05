const { normalizePhone } = require("./phoneNormalizer");

const TEST_CHANNEL_KEY = "whatsapp-meta-test";
const TEST_CHANNEL_NAME = "WhatsApp - Modo de Teste";
const MAX_CHANNEL_NAME = 120;
const MAX_EXTERNAL_ID = 160;
const MAX_CONTACT_NAME = 160;
const MAX_MESSAGE_TEXT = 4000;

function createChannelService({ prisma }) {
  async function listChannels({ empresaId }) {
    return prisma.canalIntegracao.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { createdAt: "desc" }],
    });
  }

  async function getChannel({ empresaId, id }) {
    const channel = await prisma.canalIntegracao.findFirst({ where: { id, empresaId } });
    if (!channel) throw notFound("Canal nao encontrado.", "CHANNEL_NOT_FOUND");
    return channel;
  }

  async function getChannelStatus({ empresaId, id }) {
    const channel = await getChannel({ empresaId, id });
    return {
      id: channel.id,
      tipo: channel.tipo,
      status: channel.status,
      modoTeste: channel.modoTeste,
      ativo: channel.ativo,
    };
  }

  async function createTestChannel({ empresaId }) {
    return prisma.$transaction(async (tx) => {
      try {
        const channel = await tx.canalIntegracao.upsert({
          where: { empresaId_chaveInterna: { empresaId, chaveInterna: TEST_CHANNEL_KEY } },
          create: {
            empresaId,
            tipo: "WHATSAPP_META",
            nome: TEST_CHANNEL_NAME,
            chaveInterna: TEST_CHANNEL_KEY,
            status: "MODO_TESTE",
            modoTeste: true,
            ativo: true,
          },
          update: {},
        });
        return channel;
      } catch (error) {
        if (error && error.code === "P2002") {
          const existing = await tx.canalIntegracao.findUnique({
            where: { empresaId_chaveInterna: { empresaId, chaveInterna: TEST_CHANNEL_KEY } },
          });
          if (existing) return existing;
        }
        throw error;
      }
    });
  }

  async function updateChannel({ empresaId, id, body }) {
    const data = validateChannelPatch(body);
    const channel = await getChannel({ empresaId, id });
    const nextData = {};
    if (Object.hasOwn(data, "nome")) nextData.nome = data.nome;
    if (Object.hasOwn(data, "ativo")) {
      nextData.ativo = data.ativo;
      nextData.status = data.ativo && channel.modoTeste ? "MODO_TESTE" : "INATIVO";
    }
    return prisma.canalIntegracao.update({ where: { id: channel.id }, data: nextData });
  }

  async function createOrFindChannelContact({ empresaId, canalIntegracaoId, externalId, telefoneNormalizado, nome }) {
    const cleanExternalId = normalizeRequiredText(externalId, "External ID obrigatorio.", MAX_EXTERNAL_ID);
    const cleanName = normalizeOptionalText(nome, MAX_CONTACT_NAME);
    const cleanPhone = telefoneNormalizado ? normalizePhone(telefoneNormalizado) : null;
    const channel = await getChannel({ empresaId, id: canalIntegracaoId });
    return prisma.contatoCanal.upsert({
      where: { canalIntegracaoId_externalId: { canalIntegracaoId: channel.id, externalId: cleanExternalId } },
      create: {
        empresaId,
        canalIntegracaoId: channel.id,
        externalId: cleanExternalId,
        telefoneNormalizado: cleanPhone,
        nome: cleanName,
      },
      update: {
        telefoneNormalizado: cleanPhone,
        nome: cleanName,
      },
    });
  }

  async function createOrFindOpenConversation({ empresaId, canalIntegracaoId, contatoCanalId }) {
    const channel = await getChannel({ empresaId, id: canalIntegracaoId });
    const contact = await prisma.contatoCanal.findFirst({
      where: { id: contatoCanalId, empresaId, canalIntegracaoId: channel.id },
    });
    if (!contact) throw notFound("Contato do canal nao encontrado.", "CHANNEL_CONTACT_NOT_FOUND");
    const chaveAberta = `canal:${channel.id}:contato:${contact.id}`;
    try {
      return await prisma.conversaCanal.upsert({
        where: { chaveAberta },
        create: {
          empresaId,
          canalIntegracaoId: channel.id,
          contatoCanalId: contact.id,
          status: "ABERTA",
          chaveAberta,
        },
        update: {},
      });
    } catch (error) {
      if (error && error.code === "P2002") {
        const existing = await prisma.conversaCanal.findUnique({ where: { chaveAberta } });
        if (existing && existing.empresaId === empresaId) return existing;
      }
      throw error;
    }
  }

  async function closeConversation({ empresaId, id }) {
    const conversation = await prisma.conversaCanal.findFirst({ where: { id, empresaId } });
    if (!conversation) throw notFound("Conversa nao encontrada.", "CHANNEL_CONVERSATION_NOT_FOUND");
    return prisma.conversaCanal.update({
      where: { id: conversation.id },
      data: { status: "ENCERRADA", chaveAberta: null },
    });
  }

  async function registerSimulatedMessage({ empresaId, canalIntegracaoId, conversaCanalId, externalId, direcao = "ENTRADA", tipo = "TEXTO", texto }) {
    const cleanExternalId = normalizeRequiredText(externalId, "External ID da mensagem obrigatorio.", MAX_EXTERNAL_ID);
    const cleanText = normalizeOptionalText(texto, MAX_MESSAGE_TEXT);
    if (!["ENTRADA", "SAIDA"].includes(direcao)) throw validationError("Direcao da mensagem invalida.", "CHANNEL_MESSAGE_INVALID_DIRECTION");
    if (!["TEXTO", "DESCONHECIDA"].includes(tipo)) throw validationError("Tipo da mensagem invalido.", "CHANNEL_MESSAGE_INVALID_TYPE");
    const channel = await getChannel({ empresaId, id: canalIntegracaoId });
    const conversation = await prisma.conversaCanal.findFirst({
      where: { id: conversaCanalId, empresaId, canalIntegracaoId: channel.id },
    });
    if (!conversation) throw notFound("Conversa do canal nao encontrada.", "CHANNEL_CONVERSATION_NOT_FOUND");
    const now = new Date();
    const message = await prisma.mensagemCanal.upsert({
      where: { canalIntegracaoId_externalId: { canalIntegracaoId: channel.id, externalId: cleanExternalId } },
      create: {
        empresaId,
        canalIntegracaoId: channel.id,
        conversaCanalId: conversation.id,
        externalId: cleanExternalId,
        direcao,
        tipo,
        texto: cleanText,
        status: direcao === "ENTRADA" ? "RECEBIDA" : "PREPARADA",
        simulada: true,
      },
      update: {},
    });
    await prisma.conversaCanal.update({
      where: { id: conversation.id },
      data: { ultimaMensagemEm: now },
    });
    return message;
  }

  return {
    listChannels,
    getChannel,
    getChannelStatus,
    createTestChannel,
    updateChannel,
    normalizePhone,
    createOrFindChannelContact,
    createOrFindOpenConversation,
    closeConversation,
    registerSimulatedMessage,
  };
}

function validateChannelPatch(body = {}) {
  const allowed = new Set(["nome", "ativo"]);
  const keys = Object.keys(body || {});
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError(`Campos nao permitidos: ${unknown.join(", ")}.`, "VALIDATION_ERROR");
  if (!keys.length) throw validationError("Informe ao menos um campo para atualizar.", "VALIDATION_ERROR");
  const data = {};
  if (Object.hasOwn(body, "nome")) data.nome = normalizeRequiredText(body.nome, "Nome do canal obrigatorio.", MAX_CHANNEL_NAME);
  if (Object.hasOwn(body, "ativo")) {
    if (typeof body.ativo !== "boolean") throw validationError("Ativo deve ser booleano.", "VALIDATION_ERROR");
    data.ativo = body.ativo;
  }
  return data;
}

function normalizeRequiredText(value, message, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) throw validationError(message, "VALIDATION_ERROR");
  if (text.length > maxLength) throw validationError(`Campo excede ${maxLength} caracteres.`, "VALIDATION_ERROR");
  return text;
}

function normalizeOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return normalizeRequiredText(value, "Campo obrigatorio.", maxLength);
}

function validationError(message, codigo) {
  const error = new Error(message);
  error.status = 400;
  error.codigo = codigo;
  return error;
}

function notFound(message, codigo) {
  const error = new Error(message);
  error.status = 404;
  error.codigo = codigo;
  return error;
}

module.exports = {
  createChannelService,
  TEST_CHANNEL_KEY,
  TEST_CHANNEL_NAME,
  MAX_CHANNEL_NAME,
  MAX_EXTERNAL_ID,
  MAX_CONTACT_NAME,
  MAX_MESSAGE_TEXT,
};
