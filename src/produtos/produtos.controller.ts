import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ProdutosService } from './produtos.service';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('produtos')
@UseGuards(JwtAuthGuard)
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  @Post()
  create(@Body() createProdutoDto: CreateProdutoDto, @CurrentUser() user: any) {
    return this.produtosService.create(createProdutoDto, user.empresaId);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.produtosService.findAll(user.empresaId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.produtosService.findOne(id, user.empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProdutoDto: Partial<CreateProdutoDto>,
    @CurrentUser() user: any,
  ) {
    return this.produtosService.update(id, updateProdutoDto, user.empresaId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.produtosService.remove(id, user.empresaId);
  }
}