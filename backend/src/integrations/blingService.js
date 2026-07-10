const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { encryptCredentials, decryptCredentials } = require("./crypto");
const {
  BlingHttpClient,
  assertBlingConfigured,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  revokeBlingToken,
  blingError,
} = require("./blingClient");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SYNC_ENTITIES = new Set(["PRODUTOS", "ESTOQUE", "PRECOS", "CONDICOES_PAGAMENTO"]);
const STOCK_PRODUCT_ID_BATCH_SIZE = 50;
const PRODUCT_LIST_PARAMS = { criterio: 5, tipo: "T" };
const refreshLocks = new Map();

function createBlingService({ prisma }) {
  async function iniciarOAuth({ auth }) {
    assertBlingConfigured();
    const state = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await prisma.integracaoOAuthState.create({
      data: {
        empresaId: auth.empresaId,
        usuarioId: auth.usuarioId,
        provedor: "BLING",
        stateHash: hashState(state),
        expiresAt,
      },
    });
    return {
      authorizationUrl: buildAuthorizationUrl({ state }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function concluirOAuth({ code, state }) {
    if (!code) throw blingError("BLING_AUTH_CODE_REQUIRED", "Código de autorização ausente.");
    const stored = await consumeState({ prisma, state });
    const tokens = await exchangeCodeForTokens(code);
    return prisma.integracao.create({
      data: {
        empresaId: stored.empresaId,
        nome: "Bling",
        tipo: "BLING",
        status: "ATIVA",
        modo: "SOMENTE_LEITURA",
        configuracaoJson: JSON.stringify({ provider: "BLING", connectedAt: new Date().toISOString(), connectedByUsuarioId: stored.usuarioId }),
        credenciaisCriptografadas: encryptCredentials(tokens),
        ativo: true,
        ultimaSincronizacaoEm: new Date(),
        ultimoSucessoEm: new Date(),
      },
    });
  }

  async function desconectar({ integracao, usuarioId }) {
    const credentials = safeDecrypt(integracao.credenciaisCriptografadas);
    try {
      await revokeBlingToken(credentials?.accessToken, "access_token");
      await revokeBlingToken(credentials?.refreshToken, "refresh_token");
    } catch {
      // Revogação remota é melhor esforço; os tokens locais ainda serão removidos.
    }
    return prisma.integracao.update({
      where: { id: integracao.id },
      data: {
        status: "INATIVA",
        ativo: false,
        credenciaisCriptografadas: null,
        ultimoErroEm: null,
        configuracaoJson: JSON.stringify({
          ...safeJson(integracao.configuracaoJson, {}),
          disconnectedAt: new Date().toISOString(),
          disconnectedByUsuarioId: usuarioId,
        }),
      },
    });
  }

  async function testar({ integracao }) {
    const client = await clientForIntegration(integracao);
    const result = await client.testConnection();
    await prisma.integracao.update({
      where: { id: integracao.id },
      data: { status: "ATIVA", ultimoSucessoEm: new Date(), ultimaSincronizacaoEm: new Date(), ultimoErroEm: null },
    });
    return result;
  }

  async function sincronizar({ integracao, empresaId, entidades }) {
    const requested = normalizeEntities(entidades);
    if (integracao.tipo !== "BLING") throw blingError("INTEGRATION_INVALID_TYPE", "Sincronização Bling exige integração do tipo BLING.");
    if (!integracao.ativo || integracao.status !== "ATIVA") throw blingError("INTEGRATION_INACTIVE", "Integração Bling inativa ou desconectada.");

    const sync = await prisma.sincronizacaoIntegracao.create({
      data: {
        empresaId,
        integracaoId: integracao.id,
        status: "EXECUTANDO",
        origem: "MANUAL",
        metadadosJson: JSON.stringify({ entidades: requested, modo: "SOMENTE_LEITURA" }),
      },
    });

    const counters = emptyCounters();

    try {
      const client = await clientForIntegration(integracao);
      const now = new Date();
      let productIndex = new Map();

      if (requested.includes("PRODUTOS")) {
        const products = await client.fetchPaginated("/produtos", PRODUCT_LIST_PARAMS);
        counters.produtosRecebidos = products.length;
        const result = await upsertProducts({ prisma, empresaId, integracaoId: integracao.id, products, now });
        counters.produtosCriados += result.created;
        counters.produtosAtualizados += result.updated;
        productIndex = result.productIndex;
        if (!requested.includes("PRECOS")) {
          const priceResult = await upsertPrices({ prisma, empresaId, integracaoId: integracao.id, products, productIndex, now });
          counters.precosCriados += priceResult.created;
          counters.precosAtualizados += priceResult.updated;
          counters.erros += priceResult.errors;
        }
      } else {
        productIndex = await loadProductIndex({ prisma, empresaId, integracaoId: integracao.id });
      }

      if (requested.includes("ESTOQUE")) {
        const stocks = await fetchStocksForProducts({ client, productIndex });
        counters.estoquesRecebidos = stocks.length;
        const result = await upsertStocks({ prisma, empresaId, integracaoId: integracao.id, stocks, productIndex, now });
        counters.estoquesCriados += result.created;
        counters.estoquesAtualizados += result.updated;
        counters.erros += result.errors;
      }

      if (requested.includes("PRECOS")) {
        const products = requested.includes("PRODUTOS") ? Array.from(productIndex.values()).map((entry) => entry.original).filter(Boolean) : await client.fetchPaginated("/produtos", PRODUCT_LIST_PARAMS);
        counters.precosRecebidos = products.length;
        const result = await upsertPrices({ prisma, empresaId, integracaoId: integracao.id, products, productIndex, now });
        counters.precosCriados += result.created;
        counters.precosAtualizados += result.updated;
        counters.erros += result.errors;
      }

      if (requested.includes("CONDICOES_PAGAMENTO")) {
        const terms = await client.fetchPaginated("/formas-pagamentos");
        counters.condicoesRecebidas = terms.length;
        const result = await upsertPaymentTerms({ prisma, empresaId, integracaoId: integracao.id, terms, now });
        counters.condicoesCriadas += result.created;
        counters.condicoesAtualizadas += result.updated;
      }

      const finishedAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const syncDone = await tx.sincronizacaoIntegracao.update({
          where: { id: sync.id },
          data: {
            status: counters.erros > 0 ? "CONCLUIDA_COM_ERROS" : "CONCLUIDA",
            finalizadaEm: finishedAt,
            itensRecebidos: counters.produtosRecebidos + counters.estoquesRecebidos + counters.precosRecebidos + counters.condicoesRecebidas,
            itensProcessados: counters.produtosCriados + counters.produtosAtualizados + counters.estoquesCriados + counters.estoquesAtualizados + counters.precosCriados + counters.precosAtualizados + counters.condicoesCriadas + counters.condicoesAtualizadas,
            itensComErro: counters.erros,
            metadadosJson: JSON.stringify({ entidades: requested, resultado: counters }),
          },
        });
        await tx.integracao.update({
          where: { id: integracao.id },
          data: { ultimaSincronizacaoEm: finishedAt, ultimoSucessoEm: finishedAt, ultimoErroEm: counters.erros > 0 ? finishedAt : null, status: "ATIVA" },
        });
        return syncDone;
      });

      return { sincronizacao: updated, resultado: counters };
    } catch (error) {
      const now = new Date();
      const sanitized = sanitizeError(error);
      const failed = await prisma.$transaction(async (tx) => {
        const syncFailed = await tx.sincronizacaoIntegracao.update({
          where: { id: sync.id },
          data: {
            status: "FALHOU",
            finalizadaEm: now,
            itensComErro: 1,
            mensagemErro: sanitized.message,
            metadadosJson: JSON.stringify({ entidades: requested, resultado: counters }),
          },
        });
        await tx.erroIntegracao.create({
          data: {
            empresaId,
            integracaoId: integracao.id,
            sincronizacaoId: sync.id,
            codigo: sanitized.code,
            mensagem: sanitized.message,
            detalhesSanitizados: JSON.stringify({ tipo: "BLING" }),
          },
        });
        await tx.integracao.update({
          where: { id: integracao.id },
          data: { status: statusAfterSyncError(integracao, error), ultimoErroEm: now, ultimaSincronizacaoEm: now },
        });
        return syncFailed;
      });
      const wrapped = blingError(sanitized.code, sanitized.message, error.status);
      wrapped.sincronizacao = failed;
      throw wrapped;
    }
  }

  async function clientForIntegration(integracao) {
    const credentials = safeDecrypt(integracao.credenciaisCriptografadas);
    return new BlingHttpClient({
      credentials,
      onTokenRefresh: (updatedCredentials) => saveCredentialsOnce(integracao.id, updatedCredentials),
      correlationId: `bling-${integracao.id}-${Date.now()}`,
    });
  }

  async function saveCredentialsOnce(integracaoId, credentials) {
    const current = refreshLocks.get(integracaoId) || Promise.resolve();
    const next = current.then(() => prisma.integracao.update({
      where: { id: integracaoId },
      data: { credenciaisCriptografadas: encryptCredentials(credentials) },
    }));
    refreshLocks.set(integracaoId, next.catch(() => null));
    await next;
  }

  return { iniciarOAuth, concluirOAuth, desconectar, testar, sincronizar };
}

async function upsertProducts({ prisma, empresaId, integracaoId, products, now }) {
  const productIndex = new Map();
  let created = 0;
  let updated = 0;
  for (const item of products) {
    const row = normalizeProduct(item);
    if (!row.externalId || !row.nome) continue;
    const data = {
      empresaId,
      integracaoId,
      externalId: row.externalId,
      sku: row.sku,
      codigoBarras: row.codigoBarras,
      nome: row.nome,
      descricao: row.descricao,
      categoria: row.categoria,
      marca: row.marca,
      unidade: row.unidade,
      ativo: row.ativo,
      dadosOriginaisJson: JSON.stringify(sanitizeOriginal(item)),
      sincronizadoEm: now,
    };
    const existing = await prisma.produtoExterno.findUnique({ where: { integracaoId_externalId: { integracaoId, externalId: row.externalId } } });
    const produto = existing
      ? await prisma.produtoExterno.update({ where: { id: existing.id }, data })
      : await prisma.produtoExterno.create({ data });
    if (existing) updated += 1;
    else created += 1;
    productIndex.set(row.externalId, { produto, original: item });
    if (row.sku) productIndex.set(row.sku, { produto, original: item });
    if (row.codigoBarras) productIndex.set(row.codigoBarras, { produto, original: item });
  }
  return { created, updated, productIndex };
}

async function upsertStocks({ prisma, empresaId, integracaoId, stocks, productIndex, now }) {
  let created = 0;
  let updated = 0;
  let errors = 0;
  for (const item of stocks) {
    const row = normalizeStock(item);
    const productRef = row.externalId && productIndex.get(row.externalId);
    if (!productRef) {
      errors += 1;
      continue;
    }
    const existing = await prisma.estoqueExterno.findFirst({
      where: { empresaId, produtoExternoId: productRef.produto.id, localExternalId: row.localExternalId, localNome: row.localNome },
    });
    const data = {
      empresaId,
      integracaoId,
      produtoExternoId: productRef.produto.id,
      localExternalId: row.localExternalId,
      localNome: row.localNome,
      quantidade: decimal(row.quantidade),
      reservado: decimal(row.reservado || 0),
      disponivel: decimal(row.disponivel),
      sincronizadoEm: now,
    };
    if (existing) {
      await prisma.estoqueExterno.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.estoqueExterno.create({ data });
      created += 1;
    }
  }
  return { created, updated, errors };
}

async function upsertPrices({ prisma, empresaId, integracaoId, products, productIndex, now }) {
  let created = 0;
  let updated = 0;
  let errors = 0;
  for (const item of products) {
    const row = normalizePrice(item);
    if (row.precoCentavos === null) continue;
    const productRef = row.externalId && productIndex.get(row.externalId);
    if (!productRef) {
      errors += 1;
      continue;
    }
    const existing = await prisma.precoExterno.findFirst({ where: { empresaId, produtoExternoId: productRef.produto.id, tabela: row.tabela } });
    const data = {
      empresaId,
      integracaoId,
      produtoExternoId: productRef.produto.id,
      tabela: row.tabela,
      precoCentavos: row.precoCentavos,
      precoPromocionalCentavos: row.precoPromocionalCentavos,
      inicioPromocao: row.inicioPromocao,
      fimPromocao: row.fimPromocao,
      sincronizadoEm: now,
    };
    if (existing) {
      await prisma.precoExterno.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.precoExterno.create({ data });
      created += 1;
    }
  }
  return { created, updated, errors };
}

async function upsertPaymentTerms({ prisma, empresaId, integracaoId, terms, now }) {
  let created = 0;
  let updated = 0;
  for (const item of terms) {
    const row = normalizePaymentTerm(item);
    if (!row.externalId || !row.nome) continue;
    const existing = await prisma.condicaoPagamentoExterna.findUnique({ where: { integracaoId_externalId: { integracaoId, externalId: row.externalId } } });
    const data = { empresaId, integracaoId, ...row, sincronizadoEm: now };
    if (existing) {
      await prisma.condicaoPagamentoExterna.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.condicaoPagamentoExterna.create({ data });
      created += 1;
    }
  }
  return { created, updated };
}

async function loadProductIndex({ prisma, empresaId, integracaoId }) {
  const products = await prisma.produtoExterno.findMany({ where: { empresaId, integracaoId } });
  const index = new Map();
  for (const produto of products) {
    index.set(produto.externalId, { produto });
    if (produto.sku) index.set(produto.sku, { produto });
    if (produto.codigoBarras) index.set(produto.codigoBarras, { produto });
  }
  return index;
}

async function fetchStocksForProducts({ client, productIndex }) {
  const productIds = extractBlingProductIds(productIndex);
  if (!productIds.length) return [];
  const stocks = [];
  for (const batch of chunk(productIds, STOCK_PRODUCT_ID_BATCH_SIZE)) {
    const batchStocks = await client.fetchPaginated("/estoques/saldos", { "idsProdutos[]": batch });
    stocks.push(...batchStocks);
  }
  return stocks;
}

function extractBlingProductIds(productIndex) {
  const ids = new Set();
  for (const entry of productIndex.values()) {
    const productId = text(entry?.original?.id || entry?.produto?.externalId);
    if (isBlingProductId(productId)) ids.add(productId);
  }
  return [...ids];
}

function isBlingProductId(value) {
  return /^\d+$/.test(text(value));
}

function chunk(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

function normalizeProduct(item = {}) {
  const categoria = item.categoria?.descricao || item.categoria?.nome || item.categoria || item.grupoProduto?.nome || null;
  return {
    externalId: text(item.id || item.codigo || item.sku),
    sku: text(item.codigo || item.sku || item.referencia) || null,
    codigoBarras: text(item.gtin || item.codigoBarras || item.ean) || null,
    nome: text(item.nome || item.descricao),
    descricao: text(item.descricaoComplementar || item.observacoes || item.descricaoCurta) || null,
    categoria: text(categoria) || null,
    marca: text(item.marca || item.fabricante) || null,
    unidade: normalizeUnit(item),
    ativo: normalizeActive(item.situacao ?? item.ativo),
  };
}

function normalizeStock(item = {}) {
  const produto = item.produto || {};
  const deposito = item.deposito || item.local || {};
  const quantidade = numberLike(item.saldoFisicoTotal ?? item.saldoFisico ?? item.quantidade ?? item.saldo ?? 0);
  const reservado = numberLike(item.reservado ?? 0);
  const disponivel = item.disponivel !== undefined ? numberLike(item.disponivel) : String(new Prisma.Decimal(quantidade || 0).minus(new Prisma.Decimal(reservado || 0)));
  return {
    externalId: text(produto.id || produto.codigo || item.codigo || item.idProduto),
    localExternalId: text(deposito.id || item.idDeposito) || null,
    localNome: text(deposito.descricao || deposito.nome || item.deposito) || "Padrao",
    quantidade,
    reservado,
    disponivel,
  };
}

function normalizePrice(item = {}) {
  const product = normalizeProduct(item);
  return {
    externalId: product.externalId,
    tabela: "Padrao",
    precoCentavos: moneyToCents(normalizePriceValue(item)),
    precoPromocionalCentavos: moneyToCents(normalizePromotionalPriceValue(item)),
    inicioPromocao: item.promocao?.inicio ? new Date(item.promocao.inicio) : null,
    fimPromocao: item.promocao?.fim ? new Date(item.promocao.fim) : null,
  };
}

function normalizeUnit(item = {}) {
  return firstText(
    unitValue(item.unidade),
    unitValue(item.unidadeMedida),
    unitValue(item.unidadeComercial),
    unitValue(item.siglaUnidade),
    unitValue(item.un),
  ) || null;
}

function unitValue(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return firstText(value.sigla, value.codigo, value.descricao, value.nome);
  }
  return text(value);
}

function normalizePriceValue(item = {}) {
  return firstValue(
    priceValue(item.preco),
    priceValue(item.precoVenda),
    priceValue(item.valor),
    priceValue(item.valorVenda),
    priceValue(item.precoProduto),
    priceValue(item.precoLoja),
    priceValue(item.precoUnitario),
    priceValue(item.precos?.preco),
    priceValue(item.precos?.precoVenda),
    priceValue(item.tabelaPreco?.preco),
  );
}

function normalizePromotionalPriceValue(item = {}) {
  return firstValue(
    priceValue(item.precoPromocional),
    priceValue(item.valorPromocional),
    priceValue(item.promocao?.preco),
    priceValue(item.promocao?.valor),
  );
}

function priceValue(value) {
  if (value && typeof value === "object") {
    return firstValue(value.valor, value.preco, value.precoVenda, value.valorVenda);
  }
  return value;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizePaymentTerm(item = {}) {
  return {
    externalId: text(item.id || item.codigo),
    nome: text(item.descricao || item.nome),
    parcelas: item.parcelas ? Number(item.parcelas) : null,
    valorMinimoCentavos: moneyToCents(item.valorMinimo),
    ativo: normalizeActive(item.situacao ?? item.ativo),
  };
}

function normalizeEntities(entidades) {
  const requested = Array.isArray(entidades) && entidades.length ? entidades : ["PRODUTOS", "ESTOQUE"];
  const normalized = requested.map((item) => text(item).toUpperCase()).filter(Boolean);
  if (!normalized.length) throw blingError("VALIDATION_ERROR", "Informe ao menos uma entidade valida para sincronizar.");
  const invalid = normalized.filter((item) => !SYNC_ENTITIES.has(item));
  if (invalid.length) throw blingError("VALIDATION_ERROR", `Entidades invalidas para sincronizacao: ${invalid.join(", ")}.`);
  return [...new Set(normalized)];
}

function emptyCounters() {
  return {
    produtosRecebidos: 0,
    produtosCriados: 0,
    produtosAtualizados: 0,
    estoquesRecebidos: 0,
    estoquesCriados: 0,
    estoquesAtualizados: 0,
    precosRecebidos: 0,
    precosCriados: 0,
    precosAtualizados: 0,
    condicoesRecebidas: 0,
    condicoesCriadas: 0,
    condicoesAtualizadas: 0,
    erros: 0,
  };
}

async function consumeState({ prisma, state }) {
  const stateHash = hashState(state);
  const now = new Date();
  const value = await prisma.integracaoOAuthState.findUnique({ where: { stateHash } });
  if (!value || value.usedAt || value.expiresAt < now || value.provedor !== "BLING") {
    throw blingError("BLING_INVALID_STATE", "Autorização Bling expirada ou inválida.");
  }
  await prisma.integracaoOAuthState.update({ where: { id: value.id }, data: { usedAt: now } });
  return value;
}

function hashState(state) {
  return crypto.createHash("sha256").update(String(state || ""), "utf8").digest("hex");
}

function safeDecrypt(value) {
  if (!value) return null;
  return decryptCredentials(value);
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeOriginal(item) {
  if (!item || typeof item !== "object") return item;
  const clone = { ...item };
  delete clone.access_token;
  delete clone.refresh_token;
  delete clone.token;
  return clone;
}

function sanitizeError(error) {
  return {
    code: error?.code || "BLING_SYNC_ERROR",
    message: text(error?.message) || "Não foi possível sincronizar com o Bling.",
  };
}

function statusAfterSyncError(integracao, error) {
  if (!integracao?.ativo || !integracao?.credenciaisCriptografadas) return "ERRO";
  if (["BLING_CREDENTIALS_REQUIRED", "BLING_TOKEN_ERROR"].includes(error?.code)) return "ERRO";
  return "ATIVA";
}

function moneyToCents(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  let normalized = String(value).trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  if (Number.isNaN(Number(normalized))) return null;
  const [integer, decimalPart = ""] = normalized.split(".");
  return Number(integer) * 100 + Number(decimalPart.padEnd(2, "0").slice(0, 2));
}

function decimal(value) {
  return new Prisma.Decimal(value === undefined || value === null || value === "" ? 0 : value);
}

function numberLike(value) {
  if (value === undefined || value === null || value === "") return "0";
  return String(value).replace(",", ".");
}

function normalizeActive(value) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["inativo", "i", "0", "false", "excluido"].includes(normalized)) return false;
  return true;
}

function text(value) {
  return String(value ?? "").trim();
}

module.exports = { createBlingService };
