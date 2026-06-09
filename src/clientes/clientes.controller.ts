import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { ClientesService } from './clientes.service';

import { CreateClienteNotaDto } from './dto/create-cliente-nota.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.clientesService.findAll(user.empresaId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.clientesService.findOne(id, user.empresaId);
  }

  @Post()
  create(@Body() data: CreateClienteDto, @CurrentUser() user: any) {
    return this.clientesService.create(data, user.empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdateClienteDto,
    @CurrentUser() user: any,
  ) {
    return this.clientesService.update(id, data, user.empresaId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.clientesService.remove(id, user.empresaId);
  }

  @Get(':id/notas')
  findNotas(@Param('id') id: string, @CurrentUser() user: any) {
    return this.clientesService.findNotas(id, user.empresaId);
  }

  @Post(':id/notas')
  createNota(
    @Param('id') id: string,
    @Body() data: CreateClienteNotaDto,
    @CurrentUser() user: any,
  ) {
    return this.clientesService.createNota(id, data, user.empresaId);
  }
}
