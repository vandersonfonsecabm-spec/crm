import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { EstoqueService } from './estoque.service';

@Controller('estoque')
@UseGuards(JwtAuthGuard)
export class EstoqueController {
  constructor(
    private readonly estoqueService: EstoqueService,
  ) {}

  @Post()
  async movimentar(
    @Body()
    body: {
      produtoId: string;

      tipo:
        | 'ENTRADA'
        | 'SAIDA'
        | 'AJUSTE';

      quantidade: number;

      observacao?: string;
    },

    @Req() req,
  ) {
    console.log(
      'USER TOKEN:',
      req.user,
    );

    return this.estoqueService.movimentar({
      ...body,

      empresaId:
        req.user?.empresaId,
    });
  }

  @Get()
  async historico(
    @Req() req,
  ) {
    console.log(
      'USER TOKEN:',
      req.user,
    );

    return this.estoqueService.historico(
      req.user?.empresaId,
    );
  }
}