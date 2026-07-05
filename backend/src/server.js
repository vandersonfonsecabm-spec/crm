require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Prisma, PrismaClient } = require("@prisma/client");
const { createAuth } = require("./auth");
const { mountIntegrationHubRoutes } = require("./integrations/routes");
const { mountChannelRoutes } = require("./channels/channelRoutes");
const { assertIntegrationEncryptionReady } = require("./integrations/crypto");

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://crm-murex-six-83.vercel.app",
];
const allowedOrigins = getAllowedOrigins();

app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem nao permitida pelo CORS."));
    },
    credentials: true,
  }),
);

const DEMO_EMAIL = "demo@crm.com";
const DEMO_PASSWORD = "123456";
const DEMO_TOKEN = "demo-sqlite-backend";
const UNIDADES_MEDIDA = new Set(["UN", "KG", "L", "SC", "TON"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);
const TIPOS_MOVIMENTACAO_ESTOQUE = new Set(["ENTRADA", "SAIDA", "AJUSTE"]);
const STATUS_ACOMPANHAMENTO = new Set(["PENDENTE", "CONCLUIDO", "CANCELADO"]);
const PRIORIDADES_ACOMPANHAMENTO = new Set(["BAIXA", "MEDIA", "ALTA", "CRITICA"]);
const TIPOS_ACOMPANHAMENTO = new Set(["LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "VISITA", "OUTRO"]);
const auth = createAuth({
  prisma,
  demo: {
    email: DEMO_EMAIL,
    senha: DEMO_PASSWORD,
    token: DEMO_TOKEN,
    usuario: {
      id: 1,
      nome: "Marco Admin",
      email: DEMO_EMAIL,
      role: "ADMIN",
      papel: "ADMIN",
    },
    empresa: {
      id: 1,
      nome: "CRM Agro Demo",
      slug: "crm-agro-demo",
      ativo: true,
    },
  },
});
const requireAuth = auth.authenticate;
const requireRole = auth.requireRole;

auth.mountRoutes(app);
mountIntegrationHubRoutes({ app, prisma, authenticate: requireAuth, requireRole });
mountChannelRoutes({ app, prisma, authenticate: requireAuth, requireRole });

app.get("/dashboard", async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      include: {
        notas: true,
      },
    });

    const totalValue = clientes.reduce((sum, cliente) => sum + Number(cliente.valor || 0), 0);
    const propostas = clientes.filter((cliente) => cliente.status === "Proposta");
    const fechados = clientes.filter((cliente) => cliente.status === "Fechado");
    const quentes = clientes.filter((cliente) => cliente.quente);

    res.json({
      indicadores: {
        clientes: clientes.length,
        produtos: 0,
        pedidos: propostas.length + fechados.length,
        contasPendentes: propostas.reduce((sum, cliente) => sum + Number(cliente.valor || 0), 0),
        faturamento: fechados.reduce((sum, cliente) => sum + Number(cliente.valor || 0), 0),
        pipeline: totalValue,
        quentes: quentes.length,
      },
      estoqueBaixo: [],
      pedidosRecentes: propostas.slice(0, 5),
      contasVencidas: clientes.filter((cliente) => Number(cliente.ultimoContato || 0) >= 7),
      produtosMaisVendidos: [],
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao buscar dashboard",
    });
  }
});

app.get("/clientes", async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      include: {
        notas: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    res.json(clientes);
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar clientes",
    });
  }
});

app.post("/clientes", async (req, res) => {
  try {
    const data = clientePayload(req.body);

    const cliente = await prisma.cliente.create({
      data,
      include: {
        notas: true,
      },
    });

    res.json(cliente);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao criar cliente",
    });
  }
});

app.put("/clientes/:id", async (req, res) => {
  return updateCliente(req, res);
});

app.patch("/clientes/:id", async (req, res) => {
  return updateCliente(req, res);
});

async function updateCliente(req, res) {
  try {
    const { id } = req.params;
    const data = clientePayload(req.body);

    const clienteAtualizado = await prisma.cliente.update({
      where: {
        id: Number(id),
      },
      data,
      include: {
        notas: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    res.json(clienteAtualizado);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao atualizar cliente",
    });
  }
}

app.delete("/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.cliente.delete({
      where: {
        id: Number(id),
      },
    });

    res.json({
      sucesso: true,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao excluir cliente",
    });
  }
});

app.get("/clientes/:id/notas", async (req, res) => {
  try {
    const { id } = req.params;

    const notas = await prisma.nota.findMany({
      where: {
        clienteId: Number(id),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(notas);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao buscar notas",
    });
  }
});

app.post("/clientes/:id/notas", async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, tipo } = req.body;

    if (!texto || !String(texto).trim()) {
      return res.status(400).json({
        erro: "Texto da nota é obrigatório",
      });
    }

    const nota = await prisma.nota.create({
      data: {
        clienteId: Number(id),
        texto: String(texto).trim(),
        tipo: tipo || "nota",
      },
    });

    res.json(nota);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao criar nota",
    });
  }
});

app.delete("/clientes/:clienteId/notas/:notaId", requireAuth, async (req, res) => {
  try {
    const clienteId = parsePositiveId(req.params.clienteId);
    const notaId = parsePositiveId(req.params.notaId);

    if (!clienteId || !notaId) {
      return res.status(400).json({
        erro: "Parametros invalidos.",
      });
    }

    const cliente = await prisma.cliente.findUnique({
      where: {
        id: clienteId,
      },
      select: {
        id: true,
      },
    });

    if (!cliente) {
      return res.status(404).json({
        erro: "Cliente nao encontrado.",
      });
    }

    const nota = await prisma.nota.findFirst({
      where: {
        id: notaId,
        clienteId,
      },
      select: {
        id: true,
      },
    });

    if (!nota) {
      return res.status(404).json({
        erro: "Nota nao encontrada.",
      });
    }

    await prisma.nota.delete({
      where: {
        id: notaId,
      },
    });

    return res.json({
      ok: true,
      mensagem: "Nota removida com sucesso.",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao remover nota",
    });
  }
});

