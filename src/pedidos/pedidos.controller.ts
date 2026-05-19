import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
@UseGuards(JwtAuthGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  async criar(@Req() req, @Body() dto: CreatePedidoDto) {
    return this.pedidosService.criar(
      req.user.empresaId,
      req.user.userId ?? null,
      dto,
    );
  }

  @Get()
  async listar(@Req() req) {
    return this.pedidosService.listar(req.user.empresaId);
  }
}