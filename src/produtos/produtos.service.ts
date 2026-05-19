import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProdutoDto } from './dto/create-produto.dto';

@Injectable()
export class ProdutosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateProdutoDto, empresaId: string) {
    return this.prisma.produto.create({
      data: {
        ...data,
        empresaId,
      },
    });
  }

  async findAll(empresaId: string) {
    return this.prisma.produto.findMany({
      where: { empresaId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, empresaId: string) {
    const produto = await this.prisma.produto.findFirst({
      where: { id, empresaId },
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado');
    }

    return produto;
  }

  async update(id: string, data: Partial<CreateProdutoDto>, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.produto.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.produto.delete({
      where: { id },
    });
  }
}