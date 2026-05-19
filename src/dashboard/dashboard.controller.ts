import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async resumo(@Req() req: any) {
    return this.dashboardService.resumo(
      req.user.empresaId,
    )
  }
}