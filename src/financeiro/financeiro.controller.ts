import { Body, Controller, Get, Post } from '@nestjs/common'
import { CreateContaReceberDto } from './dto/create-conta-receber.dto'
import { FinanceiroService } from './financeiro.service'

@Controller('financeiro')
export class FinanceiroController {
  constructor(private financeiroService: FinanceiroService) {}

  @Post('contas-receber')
  criarContaReceber(@Body() dto: CreateContaReceberDto) {
    return this.financeiroService.criarContaReceber(dto)
  }

  @Get('contas-receber')
  listarContasReceber() {
    return this.financeiroService.listarContasReceber()
  }
}