app.get("/acompanhamentos", async (req, res) => {
  try {
    const filtros = acompanhamentoListWhere(req.query);

    if (filtros.error) {
      return res.status(filtros.status).json({
        erro: filtros.error,
      });
    }

    const { page, limit, skip } = paginationFromQuery(req.query);
    const [total, acompanhamentos] = await Promise.all([
      prisma.acompanhamento.count({ where: filtros.data }),
      prisma.acompanhamento.findMany({
        where: filtros.data,
        include: acompanhamentoInclude(),
        orderBy: [{ dataHora: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    return res.json(paginatedResponse(acompanhamentos.map(acompanhamentoResponse), total, page, limit));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar acompanhamentos.",
    });
  }
});

app.get("/acompanhamentos/resumo", async (req, res) => {
  try {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = todayRange();
    const start = req.query.dataInicial ? parseDateFilter(req.query.dataInicial) : todayStart;
    const end = req.query.dataFinal ? parseDateFilter(req.query.dataFinal, true) : todayEnd;

    if (!start || !end) {
      return res.status(400).json({
        erro: "Periodo invalido.",
      });
    }

    const [pendentes, paraHoje, atrasados, criticos, concluidosPeriodo, proximos, porTipo] = await Promise.all([
      prisma.acompanhamento.count({ where: { status: "PENDENTE" } }),
      prisma.acompanhamento.count({
        where: {
          status: "PENDENTE",
          dataHora: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),
      prisma.acompanhamento.count({
        where: {
          status: "PENDENTE",
          dataHora: {
            lt: now,
          },
        },
      }),
      prisma.acompanhamento.count({
        where: {
          status: "PENDENTE",
          prioridade: "CRITICA",
        },
      }),
      prisma.acompanhamento.count({
        where: {
          status: "CONCLUIDO",
          concluidoEm: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.acompanhamento.findMany({
        where: { status: "PENDENTE" },
        include: acompanhamentoInclude(),
        orderBy: [{ dataHora: "asc" }, { id: "asc" }],
        take: 6,
      }),
      prisma.acompanhamento.groupBy({
        by: ["tipo"],
        where: { status: "PENDENTE" },
        _count: { _all: true },
      }),
    ]);

    return res.json({
      indicadores: {
        pendentes,
        paraHoje,
        atrasados,
        criticos,
        concluidosPeriodo,
      },
      proximos: proximos.map(acompanhamentoResponse),
      porTipo: porTipo.map((item) => ({
        tipo: item.tipo,
        total: item._count._all,
      })),
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar resumo de acompanhamentos.",
    });
  }
});

app.get("/acompanhamentos/:id", async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "Acompanhamento invalido.",
      });
    }

    const acompanhamento = await prisma.acompanhamento.findUnique({
      where: { id },
      include: acompanhamentoInclude(),
    });

    if (!acompanhamento) {
      return res.status(404).json({
        erro: "Acompanhamento nao encontrado.",
      });
    }

    return res.json(acompanhamentoResponse(acompanhamento));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar acompanhamento.",
    });
  }
});

app.post("/acompanhamentos", requireAuth, async (req, res) => {
  try {
    const payload = await acompanhamentoPayload(req.body, { partial: false });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const acompanhamento = await prisma.acompanhamento.create({
      data: payload.data,
      include: acompanhamentoInclude(),
    });

    return res.status(201).json(acompanhamentoResponse(acompanhamento));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao criar acompanhamento.",
    });
  }
});

app.patch("/acompanhamentos/:id", requireAuth, async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "Acompanhamento invalido.",
      });
    }

    const exists = await prisma.acompanhamento.findUnique({ where: { id } });

    if (!exists) {
      return res.status(404).json({
        erro: "Acompanhamento nao encontrado.",
      });
    }

    const payload = await acompanhamentoPayload(req.body, { partial: true });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const acompanhamento = await prisma.acompanhamento.update({
      where: { id },
      data: payload.data,
      include: acompanhamentoInclude(),
    });

    return res.json(acompanhamentoResponse(acompanhamento));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao atualizar acompanhamento.",
    });
  }
});

app.post("/acompanhamentos/:id/concluir", requireAuth, async (req, res) => {
  return updateAcompanhamentoStatus(req, res, "CONCLUIDO");
});

app.post("/acompanhamentos/:id/reabrir", requireAuth, async (req, res) => {
  return updateAcompanhamentoStatus(req, res, "PENDENTE");
});

app.post("/acompanhamentos/:id/cancelar", requireAuth, async (req, res) => {
  return updateAcompanhamentoStatus(req, res, "CANCELADO");
});

app.get("/categorias-produtos", async (req, res) => {
  try {
    const { page, limit, skip } = paginationFromQuery(req.query);
    const where = {};
    const busca = cleanOptionalString(req.query.busca || req.query.search);
    const ativo = parseBooleanFilter(req.query, "ativo");

    if (!ativo.valid) {
      return res.status(400).json({
        erro: "Filtro ativo deve ser verdadeiro ou falso.",
      });
    }

    if (busca) {
      where.nome = {
        contains: busca,
      };
    }

    if (ativo.provided) {
      where.ativo = ativo.value;
    }

    const [total, categorias] = await Promise.all([
      prisma.categoriaProduto.count({
        where,
      }),
      prisma.categoriaProduto.findMany({
        where,
        include: {
          _count: {
            select: {
              produtos: true,
            },
          },
        },
        orderBy: [
          {
            ativo: "desc",
          },
          {
            nome: "asc",
          },
        ],
        skip,
        take: limit,
      }),
    ]);

    return res.json(paginatedResponse(categorias.map(categoriaProdutoResponse), total, page, limit));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar categorias de produtos.",
    });
  }
});

