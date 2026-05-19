import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  TipoMovimentacaoEstoque,
} from '@prisma/client';

@Injectable()
export class EstoqueService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async movimentar(data: {
    produtoId: string;
    tipo: TipoMovimentacaoEstoque;
    quantidade: number;
    observacao?: string;
    empresaId: string;
  }) {
    console.log(
      'DADOS RECEBIDOS:',
      data,
    );

    const produto =
      await this.prisma.produto.findFirst({
        where: {
          id: data.produtoId,
          empresaId: data.empresaId,
        },
      });

    console.log(
      'PRODUTO ENCONTRADO:',
      produto,
    );

    if (!produto) {
      throw new NotFoundException(
        'Produto não encontrado',
      );
    }

    let novoEstoque = produto.estoque;

    if (data.tipo === 'ENTRADA') {
      novoEstoque += data.quantidade;
    }

    if (data.tipo === 'SAIDA') {
      if (
        produto.estoque < data.quantidade
      ) {
        throw new BadRequestException(
          'Estoque insuficiente',
        );
      }

      novoEstoque -= data.quantidade;
    }

    if (data.tipo === 'AJUSTE') {
      novoEstoque = data.quantidade;
    }

    await this.prisma.produto.update({
      where: {
        id: produto.id,
      },
      data: {
        estoque: novoEstoque,
      },
    });

    const movimentacao =
      await this.prisma.movimentacaoEstoque.create(
        {
          data: {
            produtoId: produto.id,
            tipo: data.tipo,
            quantidade: data.quantidade,
            observacao:
              data.observacao,
            empresaId: data.empresaId,
          },
        },
      );

    return {
      message:
        'Movimentação realizada com sucesso',

      estoqueAnterior:
        produto.estoque,

      estoqueAtual: novoEstoque,

      movimentacao,
    };
  }

  async historico(
    empresaId: string,
  ) {
    return this.prisma.movimentacaoEstoque.findMany(
      {
        where: {
          empresaId,
        },

        include: {
          produto: true,
        },

        orderBy: {
          createdAt: 'desc',
        },
      },
    );
  }
}