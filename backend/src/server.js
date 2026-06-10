const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const app = express();

app.use(express.json());
app.use(cors());

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

app.listen(3001, () => {
  console.log("Servidor rodando na porta 3001");
});
