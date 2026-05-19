import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { TipoMovimentacaoEstoque } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreatePedidoDto } from './dto/create-pedido.dto';

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(empresaId: string, usuarioId: string | null, dto: CreatePedidoDto) {
    if (!dto.clienteId) {
      throw new BadRequestException('Cliente é obrigatório');
    }

    if (!dto.itens || dto.itens.length === 0) {
      throw new BadRequestException('Pedido precisa ter pelo menos um item');
    }

    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id: dto.clienteId,
        empresaId,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      let total = 0;

      const itensCalculados: {
        produtoId: string;
        quantidade: number;
        preco: number;
        subtotal: number;
        estoqueAtual: number;
      }[] = [];

      for (const item of dto.itens) {
        const produto = await tx.produto.findFirst({
          where: {
            id: item.produtoId,
            empresaId,
            ativo: true,
          },
        });

        if (!produto) {
          throw new NotFoundException(`Produto não encontrado: ${item.produtoId}`);
        }

        if (item.quantidade <= 0) {
          throw new BadRequestException('Quantidade deve ser maior que zero');
        }

        if (produto.estoque < item.quantidade) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${produto.nome}`,
          );
        }

        const preco = item.preco ?? produto.precoVenda ?? 0;
        const subtotal = preco * item.quantidade;

        total += subtotal;

        itensCalculados.push({
          produtoId: produto.id,
          quantidade: item.quantidade,
          preco,
          subtotal,
          estoqueAtual: produto.estoque,
        });
      }

      const pedido = await tx.pedido.create({
        data: {
          clienteId: dto.clienteId,
          empresaId,
          total,
          itens: {
            create: itensCalculados.map((item) => ({
              produtoId: item.produtoId,
              quantidade: item.quantidade,
              preco: item.preco,
              subtotal: item.subtotal,
            })),
          },
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

      for (const item of itensCalculados) {
        await tx.produto.update({
          where: {
            id: item.produtoId,
          },
          data: {
            estoque: item.estoqueAtual - item.quantidade,
          },
        });

        await tx.movimentacaoEstoque.create({
          data: {
            tipo: TipoMovimentacaoEstoque.SAIDA,
            quantidade: item.quantidade,
            observacao: `Baixa automática do pedido ${pedido.numero}`,
            produtoId: item.produtoId,
            empresaId,
            usuarioId,
          },
        });
      }

      const vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + 30);

      const contaReceber = await tx.contaReceber.create({
        data: {
          descricao: `Conta a receber do pedido ${pedido.numero}`,
          valor: total,
          vencimento,
          clienteId: dto.clienteId,
          pedidoId: pedido.id,
          empresaId,
        },
      });

      return {
        message: 'Pedido criado com sucesso',
        pedido,
        contaReceber,
      };
    });
  }

  async listar(empresaId: string) {
    return this.prisma.pedido.findMany({
      where: {
        empresaId,
      },
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
    });
  }
}