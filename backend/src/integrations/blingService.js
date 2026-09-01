const crypto = require("node:crypto");
const { SYSTEM_ACTOR_EMAIL } = require("../system-actor");
const { Prisma } = require("@prisma/client");
const { encryptCredentials, decryptCredentials } = require("./crypto");
const { createDistributedOperationLease } = require("../shared/distributedOperationLease");
const { decimalToCentsRoundHalfUp } = require("../shared/commercial-money");
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
const PRODUCT_DETAIL_CONCURRENCY = 3;

function createBlingService({ prisma }) {
  const distributedLease = createDistributedOperationLease({ prisma });

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
    const pending = await loadStateCandidate({ prisma, state });
    return distributedLease.withLease({
      empresaId: pending.empresaId,
      namespace: "BLING_OAUTH_TENANT",
      resourceKey: "BLING",
    }, async (lease) => {
      const existing = await prisma.integracao.findFirst({
        where: { empresaId: pending.empresaId, tipo: "BLING" },
        select: { id: true, ativo: true, status: true, credenciaisCriptografadas: true },
      });
      if (existing?.ativo && existing.status === "ATIVA" && existing.credenciaisCriptografadas) {
        throw blingError("BLING_ALREADY_CONNECTED", "Este tenant já possui uma integração Bling.", 409);
      }

      const tokens = await exchangeCodeForTokens(code, { signal: lease.signal });
      return lease.fencedTransaction(async (tx) => {
        const stored = await consumeStateWithClient(tx, state);
        const data = {
          nome: "Bling",
          status: "ATIVA",
          modo: "SOMENTE_LEITURA",
          configuracaoJson: JSON.stringify({ provider: "BLING", connectedAt: new Date().toISOString(), connectedByUsuarioId: stored.usuarioId }),
          credenciaisCriptografadas: encryptCredentials(tokens),
          ativo: true,
          ultimaSincronizacaoEm: new Date(),
          ultimoSucessoEm: new Date(),
          ultimoErroEm: null,
        };
        if (existing) {
          return tx.integracao.update({
            where: { empresaId_id: { empresaId: stored.empresaId, id: existing.id } },
            data,
          });
        }
        return tx.integracao.create({
          data: {
            empresaId: stored.empresaId,
            ...data,
            tipo: "BLING",
          },
        });
      });
    });
  }

  async function desconectar({ integracao, empresaId, usuarioId }) {
    integracao = await loadTenantIntegration(prisma, integracao, empresaId);
    return withIntegrationLease(integracao, async (lease) => {
      integracao = await loadTenantIntegration(prisma, integracao, empresaId);
      const credentials = safeDecrypt(integracao.credenciaisCriptografadas);
      try {
        await revokeBlingToken(credentials?.accessToken, "access_token", { signal: lease.signal });
        await revokeBlingToken(credentials?.refreshToken, "refresh_token", { signal: lease.signal });
      } catch {
        // Revogação remota é melhor esforço; os tokens locais ainda serão removidos.
      }
      return lease.fencedTransaction((tx) => tx.integracao.update({
        where: { empresaId_id: { empresaId, id: integracao.id } },
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
      }));
    });
  }

  // Local revocation is deliberately separate from the external disconnect.
  // It is safe to run while provider activation is paused: no token is
  // resolved, no network request is attempted, and the encrypted credential is
  // removed atomically behind the existing integration lease.
  async function desconectarLocal({ integracao, empresaId, usuarioId }) {
    integracao = await loadTenantIntegration(prisma, integracao, empresaId);
    return withIntegrationLease(integracao, (lease) => lease.fencedTransaction((tx) => tx.integracao.update({
      where: { empresaId_id: { empresaId, id: integracao.id } },
      data: {
        status: "INATIVA",
        ativo: false,
        credenciaisCriptografadas: null,
        ultimoErroEm: null,
        configuracaoJson: JSON.stringify({
          ...safeJson(integracao.configuracaoJson, {}),
          disconnectedAt: new Date().toISOString(),
          disconnectedByUsuarioId: usuarioId,
          externalRevocation: "PAUSED",
        }),
      },
    })));
  }

  async function testar({ integracao, empresaId }) {
    integracao = await loadTenantIntegration(prisma, integracao, empresaId);
    return withIntegrationLease(integracao, async (lease) => {
      integracao = await loadTenantIntegration(prisma, integracao, empresaId);
      const client = await clientForIntegration(integracao, lease);
      try {
        const result = await client.testConnection();
        await lease.fencedTransaction((tx) => tx.integracao.update({
          where: { empresaId_id: { empresaId, id: integracao.id } },
          data: { status: "ATIVA", ultimoSucessoEm: new Date(), ultimaSincronizacaoEm: new Date(), ultimoErroEm: null },
        }));
        return result;
      } catch (error) {
        if (statusAfterSyncError(integracao, error) === "ERRO") {
          await lease.fencedTransaction((tx) => tx.integracao.update({
            where: { empresaId_id: { empresaId, id: integracao.id } },
            data: { status: "ERRO", ultimoErroEm: new Date(), ultimaSincronizacaoEm: new Date() },
          }));
        }
        throw error;
      }
    });
  }

  async function sincronizar({ integracao, empresaId, entidades }) {
    integracao = await loadTenantIntegration(prisma, integracao, empresaId);
    return withIntegrationLease(integracao, async (lease) => sincronizarComLease({
      integracao: await loadTenantIntegration(prisma, integracao, empresaId),
      empresaId,
      entidades,
      lease,
    }));
  }

  async function sincronizarComLease({ integracao, empresaId, entidades, lease }) {
    const requested = normalizeEntities(entidades);
    if (integracao.tipo !== "BLING") throw blingError("INTEGRATION_INVALID_TYPE", "Sincronização Bling exige integração do tipo BLING.");
    if (!integracao.ativo || integracao.status !== "ATIVA") throw blingError("INTEGRATION_INACTIVE", "Integração Bling inativa ou desconectada.");

    const sync = await lease.fencedTransaction(async (tx) => {
      await reconcileInterruptedSyncs(tx, empresaId, integracao.id);
      return tx.sincronizacaoIntegracao.create({
        data: {
          empresaId,
          integracaoId: integracao.id,
          status: "EXECUTANDO",
          origem: "MANUAL",
          metadadosJson: JSON.stringify({ entidades: requested, modo: "SOMENTE_LEITURA" }),
        },
      });
    });

    const counters = emptyCounters();

    try {
      const client = await clientForIntegration(integracao, lease);
      const now = new Date();
      let productIndex = new Map();

      if (requested.includes("PRODUTOS")) {
        const listedProducts = await client.fetchPaginated("/produtos", PRODUCT_LIST_PARAMS);
        const detailResult = await enrichProductsWithUnitDetails({ client, products: listedProducts });
        const products = detailResult.products;
        counters.produtosRecebidos = products.length;
        counters.detalhesProdutosConsultados += detailResult.detailsFetched;
        counters.detalhesProdutosComErro += detailResult.detailErrors;
        counters.erros += detailResult.detailErrors;
        const result = await lease.fencedTransaction((tx) => upsertProducts({ prisma: tx, empresaId, integracaoId: integracao.id, products, now }));
        counters.produtosCriados += result.created;
        counters.produtosAtualizados += result.updated;
        productIndex = result.productIndex;
        if (!requested.includes("PRECOS")) {
          const priceResult = await lease.fencedTransaction((tx) => upsertPrices({ prisma: tx, empresaId, integracaoId: integracao.id, products, productIndex, now }));
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
        const result = await lease.fencedTransaction((tx) => upsertStocks({ prisma: tx, empresaId, integracaoId: integracao.id, stocks, productIndex, now }));
        counters.estoquesCriados += result.created;
        counters.estoquesAtualizados += result.updated;
        counters.erros += result.errors;
      }

      if (requested.includes("PRECOS")) {
        const products = requested.includes("PRODUTOS") ? Array.from(productIndex.values()).map((entry) => entry.original).filter(Boolean) : await client.fetchPaginated("/produtos", PRODUCT_LIST_PARAMS);
        counters.precosRecebidos = products.length;
        const result = await lease.fencedTransaction((tx) => upsertPrices({ prisma: tx, empresaId, integracaoId: integracao.id, products, productIndex, now }));
        counters.precosCriados += result.created;
        counters.precosAtualizados += result.updated;
        counters.erros += result.errors;
      }

      if (requested.includes("CONDICOES_PAGAMENTO")) {
        const terms = await client.fetchPaginated("/formas-pagamentos");
        counters.condicoesRecebidas = terms.length;
        const result = await lease.fencedTransaction((tx) => upsertPaymentTerms({ prisma: tx, empresaId, integracaoId: integracao.id, terms, now }));
        counters.condicoesCriadas += result.created;
        counters.condicoesAtualizadas += result.updated;
      }

      const finishedAt = new Date();
      const updated = await lease.fencedTransaction(async (tx) => {
        const syncDone = await tx.sincronizacaoIntegracao.update({
          where: { empresaId_id: { empresaId, id: sync.id } },
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
          where: { empresaId_id: { empresaId, id: integracao.id } },
          data: {
            ultimaSincronizacaoEm: finishedAt,
            ultimoErroEm: counters.erros > 0 ? finishedAt : null,
            status: "ATIVA",
            ...(counters.erros === 0 ? { ultimoSucessoEm: finishedAt } : {}),
          },
        });
        return syncDone;
      });

      return { sincronizacao: updated, resultado: counters };
    } catch (error) {
      const now = new Date();
      const sanitized = sanitizeError(error);
      const failed = await lease.fencedTransaction(async (tx) => {
        const syncFailed = await tx.sincronizacaoIntegracao.update({
          where: { empresaId_id: { empresaId, id: sync.id } },
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
          where: { empresaId_id: { empresaId, id: integracao.id } },
          data: { status: statusAfterSyncError(integracao, error), ultimoErroEm: now, ultimaSincronizacaoEm: now },
        });
        return syncFailed;
      });
      const wrapped = blingError(sanitized.code, sanitized.message, error.status);
      wrapped.sincronizacao = failed;
      throw wrapped;
    }
  }

  async function clientForIntegration(integracao, lease) {
    const credentials = safeDecrypt(integracao.credenciaisCriptografadas);
    return new BlingHttpClient({
      credentials,
      onTokenRefresh: (updatedCredentials) => saveCredentialsOnce(integracao.empresaId, integracao.id, updatedCredentials, lease),
      correlationId: `bling-${integracao.id}-${Date.now()}`,
      signal: lease.signal,
    });
  }

  async function saveCredentialsOnce(empresaId, integracaoId, credentials, lease) {
    await lease.fencedTransaction(async (tx) => {
      const current = await tx.integracao.findUnique({
        where: { empresaId_id: { empresaId, id: integracaoId } },
        select: { ativo: true, status: true },
      });
      if (!current?.ativo || current.status === "INATIVA") {
        throw blingError("INTEGRATION_INACTIVE", "Integração Bling inativa ou desconectada.", 409);
      }
      return tx.integracao.update({
        where: { empresaId_id: { empresaId, id: integracaoId } },
        data: { credenciaisCriptografadas: encryptCredentials(credentials) },
      });
    });
  }

  function withIntegrationLease(integracao, handler) {
    return distributedLease.withLease({
      empresaId: integracao.empresaId,
      namespace: "INTEGRATION_OPERATION",
      resourceKey: String(integracao.id),
    }, handler);
  }

  return { iniciarOAuth, concluirOAuth, desconectar, desconectarLocal, testar, sincronizar };
}