app.post("/categorias-produtos", requireAuth, async (req, res) => {
  try {
    const payload = categoriaProdutoPayload(req.body, { partial: false });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const categoriaExistente = await findCategoriaByNome(payload.data.nome);

    if (categoriaExistente) {
      return res.status(409).json({
        erro: "Ja existe uma categoria com esse nome.",
      });
    }

    const categoria = await prisma.categoriaProduto.create({
      data: payload.data,
      include: {
        _count: {
          select: {
            produtos: true,
          },
        },
      },
    });

    return res.status(201).json(categoriaProdutoResponse(categoria));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao criar categoria de produto.",
    });
  }
});

app.patch("/categorias-produtos/:id", requireAuth, async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "ID invalido.",
      });
    }

    const categoriaAtual = await prisma.categoriaProduto.findUnique({
      where: {
        id,
      },
    });

    if (!categoriaAtual) {
      return res.status(404).json({
        erro: "Categoria de produto nao encontrada.",
      });
    }

    const payload = categoriaProdutoPayload(req.body, { partial: true });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    if (payload.data.nome) {
      const categoriaExistente = await findCategoriaByNome(payload.data.nome, id);

      if (categoriaExistente) {
        return res.status(409).json({
          erro: "Ja existe uma categoria com esse nome.",
        });
      }
    }

    const categoria = await prisma.categoriaProduto.update({
      where: {
        id,
      },
      data: payload.data,
      include: {
        _count: {
          select: {
            produtos: true,
          },
        },
      },
    });

    return res.json(categoriaProdutoResponse(categoria));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao atualizar categoria de produto.",
    });
  }
});

app.get("/produtos", async (req, res) => {
  try {
    const { page, limit, skip } = paginationFromQuery(req.query);
    const where = produtoListWhere(req.query);
    const orderBy = produtoOrderBy(req.query);

    if (where.error) {
      return res.status(where.status).json({
        erro: where.error,
      });
    }

    const estoqueBaixo = parseBooleanFilter(req.query, "estoqueBaixo");

    if (!estoqueBaixo.valid) {
      return res.status(400).json({
        erro: "Filtro estoqueBaixo deve ser verdadeiro ou falso.",
      });
    }

    if (estoqueBaixo.provided) {
      const produtos = await prisma.produto.findMany({
        where: where.data,
        include: {
          categoria: true,
        },
        orderBy,
      });
      const produtosFiltrados = produtos.filter((produto) => {
        const baixo = produtoTemEstoqueBaixo(produto);
        return estoqueBaixo.value ? baixo : !baixo;
      });

      return res.json(
        paginatedResponse(
          produtosFiltrados.slice(skip, skip + limit).map(produtoResponse),
          produtosFiltrados.length,
          page,
          limit,
        ),
      );
    }

    const [total, produtos] = await Promise.all([
      prisma.produto.count({
        where: where.data,
      }),
      prisma.produto.findMany({
        where: where.data,
        include: {
          categoria: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return res.json(paginatedResponse(produtos.map(produtoResponse), total, page, limit));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar produtos.",
    });
  }
});

app.get("/produtos/:id", async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "ID invalido.",
      });
    }

    const produto = await prisma.produto.findUnique({
      where: {
        id,
      },
      include: {
        categoria: true,
        _count: {
          select: {
            movimentacoes: true,
          },
        },
        movimentacoes: {
          include: {
            produto: {
              select: {
                id: true,
                nome: true,
                codigo: true,
                unidadeMedida: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
      },
    });

    if (!produto) {
      return res.status(404).json({
        erro: "Produto nao encontrado.",
      });
    }

    return res.json(produtoResponse(produto));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar produto.",
    });
  }
});

app.post("/produtos", requireAuth, async (req, res) => {
  try {
    const payload = await produtoPayload(req.body, { partial: false });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const produto = await prisma.produto.create({
      data: {
        ...payload.data,
        quantidadeAtual: "0",
      },
      include: {
        categoria: true,
      },
    });

    return res.status(201).json(produtoResponse(produto));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao criar produto.",
    });
  }
});

app.patch("/produtos/:id", requireAuth, async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "ID invalido.",
      });
    }

    const produtoAtual = await prisma.produto.findUnique({
      where: {
        id,
      },
    });

    if (!produtoAtual) {
      return res.status(404).json({
        erro: "Produto nao encontrado.",
      });
    }

    const payload = await produtoPayload(req.body, { partial: true, currentId: id });

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const produto = await prisma.produto.update({
      where: {
        id,
      },
      data: payload.data,
      include: {
        categoria: true,
      },
    });

    return res.json(produtoResponse(produto));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao atualizar produto.",
    });
  }
});

app.post("/estoque/entradas", requireAuth, async (req, res) => {
  return criarMovimentacaoEstoque(req, res, "ENTRADA");
});

app.post("/estoque/saidas", requireAuth, async (req, res) => {
  return criarMovimentacaoEstoque(req, res, "SAIDA");
});

app.post("/estoque/ajustes", requireAuth, async (req, res) => {
  return criarMovimentacaoEstoque(req, res, "AJUSTE");
});

