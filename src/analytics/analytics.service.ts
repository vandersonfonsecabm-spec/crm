import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async resumo(empresaId: string) {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        empresaId,
      },
      include: {
        cliente: true,
        itens: {
          include: {
            produto: true,
          },
        },
      },
    });

    const faturamentoTotal = pedidos.reduce(
      (acc, pedido) => acc + Number(pedido.total),
      0,
    );

    const ticketMedio =
      pedidos.length > 0
        ? faturamentoTotal / pedidos.length
        : 0;

    const clientesMap = new Map();
    const produtosMap = new Map();

    for (const pedido of pedidos) {
      const clienteNome =
        pedido.cliente?.nome || 'Sem cliente';

      if (!clientesMap.has(clienteNome)) {
        clientesMap.set(clienteNome, 0);
      }

      clientesMap.set(
        clienteNome,
        clientesMap.get(clienteNome) + Number(pedido.total),
      );

      for (const item of pedido.itens) {
        const produtoNome =
          item.produto?.nome || 'Produto';

        if (!produtosMap.has(produtoNome)) {
          produtosMap.set(produtoNome, 0);
        }

        produtosMap.set(
          produtoNome,
          produtosMap.get(produtoNome) + item.quantidade,
        );
      }
    }

    const rankingClientes = Array.from(
      clientesMap.entries(),
    )
      .map(([cliente, total]) => ({
        cliente,
        total,
      }))
      .sort((a, b) => b.total - a.total);

    const rankingProdutos = Array.from(
      produtosMap.entries(),
    )
      .map(([produto, quantidade]) => ({
        produto,
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const faturamentoMensalMap = new Map();

    for (const pedido of pedidos) {
      const data = new Date(pedido.createdAt);

      const chave = `${data.getMonth() + 1}/${data.getFullYear()}`;

      if (!faturamentoMensalMap.has(chave)) {
        faturamentoMensalMap.set(chave, 0);
      }

      faturamentoMensalMap.set(
        chave,
        faturamentoMensalMap.get(chave) +
          Number(pedido.total),
      );
    }

    const faturamentoMensal = Array.from(
      faturamentoMensalMap.entries(),
    ).map(([mes, total]) => ({
      mes,
      total,
    }));

    return {
      resumo: {
        faturamentoTotal,
        quantidadePedidos: pedidos.length,
        ticketMedio,
      },

      rankingClientes,

      rankingProdutos,

      faturamentoMensal,
    };
  }
}