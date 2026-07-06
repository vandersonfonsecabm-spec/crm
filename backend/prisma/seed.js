const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const clientes = [
  {
    nome: "Mariana Costa",
    telefone: "5535999990001",
    email: "mariana@alphaagro.com",
    empresa: "Alpha Agro",
    interesse: "Alpha Agro - proposta em fechamento",
    status: "Proposta",
    valor: 26230,
    origem: "Instagram",
    favorito: true,
    quente: true,
    ultimoContato: 1,
    proximoFollowUp: "Hoje",
    tags: JSON.stringify(["Quente", "Alto valor"]),
    notas: ["Cliente pediu condicao especial para fechar esta semana."],
  },
  {
    nome: "Daniel Martins",
    telefone: "5535944440006",
    email: "daniel@martinsagro.com",
    empresa: "Martins Agro",
    interesse: "Martins Agro - comparativo de planos",
    status: "Proposta",
    valor: 27090,
    origem: "WhatsApp",
    favorito: true,
    quente: true,
    ultimoContato: 2,
    proximoFollowUp: "Hoje",
    tags: JSON.stringify(["Quente", "Urgente"]),
    notas: ["Enviar comparativo de planos antes do proximo contato."],
  },
  {
    nome: "Bianca Rocha",
    telefone: "5535977770003",
    email: "bianca@rochagraos.com",
    empresa: "Rocha Graos",
    interesse: "Rocha Graos - novo lead do site",
    status: "Novo",
    valor: 24080,
    origem: "Site",
    favorito: true,
    quente: true,
    ultimoContato: 0,
    proximoFollowUp: "Hoje",
    tags: JSON.stringify(["Novo", "Quente"]),
    notas: ["Lead novo vindo do site. Priorizar qualificacao inicial."],
  },
  {
    nome: "Rafael Lima",
    telefone: "5535988880002",
    email: "rafael@limainsumos.com",
    empresa: "Lima Insumos",
    interesse: "Lima Insumos - follow-up comercial",
    status: "Contato",
    valor: 24940,
    origem: "Indicacao",
    favorito: false,
    quente: true,
    ultimoContato: 4,
    proximoFollowUp: "Hoje",
    tags: JSON.stringify(["Follow-up"]),
    notas: ["Enviar follow-up com resumo da proposta inicial."],
  },
  {
    nome: "Felipe Andrade",
    telefone: "5535966660004",
    email: "felipe@andradecafe.com",
    empresa: "Andrade Cafe",
    interesse: "Andrade Cafe - cliente ativo",
    status: "Fechado",
    valor: 23650,
    origem: "Google",
    favorito: false,
    quente: true,
    ultimoContato: 0,
    proximoFollowUp: "Hoje",
    tags: JSON.stringify(["Ganho"]),
    notas: ["Contrato fechado e enviado para assinatura."],
  },
];

async function main() {
  const totalClientes = await prisma.cliente.count();

  if (totalClientes > 0) {
    console.log("Seed ignorado: banco ja possui clientes.");
    return;
  }

  const empresa = await prisma.empresa.upsert({
    where: { slug: "crm-agro-demo" },
    create: {
      nome: "CRM Agro Demo",
      slug: "crm-agro-demo",
    },
    update: {},
  });

  for (const cliente of clientes) {
    const { notas, ...dadosCliente } = cliente;

    const criado = await prisma.cliente.create({
      data: { ...dadosCliente, empresaId: empresa.id },
    });
    await createNotas(empresa.id, criado.id, notas);
  }

  console.log("Demo SQLite pronto.");
}

async function createNotas(empresaId, clienteId, notas) {
  for (const texto of notas) {
    await prisma.nota.create({
      data: {
        empresaId,
        clienteId,
        texto,
        tipo: "nota",
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
