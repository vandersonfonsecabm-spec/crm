function createCanonicalService({ prisma }) {
  async function buscarProdutos({ empresaId, filtros = {}, page = 1, limit = 20 }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const where = produtoWhere(empresaId, filtros);
    const [total, produtos] = await Promise.all([
      prisma.produtoExterno.count({ where }),
      prisma.produtoExterno.findMany({
        where,
        include: includeCanonicalData(),
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      data: produtos.map(canonicalProductResponse),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async function consultarProdutoPorCodigo({ empresaId, codigo }) {
    const text = String(codigo || "").trim();
    if (!text) return null;

    const produto = await prisma.produtoExterno.findFirst({
      where: {
        empresaId,
        OR: [{ sku: text }, { codigoBarras: text }, { externalId: text }],
      },
      include: includeCanonicalData(),
      orderBy: { id: "asc" },
    });

    return produto ? canonicalProductResponse(produto) : null;
  }

  async function consultarDisponibilidade({ empresaId, produtoExternoId }) {
    return prisma.estoqueExterno.findMany({
      where: { empresaId, produtoExternoId },
      orderBy: [{ localNome: "asc" }, { id: "asc" }],
    });
  }

  async function consultarPrecos({ empresaId, produtoExternoId }) {
    return prisma.precoExterno.findMany({
      where: { empresaId, produtoExternoId },
      orderBy: [{ tabela: "asc" }, { id: "asc" }],
    });
  }

  async function consultarCondicoesPagamento({ empresaId, integracaoId }) {
    return prisma.condicaoPagamentoExterna.findMany({
      where: { empresaId, integracaoId, ativo: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    });
  }

  return {
    buscarProdutos,
    consultarProdutoPorCodigo,
    consultarDisponibilidade,
    consultarPrecos,
    consultarCondicoesPagamento,
  };
}

function produtoWhere(empresaId, filtros = {}) {
  const where = { empresaId };
  const busca = clean(filtros.busca || filtros.nome);
  const sku = clean(filtros.sku);
  const codigoBarras = clean(filtros.codigoBarras);
  const categoria = clean(filtros.categoria);
  const integracaoId = positiveId(filtros.integracaoId);

  if (integracaoId) where.integracaoId = integracaoId;
  if (sku) where.sku = { contains: sku };
  if (codigoBarras) where.codigoBarras = { contains: codigoBarras };
  if (categoria) where.categoria = { contains: categoria };
  if (busca) {
    where.OR = [
      { nome: { contains: busca } },
      { sku: { contains: busca } },
      { codigoBarras: { contains: busca } },
    ];
  }

  return where;
}

function includeCanonicalData() {
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
    estoques: true,
    precos: true,
  };
}

function canonicalProductResponse(produto) {
  const atualizadoEm = produto.sincronizadoEm || produto.updatedAt;

  return {
    produto: {
      id: produto.id,
      externalId: produto.externalId,
      sku: produto.sku,
      codigoBarras: produto.codigoBarras,
      nome: produto.nome,
      descricao: produto.descricao,
      categoria: produto.categoria,
      marca: produto.marca,
      unidade: produto.unidade,
      ativo: produto.ativo,
    },
    estoques: (produto.estoques || []).map((estoque) => ({
      id: estoque.id,
      localExternalId: estoque.localExternalId,
      localNome: estoque.localNome,
      quantidade: decimalToString(estoque.quantidade),
      reservado: estoque.reservado === null || estoque.reservado === undefined ? null : decimalToString(estoque.reservado),
      disponivel: decimalToString(estoque.disponivel),
      sincronizadoEm: estoque.sincronizadoEm,
    })),
    precos: (produto.precos || []).map((preco) => ({
      id: preco.id,
      tabela: preco.tabela,
      precoCentavos: preco.precoCentavos,
      precoPromocionalCentavos: preco.precoPromocionalCentavos,
      inicioPromocao: preco.inicioPromocao,
      fimPromocao: preco.fimPromocao,
      sincronizadoEm: preco.sincronizadoEm,
    })),
    condicoesPagamento: [],
    origem: {
      integracaoId: produto.integracao?.id,
      integracaoNome: produto.integracao?.nome,
      tipo: produto.integracao?.tipo,
      ultimaSincronizacaoEm: produto.integracao?.ultimaSincronizacaoEm,
      ultimoSucessoEm: produto.integracao?.ultimoSucessoEm,
    },
    atualizadoEm,
    possivelmenteDesatualizado: isStale(atualizadoEm),
  };
}

function isStale(date) {
  if (!date) return true;
  return Date.now() - new Date(date).getTime() > 1000 * 60 * 60 * 24;
}

function decimalToString(value) {
  return value === null || value === undefined ? "0" : value.toString();
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

module.exports = { createCanonicalService, canonicalProductResponse };
