import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateClienteNotaDto } from './dto/create-cliente-nota.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(empresaId: string) {
    const clientes = await this.prisma.cliente.findMany({
      where: {
        empresaId,
      },
      include: {
        notas: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return clientes.map((cliente) => this.presentCliente(cliente));
  }

  async findOne(id: string, empresaId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
      },
      include: {
        notas: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return this.presentCliente(cliente);
  }

  async create(data: CreateClienteDto, empresaId: string) {
    const cliente = await this.prisma.cliente.create({
      data: {
        ...this.normalizeClienteData(data),
        empresaId,
      } as Prisma.ClienteUncheckedCreateInput,
      include: {
        notas: true,
      },
    });

    return this.presentCliente(cliente);
  }

  async update(id: string, data: UpdateClienteDto, empresaId: string) {
    await this.findOne(id, empresaId);

    const cliente = await this.prisma.cliente.update({
      where: {
        id,
      },
      data: this.normalizeClienteData(data),
      include: {
        notas: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return this.presentCliente(cliente);
  }

  async remove(id: string, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.cliente.delete({
      where: {
        id,
      },
    });
  }

  async findNotas(id: string, empresaId: string) {
    await this.findOne(id, empresaId);

    return this.prisma.clienteNota.findMany({
      where: {
        clienteId: id,
        empresaId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createNota(
    id: string,
    data: CreateClienteNotaDto,
    empresaId: string,
  ) {
    await this.findOne(id, empresaId);

    return this.prisma.clienteNota.create({
      data: {
        texto: data.texto,
        tipo: data.tipo ?? 'nota',
        clienteId: id,
        empresaId,
      },
    });
  }

  private normalizeClienteData(data: CreateClienteDto | UpdateClienteDto) {
    const { empresa, ...clienteData } = data;

    return {
      ...clienteData,
      fazenda: data.fazenda ?? empresa ?? clienteData.fazenda,
      interesse: data.interesse ?? empresa ?? clienteData.interesse,
    };
  }

  private presentCliente(cliente: any) {
    return {
      ...cliente,
      empresa: cliente.fazenda ?? cliente.cidade ?? null,
    };
  }
}