app.get("/estoque/movimentacoes", async (req, res) => {
  try {
    const filtros = movimentacaoListWhere(req.query);

    if (filtros.error) {
      return res.status(filtros.status).json({
        erro: filtros.error,
      });
    }

    const { page, limit, skip } = paginationFromQuery(req.query);
    const [total, movimentacoes] = await Promise.all([
      prisma.movimentacaoEstoque.count({
        where: filtros.data,
      }),
      prisma.movimentacaoEstoque.findMany({
        where: filtros.data,
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              unidadeMedida: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    return res.json(
      paginatedResponse(movimentacoes.map(movimentacaoResponse), total, page, limit),
    );
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar movimentacoes de estoque.",
    });
  }
});

app.get("/estoque/resumo", async (req, res) => {
  try {
    const [
      produtosAtivos,
      produtosComEstoque,
      produtosSemEstoque,
      produtosComEstoqueBaixo,
      categoriasAtivas,
      ultimasMovimentacoes,
      produtosParaTotais,
    ] = await Promise.all([
      prisma.produto.count({
        where: {
          ativo: true,
        },
      }),
      prisma.produto.count({
        where: {
          ativo: true,
          quantidadeAtual: {
            gt: "0",
          },
        },
      }),
      prisma.produto.count({
        where: {
          ativo: true,
          quantidadeAtual: "0",
        },
      }),
      prisma.produto.findMany({
        where: {
          ativo: true,
          quantidadeAtual: {
            gt: "0",
          },
        },
        select: {
          id: true,
          quantidadeAtual: true,
          estoqueMinimo: true,
        },
      }),
      prisma.categoriaProduto.count({
        where: {
          ativo: true,
        },
      }),
      prisma.movimentacaoEstoque.findMany({
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              unidadeMedida: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
      prisma.produto.findMany({
        where: {
          ativo: true,
        },
        select: {
          quantidadeAtual: true,
          precoCustoCentavos: true,
          precoVendaCentavos: true,
        },
      }),
    ]);
    const totais = calcularTotaisEstoque(produtosParaTotais);

    return res.json({
      indicadores: {
        produtosAtivos,
        produtosComEstoque,
        produtosSemEstoque,
        produtosComEstoqueBaixo: produtosComEstoqueBaixo.filter((produto) =>
          decimalLessThanOrEqual(produto.quantidadeAtual, produto.estoqueMinimo),
        ).length,
        categoriasAtivas,
        valorTotalCustoCentavos: decimalToString(totais.custo),
        valorTotalVendaCentavos: decimalToString(totais.venda),
      },
      ultimasMovimentacoes: ultimasMovimentacoes.map(movimentacaoResponse),
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao buscar resumo de estoque.",
    });
  }
});

async function criarMovimentacaoEstoque(req, res, tipo) {
  try {
    const payload =
      tipo === "AJUSTE" ? ajusteEstoquePayload(req.body) : movimentacaoEstoquePayload(req.body);

    if (payload.error) {
      return res.status(payload.status).json({
        erro: payload.error,
      });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({
        where: {
          id: payload.data.produtoId,
        },
        include: {
          categoria: true,
        },
      });

      if (!produto) {
        return validationError("Produto nao encontrado.", 404);
      }

      if (!produto.ativo) {
        return validationError("Produto inativo nao pode movimentar estoque.", 409);
      }

      const quantidadeAnterior = toDecimal(produto.quantidadeAtual);
      const quantidadeMovimentada =
        tipo === "AJUSTE" ? payload.data.novaQuantidade : payload.data.quantidade;
      let quantidadePosterior = quantidadeAnterior;

      if (tipo === "ENTRADA") {
        quantidadePosterior = quantidadeAnterior.plus(quantidadeMovimentada);
      }

      if (tipo === "SAIDA") {
        if (quantidadeAnterior.lessThan(quantidadeMovimentada)) {
          return validationError(
            `Saldo insuficiente para realizar a saida. Saldo disponivel: ${decimalToString(quantidadeAnterior)}.`,
            409,
          );
        }

        quantidadePosterior = quantidadeAnterior.minus(quantidadeMovimentada);
      }

      if (tipo === "AJUSTE") {
        quantidadePosterior = quantidadeMovimentada;

        if (quantidadePosterior.equals(quantidadeAnterior)) {
          return validationError("Ajuste deve alterar o saldo atual do produto.");
        }
      }

      const [produtoAtualizado, movimentacao] = await Promise.all([
        tx.produto.update({
          where: {
            id: produto.id,
          },
          data: {
            quantidadeAtual: decimalToString(quantidadePosterior),
          },
          include: {
            categoria: true,
          },
        }),
        tx.movimentacaoEstoque.create({
          data: {
            produtoId: produto.id,
            tipo,
            quantidade:
              tipo === "AJUSTE"
                ? decimalToString(quantidadePosterior.minus(quantidadeAnterior).abs())
                : decimalToString(quantidadeMovimentada),
            quantidadeAnterior: decimalToString(quantidadeAnterior),
            quantidadePosterior: decimalToString(quantidadePosterior),
            motivo: payload.data.motivo,
            observacao: payload.data.observacao,
          },
          include: {
            produto: {
              select: {
                id: true,
                nome: true,
                codigo: true,
                unidadeMedida: true,
              },
            },
          },
        }),
      ]);

      return {
        produto: produtoResponse(produtoAtualizado),
        movimentacao: movimentacaoResponse(movimentacao),
      };
    });

    if (resultado.error) {
      return res.status(resultado.status).json({
        erro: resultado.error,
      });
    }

    return res.status(201).json(resultado);
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao movimentar estoque.",
    });
  }
}

function movimentacaoEstoquePayload(body) {
  const unknown = unknownFields(body, ["produtoId", "quantidade", "motivo", "observacao"]);

  if (unknown.length > 0) {
    return validationError(`Campos nao permitidos: ${unknown.join(", ")}.`);
  }

  const produtoId = parsePositiveId(body.produtoId);

  if (!produtoId) {
    return validationError("Produto invalido.");
  }

  const quantidade = parsePositiveDecimal(body.quantidade);

  if (!quantidade.ok) {
    return validationError("Quantidade deve ser maior que zero.");
  }

  return {
    data: {
      produtoId,
      quantidade: quantidade.value,
      motivo: cleanNullableString(body.motivo),
      observacao: cleanNullableString(body.observacao),
    },
  };
}

function ajusteEstoquePayload(body) {
  const unknown = unknownFields(body, ["produtoId", "novaQuantidade", "motivo", "observacao"]);

  if (unknown.length > 0) {
    return validationError(`Campos nao permitidos: ${unknown.join(", ")}.`);
  }

  const produtoId = parsePositiveId(body.produtoId);

  if (!produtoId) {
    return validationError("Produto invalido.");
  }

  if (!Object.prototype.hasOwnProperty.call(body, "novaQuantidade")) {
    return validationError("Nova quantidade e obrigatoria.");
  }

  const novaQuantidade = parseNonNegativeDecimal(body.novaQuantidade);

  if (!novaQuantidade.ok || novaQuantidade.value === null || novaQuantidade.value === undefined) {
    return validationError("Nova quantidade nao pode ser negativa.");
  }

  const motivo = cleanOptionalString(body.motivo);

  if (!motivo) {
    return validationError("Motivo do ajuste e obrigatorio.");
  }

  return {
    data: {
      produtoId,
      novaQuantidade: toDecimal(novaQuantidade.value),
      motivo,
      observacao: cleanNullableString(body.observacao),
    },
  };
}

function movimentacaoListWhere(query) {
  const where = {};
  const produtoId = query.produtoId === undefined || query.produtoId === "" ? null : parsePositiveId(query.produtoId);
  const tipo = cleanOptionalString(query.tipo).toUpperCase();
  const dataInicial = cleanOptionalString(query.dataInicial || query.de);
  const dataFinal = cleanOptionalString(query.dataFinal || query.ate);
  const busca = cleanOptionalString(query.busca || query.search);

  if (query.produtoId !== undefined && query.produtoId !== "" && !produtoId) {
    return validationError("Produto invalido.");
  }

  if (produtoId) {
    where.produtoId = produtoId;
  }

  if (tipo) {
    if (!TIPOS_MOVIMENTACAO_ESTOQUE.has(tipo)) {
      return validationError("Tipo de movimentacao invalido.");
    }

    where.tipo = tipo;
  }

  if (dataInicial || dataFinal) {
    const createdAt = {};

    if (dataInicial) {
      const parsed = parseDateFilter(dataInicial);

      if (!parsed) {
        return validationError("Data inicial invalida.");
      }

      createdAt.gte = parsed;
    }

    if (dataFinal) {
      const parsed = parseDateFilter(dataFinal, true);

      if (!parsed) {
        return validationError("Data final invalida.");
      }

      createdAt.lte = parsed;
    }

    where.createdAt = createdAt;
  }

  if (busca) {
    where.produto = {
      OR: [
        {
          nome: {
            contains: busca,
          },
        },
        {
          codigo: {
            contains: busca,
          },
        },
      ],
    };
  }

  return {
    data: where,
  };
}

function movimentacaoResponse(movimentacao) {
  return {
    id: movimentacao.id,
    tipo: movimentacao.tipo,
    quantidade: decimalToString(movimentacao.quantidade),
    quantidadeAnterior: decimalToString(movimentacao.quantidadeAnterior),
    quantidadePosterior: decimalToString(movimentacao.quantidadePosterior),
    motivo: movimentacao.motivo,
    observacao: movimentacao.observacao,
    createdAt: movimentacao.createdAt,
    produto: movimentacao.produto
      ? {
          id: movimentacao.produto.id,
          nome: movimentacao.produto.nome,
          codigo: movimentacao.produto.codigo,
          unidadeMedida: movimentacao.produto.unidadeMedida,
        }
      : null,
  };
}

function categoriaProdutoPayload(body, { partial }) {
  const unknown = unknownFields(body, ["nome", "descricao", "ativo"]);

  if (unknown.length > 0) {
    return validationError(`Campos nao permitidos: ${unknown.join(", ")}.`);
  }

  const data = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, "nome")) {
    const nome = cleanOptionalString(body.nome);

    if (!nome) {
      return validationError("Nome da categoria e obrigatorio.");
    }

    if (nome.length > 80) {
      return validationError("Nome da categoria deve ter no maximo 80 caracteres.");
    }

    data.nome = nome;
  }

  if (Object.prototype.hasOwnProperty.call(body, "descricao")) {
    const descricao = cleanNullableString(body.descricao);

    if (descricao && descricao.length > 240) {
      return validationError("Descricao deve ter no maximo 240 caracteres.");
    }

    data.descricao = descricao;
  }

  if (Object.prototype.hasOwnProperty.call(body, "ativo")) {
    const ativo = parseBooleanValue(body.ativo);

    if (ativo === null) {
      return validationError("Ativo deve ser verdadeiro ou falso.");
    }

    data.ativo = ativo;
  } else if (!partial) {
    data.ativo = true;
  }

  return {
    data,
  };
}

