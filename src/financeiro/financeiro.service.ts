import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateContaReceberDto } from './dto/create-conta-receber.dto'

@Injectable()
export class FinanceiroService {
  constructor(private prisma: PrismaService) {}

  async criarContaReceber(dto: CreateContaReceberDto) {
    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findUnique({
        where: {
          id: dto.clienteId,
        },
      })

      if (!cliente) {
        throw new NotFoundException('Cliente não encontrado')
      }
    }

    if (dto.pedidoId) {
      const pedido = await this.prisma.pedido.findUnique({
        where: {
          id: dto.pedidoId,
        },
      })

      if (!pedido) {
        throw new NotFoundException('Pedido não encontrado')
      }
    }

    return this.prisma.contaReceber.create({
      data: {
        descricao: dto.descricao,
        valor: dto.valor,
        vencimento: new Date(dto.vencimento),
        clienteId: dto.clienteId,
        pedidoId: dto.pedidoId,
        empresaId: 'cmp49j5mv00006kvne5407nrb',
      },
    })
  }

  async listarContasReceber() {
    return this.prisma.contaReceber.findMany({
      include: {
        cliente: true,
        pedido: true,
      },
      orderBy: {
        vencimento: 'asc',
      },
    })
  }
}