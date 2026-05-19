import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

interface CriarAuditoriaDTO {
  entidade: string;
  entidadeId?: string;
  acao: string;
  descricao?: string;
  usuarioId?: string;
  empresaId: string;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(data: CriarAuditoriaDTO) {
    return this.prisma.auditoria.create({
      data,
    });
  }

  async listar(empresaId: string) {
    return this.prisma.auditoria.findMany({
      where: {
        empresaId,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}