async function reconcileInterruptedSyncs(client, empresaId, integracaoId) {
  const now = new Date();
  await client.sincronizacaoIntegracao.updateMany({
    where: { empresaId, integracaoId, status: "EXECUTANDO" },
    data: {
      status: "FALHOU",
      finalizadaEm: now,
      itensComErro: 1,
      mensagemErro: "Sincronização interrompida antes da conclusão.",
    },
  });
}

async function loadTenantIntegration(prisma, integrationCandidate, empresaId) {
  const id = Number(integrationCandidate?.id);
  if (!Number.isInteger(empresaId) || empresaId < 1 || !Number.isInteger(id) || id < 1) {
    throw blingError("INTEGRATION_NOT_FOUND", "Integração não encontrada.", 404);
  }
  const integration = await prisma.integracao.findFirst({ where: { id, empresaId } });
  if (!integration) throw blingError("INTEGRATION_NOT_FOUND", "Integração não encontrada.", 404);
  return integration;
}

async function upsertProducts({ prisma, empresaId, integracaoId, products, now }) {
  const productIndex = new Map();
  let created = 0;
  let updated = 0;
  for (const item of products) {
    const row = normalizeProduct(item);
    if (!row.externalId || !row.nome) continue;
    const existing = await prisma.produtoExterno.findUnique({ where: { integracaoId_externalId: { integracaoId, externalId: row.externalId } } });
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
      unidade: row.unidade || existing?.unidade || null,
      ativo: row.ativo,
      dadosOriginaisJson: JSON.stringify(sanitizeOriginal(item)),
      sincronizadoEm: now,
    };
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

async function enrichProductsWithUnitDetails({ client, products }) {
  const detailIds = [];
  const seen = new Set();
  for (const item of products) {
    const productId = text(item?.id);
    if (normalizeUnit(item) || !isBlingProductId(productId) || seen.has(productId)) continue;
    seen.add(productId);
    detailIds.push(productId);
  }

  if (!detailIds.length) return { products, detailsFetched: 0, detailErrors: 0 };

  const details = new Map();
  let detailErrors = 0;
  await mapWithConcurrency(detailIds, PRODUCT_DETAIL_CONCURRENCY, async (productId) => {
    try {
      const detail = await client.fetchProductDetail(productId);
      if (detail && typeof detail === "object") details.set(productId, detail);
    } catch {
      detailErrors += 1;
    }
  });

  return {
    products: products.map((item) => {
      const productId = text(item?.id);
      const detail = details.get(productId);
      return detail ? { ...item, detalheProduto: detail } : item;
    }),
    detailsFetched: detailIds.length,
    detailErrors,
  };
}

async function mapWithConcurrency(values, limit, handler) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor];
      cursor += 1;
      await handler(value);
    }
  });
  await Promise.all(workers);
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
    unitValue(item.detalheProduto?.unidade),
    unitValue(item.detalheProduto?.unidadeMedida),
    unitValue(item.detalheProduto?.unidadeComercial),
    unitValue(item.detalheProduto?.siglaUnidade),
    unitValue(item.detalheProduto?.un),
  ) || null;
}

