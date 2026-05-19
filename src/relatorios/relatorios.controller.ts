import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RelatoriosService } from './relatorios.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('relatorios')
@UseGuards(JwtAuthGuard)
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('financeiro')
  financeiro(@Req() req: any) {
    return this.relatoriosService.financeiro(req.user.empresaId);
  }
}