async function produtoPayload(body, { partial, currentId = null }) {
  const forbidden = ["quantidadeAtual", "createdAt", "updatedAt", "movimentacoes"].filter((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );

  if (forbidden.length > 0) {
    return validationError(`Campos nao podem ser alterados por esta rota: ${forbidden.join(", ")}.`);
  }

  const allowed = [
    "nome",
    "codigo",
    "descricao",
    "categoriaId",
    "unidadeMedida",
    "estoqueMinimo",
    "precoCustoCentavos",
    "precoVendaCentavos",
    "ativo",
  ];
  const unknown = unknownFields(body, allowed);

  if (unknown.length > 0) {
    return validationError(`Campos nao permitidos: ${unknown.join(", ")}.`);
  }

  const data = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, "nome")) {
    const nome = cleanOptionalString(body.nome);

    if (!nome) {
      return validationError("Nome do produto e obrigatorio.");
    }

    if (nome.length > 120) {
      return validationError("Nome do produto deve ter no maximo 120 caracteres.");
    }

    data.nome = nome;
  }

  if (Object.prototype.hasOwnProperty.call(body, "codigo")) {
    const codigo = normalizeProductCode(body.codigo);

    if (codigo && codigo.length > 60) {
      return validationError("Codigo do produto deve ter no maximo 60 caracteres.");
    }

    if (codigo) {
      const produtoComCodigo = await prisma.produto.findUnique({
        where: {
          codigo,
        },
        select: {
          id: true,
        },
      });

      if (produtoComCodigo && produtoComCodigo.id !== currentId) {
        return validationError("Ja existe um produto com esse codigo.", 409);
      }
    }

    data.codigo = codigo;
  }

  if (Object.prototype.hasOwnProperty.call(body, "descricao")) {
    const descricao = cleanNullableString(body.descricao);

    if (descricao && descricao.length > 300) {
      return validationError("Descricao do produto deve ter no maximo 300 caracteres.");
    }

    data.descricao = descricao;
  }

  if (Object.prototype.hasOwnProperty.call(body, "categoriaId")) {
    if (body.categoriaId === null || body.categoriaId === "") {
      data.categoriaId = null;
    } else {
      const categoriaId = parsePositiveId(body.categoriaId);

      if (!categoriaId) {
        return validationError("Categoria invalida.");
      }

      const categoria = await prisma.categoriaProduto.findUnique({
        where: {
          id: categoriaId,
        },
        select: {
          id: true,
          ativo: true,
        },
      });

      if (!categoria) {
        return validationError("Categoria de produto nao encontrada.", 404);
      }

      if (!categoria.ativo) {
        return validationError("Categoria inativa nao pode ser vinculada ao produto.", 409);
      }

      data.categoriaId = categoriaId;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "unidadeMedida")) {
    const unidadeMedida = cleanOptionalString(body.unidadeMedida).toUpperCase();

    if (!unidadeMedida) {
      return validationError("Unidade de medida e obrigatoria.");
    }

    if (!UNIDADES_MEDIDA.has(unidadeMedida)) {
      return validationError("Unidade de medida invalida.");
    }

    data.unidadeMedida = unidadeMedida;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "estoqueMinimo")) {
    const estoqueMinimo = parseNonNegativeDecimal(body.estoqueMinimo, partial ? null : "0");

    if (!estoqueMinimo.ok) {
      return validationError("Estoque minimo nao pode ser negativo.");
    }

    if (estoqueMinimo.value !== null) {
      data.estoqueMinimo = estoqueMinimo.value;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "precoCustoCentavos")) {
    const precoCustoCentavos = parseNonNegativeInteger(body.precoCustoCentavos, partial ? null : 0);

    if (precoCustoCentavos === null) {
      return validationError("Preco de custo em centavos nao pode ser negativo.");
    }

    data.precoCustoCentavos = precoCustoCentavos;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "precoVendaCentavos")) {
    const precoVendaCentavos = parseNonNegativeInteger(body.precoVendaCentavos, partial ? null : 0);

    if (precoVendaCentavos === null) {
      return validationError("Preco de venda em centavos nao pode ser negativo.");
    }

    data.precoVendaCentavos = precoVendaCentavos;
  }

  if (Object.prototype.hasOwnProperty.call(body, "ativo")) {
    const ativo = parseBooleanValue(body.ativo);

    if (ativo === null) {
      return validationError("Ativo deve ser verdadeiro ou falso.");
    }

    data.ativo = ativo;
  } else if (!partial) {
    data.ativo = true;
  }

  return {
    data,
  };
}