function unitValue(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return firstText(value.sigla, value.codigo, value.valor, value.descricao, value.nome);
  }
  return text(value).toUpperCase();
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
    detalhesProdutosConsultados: 0,
    detalhesProdutosComErro: 0,
    condicoesRecebidas: 0,
    condicoesCriadas: 0,
    condicoesAtualizadas: 0,
    erros: 0,
  };
}

async function loadStateCandidate({ prisma, state }) {
  const stateHash = hashState(state);
  const now = new Date();
  const value = await prisma.integracaoOAuthState.findUnique({ where: { stateHash } });
  if (!value || value.usedAt || value.expiresAt <= now || value.provedor !== "BLING") {
    throw blingError("BLING_INVALID_STATE", "Autorização Bling expirada ou inválida.");
  }
  await assertOAuthActorActive(prisma, value);
  return value;
}

async function consumeStateWithClient(client, state) {
  const stateHash = hashState(state);
  const now = new Date();
  const value = await client.integracaoOAuthState.findUnique({ where: { stateHash } });
  if (!value || value.usedAt || value.expiresAt <= now || value.provedor !== "BLING") {
    throw blingError("BLING_INVALID_STATE", "Autorização Bling expirada ou inválida.");
  }
  await assertOAuthActorActive(client, value);
  const claimed = await client.integracaoOAuthState.updateMany({
    where: { id: value.id, provedor: "BLING", usedAt: null, expiresAt: { gte: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) throw blingError("BLING_INVALID_STATE", "Autorização Bling expirada ou inválida.");
  return value;
}

async function assertOAuthActorActive(client, state) {
  const actor = await client.usuario.findFirst({
    where: {
      id: state.usuarioId,
      empresaId: state.empresaId,
      ativo: true,
      email: { not: SYSTEM_ACTOR_EMAIL },
      papel: "ADMIN",
      empresa: { ativo: true },
    },
    select: { id: true },
  });
  if (!actor) throw blingError("BLING_INVALID_STATE", "Autorização Bling expirada ou inválida.");
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
  const code = String(error?.code || "BLING_SYNC_ERROR").slice(0, 80);
  const safeMessages = {
    BLING_CREDENTIALS_REQUIRED: "Credenciais do Bling ausentes.",
    BLING_TOKEN_ERROR: "Não foi possível renovar a autenticação do Bling.",
    BLING_TOKEN_RESPONSE_INVALID: "O Bling retornou uma credencial inválida.",
    BLING_HTTP_ERROR: Number(error?.status) === 401 ? "A autenticação do Bling foi rejeitada." : "O Bling recusou a solicitação.",
    BLING_TIMEOUT: "O Bling não respondeu dentro do prazo.",
  };
  return {
    code,
    message: safeMessages[code] || "Não foi possível sincronizar com o Bling.",
  };
}

function statusAfterSyncError(integracao, error) {
  if (!integracao?.ativo || !integracao?.credenciaisCriptografadas) return "ERRO";
  if (["BLING_CREDENTIALS_REQUIRED", "BLING_TOKEN_ERROR", "BLING_TOKEN_RESPONSE_INVALID"].includes(error?.code)) return "ERRO";
  if (error?.code === "BLING_HTTP_ERROR" && Number(error?.status) === 401) return "ERRO";
  return "ATIVA";
}

function moneyToCents(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  let normalized = String(value).trim().replace(/[^\d,.-]/g, "");
  if (!normalized || normalized.includes("-") || normalized.includes("+") || /e/i.test(normalized)) return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    const decimalSeparator = normalized.lastIndexOf(",") > normalized.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = normalized.replace(thousandsSeparator, "");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  return decimalToCentsRoundHalfUp(normalized);
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

module.exports = { createBlingService, _private: { moneyToCents, sanitizeError, statusAfterSyncError } };
