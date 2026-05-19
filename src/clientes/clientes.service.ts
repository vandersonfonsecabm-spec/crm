import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(empresaId: string) {
    return this.prisma.cliente.findMany({
      where: {
        empresaId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, empresaId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return cliente;
  }

  async create(data: CreateClienteDto, empresaId: string) {
    return this.prisma.cliente.create({
      data: {
        ...data,
        empresaId,
      },
    });
  }

  async update(id: string, data: UpdateClienteDto, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data,
    });
  }

  async remove(id: string, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.cliente.delete({
      where: {
        id,
      },
    });
  }
}