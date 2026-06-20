require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

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

app.post("/auth/login", (req, res) => {
  const { email, senha } = req.body || {};

  if (email !== DEMO_EMAIL || senha !== DEMO_PASSWORD) {
    return res.status(401).json({
      message: "Email ou senha invalidos.",
      statusCode: 401,
    });
  }

  return res.json({
    access_token: DEMO_TOKEN,
    user: {
      id: 1,
      nome: "Marco Admin",
      email: DEMO_EMAIL,
      role: "ADMIN",
    },
    empresa: {
      id: 1,
      nome: "CRM Agro Demo",
    },
  });
});

app.post("/auth/demo", (req, res) => {
  return res.json({
    access_token: DEMO_TOKEN,
    user: {
      id: 1,
      nome: "Marco Admin",
      email: DEMO_EMAIL,
      role: "ADMIN",
    },
    empresa: {
      id: 1,
      nome: "CRM Agro Demo",
    },
  });
});

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

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const expectedToken = `Bearer ${DEMO_TOKEN}`;

  if (authorization !== expectedToken) {
    return res.status(401).json({
      erro: "Nao autorizado.",
    });
  }

  return next();
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

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em ${HOST}:${PORT}`);
});

function getAllowedOrigins() {
  const configuredOrigins = [process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}
