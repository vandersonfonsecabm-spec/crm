import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async resumo(empresaId: string) {
    const [
      totalClientes,
      totalProdutos,
      totalPedidos,
      contasPendentes,
      faturamento,
      estoqueBaixo,
      pedidosRecentes,
      contasVencidas,
      produtosMaisVendidos,
    ] = await Promise.all([
      this.prisma.cliente.count({
        where: { empresaId },
      }),

      this.prisma.produto.count({
        where: { empresaId },
      }),

      this.prisma.pedido.count({
        where: { empresaId },
      }),

      this.prisma.contaReceber.aggregate({
        where: {
          empresaId,
          status: 'PENDENTE',
        },
        _sum: { valor: true },
      }),

      this.prisma.pedido.aggregate({
        where: { empresaId },
        _sum: { total: true },
      }),

      this.prisma.produto.findMany({
        where: {
          empresaId,
          estoque: {
            lte: 5,
          },
        },
        orderBy: {
          estoque: 'asc',
        },
        take: 10,
      }),

      this.prisma.pedido.findMany({
        where: { empresaId },
        include: {
          cliente: true,
          contaReceber: true,
          itens: {
            include: {
              produto: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      }),

      this.prisma.contaReceber.findMany({
        where: {
          empresaId,
          status: 'PENDENTE',
          vencimento: {
            lt: new Date(),
          },
        },
        include: {
          cliente: true,
          pedido: true,
        },
        orderBy: {
          vencimento: 'asc',
        },
      }),

      this.prisma.itemPedido.groupBy({
        by: ['produtoId'],
        _sum: {
          quantidade: true,
          subtotal: true,
        },
        orderBy: {
          _sum: {
            quantidade: 'desc',
          },
        },
        take: 10,
      }),
    ])

    const produtosDetalhados = await Promise.all(
      produtosMaisVendidos.map(async (item) => {
        const produto = await this.prisma.produto.findUnique({
          where: {
            id: item.produtoId,
          },
        })

        return {
          produtoId: item.produtoId,
          nome: produto?.nome || 'Produto não encontrado',
          quantidadeVendida: item._sum.quantidade || 0,
          totalVendido: item._sum.subtotal || 0,
        }
      }),
    )

    return {
      indicadores: {
        clientes: totalClientes,
        produtos: totalProdutos,
        pedidos: totalPedidos,
        contasPendentes: contasPendentes._sum.valor || 0,
        faturamento: faturamento._sum.total || 0,
      },

      estoqueBaixo,

      pedidosRecentes,

      contasVencidas,

      produtosMaisVendidos: produtosDetalhados,
    }
  }
}