function produtoListWhere(query) {
  const where = {};
  const busca = cleanOptionalString(query.busca || query.search);
  const ativo = parseBooleanFilter(query, "ativo");
  const unidadeMedida = cleanOptionalString(query.unidadeMedida).toUpperCase();

  if (!ativo.valid) {
    return validationError("Filtro ativo deve ser verdadeiro ou falso.");
  }

  if (busca) {
    where.OR = [
      {
        nome: {
          contains: busca,
        },
      },
      {
        codigo: {
          contains: busca,
        },
      },
    ];
  }

  if (ativo.provided) {
    where.ativo = ativo.value;
  }

  if (Object.prototype.hasOwnProperty.call(query, "categoriaId") && query.categoriaId !== "") {
    const categoriaId = parsePositiveId(query.categoriaId);

    if (!categoriaId) {
      return validationError("Categoria invalida.");
    }

    where.categoriaId = categoriaId;
  }

  if (unidadeMedida) {
    if (!UNIDADES_MEDIDA.has(unidadeMedida)) {
      return validationError("Unidade de medida invalida.");
    }

    where.unidadeMedida = unidadeMedida;
  }

  return {
    data: where,
  };
}

function produtoOrderBy(query) {
  const sortBy = cleanOptionalString(query.sortBy || query.ordenarPor);
  const direction = cleanOptionalString(query.order || query.direcao).toLowerCase();
  const safeDirection = SORT_DIRECTIONS.has(direction) ? direction : "asc";
  const allowedFields = new Set([
    "id",
    "nome",
    "codigo",
    "unidadeMedida",
    "quantidadeAtual",
    "estoqueMinimo",
    "precoCustoCentavos",
    "precoVendaCentavos",
    "ativo",
    "createdAt",
    "updatedAt",
  ]);

  if (sortBy && allowedFields.has(sortBy)) {
    return [
      {
        [sortBy]: safeDirection,
      },
      {
        id: "asc",
      },
    ];
  }

  return [
    {
      ativo: "desc",
    },
    {
      nome: "asc",
    },
    {
      id: "asc",
    },
  ];
}

function produtoResponse(produto) {
  return {
    id: produto.id,
    nome: produto.nome,
    codigo: produto.codigo,
    descricao: produto.descricao,
    categoriaId: produto.categoriaId,
    categoria: produto.categoria || null,
    unidadeMedida: produto.unidadeMedida,
    quantidadeAtual: decimalToString(produto.quantidadeAtual),
    estoqueMinimo: decimalToString(produto.estoqueMinimo),
    precoCustoCentavos: produto.precoCustoCentavos,
    precoVendaCentavos: produto.precoVendaCentavos,
    ativo: produto.ativo,
    createdAt: produto.createdAt,
    updatedAt: produto.updatedAt,
    movimentacoesCount: produto._count?.movimentacoes ?? undefined,
    ultimasMovimentacoes: produto.movimentacoes?.map(movimentacaoResponse) ?? undefined,
  };
}

function paginatedResponse(data, total, page, limit) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

