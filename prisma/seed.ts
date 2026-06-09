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

async function main() {
  const senha = await bcrypt.hash(DEMO_PASSWORD, 10);

  const empresa = await prisma.empresa.upsert({
    where: {
      email: 'demo@crm.com',
    },
    update: {
      nome: 'CRM Agro Demo',
    },
    create: {
      nome: 'CRM Agro Demo',
      email: 'demo@crm.com',
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

  const clientes = [
    {
      nome: 'Mariana Costa',
      email: 'mariana@alphaagro.com',
      telefone: '5535999990001',
      cidade: 'Varginha',
      estado: 'MG',
      fazenda: 'Alpha Agro',
      observacoes: 'Cliente em proposta, alto potencial de fechamento.',
    },
    {
      nome: 'Daniel Martins',
      email: 'daniel@martinsagro.com',
      telefone: '5535944440006',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      fazenda: 'Martins Agro',
      observacoes: 'Precisa receber comparativo de planos.',
    },
    {
      nome: 'Bianca Rocha',
      email: 'bianca@rochaagro.com',
      telefone: '5535977770003',
      cidade: 'Uberaba',
      estado: 'MG',
      fazenda: 'Rocha Grãos',
      observacoes: 'Novo lead vindo do site.',
    },
    {
      nome: 'Rafael Lima',
      email: 'rafael@limaagro.com',
      telefone: '5535988880002',
      cidade: 'Campinas',
      estado: 'SP',
      fazenda: 'Lima Insumos',
      observacoes: 'Aguardando retomada comercial.',
    },
    {
      nome: 'Felipe Andrade',
      email: 'felipe@andradeagro.com',
      telefone: '5535966660004',
      cidade: 'Franca',
      estado: 'SP',
      fazenda: 'Andrade Café',
      observacoes: 'Cliente ativo com histórico recente.',
    },
  ];

  for (const cliente of clientes) {
    const existing = await prisma.cliente.findFirst({
      where: {
        email: cliente.email,
        empresaId: empresa.id,
      },
    });

    if (existing) {
      await prisma.cliente.update({
        where: {
          id: existing.id,
        },
        data: cliente,
      });
      continue;
    }

    await prisma.cliente.create({
      data: {
        ...cliente,
        empresaId: empresa.id,
      },
    });
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
