import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL não encontrada.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
} as any);

const DEMO_EMAIL = 'demo@crm.com';
const DEMO_PASSWORD = '123456';

const clientes = [
  {
    nome: 'Mariana Costa',
    email: 'mariana@alphaagro.com',
    telefone: '5535999990001',
    cidade: 'Varginha',
    estado: 'MG',
    fazenda: 'Alpha Agro',
    observacoes: 'Cliente pediu condição especial para fechar esta semana.',
    status: 'Proposta',
    valor: 26230,
    origem: 'Instagram',
    favorito: true,
    quente: true,
    ultimoContato: 1,
    proximoFollowUp: 'Hoje',
    tags: ['Quente', 'Alto valor'],
  },
  {
    nome: 'Daniel Martins',
    email: 'daniel@martinsagro.com',
    telefone: '5535944440006',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    fazenda: 'Martins Agro',
    observacoes: 'Enviar comparativo de planos antes do próximo contato.',
    status: 'Proposta',
    valor: 27090,
    origem: 'WhatsApp',
    favorito: true,
    quente: true,
    ultimoContato: 2,
    proximoFollowUp: 'Hoje',
    tags: ['Quente', 'Urgente'],
  },
  {
    nome: 'Bianca Rocha',
    email: 'bianca@rochaagro.com',
    telefone: '5535977770003',
    cidade: 'Uberaba',
    estado: 'MG',
    fazenda: 'Rocha Grãos',
    observacoes: 'Lead novo vindo do site. Priorizar qualificação inicial.',
    status: 'Novo',
    valor: 24080,
    origem: 'Site',
    favorito: true,
    quente: true,
    ultimoContato: 0,
    proximoFollowUp: 'Hoje',
    tags: ['Novo', 'Quente'],
  },
  {
    nome: 'Rafael Lima',
    email: 'rafael@limaagro.com',
    telefone: '5535988880002',
    cidade: 'Campinas',
    estado: 'SP',
    fazenda: 'Lima Insumos',
    observacoes: 'Enviar follow-up com resumo da proposta inicial.',
    status: 'Contato',
    valor: 24940,
    origem: 'Indicação',
    favorito: false,
    quente: true,
    ultimoContato: 4,
    proximoFollowUp: 'Hoje',
    tags: ['Follow-up'],
  },
  {
    nome: 'Felipe Andrade',
    email: 'felipe@andradeagro.com',
    telefone: '5535966660004',
    cidade: 'Franca',
    estado: 'SP',
    fazenda: 'Andrade Café',
    observacoes: 'Contrato fechado e enviado para assinatura.',
    status: 'Fechado',
    valor: 23650,
    origem: 'Google',
    favorito: false,
    quente: true,
    ultimoContato: 0,
    proximoFollowUp: 'Hoje',
    tags: ['Ganho'],
  },
];

async function main() {
  const senha = await bcrypt.hash(DEMO_PASSWORD, 10);

  const empresa = await prisma.empresa.upsert({
    where: {
      email: DEMO_EMAIL,
    },
    update: {
      nome: 'CRM Agro Demo',
    },
    create: {
      nome: 'CRM Agro Demo',
      email: DEMO_EMAIL,
    },
  });

  await prisma.user.upsert({
    where: {
      email: DEMO_EMAIL,
    },
    update: {
      nome: 'Marco Admin',
      senha,
      role: 'ADMIN',
      empresaId: empresa.id,
    },
    create: {
      nome: 'Marco Admin',
      email: DEMO_EMAIL,
      senha,
      role: 'ADMIN',
      empresaId: empresa.id,
    },
  });

  for (const cliente of clientes) {
    const existing = await prisma.cliente.findFirst({
      where: {
        email: cliente.email,
        empresaId: empresa.id,
      },
    });

    const savedClient = existing
      ? await prisma.cliente.update({
          where: {
            id: existing.id,
          },
          data: cliente,
        })
      : await prisma.cliente.create({
          data: {
            ...cliente,
            empresaId: empresa.id,
          },
        });

    const existingNote = await prisma.clienteNota.findFirst({
      where: {
        clienteId: savedClient.id,
        texto: cliente.observacoes,
      },
    });

    if (!existingNote) {
      await prisma.clienteNota.create({
        data: {
          clienteId: savedClient.id,
          empresaId: empresa.id,
          texto: cliente.observacoes,
          tipo: 'nota',
        },
      });
    }
  }

  console.log(`Demo pronto: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