function paginationFromQuery(query) {
  const page = Math.max(1, parseInteger(query.page, 1));
  const limit = Math.min(100, Math.max(1, parseInteger(query.limit, 20)));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function acompanhamentoInclude() {
  return {
    cliente: {
      select: {
        id: true,
        nome: true,
        empresa: true,
        telefone: true,
        email: true,
        status: true,
        valor: true,
      },
    },
  };
}

function acompanhamentoResponse(acompanhamento) {
  const now = new Date();

  return {
    id: acompanhamento.id,
    clienteId: acompanhamento.clienteId,
    cliente: acompanhamento.cliente || null,
    titulo: acompanhamento.titulo,
    descricao: acompanhamento.descricao,
    dataHora: acompanhamento.dataHora,
    prioridade: acompanhamento.prioridade,
    status: acompanhamento.status,
    tipo: acompanhamento.tipo,
    responsavel: acompanhamento.responsavel,
    concluidoEm: acompanhamento.concluidoEm,
    atrasado: acompanhamento.status === "PENDENTE" && acompanhamento.dataHora < now,
    createdAt: acompanhamento.createdAt,
    updatedAt: acompanhamento.updatedAt,
  };
}

async function acompanhamentoPayload(body, { partial }) {
  const allowed = ["clienteId", "titulo", "descricao", "dataHora", "prioridade", "tipo", "responsavel"];
  const unknown = unknownFields(body, allowed);

  if (unknown.length) {
    return validationError(`Campos nao permitidos: ${unknown.join(", ")}.`);
  }

  if (Object.prototype.hasOwnProperty.call(body, "clienteId")) {
    const clienteId = parsePositiveId(body.clienteId);

    if (!clienteId) {
      return validationError("Cliente invalido.");
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });

    if (!cliente) {
      return validationError("Cliente nao encontrado.", 404);
    }
  } else if (!partial) {
    return validationError("Cliente e obrigatorio.");
  }

  if (Object.prototype.hasOwnProperty.call(body, "titulo")) {
    const titulo = cleanOptionalString(body.titulo);

    if (!titulo) {
      return validationError("Titulo e obrigatorio.");
    }

    if (titulo.length > 120) {
      return validationError("Titulo deve ter no maximo 120 caracteres.");
    }
  } else if (!partial) {
    return validationError("Titulo e obrigatorio.");
  }

  if (Object.prototype.hasOwnProperty.call(body, "dataHora")) {
    const dataHora = parseDateFilter(body.dataHora);

    if (!dataHora) {
      return validationError("Data e hora invalidas.");
    }
  } else if (!partial) {
    return validationError("Data e hora sao obrigatorias.");
  }

  if (Object.prototype.hasOwnProperty.call(body, "prioridade")) {
    const prioridade = cleanOptionalString(body.prioridade).toUpperCase();

    if (!PRIORIDADES_ACOMPANHAMENTO.has(prioridade)) {
      return validationError("Prioridade invalida.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "tipo")) {
    const tipo = cleanOptionalString(body.tipo).toUpperCase();

    if (!TIPOS_ACOMPANHAMENTO.has(tipo)) {
      return validationError("Tipo de acompanhamento invalido.");
    }
  }

  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, "clienteId")) data.clienteId = parsePositiveId(body.clienteId);
  if (Object.prototype.hasOwnProperty.call(body, "titulo")) data.titulo = cleanOptionalString(body.titulo);
  if (Object.prototype.hasOwnProperty.call(body, "descricao")) data.descricao = cleanNullableString(body.descricao);
  if (Object.prototype.hasOwnProperty.call(body, "dataHora")) data.dataHora = parseDateFilter(body.dataHora);
  if (Object.prototype.hasOwnProperty.call(body, "prioridade")) data.prioridade = cleanOptionalString(body.prioridade).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(body, "tipo")) data.tipo = cleanOptionalString(body.tipo).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(body, "responsavel")) data.responsavel = cleanNullableString(body.responsavel);

  if (!partial) {
    data.status = "PENDENTE";
  }

  return { data };
}

function acompanhamentoListWhere(query) {
  const where = {};
  const clienteId = query.clienteId === undefined || query.clienteId === "" ? null : parsePositiveId(query.clienteId);
  const status = cleanOptionalString(query.status).toUpperCase();
  const prioridade = cleanOptionalString(query.prioridade).toUpperCase();
  const tipo = cleanOptionalString(query.tipo).toUpperCase();
  const busca = cleanOptionalString(query.busca || query.search);
  const dataInicial = cleanOptionalString(query.dataInicial || query.de);
  const dataFinal = cleanOptionalString(query.dataFinal || query.ate);
  const atrasados = parseBooleanFilter(query, "atrasados");
  const hoje = parseBooleanFilter(query, "hoje");

  if (query.clienteId !== undefined && query.clienteId !== "" && !clienteId) {
    return validationError("Cliente invalido.");
  }

  if (clienteId) where.clienteId = clienteId;

  if (status) {
    if (!STATUS_ACOMPANHAMENTO.has(status)) return validationError("Status invalido.");
    where.status = status;
  }

  if (prioridade) {
    if (!PRIORIDADES_ACOMPANHAMENTO.has(prioridade)) return validationError("Prioridade invalida.");
    where.prioridade = prioridade;
  }

  if (tipo) {
    if (!TIPOS_ACOMPANHAMENTO.has(tipo)) return validationError("Tipo de acompanhamento invalido.");
    where.tipo = tipo;
  }

  if (!atrasados.valid || !hoje.valid) {
    return validationError("Filtro booleano invalido.");
  }

  const dateFilter = {};

  if (dataInicial) {
    const parsed = parseDateFilter(dataInicial);
    if (!parsed) return validationError("Data inicial invalida.");
    dateFilter.gte = parsed;
  }

  if (dataFinal) {
    const parsed = parseDateFilter(dataFinal, true);
    if (!parsed) return validationError("Data final invalida.");
    dateFilter.lte = parsed;
  }

  if (hoje.provided && hoje.value) {
    const { start, end } = todayRange();
    dateFilter.gte = start;
    dateFilter.lte = end;
  }

  if (atrasados.provided && atrasados.value) {
    where.status = "PENDENTE";
    dateFilter.lt = new Date();
  }

  if (Object.keys(dateFilter).length) {
    where.dataHora = dateFilter;
  }

  if (busca) {
    where.OR = [
      { titulo: { contains: busca } },
      {
        cliente: {
          nome: {
            contains: busca,
          },
        },
      },
      {
        cliente: {
          empresa: {
            contains: busca,
          },
        },
      },
    ];
  }

  return { data: where };
}

