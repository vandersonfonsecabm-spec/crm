import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async financeiro(empresaId: string) {
    const hoje = new Date();

    const [
      faturamento,
      contasPagas,
      contasVencidas,
      contasAReceber,
      pedidosPorStatus,
      fluxoCaixa,
    ] = await Promise.all([
      this.prisma.pedido.aggregate({
        where: {
          empresaId,
        },
        _sum: {
          total: true,
        },
      }),

      this.prisma.contaReceber.aggregate({
        where: {
          empresaId,
          status: 'PAGO',
        },
        _sum: {
          valor: true,
        },
      }),

      this.prisma.contaReceber.aggregate({
        where: {
          empresaId,
          status: {
            not: 'PAGO',
          },
          vencimento: {
            lt: hoje,
          },
        },
        _sum: {
          valor: true,
        },
      }),

      this.prisma.contaReceber.aggregate({
        where: {
          empresaId,
          status: {
            not: 'PAGO',
          },
        },
        _sum: {
          valor: true,
        },
      }),

      this.prisma.pedido.groupBy({
        by: ['status'],
        where: {
          empresaId,
        },
        _count: {
          id: true,
        },
        _sum: {
          total: true,
        },
      }),

      this.prisma.contaReceber.findMany({
        where: {
          empresaId,
        },
        select: {
          id: true,
          descricao: true,
          valor: true,
          status: true,
          vencimento: true,
          createdAt: true,
        },
        orderBy: {
          vencimento: 'asc',
        },
      }),
    ]);

    return {
      resumo: {
        faturamento: faturamento._sum.total ?? 0,
        contasPagas: contasPagas._sum.valor ?? 0,
        contasVencidas: contasVencidas._sum.valor ?? 0,
        contasAReceber: contasAReceber._sum.valor ?? 0,
        fluxoCaixaPrevisto: contasAReceber._sum.valor ?? 0,
      },

      pedidosPorStatus: pedidosPorStatus.map((pedido) => ({
        status: pedido.status,
        quantidade: pedido._count.id,
        total: pedido._sum.total ?? 0,
      })),

      fluxoCaixa,
    };
  }
}