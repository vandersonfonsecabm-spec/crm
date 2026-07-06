const { createCommercialCatalogService } = require("../../integrations/commercialCatalogService");
const { TEST_CHANNEL_KEY, TEST_CHANNEL_NAME } = require("../channelService");
const { parseSimulationPayload } = require("./messageParser");
const { detectIntent } = require("./intentService");
const { buildPreparedResponse, summarizeProduct } = require("./responseService");

const OPEN_STATUSES = new Set(["Lead", "Novo", "Contato", "Proposta"]);
const COMMERCIAL_INTENTS = new Set([
  "CONSULTAR_PRODUTO",
  "CONSULTAR_PRECO",
  "CONSULTAR_ESTOQUE",
  "CONSULTAR_DISPONIBILIDADE",
  "CONSULTAR_PROMOCAO",
  "FALAR_COM_VENDEDOR",
]);

function createWhatsappSimulationService({ prisma }) {
  const catalogService = createCommercialCatalogService({ prisma });

  async function simulateMessage({ empresaId, usuarioId, body }) {
    const payload = parseSimulationPayload(body);
    const intent = detectIntent(payload.mensagem);
    const channel = payload.canalIntegracaoId
      ? await getTestChannel({ empresaId, id: payload.canalIntegracaoId })
      : await findOrCreateTestChannel({ empresaId });
    const existing = await findExistingResult({ empresaId, canalIntegracaoId: channel.id, externalId: payload.externalId });
    if (existing) return existing;

    const catalog = await searchCatalog({ empresaId, intent });
    const product = catalog.product;
    const followUpReason = followUpReasonFor({ intent, product });
    const preparedText = buildPreparedResponse({ intent, product, followUpRequired: Boolean(followUpReason) });

    try {
      return await prisma.$transaction(async (tx) => {
        const duplicateInsideTx = await findExistingResult({ empresaId, canalIntegracaoId: channel.id, externalId: payload.externalId, prismaClient: tx });
        if (duplicateInsideTx) return duplicateInsideTx;

        const contact = await createOrFindContact({ tx, empresaId, channel, payload });
        const conversation = await createOrFindConversation({ tx, empresaId, channel, contact });
        const incoming = await tx.mensagemCanal.create({
          data: {
            empresaId,
            canalIntegracaoId: channel.id,
            conversaCanalId: conversation.id,
            externalId: payload.externalId,
            direcao: "ENTRADA",
            tipo: "TEXTO",
            texto: payload.mensagem,
            status: "RECEBIDA",
            simulada: true,
          },
        });
        const clienteResult = await createOrFindClient({ tx, empresaId, payload, intent, product });
        const notaResult = await createNoteIfNeeded({ tx, empresaId, cliente: clienteResult.cliente, intent, product, externalId: payload.externalId });
        const funilResult = await updateFunnelIfNeeded({ tx, cliente: clienteResult.cliente, intent });
        const followUpResult = await createOrReuseFollowUp({ tx, empresaId, cliente: clienteResult.cliente, reason: followUpReason, externalId: payload.externalId });
        const outgoing = await tx.mensagemCanal.create({
          data: {
            empresaId,
            canalIntegracaoId: channel.id,
            conversaCanalId: conversation.id,
            externalId: responseExternalId(payload.externalId),
            direcao: "SAIDA",
            tipo: "TEXTO",
            texto: preparedText,
            status: "PREPARADA",
            simulada: true,
          },
        });

        await tx.mensagemCanal.update({ where: { id: incoming.id }, data: { status: "PROCESSADA" } });
        await tx.conversaCanal.update({ where: { id: conversation.id }, data: { ultimaMensagemEm: new Date() } });

        return responsePayload({
          duplicate: false,
          channel,
          contact,
          conversation,
          incoming: { ...incoming, status: "PROCESSADA" },
          outgoing,
          intent,
          catalog,
          clienteResult,
          notaResult,
          funilResult,
          followUpResult,
          preparedText,
          usuarioId,
        });
      });
    } catch (error) {
      if (error && error.code === "P2002") {
        const duplicate = await findExistingResult({ empresaId, canalIntegracaoId: channel.id, externalId: payload.externalId });
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  async function searchCatalog({ empresaId, intent }) {
    if (!intent.termoBusca || intent.intencao === "SAUDACAO" || intent.intencao === "FALAR_COM_VENDEDOR" || intent.intencao === "NAO_COMPREENDIDA") {
      return { products: [], product: null, pagination: null };
    }
    const filtros = { q: intent.termoBusca, limite: 5 };
    if (intent.sku) filtros.sku = intent.sku;
    if (intent.codigoBarras) filtros.codigoBarras = intent.codigoBarras;
    const result = await catalogService.consultarCatalogoComercial({ empresaId, filtros });
    if (!result.data.length) {
      for (const token of searchTokens(intent.termoBusca)) {
        const fallback = await catalogService.consultarCatalogoComercial({ empresaId, filtros: { q: token, limite: 5 } });
        if (fallback.data.length) return { products: fallback.data, product: fallback.data[0] || null, pagination: fallback.pagination };
      }
    }
    return { products: result.data, product: result.data[0] || null, pagination: result.pagination };
  }

  async function findExistingResult({ empresaId, canalIntegracaoId, externalId, prismaClient = prisma }) {
    const incoming = await prismaClient.mensagemCanal.findFirst({
      where: { empresaId, canalIntegracaoId, externalId, direcao: "ENTRADA" },
      include: { conversaCanal: { include: { contatoCanal: true, canalIntegracao: true } } },
    });
    if (!incoming) return null;
    const outgoing = await prismaClient.mensagemCanal.findFirst({
      where: { empresaId, canalIntegracaoId, externalId: responseExternalId(externalId), direcao: "SAIDA" },
      orderBy: { id: "asc" },
    });
    const client = incoming.conversaCanal?.contatoCanal?.telefoneNormalizado
      ? await prismaClient.cliente.findFirst({ where: { empresaId, telefone: incoming.conversaCanal.contatoCanal.telefoneNormalizado }, orderBy: { id: "asc" } })
      : null;
    return responsePayload({
      duplicate: true,
      channel: incoming.conversaCanal.canalIntegracao,
      contact: incoming.conversaCanal.contatoCanal,
      conversation: incoming.conversaCanal,
      incoming,
      outgoing,
      intent: { intencao: "PROCESSADA", termoBusca: "", regra: "idempotent-replay" },
      catalog: { products: [], product: null },
      clienteResult: { cliente: client, criado: false },
      notaResult: { nota: null, criada: false },
      funilResult: { etapaAnterior: client?.status || null, etapaAtual: client?.status || null, alterado: false },
      followUpResult: { acompanhamento: null, criado: false, reutilizado: false },
      preparedText: outgoing?.texto || null,
    });
  }

  return { simulateMessage };
}

async function getTestChannel({ empresaId, id }) {
  const channel = await globalPrisma().canalIntegracao.findFirst({ where: { id, empresaId } });
  if (!channel) throw notFound("Canal nao encontrado.", "CHANNEL_NOT_FOUND");
  if (!channel.modoTeste || channel.tipo !== "WHATSAPP_META") throw validationError("Esta simulacao exige um canal WhatsApp em modo de teste.");
  if (!channel.ativo || channel.status !== "MODO_TESTE") throw validationError("Canal de teste inativo ou indisponivel.");
  return channel;
}

async function findOrCreateTestChannel({ empresaId }) {
  const prisma = globalPrisma();
  return prisma.canalIntegracao.upsert({
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
}

let prismaRef;
function globalPrisma() {
  if (!prismaRef) throw new Error("Prisma nao inicializado para simulacao.");
  return prismaRef;
}

function createOrFindSimulationService(deps) {
  prismaRef = deps.prisma;
  return createWhatsappSimulationService(deps);
}

async function createOrFindContact({ tx, empresaId, channel, payload }) {
  return tx.contatoCanal.upsert({
    where: { canalIntegracaoId_externalId: { canalIntegracaoId: channel.id, externalId: payload.telefoneNormalizado } },
    create: {
      empresaId,
      canalIntegracaoId: channel.id,
      externalId: payload.telefoneNormalizado,
      telefoneNormalizado: payload.telefoneNormalizado,
      nome: payload.nome,
    },
    update: payload.nome ? { nome: payload.nome, telefoneNormalizado: payload.telefoneNormalizado } : { telefoneNormalizado: payload.telefoneNormalizado },
  });
}

async function createOrFindConversation({ tx, empresaId, channel, contact }) {
  const chaveAberta = `canal:${channel.id}:contato:${contact.id}`;
  return tx.conversaCanal.upsert({
    where: { chaveAberta },
    create: { empresaId, canalIntegracaoId: channel.id, contatoCanalId: contact.id, status: "ABERTA", chaveAberta },
    update: {},
  });
}

async function createOrFindClient({ tx, empresaId, payload, intent, product }) {
  const existing = await tx.cliente.findFirst({ where: { empresaId, telefone: payload.telefoneNormalizado }, orderBy: { id: "asc" } });
  if (existing) return { cliente: existing, criado: false };
  const commercial = COMMERCIAL_INTENTS.has(intent.intencao);
  const name = payload.nome || `Contato WhatsApp ${maskPhone(payload.telefoneNormalizado)}`;
  const cliente = await tx.cliente.create({
    data: {
      empresaId,
      nome: name,
      telefone: payload.telefoneNormalizado,
      email: "",
      empresa: "",
      interesse: product?.nome || intent.termoBusca || "",
      status: commercial ? "Lead" : "Lead",
      valor: product?.precoAtualCentavos || 0,
      origem: "WhatsApp Simulado",
      quente: commercial,
      ultimoContato: 0,
      proximoFollowUp: "Hoje",
      tags: JSON.stringify(["whatsapp-simulado"]),
    },
  });
  return { cliente, criado: true };
}

async function createNoteIfNeeded({ tx, empresaId, cliente, intent, product, externalId }) {
  if (!COMMERCIAL_INTENTS.has(intent.intencao)) return { nota: null, criada: false };
  const marker = `[whatsapp-sim:${externalId}]`;
  const existing = await tx.nota.findFirst({ where: { empresaId, clienteId: cliente.id, texto: { contains: marker } }, orderBy: { id: "asc" } });
  if (existing) return { nota: existing, criada: false };
  const texto = `${marker} Origem: WhatsApp simulado. Intencao: ${intent.intencao}. Termo: ${intent.termoBusca || "n/a"}. Resultado: ${product ? product.nome : "produto nao encontrado"}.`;
  const nota = await tx.nota.create({ data: { empresaId, clienteId: cliente.id, texto, tipo: "whatsapp" } });
  return { nota, criada: true };
}

async function updateFunnelIfNeeded({ tx, cliente, intent }) {
  const previous = cliente.status;
  if (!COMMERCIAL_INTENTS.has(intent.intencao) || !OPEN_STATUSES.has(previous)) {
    return { etapaAnterior: previous, etapaAtual: previous, alterado: false };
  }
  if (previous !== "Lead") return { etapaAnterior: previous, etapaAtual: previous, alterado: false };
  const updated = await tx.cliente.update({ where: { id: cliente.id }, data: { status: "Contato", ultimoContato: 0 } });
  return { etapaAnterior: previous, etapaAtual: updated.status, alterado: true };
}

async function createOrReuseFollowUp({ tx, empresaId, cliente, reason, externalId }) {
  if (!reason) return { acompanhamento: null, criado: false, reutilizado: false };
  const marker = `[whatsapp-sim:${externalId}]`;
  const existing = await tx.acompanhamento.findFirst({
    where: { empresaId, clienteId: cliente.id, status: "PENDENTE", descricao: { contains: marker } },
    orderBy: { id: "asc" },
  });
  if (existing) return { acompanhamento: existing, criado: false, reutilizado: true };
  const acompanhamento = await tx.acompanhamento.create({
    data: {
      empresaId,
      clienteId: cliente.id,
      titulo: "Atendimento WhatsApp simulado",
      descricao: `${marker} ${reason}`,
      dataHora: new Date(Date.now() + 60 * 60 * 1000),
      prioridade: "MEDIA",
      tipo: "WHATSAPP",
      status: "PENDENTE",
    },
  });
  return { acompanhamento, criado: true, reutilizado: false };
}

function followUpReasonFor({ intent, product }) {
  if (intent.intencao === "FALAR_COM_VENDEDOR") return "Cliente solicitou atendimento humano.";
  if (COMMERCIAL_INTENTS.has(intent.intencao) && !product) return "Produto nao encontrado no catalogo.";
  if (product?.disponibilidade === "DESCONHECIDO") return "Estoque desconhecido requer verificacao humana.";
  if (intent.intencao === "NAO_COMPREENDIDA") return "Mensagem nao compreendida requer avaliacao.";
  return null;
}

function responseExternalId(externalId) {
  const suffix = ":prepared-response";
  const base = String(externalId || "sim");
  return base.length + suffix.length > 160 ? `${base.slice(0, 160 - suffix.length)}${suffix}` : `${base}${suffix}`;
}

function searchTokens(term) {
  return String(term || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 4);
}

function responsePayload({ duplicate, channel, contact, conversation, incoming, outgoing, intent, catalog, clienteResult, notaResult, funilResult, followUpResult, preparedText }) {
  return {
    simulacaoId: incoming?.id || null,
    mensagemId: incoming?.id || null,
    externalId: incoming?.externalId || null,
    duplicada: duplicate,
    canal: channel ? { id: channel.id, nome: channel.nome, tipo: channel.tipo, status: channel.status, modoTeste: channel.modoTeste } : null,
    contato: contact ? { id: contact.id, nome: contact.nome, telefone: maskPhone(contact.telefoneNormalizado) } : null,
    conversa: conversation ? { id: conversation.id, status: conversation.status } : null,
    intencao: { tipo: intent.intencao, termoBusca: intent.termoBusca, regra: intent.regra },
    termosBusca: [intent.termoBusca].filter(Boolean),
    produtosEncontrados: (catalog.products || []).map(summarizeProduct),
    produtoPrincipal: summarizeProduct(catalog.product),
    preco: catalog.product ? { precoAtualCentavos: catalog.product.precoAtualCentavos, emPromocao: catalog.product.emPromocao } : null,
    estoque: catalog.product ? { disponibilidade: catalog.product.disponibilidade, quantidadeDisponivelTotal: catalog.product.quantidadeDisponivelTotal, locais: catalog.product.locais || [] } : null,
    respostaPreparada: outgoing ? { id: outgoing.id, texto: preparedText || outgoing.texto, status: outgoing.status } : null,
    cliente: clienteResult.cliente ? { id: clienteResult.cliente.id, criado: clienteResult.criado, nome: clienteResult.cliente.nome } : null,
    nota: { id: notaResult.nota?.id || null, criada: notaResult.criada },
    funil: funilResult,
    acompanhamento: { id: followUpResult.acompanhamento?.id || null, criado: followUpResult.criado, reutilizado: followUpResult.reutilizado },
    status: duplicate ? "DUPLICADA" : "PROCESSADA",
  };
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.codigo = "VALIDATION_ERROR";
  return error;
}

function notFound(message, codigo) {
  const error = new Error(message);
  error.status = 404;
  error.codigo = codigo;
  return error;
}

function maskPhone(value) {
  const text = String(value || "");
  if (text.length <= 4) return "***";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

module.exports = { createWhatsappSimulationService: createOrFindSimulationService };
