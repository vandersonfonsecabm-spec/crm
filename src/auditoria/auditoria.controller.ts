import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuditoriaService } from './auditoria.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('auditoria')
@UseGuards(JwtAuthGuard)
export class AuditoriaController {
  constructor(
    private readonly auditoriaService: AuditoriaService,
  ) {}

  @Post()
  criar(
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.auditoriaService.criar({
      entidade: body.entidade,
      entidadeId: body.entidadeId,
      acao: body.acao,
      descricao: body.descricao,
      usuarioId: req.user.sub,
      empresaId: req.user.empresaId,
    });
  }

  @Get()
  listar(@Req() req: any) {
    return this.auditoriaService.listar(
      req.user.empresaId,
    );
  }
}