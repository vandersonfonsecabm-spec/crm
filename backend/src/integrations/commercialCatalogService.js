const { Prisma } = require("@prisma/client");

const DEFAULT_STALE_MINUTES = 60;
const MAX_LIMIT = 100;

function createCommercialCatalogService({ prisma }) {
  async function consultarCatalogoComercial({ empresaId, filtros = {} }) {
    const page = Math.max(1, Number(filtros.pagina || filtros.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(filtros.limite || filtros.limit) || 20));
    const where = commercialProductWhere(empresaId, filtros);

    const [total, produtos] = await Promise.all([
      prisma.produtoExterno.count({ where }),
      prisma.produtoExterno.findMany({
        where,
        include: commercialInclude(),
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: produtos.map(commercialProductResponse),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async function buscarProdutoParaAtendimento({ empresaId, termo, limite = 5 }) {
    return consultarCatalogoComercial({ empresaId, filtros: { q: termo, limite } });
  }

  async function consultarEstoqueParaAtendimento({ empresaId, termo, limite = 5 }) {
    return consultarCatalogoComercial({ empresaId, filtros: { q: termo, somenteDisponiveis: true, limite } });
  }

  async function consultarPrecoParaAtendimento({ empresaId, termo, limite = 5 }) {
    const result = await consultarCatalogoComercial({ empresaId, filtros: { q: termo, limite } });
    return { ...result, data: result.data.filter((item) => item.precoAtualCentavos !== null) };
  }

  async function qualidadeDados({ empresaId }) {
    const staleDate = staleThresholdDate();
    const [
      totalProdutos,
      produtosAtivos,
      produtosInativos,
      produtosSemSku,
      produtosSemCodigoBarras,
      produtosSemEstoque,
      produtosSemPreco,
      produtosComDadosDesatualizados,
      duplicidadesSku,
      duplicidadesCodigoBarras,
      integracoes,
      ultimaImportacao,
      ultimaSincronizacao,
    ] = await Promise.all([
      prisma.produtoExterno.count({ where: { empresaId } }),
      prisma.produtoExterno.count({ where: { empresaId, ativo: true } }),
      prisma.produtoExterno.count({ where: { empresaId, ativo: false } }),
      prisma.produtoExterno.count({ where: { empresaId, OR: [{ sku: null }, { sku: "" }] } }),
      prisma.produtoExterno.count({ where: { empresaId, OR: [{ codigoBarras: null }, { codigoBarras: "" }] } }),
      prisma.produtoExterno.count({ where: { empresaId, estoques: { none: {} } } }),
      prisma.produtoExterno.count({ where: { empresaId, precos: { none: {} } } }),
      prisma.produtoExterno.count({ where: { empresaId, sincronizadoEm: { lt: staleDate } } }),
      duplicateGroups(prisma, empresaId, "sku"),
      duplicateGroups(prisma, empresaId, "codigoBarras"),
      prisma.integracao.findMany({
        where: { empresaId },
        select: { id: true, nome: true, tipo: true, status: true, ultimaSincronizacaoEm: true, ultimoSucessoEm: true },
        orderBy: [{ tipo: "asc" }, { nome: "asc" }],
      }),
      prisma.importacaoDados.findFirst({
        where: { empresaId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, formato: true, status: true, nomeArquivo: true, totalLinhas: true, linhasValidas: true, linhasComErro: true, createdAt: true, finalizadaEm: true },
      }),
      prisma.integracao.findFirst({
        where: { empresaId, ultimaSincronizacaoEm: { not: null } },
        orderBy: { ultimaSincronizacaoEm: "desc" },
        select: { id: true, nome: true, tipo: true, ultimaSincronizacaoEm: true, ultimoSucessoEm: true },
      }),
    ]);

    return {
      totalProdutos,
      produtosAtivos,
      produtosInativos,
      produtosSemSku,
      produtosSemCodigoBarras,
      produtosSemEstoque,
      produtosSemPreco,
      produtosComDadosDesatualizados,
      duplicidadesDetectadas: {
        sku: duplicidadesSku,
        codigoBarras: duplicidadesCodigoBarras,
      },
      integracoesOrigem: integracoes,
      ultimaImportacao,
      ultimaSincronizacao,
      staleAfterMinutes: staleAfterMinutes(),
    };
  }

  return {
    consultarCatalogoComercial,
    buscarProdutoParaAtendimento,
    consultarEstoqueParaAtendimento,
    consultarPrecoParaAtendimento,
    qualidadeDados,
  };
}

function commercialProductWhere(empresaId, filtros = {}) {
  const where = { empresaId };
  const q = clean(filtros.q || filtros.busca || filtros.nome);
  const sku = clean(filtros.sku);
  const codigoBarras = clean(filtros.codigoBarras);
  const categoria = clean(filtros.categoria);
  const marca = clean(filtros.marca);
  const local = clean(filtros.local);
  const somenteDisponiveis = parseBooleanFilter(filtros.somenteDisponiveis || filtros.apenasDisponiveis);

  if (sku) where.sku = { contains: sku };
  if (codigoBarras) where.codigoBarras = { contains: codigoBarras };
  if (categoria) where.categoria = { contains: categoria };
  if (marca) where.marca = { contains: marca };
  if (local) {
    where.estoques = {
      some: {
        OR: [{ localNome: { contains: local } }, { localExternalId: { contains: local } }],
      },
    };
  }
  if (somenteDisponiveis === true) {
    where.ativo = true;
    where.estoques = { some: { disponivel: { gt: 0 } } };
  }
  if (q) {
    where.OR = [
      { nome: { contains: q } },
      { sku: { contains: q } },
      { codigoBarras: { contains: q } },
      { descricao: { contains: q } },
      { marca: { contains: q } },
      { categoria: { contains: q } },
    ];
  }

  return where;
}

function commercialInclude() {
  return {
    integracao: {
      select: {
        id: true,
        nome: true,
        tipo: true,
        ultimaSincronizacaoEm: true,
        ultimoSucessoEm: true,
      },
    },
    estoques: { orderBy: [{ localNome: "asc" }, { id: "asc" }] },
    precos: { orderBy: [{ tabela: "asc" }, { id: "asc" }] },
  };
}

function commercialProductResponse(produto) {
  const estoques = produto.estoques || [];
  const precos = produto.precos || [];
  const quantidadeTotal = sumDecimal(estoques.map((item) => item.quantidade));
  const reservadoTotal = sumDecimal(estoques.map((item) => item.reservado || 0));
  const disponivelTotal = sumDecimal(estoques.map((item) => item.disponivel));
  const preco = selectCurrentPrice(precos);
  const atualizadoEm = produto.sincronizadoEm || produto.updatedAt;
  const dadosDesatualizados = isStale(atualizadoEm);
  const disponibilidade = availabilityStatus({ produto, estoques, disponivelTotal });
  const avisos = [];

  if (dadosDesatualizados) avisos.push("Os dados podem estar desatualizados.");
  if (!estoques.length) avisos.push("Produto sem informacao de estoque.");
  if (!precos.length) avisos.push("Produto sem informacao de preco.");
  if (!produto.ativo) avisos.push("Produto inativo na origem.");

  return {
    idCanonico: produto.id,
    externalId: produto.externalId,
    nome: produto.nome,
    descricao: produto.descricao,
    sku: produto.sku,
    codigoBarras: produto.codigoBarras,
    categoria: produto.categoria,
    marca: produto.marca,
    unidade: produto.unidade,
    ativo: produto.ativo,
    disponibilidade,
    estoques: estoques.map((estoque) => ({
      localExternalId: estoque.localExternalId,
      localNome: estoque.localNome,
      quantidade: decimalToString(estoque.quantidade),
      reservado: estoque.reservado === null || estoque.reservado === undefined ? "0" : decimalToString(estoque.reservado),
      disponivel: decimalToString(estoque.disponivel),
      status: stockStatus(produto, estoque.disponivel, true),
      sincronizadoEm: estoque.sincronizadoEm,
    })),
    quantidadeTotal: quantidadeTotal.toString(),
    quantidadeReservadaTotal: reservadoTotal.toString(),
    quantidadeDisponivelTotal: disponivelTotal.toString(),
    precoPadrao: priceByTable(precos, "Padrao"),
    precoAtualCentavos: preco.precoAtualCentavos,
    precoOriginalCentavos: preco.precoOriginalCentavos,
    precoPromocionalCentavos: preco.precoPromocionalCentavos,
    emPromocao: preco.emPromocao,
    tabelaPreco: preco.tabela,
    inicioPromocao: preco.inicioPromocao,
    fimPromocao: preco.fimPromocao,
    locais: estoques.map((estoque) => estoque.localNome || estoque.localExternalId || "Padrao"),
    origem: {
      integracaoId: produto.integracao?.id,
      integracaoNome: produto.integracao?.nome,
      tipoIntegracao: produto.integracao?.tipo,
    },
    ultimaSincronizacao: atualizadoEm,
    dadosDesatualizados,
    avisos,
  };
}

function selectCurrentPrice(precos) {
  const sorted = [...(precos || [])].sort((a, b) => {
    if ((a.tabela || "Padrao") === "Padrao") return -1;
    if ((b.tabela || "Padrao") === "Padrao") return 1;
    return a.id - b.id;
  });
  const price = sorted[0];
  if (!price) {
    return {
      precoAtualCentavos: null,
      precoOriginalCentavos: null,
      precoPromocionalCentavos: null,
      emPromocao: false,
      tabela: null,
      inicioPromocao: null,
      fimPromocao: null,
    };
  }
  const promotionActive = isPromotionActive(price);
  return {
    precoAtualCentavos: promotionActive ? price.precoPromocionalCentavos : price.precoCentavos,
    precoOriginalCentavos: price.precoCentavos,
    precoPromocionalCentavos: price.precoPromocionalCentavos,
    emPromocao: promotionActive,
    tabela: price.tabela,
    inicioPromocao: price.inicioPromocao,
    fimPromocao: price.fimPromocao,
  };
}

function priceByTable(precos, tableName) {
  const price = (precos || []).find((item) => (item.tabela || "Padrao") === tableName) || (precos || [])[0];
  if (!price) return null;
  return {
    tabela: price.tabela,
    precoCentavos: price.precoCentavos,
    precoPromocionalCentavos: price.precoPromocionalCentavos,
    emPromocao: isPromotionActive(price),
    inicioPromocao: price.inicioPromocao,
    fimPromocao: price.fimPromocao,
  };
}

function isPromotionActive(price, now = new Date()) {
  if (!price || price.precoPromocionalCentavos === null || price.precoPromocionalCentavos === undefined) return false;
  if (price.inicioPromocao && now < new Date(price.inicioPromocao)) return false;
  if (price.fimPromocao && now > new Date(price.fimPromocao)) return false;
  return true;
}

function availabilityStatus({ produto, estoques, disponivelTotal }) {
  if (!produto.ativo) return "INDISPONIVEL";
  if (!estoques.length) return "DESCONHECIDO";
  if (disponivelTotal.gt(0)) return "EM_ESTOQUE";
  return "SEM_ESTOQUE";
}

function stockStatus(produto, disponivel, hasRecord) {
  if (!produto.ativo) return "INDISPONIVEL";
  if (!hasRecord) return "DESCONHECIDO";
  const value = new Prisma.Decimal(disponivel || 0);
  return value.gt(0) ? "EM_ESTOQUE" : "SEM_ESTOQUE";
}

function sumDecimal(values) {
  return values.reduce((sum, value) => sum.plus(new Prisma.Decimal(value || 0)), new Prisma.Decimal(0));
}

function decimalToString(value) {
  return value === null || value === undefined ? "0" : value.toString();
}

function staleAfterMinutes() {
  const value = Number(process.env.HUB_DATA_STALE_AFTER_MINUTES);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_STALE_MINUTES;
}

function staleThresholdDate() {
  return new Date(Date.now() - staleAfterMinutes() * 60 * 1000);
}

function isStale(date) {
  if (!date) return true;
  return new Date(date).getTime() < staleThresholdDate().getTime();
}

async function duplicateGroups(prisma, empresaId, field) {
  const rows = await prisma.produtoExterno.findMany({
    where: { empresaId, NOT: { [field]: null } },
    select: { [field]: true },
  });
  const counts = new Map();
  rows.forEach((row) => {
    const value = clean(row[field]);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, total]) => total > 1)
    .map(([valor, total]) => ({ campo: field, valor, total }));
}

function parseBooleanFilter(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "sim", "s"].includes(text)) return true;
  if (["false", "0", "nao", "não", "n"].includes(text)) return false;
  return null;
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

module.exports = {
  createCommercialCatalogService,
  commercialProductResponse,
  isPromotionActive,
};