async function updateAcompanhamentoStatus(req, res, status) {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "Acompanhamento invalido.",
      });
    }

    const acompanhamentoAtual = await prisma.acompanhamento.findUnique({ where: { id } });

    if (!acompanhamentoAtual) {
      return res.status(404).json({
        erro: "Acompanhamento nao encontrado.",
      });
    }

    if (status === "CONCLUIDO" && acompanhamentoAtual.status === "CONCLUIDO") {
      return res.status(409).json({
        erro: "Acompanhamento ja concluido.",
      });
    }

    const data = {
      status,
      concluidoEm: status === "CONCLUIDO" ? new Date() : null,
    };

    const acompanhamento = await prisma.acompanhamento.update({
      where: { id },
      data,
      include: acompanhamentoInclude(),
    });

    return res.json(acompanhamentoResponse(acompanhamento));
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      erro: "Erro ao atualizar status do acompanhamento.",
    });
  }
}

function todayRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  return { start, end };
}

async function findCategoriaByNome(nome, ignoreId = null) {
  const nomeNormalizado = normalizeLookupText(nome);
  const categorias = await prisma.categoriaProduto.findMany({
    select: {
      id: true,
      nome: true,
    },
  });

  return (
    categorias.find(
      (categoria) =>
        categoria.id !== ignoreId && normalizeLookupText(categoria.nome) === nomeNormalizado,
    ) || null
  );
}

function categoriaProdutoResponse(categoria) {
  return {
    id: categoria.id,
    nome: categoria.nome,
    descricao: categoria.descricao,
    ativo: categoria.ativo,
    produtosCount: categoria._count?.produtos ?? 0,
    createdAt: categoria.createdAt,
    updatedAt: categoria.updatedAt,
  };
}

function normalizeProductCode(value) {
  const codigo = cleanNullableString(value);
  return codigo ? codigo.toUpperCase() : null;
}

function cleanOptionalString(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeLookupText(value) {
  return cleanOptionalString(value).toLowerCase();
}

function cleanNullableString(value) {
  const cleaned = cleanOptionalString(value);
  return cleaned || null;
}

function parseBooleanFilter(source, field) {
  if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === "") {
    return {
      provided: false,
      valid: true,
      value: null,
    };
  }

  const value = parseBooleanValue(source[field]);

  return {
    provided: true,
    valid: value !== null,
    value,
  };
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "sim", "ativo"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "nao", "inativo"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function parseInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseNonNegativeDecimal(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: true,
      value: fallback,
    };
  }

  const normalized = String(value).trim().replace(",", ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return {
      ok: false,
      value: null,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

function parsePositiveDecimal(value) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: false,
      value: null,
    };
  }

  const normalized = String(value).trim().replace(",", ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return {
      ok: false,
      value: null,
    };
  }

  const decimal = toDecimal(normalized);

  if (decimal.lessThanOrEqualTo(0)) {
    return {
      ok: false,
      value: null,
    };
  }

  return {
    ok: true,
    value: decimal,
  };
}

function toDecimal(value) {
  return new Prisma.Decimal(decimalToString(value));
}

function decimalLessThanOrEqual(left, right) {
  return toDecimal(left).lessThanOrEqualTo(toDecimal(right));
}

function produtoTemEstoqueBaixo(produto) {
  const quantidadeAtual = toDecimal(produto.quantidadeAtual);
  return quantidadeAtual.greaterThan(0) && quantidadeAtual.lessThanOrEqualTo(toDecimal(produto.estoqueMinimo));
}

function calcularTotaisEstoque(produtos) {
  return produtos.reduce(
    (totais, produto) => {
      const quantidadeAtual = toDecimal(produto.quantidadeAtual);

      return {
        custo: totais.custo.plus(quantidadeAtual.times(produto.precoCustoCentavos || 0)),
        venda: totais.venda.plus(quantidadeAtual.times(produto.precoVendaCentavos || 0)),
      };
    },
    {
      custo: new Prisma.Decimal(0),
      venda: new Prisma.Decimal(0),
    },
  );
}

function decimalToString(value) {
  return value === null || value === undefined ? "0" : value.toString();
}

function parseDateFilter(value, endOfDay = false) {
  const text = String(value || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function unknownFields(body, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(body || {}).filter((field) => !allowedSet.has(field));
}

function validationError(error, status = 400) {
  return {
    error,
    status,
  };
}

function clientePayload(body) {
  const tags = Array.isArray(body.tags)
    ? body.tags
    : typeof body.tags === "string"
      ? safeParseTags(body.tags)
      : [];

  return {
    nome: String(body.nome || "").trim(),
    telefone: String(body.telefone || "").trim(),
    email: String(body.email || "").trim(),
    empresa: String(body.empresa || "").trim(),
    interesse: String(body.interesse || "").trim(),
    status: String(body.status || "Lead").trim(),
    valor: Number.isFinite(Number(body.valor)) ? Number(body.valor) : 0,
    origem: String(body.origem || "Manual").trim(),
    favorito: Boolean(body.favorito),
    quente: Boolean(body.quente),
    ultimoContato: Number.isFinite(Number(body.ultimoContato)) ? Number(body.ultimoContato) : 0,
    proximoFollowUp: String(body.proximoFollowUp || "Hoje").trim(),
    tags: JSON.stringify(tags),
  };
}

function safeParseTags(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "crm-agro-demo-api",
  });
});

app.use((error, req, res, next) => {
  if (error.message === "Origem nao permitida pelo CORS.") {
    return res.status(403).json({
      erro: "Origem nao permitida.",
    });
  }

  console.log(error);

  return res.status(500).json({
    erro: "Erro interno do servidor",
  });
});

function startServer(port = PORT) {
  return app.listen(port, HOST, () => {
    console.log(`Servidor rodando em ${HOST}:${port}`);
  });
}

if (require.main === module) {
  Promise.resolve(assertIntegrationEncryptionReady({ prisma }))
    .then(() => {
      startServer();
    })
    .catch((error) => {
      console.error(error.message || "Falha ao validar criptografia de integracoes.");
      process.exit(1);
    });
}

function getAllowedOrigins() {
  const configuredOrigins = [process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}

module.exports = { app, prisma, startServer };
