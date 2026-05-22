const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const app = express();

app.use(express.json());
app.use(cors());

app.get("/clientes", async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
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
    const { nome, telefone, interesse, status } = req.body;

    const cliente = await prisma.cliente.create({
      data: {
        nome,
        telefone: telefone || "",
        interesse: interesse || "",
        status: status || "Lead",
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
  try {
    const { id } = req.params;

    const { nome, telefone, interesse, status } = req.body;

    const clienteAtualizado = await prisma.cliente.update({
      where: {
        id: Number(id),
      },
      data: {
        nome,
        telefone: telefone || "",
        interesse: interesse || "",
        status: status || "Lead",
      },
    });

    res.json(clienteAtualizado);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      erro: "Erro ao atualizar cliente",
    });
  }
});

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

app.listen(3001, () => {
  console.log("Servidor rodando na porta 3001");
});